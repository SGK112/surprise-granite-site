#!/usr/bin/env node
/**
 * inject-city-hub-links.js — fix orphaned local pages. Each /locations/<city>/
 * hub gets a link section pointing at EVERY sub-page that exists under it
 * (services, remodeling, and the granite/quartz/marble/quartzite material pages),
 * so Google can crawl them via internal links instead of the sitemap alone.
 *
 * Auto-detects sub-page dirs (robust to whatever exists per city). Idempotent via
 * the <!--city-links--> marker; inserted before <!--cross-sell--> / <footer /
 * </body>. Rerunnable after new sub-pages are generated.
 *
 *   node scripts/inject-city-hub-links.js            # dry run
 *   node scripts/inject-city-hub-links.js --write
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const WRITE = process.argv.includes('--write');
const MARKER = '<!--city-links-->';

// slug -> [label, group]. group: 'svc' (services/remodeling) or 'mat' (materials).
const LABELS = {
  'countertops': ['Countertops', 'svc'],
  'countertop-replacement': ['Countertop Replacement', 'svc'],
  'kitchen-remodeling': ['Kitchen Remodeling', 'svc'],
  'bathroom-remodeling': ['Bathroom Remodeling', 'svc'],
  'flooring': ['Flooring', 'svc'],
  'cabinets': ['Cabinets', 'svc'],
  'granite-countertops': ['Granite Countertops', 'mat'],
  'quartz-countertops': ['Quartz Countertops', 'mat'],
  'marble-countertops': ['Marble Countertops', 'mat'],
  'quartzite-countertops': ['Quartzite Countertops', 'mat'],
};
const ORDER = Object.keys(LABELS);

function cityDisplay(html, slug) {
  const m = html.match(/<title>([^<|—-]+)/);
  const t = m && m[1].trim();
  if (t && /,/.test(t)) return t.split(',')[0].replace(/.*\bin\s+/i, '').trim();
  return slug.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join(' ');
}

function linksSection(city, citySlug, subs) {
  const link = (slug) => `<a href="/locations/${citySlug}/${slug}/" style="display:block;background:#fff;border:1px solid #e5e5e5;border-radius:10px;padding:14px 18px;text-decoration:none;color:#1a2b3c;font-weight:600;">${LABELS[slug][0]}</a>`;
  const svc = subs.filter((s) => LABELS[s][1] === 'svc');
  const mat = subs.filter((s) => LABELS[s][1] === 'mat');
  const group = (title, list) => list.length ? `
    <h3 style="color:#1a2b3c;margin:24px 0 10px;">${title}</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">${list.map(link).join('')}</div>` : '';
  return `
${MARKER}
<section style="max-width:1100px;margin:0 auto;padding:48px 20px;font-family:'Inter',system-ui,sans-serif;">
  <div style="text-align:center;margin-bottom:8px;">
    <span style="color:#cca600;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:13px;">Explore ${city}</span>
    <h2 style="color:#1a2b3c;font-size:clamp(22px,4vw,30px);margin:8px 0;">Countertops &amp; Remodeling in ${city}</h2>
  </div>
  ${group('Services &amp; Remodeling', svc)}
  ${group('Countertop Materials', mat)}
</section>
`;
}

function insert(html, snippet) {
  for (const re of [/<!--cross-sell-->/, /<footer[\s>]/i, /<\/body>/i]) {
    const m = html.match(re);
    if (m) return html.slice(0, m.index) + snippet + '\n' + html.slice(m.index);
  }
  return null;
}

const locDir = path.join(ROOT, 'locations');
let done = 0, skip = 0, fail = 0;
for (const citySlug of fs.readdirSync(locDir)) {
  const hub = path.join(locDir, citySlug, 'index.html');
  if (!fs.existsSync(hub) || !fs.statSync(path.join(locDir, citySlug)).isDirectory()) continue;
  let html = fs.readFileSync(hub, 'utf8');
  if (html.includes(MARKER)) { skip++; continue; }
  // detect existing sub-page dirs we have labels for
  const subs = ORDER.filter((slug) => fs.existsSync(path.join(locDir, citySlug, slug, 'index.html')));
  if (!subs.length) { continue; }
  const city = cityDisplay(html, citySlug);
  const next = insert(html, linksSection(city, citySlug, subs));
  if (!next) { fail++; console.warn('  NO ANCHOR:', citySlug); continue; }
  done++;
  console.log(`  ${WRITE ? 'wrote' : 'would write'}: locations/${citySlug}/  (${subs.length} sub-page links)`);
  if (WRITE) fs.writeFileSync(hub, next);
}
console.log(`\n${WRITE ? 'WROTE' : 'DRY RUN'} — ${done} hubs linked, skipped ${skip} (already), no-anchor ${fail}`);
if (!WRITE) console.log('Re-run with --write to apply.');
