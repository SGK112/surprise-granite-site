#!/usr/bin/env node
/**
 * Strip the leftover Webflow CMS pagination widgets that were feeding a crawl trap.
 *
 * Every one of these is a `<div class="w-pagination-wrapper hidden">` — invisible to users,
 * but it carries `<a href="?xxxxxxxx_page=2">` plus a `<link rel="prerender" href="?..._page=2">`
 * that Googlebot happily follows. The params also COMBINE across widgets
 * (`?017144ac_page=4&5dd91d68_page=4`), so the URL space explodes: they were ~30% of the
 * "Crawled - currently not indexed" bucket in the 2026-08-07 GSC drilldown.
 *
 * Hidden wrappers are removed whole (dead markup). The single VISIBLE wrapper —
 * pro-directory/search-pros, class "w-pagination-wrapper pagination" — is real Finsweet
 * cmsload pagination, so it keeps working: the anchor just gets rel="nofollow" and its
 * prerender hint is dropped.
 *
 * Paired with `Disallow: /*_page=` in robots.txt, which handles the legacy URLs Google
 * already knows about (nothing links to those anymore — they just still return 200).
 *
 * One-shot cleanup; no generator emits these. Re-running is a safe no-op.
 * Usage: node scripts/strip-webflow-pagination.js [--write]
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const WRITE = process.argv.includes('--write');

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

/**
 * Find the `<div ...>` that opens the wrapper whose class attribute sits at `classIdx`,
 * then scan forward tracking div depth to find its matching `</div>`.
 * Returns [start, end) offsets of the whole element, or null if it doesn't balance.
 */
function wrapperSpan(html, classIdx) {
  const start = html.lastIndexOf('<div', classIdx);
  if (start === -1) return null;
  const openEnd = html.indexOf('>', classIdx);
  if (openEnd === -1) return null;

  const tag = /<div\b|<\/div\s*>/gi;
  tag.lastIndex = openEnd + 1;
  let depth = 1;
  let m;
  while ((m = tag.exec(html))) {
    depth += m[0][1] === '/' ? -1 : 1;
    if (depth === 0) return [start, m.index + m[0].length];
  }
  return null;
}

let filesChanged = 0;
let hiddenRemoved = 0;
let anchorsNofollowed = 0;
let prerendersDropped = 0;
const unbalanced = [];

for (const file of walk(ROOT)) {
  const original = fs.readFileSync(file, 'utf8');
  if (!original.includes('_page=')) continue;
  let html = original;

  // 1. Hidden wrappers: delete the element outright.
  for (;;) {
    const idx = html.indexOf('class="w-pagination-wrapper hidden"');
    if (idx === -1) break;
    const span = wrapperSpan(html, idx);
    if (!span) {
      unbalanced.push(path.relative(ROOT, file));
      break;
    }
    html = html.slice(0, span[0]) + html.slice(span[1]);
    hiddenRemoved++;
  }

  // 2. Visible wrappers: keep the UI, kill the crawl signal.
  html = html.replace(/<link rel="prerender" href="\?[^"]*_page=[^"]*"\s*\/?>/g, () => {
    prerendersDropped++;
    return '';
  });
  html = html.replace(/<a href="(\?[^"]*_page=[^"]*)"(?![^>]*\brel=)/g, (_, href) => {
    anchorsNofollowed++;
    return `<a href="${href}" rel="nofollow"`;
  });

  if (html === original) continue;
  filesChanged++;
  if (WRITE) fs.writeFileSync(file, html);
}

console.log(`${WRITE ? 'Wrote' : 'Would change'} ${filesChanged} files`);
console.log(`  hidden pagination wrappers removed : ${hiddenRemoved}`);
console.log(`  prerender hints dropped            : ${prerendersDropped}`);
console.log(`  visible anchors given rel=nofollow : ${anchorsNofollowed}`);
if (unbalanced.length) {
  console.log(`\n!! unbalanced wrapper, left untouched in ${unbalanced.length} file(s):`);
  for (const f of unbalanced) console.log(`   ${f}`);
  process.exitCode = 1;
}
if (!WRITE) console.log('\nDry run. Re-run with --write to apply.');
