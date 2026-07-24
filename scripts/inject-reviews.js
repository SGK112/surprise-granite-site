#!/usr/bin/env node
/**
 * inject-reviews.js — add a real Google-reviews section to service + location
 * pages for trust/conversion. Uses genuine reviews scraped from the live reviews
 * page (data/google-reviews.json). DISPLAY ONLY — no AggregateRating/Review schema
 * on these pages, because self-serve review rich results for LocalBusiness/Service
 * were removed by Google in 2019 (schema stars won't show and a self-rating is a
 * compliance risk). Stars in search come from Google Business Profile; on-page we
 * get the conversion + E-E-A-T lift honestly. Real reviews only.
 *
 * Rotates which reviews show per page (deterministic by path) so pages differ.
 * Idempotent via <!--reviews-->; inserted before <!--cross-sell--> / <footer / </body>.
 *
 *   node scripts/inject-reviews.js <dir> [<dir> ...] [--write]
 *   e.g. node scripts/inject-reviews.js services locations --write
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const DIRS = args.filter((a) => a !== '--write');
const MARKER = '<!--reviews-->';

const REVIEWS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'google-reviews.json'), 'utf8'))
  .filter((r) => r.text && r.text.length >= 40 && r.text.length <= 320); // punchy, real
const GOOGLE_WRITE = 'https://g.page/r/CXsLJCVtUF84EAE/review';
const G_ICON = '/migrated/6456ce4476abb25581fbad0c/6456ce4476abb2afc2fbb0ae_google_g_icon.png';

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
// simple deterministic hash so each page shows a stable, different trio
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

function pick(seed, n) {
  const out = []; const used = new Set();
  for (let i = 0; out.length < n && i < REVIEWS.length * 2; i++) {
    const idx = (seed + i * 7) % REVIEWS.length;
    if (!used.has(idx)) { used.add(idx); out.push(REVIEWS[idx]); }
  }
  return out;
}

const STARS = '<span style="color:#f9cb00;letter-spacing:2px;font-size:18px;">★★★★★</span>';

function section(seed) {
  const cards = pick(seed, 3).map((r) => `
      <figure style="background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:22px;margin:0;">
        <div style="margin-bottom:10px;">${STARS}</div>
        <blockquote style="margin:0 0 14px;color:#333;font-size:15px;line-height:1.6;">${esc(r.text)}</blockquote>
        <figcaption style="display:flex;align-items:center;gap:8px;">
          <img src="${G_ICON}" alt="Google review" width="20" height="20" loading="lazy" style="border-radius:50%;"/>
          <span style="font-weight:600;color:#1a2b3c;">${esc(r.name)}</span>
          <span style="color:#888;font-size:13px;">· Google Review</span>
        </figcaption>
      </figure>`).join('');
  return `
${MARKER}
<section style="background:#f8f9fa;border-top:1px solid #e5e5e5;padding:56px 20px;font-family:'Inter',system-ui,sans-serif;">
  <div style="max-width:1100px;margin:0 auto;">
    <div style="text-align:center;margin-bottom:26px;">
      <div style="margin-bottom:6px;">${STARS}</div>
      <h2 style="color:#1a2b3c;font-size:clamp(22px,4vw,30px);margin:6px 0 6px;">What Phoenix Homeowners Say</h2>
      <p style="color:#555;margin:0;">Rated <strong>4.5 on Google</strong> across <strong>157 reviews</strong> from real Surprise Granite customers.</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;">${cards}
    </div>
    <div style="text-align:center;margin-top:26px;">
      <a href="/company/reviews/" style="display:inline-block;background:#1a2b3c;color:#fff;font-weight:700;padding:12px 26px;border-radius:8px;text-decoration:none;margin:4px;">Read All Reviews</a>
      <a href="${GOOGLE_WRITE}" target="_blank" rel="noopener" style="display:inline-block;background:transparent;color:#1a2b3c;border:2px solid #1a2b3c;font-weight:700;padding:10px 24px;border-radius:8px;text-decoration:none;margin:4px;">Leave a Review</a>
    </div>
  </div>
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
  for (const rel of walk(d)) {
    const file = path.join(ROOT, rel);
    let html = fs.readFileSync(file, 'utf8');
    if (html.includes(MARKER)) { skip++; continue; }
    const next = insert(html, section(hash(rel)));
    if (!next) { fail++; continue; }
    done++;
    if (WRITE) fs.writeFileSync(file, next);
  }
  console.log(`  ${d}: reviews section`);
}
console.log(`\n${WRITE ? 'WROTE' : 'DRY RUN'} — injected ${done}, skipped ${skip}, no-anchor ${fail} | ${REVIEWS.length} reviews available`);
if (!WRITE) console.log('Re-run with --write to apply.');
