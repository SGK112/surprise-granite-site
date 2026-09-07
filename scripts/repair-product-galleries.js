#!/usr/bin/env node
/**
 * Strip foreign colourways out of a vendor's product galleries.
 *
 * Lions Floor names every image after the SKU it belongs to —
 * 15_bbxv_biscotti_oak__planks.jpg, roomscenelilr04.jpg — but the importer
 * attached whole collections to every product in them. The result: 162 of 163
 * Lions Floor products showed images of OTHER floors, and 147 had a different
 * floor entirely as their PRIMARY image. The customer browsing "Biscotti Oak"
 * was looking at a photo of "Toy Block".
 *
 * The SKU in the filename is the fix. BB-XV keeps bbxv, and drops bbii, bbxvi
 * and bbxviii — matched on a boundary, because 'bbxv' is also a prefix of
 * 'bbxviii' and a plain substring test would keep the wrong plank.
 *
 * A product whose own images cannot be identified is LEFT ALONE. An empty
 * gallery is worse than a mixed one, and silence about it is worse than both.
 *
 * Usage: node scripts/repair-product-galleries.js [vendor] [--write]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WRITE = process.argv.includes('--write');
const VENDOR = process.argv.find((a, i) => i > 1 && !a.startsWith('--')) || 'lions-floor';

// .env.local WINS over the ambient shell. The profile exports a Supabase anon
// key, and a role with no grants makes PostgREST report catalog_products as
// "not found in the schema cache" — a permissions error wearing a 404's clothes.
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const URL_BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!URL_BASE || !KEY) { console.error('SUPABASE_URL / service key missing from .env.local'); process.exit(1); }
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

// The SKU as it appears inside a filename: letters and digits only.
const token = (sku) => String(sku || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Boundary match. 'bbxv' must not match 'bbxviii' — same collection, different floor.
const belongsTo = (url, tok) => new RegExp(tok + '(?![a-z0-9])').test(String(url).toLowerCase());

// A plank/swatch shot represents the product better than a styled room, so it
// leads the gallery; the room scene stays, just not first.
const isRoomScene = (url) => /roomscene|__room\b|_room[_.]/i.test(String(url));

// The same photo arrives several times at different Cloudinary sizes
// (.../h_222,w_450/... and .../h_500,w_792/... of one file), so a plain URL
// dedupe leaves the gallery showing the same plank twice. Key on the source
// filename and keep the largest rendition of each.
const sourceName = (url) => String(url).split('?')[0].split('/').pop().toLowerCase();
const pixels = (url) => {
  const w = /[,/]w_(\d+)/.exec(url), h = /[,/]h_(\d+)/.exec(url);
  return (w ? +w[1] : 0) * (h ? +h[1] : 0);
};
function biggestOfEach(urls) {
  const best = new Map();
  for (const u of urls) {
    const k = sourceName(u);
    if (!best.has(k) || pixels(u) > pixels(best.get(k))) best.set(k, u);
  }
  return [...best.values()];
}

(async () => {
  const res = await fetch(
    `${URL_BASE}/rest/v1/catalog_products?vendor_id=eq.${encodeURIComponent(VENDOR)}&select=id,sku,name,primary_image_url,image_urls&limit=2000`,
    { headers });
  const rows = await res.json();
  if (!Array.isArray(rows)) { console.error('read failed:', rows); process.exit(1); }

  const fixes = [];
  let clean = 0, unidentifiable = 0;

  for (const r of rows) {
    const tok = token(r.sku);
    const urls = [...new Set(r.image_urls || [])];       // the feed repeats images too
    if (!tok || !urls.length) { unidentifiable++; continue; }

    const mine = biggestOfEach(urls.filter((u) => belongsTo(u, tok)));
    if (!mine.length) { unidentifiable++; continue; }    // leave it exactly as it is

    mine.sort((a, b) => (isRoomScene(a) ? 1 : 0) - (isRoomScene(b) ? 1 : 0));
    const dropped = urls.length - mine.length;
    const primaryWrong = r.primary_image_url && !belongsTo(r.primary_image_url, tok);

    if (!dropped && !primaryWrong && mine.length === (r.image_urls || []).length) { clean++; continue; }
    fixes.push({ id: r.id, sku: r.sku, name: r.name, dropped, primaryWrong, image_urls: mine, primary_image_url: mine[0] });
  }

  console.log(`${VENDOR}: ${rows.length} products | ${fixes.length} to fix | ${clean} already clean | ${unidentifiable} left alone (no SKU match in any filename)`);
  console.log(`  primary image was a different product on ${fixes.filter((f) => f.primaryWrong).length}`);
  console.log(`  foreign images to remove: ${fixes.reduce((n, f) => n + f.dropped, 0)}`);
  for (const f of fixes.slice(0, 8)) {
    console.log(`   ${String(f.sku).padEnd(10)} keep ${f.image_urls.length}, drop ${f.dropped}${f.primaryWrong ? '  <- primary was another product' : ''}`);
  }

  if (!WRITE) { console.log('\nDry run — nothing written.'); return; }

  let done = 0;
  for (const f of fixes) {
    const r = await fetch(`${URL_BASE}/rest/v1/catalog_products?id=eq.${f.id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ image_urls: f.image_urls, primary_image_url: f.primary_image_url, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) console.error(`  ${f.sku}: ${r.status} ${await r.text()}`);
    else done++;
  }
  console.log(`\nrepaired ${done} of ${fixes.length} galleries`);
})();
