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
const MARKER = '<!--cross-sell-->';

const PRODUCTS = [
  ['Countertops', '/materials/all-countertops/', 'Granite, quartz & marble slabs'],
  ['Kitchen & Bath Sinks', '/marketplace/sinks/', 'Undermount, farmhouse & vessel'],
  ['Faucets', '/marketplace/faucets/', 'Kitchen & bathroom faucets'],
  ['Tile & Backsplash', '/materials/all-tile/', 'Floor, wall & backsplash tile'],
  ['Flooring', '/materials/flooring/', 'Tile, wood-look & LVP'],
  ['Kitchen Accessories', '/marketplace/kitchen-accessories/', 'Racks, drains & organizers'],
];
const SERVICES = [
  ['Countertop Installation', '/services/countertop-installation/', 'Fabrication & install, lifetime warranty'],
  ['Countertop Replacement', '/services/countertop-replacement/', 'Tear-out & new tops, one day'],
  ['Kitchen Remodeling', '/services/home/kitchen-remodeling-arizona/', 'Full kitchens across the Valley'],
  ['Bathroom Remodeling', '/services/home/bathroom-remodeling-arizona/', 'Vanities, showers & tile'],
  ['Sink Installation', '/services/sink-installation/', 'Undermount & drop-in fitting'],
  ['Free In-Home Estimate', '/get-a-free-estimate', 'We come measure & quote, no obligation'],
];

function strip(kind) {
  const isProduct = kind === 'product';
  const items = isProduct ? PRODUCTS : SERVICES;
  const label = isProduct ? 'Shop the Materials' : 'Professional Installation & Remodeling';
  const heading = isProduct ? 'Shop Materials for Your Project' : 'Let Us Install It — Phoenix Metro';
  const sub = isProduct
    ? 'Browse the countertops, sinks, faucets, tile, and flooring we carry — then let us fabricate and install.'
    : 'Surprise Granite is a licensed AZ contractor (ROC #341113). We fabricate, install, and remodel across the Phoenix Valley.';
  const cards = items.map(([t, href, d]) => `
      <a href="${href}" style="display:block;background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:18px 20px;text-decoration:none;transition:box-shadow .2s;">
        <div style="color:#1a2b3c;font-weight:700;font-size:15px;margin-bottom:4px;">${t}</div>
        <div style="color:#666;font-size:13px;line-height:1.5;">${d}</div>
      </a>`).join('');
  return `
${MARKER}
<section class="sg-xsell" style="background:#f8f9fa;border-top:1px solid #e5e5e5;padding:56px 20px;font-family:'Inter',system-ui,sans-serif;">
  <div style="max-width:1100px;margin:0 auto;">
    <div style="text-align:center;margin-bottom:28px;">
      <span style="color:#cca600;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:13px;">${label}</span>
      <h2 style="color:#1a2b3c;font-size:clamp(22px,4vw,30px);margin:8px 0 10px;">${heading}</h2>
      <p style="color:#555;max-width:720px;margin:0 auto;line-height:1.6;">${sub}</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;">${cards}
    </div>
  </div>
</section>
`;
}

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
  const snippet = strip(kind);
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
