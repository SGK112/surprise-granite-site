#!/usr/bin/env node
/**
 * absolutize-meta-urls.js — make every MACHINE-READ image URL absolute.
 *
 * WHY. Open Graph, Twitter cards and schema.org Product `image` all REQUIRE an
 * absolute URL. Site-relative paths are silently useless to the consumers that
 * matter: Google will not build a rich result or a Merchant listing from a relative
 * image, and Facebook/LinkedIn/Slack render no preview at all — so every share of
 * those pages was a bare link. Nothing looks wrong on screen, because the browser
 * resolves <img src="/…"> perfectly well, which is exactly why this survived.
 *
 * Found 2026-09-13: 402 pages with a relative og:image, and 327 Product schemas
 * with a relative image (175 tile + 152 flooring — every flooring page).
 *
 * Fixes, in place:
 *   og:image, og:image:secure_url, twitter:image
 *   JSON-LD "image" values (string or array) on any node
 *
 * Deliberately NOT touched: <img src>, <link rel=preload>, CSS url(). Those are
 * browser-facing, relative works, and rewriting them would bloat every page for
 * no gain.
 *
 *   node scripts/absolutize-meta-urls.js [--write]
 *
 * Idempotent — an already-absolute URL is left alone, so it is safe on a cron.
 * Only rewrites paths that start with "/" (a real site path). Protocol-relative
 * "//host/x" and data: URIs are left alone.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://www.surprisegranite.com';
const WRITE = process.argv.includes('--write');

const SKIP_DIRS = new Set(['node_modules', '.git', 'migrated', 'images', 'assets', 'data']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(p, out);
    } else if (e.isFile() && e.name.endsWith('.html')) {
      out.push(p);
    }
  }
  return out;
}

// A leading "/" but not "//" (protocol-relative) — those already resolve.
const isSitePath = u => typeof u === 'string' && u.startsWith('/') && !u.startsWith('//');

let pages = 0, metaFixed = 0, ldFixed = 0, pagesChanged = 0;

for (const file of walk(ROOT)) {
  let html = fs.readFileSync(file, 'utf8');
  const before = html;
  pages++;

  // 1. og:image / og:image:secure_url / twitter:image
  html = html.replace(
    /(<meta\s+(?:property|name)="(?:og:image(?::secure_url)?|twitter:image)"\s+content=")(\/[^"/][^"]*)(")/gi,
    (m, a, url, z) => { metaFixed++; return `${a}${SITE}${url}${z}`; }
  );

  // 2. JSON-LD "image" — string or array. Parse/re-serialise rather than regex the
  //    value, so a URL containing a quote or comma cannot corrupt the block.
  html = html.replace(
    /(<script[^>]*application\/ld\+json[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (m, open, body, close) => {
      let data;
      try { data = JSON.parse(body.trim()); } catch (e) { return m; }  // leave malformed LD alone
      let touched = false;
      const fix = (node) => {
        if (Array.isArray(node)) return node.forEach(fix);
        if (!node || typeof node !== 'object') return;
        if ('image' in node) {
          const v = node.image;
          if (isSitePath(v)) { node.image = SITE + v; touched = true; }
          else if (Array.isArray(v)) {
            node.image = v.map((u) => { if (isSitePath(u)) { touched = true; return SITE + u; } return u; });
          }
        }
        for (const k of Object.keys(node)) if (typeof node[k] === 'object') fix(node[k]);
      };
      fix(data);
      if (!touched) return m;
      ldFixed++;
      return `${open}${JSON.stringify(data)}${close}`;
    }
  );

  if (html !== before) {
    pagesChanged++;
    if (WRITE) fs.writeFileSync(file, html);
  }
}

console.log(`scanned ${pages} html files`);
console.log(`  og/twitter image tags absolutised : ${metaFixed}`);
console.log(`  JSON-LD blocks absolutised        : ${ldFixed}`);
console.log(`  pages changed                     : ${pagesChanged}`);
if (!WRITE) console.log('\nDRY RUN — re-run with --write to apply.');
