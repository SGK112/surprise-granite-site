#!/usr/bin/env node
/**
 * inject-local-section.js — add a self-contained, locally-relevant "Serving the
 * Phoenix Valley" section to every service page for local SEO. Rerunnable and
 * idempotent (skips any page already carrying the <!--local-section--> marker).
 *
 * Self-contained INLINE styles so it renders identically across both service-page
 * templates (modern `.cta` pages and the older ones). Inserted before the first
 * of: <section class="cta"> · <footer · </body>.
 *
 *   node scripts/inject-local-section.js            # dry run (reports only)
 *   node scripts/inject-local-section.js --write    # write the changes
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WRITE = process.argv.includes('--write');
const MARKER = '<!--local-section-->';

// Service area — the cities we quote in. A couple are linked to the estimate form.
const CITIES = ['Surprise', 'Peoria', 'Glendale', 'Phoenix', 'Scottsdale', 'Goodyear',
  'Buckeye', 'Avondale', 'Litchfield Park', 'Sun City', 'Sun City West', 'Anthem',
  'Mesa', 'Tempe', 'Chandler', 'Gilbert'];

// Per-service label + an Arizona-specific angle so the pages aren't boilerplate
// duplicates of each other. Keyed by the last path segment (or a parent slug).
const SERVICES = {
  'countertop-installation': ['Countertop Installation', 'New granite, quartz, and marble countertops fabricated and installed for Valley kitchens and baths.'],
  'countertop-replacement': ['Countertop Replacement', 'Tearing out tired, sun-faded, or hard-water-etched countertops and installing new stone.'],
  'countertop-polish-repair': ['Countertop Repair & Polish', 'Fixing chips, cracks, dull spots, and hard-water etching on Arizona stone countertops.'],
  'kitchen-remodeling-arizona': ['Kitchen Remodeling', 'Full kitchen remodels — cabinets, countertops, backsplash, and islands — built for how Arizona families cook and entertain.'],
  'bathroom-remodeling-arizona': ['Bathroom Remodeling', 'Vanities, showers, tile, and countertops for cool, low-maintenance Arizona bathrooms.'],
  'custom-showers': ['Custom Showers', 'Walk-in tile and stone showers designed for desert homes.'],
  'tile-shower-remodel': ['Tile Shower Remodels', 'Replacing dated fiberglass and cracked-grout showers with custom tile.'],
  'tile-backsplash-installation': ['Tile & Backsplash Installation', 'Backsplashes and accent walls that finish off a Valley kitchen or bath.'],
  'vanity-installation': ['Vanity Installation', 'Bathroom vanities with the stone top, sink, and faucet set in one trip.'],
  'sink-installation': ['Sink Installation', 'Undermount and drop-in sinks fitted to your countertops.'],
  'flooring-installation': ['Flooring Installation', 'Tile, wood-look, and stone flooring that stands up to Arizona grit and heat.'],
  'tile-flooring': ['Tile Flooring', 'Wood-look and stone-look tile — cool underfoot and built for the desert.'],
  'hardwood-flooring': ['Hardwood & LVP Flooring', 'Wide-plank wood and luxury vinyl that handles Arizona’s dry climate.'],
  'natural-stone-flooring': ['Natural Stone Flooring', 'Travertine, marble, and slate floors for Valley homes.'],
  'cabinet-installation': ['Cabinet Installation', 'Custom and semi-custom cabinets installed across the Valley.'],
  'cabinets': ['Cabinetry', 'In-house cabinet refacing to full custom builds for Phoenix kitchens.'],
  'silestone-installer-phoenix': ['Silestone Installation', 'Authorized Silestone quartz fabrication and installation, Phoenix to the West Valley.'],
  'interior-design': ['Interior Design', 'Local design help pulling your Arizona home’s finishes together.'],
  'commercial': ['Commercial Stone & Casework', 'Countertops and casework for Valley businesses, restaurants, and offices.'],
  'financing': ['Remodel Financing', 'Flexible financing so Valley homeowners can start now and pay over time.'],
  'home-remodeling-financing-options-in-arizona': ['Remodel Financing', 'Flexible financing so Valley homeowners can start their remodel now and pay over time.'],
};

function serviceMeta(file, html) {
  const seg = path.basename(path.dirname(file));
  if (SERVICES[seg]) return SERVICES[seg];
  // fall back to the parent segment (e.g. cabinets/kitchen -> cabinets)
  const parent = path.basename(path.dirname(path.dirname(file)));
  if (SERVICES[parent]) return SERVICES[parent];
  // last resort: humanize the slug + a generic local angle
  const name = seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return [name, 'Trusted local craftsmanship for kitchens and baths across the Valley.'];
}

function citiesHtml() {
  return CITIES.map((c, i) =>
    i === 0 || c === 'Phoenix'
      ? `<a href="/get-a-free-estimate" style="color:#1a1a2e;text-decoration:underline;">${c}</a>`
      : c
  ).join(' &middot; ');
}

function block(name, angle) {
  return `
${MARKER}
<section style="background:#f8f9fa;padding:64px 20px;border-top:1px solid #e5e5e5;font-family:'Inter',system-ui,sans-serif;">
  <div style="max-width:1100px;margin:0 auto;">
    <div style="text-align:center;margin-bottom:28px;">
      <span style="color:#cca600;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:13px;">Serving the Valley</span>
      <h2 style="color:#1a2b3c;font-size:clamp(24px,4vw,32px);margin:8px 0 12px;">${name} Across Metro Phoenix</h2>
      <p style="color:#555;max-width:760px;margin:0 auto;line-height:1.7;">${angle} Family-owned and based in Surprise, we serve the entire West Valley and greater Phoenix &mdash; licensed Arizona General Contractor ROC#340633, free in-home estimates.</p>
    </div>
    <p style="color:#1a1a2e;text-align:center;line-height:2.2;max-width:900px;margin:0 auto 24px;font-weight:500;">
      ${citiesHtml()}
    </p>
    <div style="text-align:center;">
      <a href="/get-a-free-estimate" style="display:inline-block;background:#f9cb00;color:#1a2b3c;font-weight:700;padding:14px 30px;border-radius:8px;text-decoration:none;">Get a Free Local Estimate</a>
    </div>
  </div>
</section>
`;
}

function insert(html, snippet) {
  const anchors = [/<section class="cta"/, /<footer[\s>]/i, /<\/body>/i];
  for (const re of anchors) {
    const m = html.match(re);
    if (m) return html.slice(0, m.index) + snippet + '\n' + html.slice(m.index);
  }
  return null;
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (name === 'index.html') out.push(full);
  }
  return out;
}

const files = walk(path.join(ROOT, 'services'));
let injected = 0, skipped = 0, failed = 0;
for (const file of files) {
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes(MARKER)) { skipped++; continue; }
  const [name, angle] = serviceMeta(file, html);
  const next = insert(html, block(name, angle));
  if (!next) { failed++; console.warn('  NO ANCHOR:', path.relative(ROOT, file)); continue; }
  injected++;
  console.log(`  ${WRITE ? 'inject' : 'would inject'}: ${path.relative(ROOT, file)}  ->  "${name}"`);
  if (WRITE) fs.writeFileSync(file, next);
}
console.log(`\n${WRITE ? 'WROTE' : 'DRY RUN'} — injected ${injected}, skipped ${skipped} (already had it), no-anchor ${failed}, total ${files.length}`);
if (!WRITE) console.log('Re-run with --write to apply.');
