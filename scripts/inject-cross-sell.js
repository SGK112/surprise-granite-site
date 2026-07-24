#!/usr/bin/env node
/**
 * inject-cross-sell.js — reciprocal cross-selling for SEO + conversion:
 *   • content pages (services/, locations/, tools/)  -> "Shop Materials" PRODUCT strip
 *   • product pages (marketplace/, countertops/)      -> "Installation & Remodeling" SERVICE strip
 *
 * Self-contained inline styles (renders on any template), idempotent via the
 * <!--cross-sell--> marker, inserted before the first of <footer / </body>.
 * Hidden in ?embed mode (.sg-embed .sg-xsell) so iframed tools are unaffected.
 *
 *   node scripts/inject-cross-sell.js <dir> [<dir> ...]            # dry run
 *   node scripts/inject-cross-sell.js <dir> [<dir> ...] --write
 * e.g. node scripts/inject-cross-sell.js services locations tools --write
 *      node scripts/inject-cross-sell.js marketplace countertops --write
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const DIRS = args.filter((a) => a !== '--write');
// Strips live in one shared module so the generators and this injector never drift.
const { MARKER, productStrip, serviceStrip } = require('./lib/cross-sell');

// content dirs get the PRODUCT strip; product dirs get the SERVICE strip.
function kindForDir(dir) {
  const top = dir.split(/[\\/]/)[0];
  if (['services', 'locations', 'tools'].includes(top)) return 'product';
  if (['marketplace', 'countertops'].includes(top)) return 'service';
  return null;
}

function insert(html, snippet) {
  for (const re of [/<footer[\s>]/i, /<\/body>/i]) {
    const m = html.match(re);
    if (m) return html.slice(0, m.index) + snippet + '\n' + html.slice(m.index);
  }
  return null;
}

function walk(dir, out = []) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return out;
  for (const name of fs.readdirSync(full)) {
    const rel = path.join(dir, name);
    if (fs.statSync(path.join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (name === 'index.html') out.push(rel);
  }
  return out;
}

let done = 0, skip = 0, fail = 0;
for (const d of DIRS) {
  const kind = kindForDir(d);
  if (!kind) { console.warn('  unknown dir (skipped):', d); continue; }
  const snippet = kind === 'product' ? productStrip : serviceStrip;
  for (const rel of walk(d)) {
    const file = path.join(ROOT, rel);
    let html = fs.readFileSync(file, 'utf8');
    if (html.includes(MARKER)) { skip++; continue; }
    const next = insert(html, snippet);
    if (!next) { fail++; continue; }
    done++;
    if (WRITE) fs.writeFileSync(file, next);
  }
  console.log(`  ${d}: ${kind} strip`);
}
console.log(`\n${WRITE ? 'WROTE' : 'DRY RUN'} — injected ${done}, skipped ${skip} (already had it), no-anchor ${fail}`);
if (!WRITE) console.log('Re-run with --write to apply.');
