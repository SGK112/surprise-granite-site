#!/usr/bin/env node
/**
 * Correct mislabeled slab materials ("they're mislabeled as quartz when
 * they're natural stone", 2026-07-06). Builds a cross-vendor material
 * authority from sources that actually know each color's material:
 *   - cactus-products.json (426 colors, scraped material)
 *   - daltile-slabs.json (line → material)
 *   - Monterrey library rows (description carries "Granite | Brazil | …")
 *   - Arizona Tile library rows (description/note carries the type)
 * Then fixes any active slab whose subcategory conflicts (only when the
 * authority is a natural stone and the row claims Quartz, or the row has
 * no material at all). Also deactivates the sun-stone relics.
 *
 * Usage: NODE_PATH=api/node_modules node scripts/fix-slab-materials.js [--write]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { MongoClient } = require('mongodb');

const supa = createClient('https://ypeypgwsycxcagncgdur.supabase.co', process.env.SUPABASE_SERVICE_KEY);
const MONGO = fs.readFileSync('/Users/homepc/voiceNow-crm/.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const WRITE = process.argv.includes('--write');
const SCRATCH = '/private/tmp/claude-501/-Users-homepc-surprise-granite-site/2bd048cb-bc66-4413-981e-d49856c89864/scratchpad';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const baseName = (s) => String(s || '')
  .replace(/\([^)]*\)/g, ' ')
  .replace(/\b\d+(?:\.\d+)?\s*cm\b/gi, ' ')
  .replace(/\b(polished|honed|leathered|leather|brushed|matte|satin|velvet|caressed|suede|slabs?)\b/gi, ' ')
  .replace(/\b(quartzite|quartz|granite|marble|porcelain|dolomite|soapstone|onyx|limestone|travertine|slate)\b/gi, ' ')
  .trim();
const NATURALS = new Set(['Quartzite', 'Granite', 'Marble', 'Dolomite', 'Soapstone', 'Onyx', 'Limestone', 'Travertine', 'Slate', 'Semi-Precious']);

(async () => {
  // ── Build the authority: normalized base name → material (majority vote) ──
  const votes = new Map();
  const vote = (name, material) => {
    const b = norm(baseName(name));
    if (b.length < 4 || !material) return;
    if (!votes.has(b)) votes.set(b, {});
    votes.get(b)[material] = (votes.get(b)[material] || 0) + 1;
  };

  for (const c of JSON.parse(fs.readFileSync(SCRATCH + '/cactus-products.json', 'utf8'))) {
    const m = String(c.material || '');
    if (/quartzite/i.test(m)) vote(c.name, 'Quartzite');
    else if (/granite/i.test(m)) vote(c.name, 'Granite');
    else if (/marble/i.test(m)) vote(c.name, 'Marble');
    else if (/dolomite/i.test(m)) vote(c.name, 'Dolomite');
    else if (/onyx/i.test(m)) vote(c.name, 'Onyx');
    else if (/limestone/i.test(m)) vote(c.name, 'Limestone');
    else if (/travertine/i.test(m)) vote(c.name, 'Travertine');
    else if (/soapstone/i.test(m)) vote(c.name, 'Soapstone');
    else if (/slate/i.test(m)) vote(c.name, 'Slate');
    else if (/semi/i.test(m)) vote(c.name, 'Semi-Precious');
    else if (/quartz|quantra/i.test(m)) vote(c.name, 'Quartz');
    else if (/porcelain|epic|lapitec/i.test(m)) vote(c.name, 'Porcelain');
  }
  for (const c of JSON.parse(fs.readFileSync(SCRATCH + '/daltile-slabs.json', 'utf8'))) {
    const l = String(c.line || '').toLowerCase();
    if (l.includes('quartzite')) vote(c.name, 'Quartzite');
    else if (l.includes('granite')) vote(c.name, 'Granite');
    else if (l.includes('marble') && l.includes('natural')) vote(c.name, 'Marble');
    else if (l.includes('porcelain')) vote(c.name, 'Porcelain');
    else if (l.includes('quartz') || l.includes('purevana')) vote(c.name, 'Quartz');
  }
  const mongo = new MongoClient(MONGO); await mongo.connect();
  const lil = await mongo.db('voiceflow-crm').collection('lineitemlibraries')
    .find({ unit: 'sqft' }, { projection: { name: 1, description: 1, vendor: 1 } }).toArray();
  await mongo.close();
  for (const r of lil) {
    const d = `${r.description || ''}`;
    const m = d.match(/\b(Quartzite|Granite|Marble|Dolomite|Travertine|Soapstone|Onyx|Limestone|Basalt|Schist)\b/i);
    if (m) vote(r.name, m[1][0].toUpperCase() + m[1].slice(1).toLowerCase());
    else if (/\bQuartz\b/i.test(d) || /^(QSL|Silestone|Caesarstone)/i.test(r.name)) vote(r.name, 'Quartz');
    // name tokens are evidence too
    const n = r.name.match(/\b(Quartzite|Granite|Marble|Dolomite|Travertine|Soapstone|Onyx|Limestone)\b/i);
    if (n) vote(r.name, n[1][0].toUpperCase() + n[1].slice(1).toLowerCase());
  }
  const authority = new Map();
  for (const [b, v] of votes) {
    const best = Object.entries(v).sort((a, c) => c[1] - a[1])[0];
    if (best) authority.set(b, best[0]);
  }
  console.log('authority colors:', authority.size);

  // ── Sweep active slabs ──
  let rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products')
      .select('id,vendor_id,name,subcategory,specs').eq('active', true).eq('category', 'slab').order('id').range(from, from + 999);
    if (error) throw error;
    rows = rows.concat(data || []);
    if (data.length < 1000) break;
  }
  const report = { slabs: rows.length, corrected: 0, byVendor: {}, sunStoneRemoved: 0 };
  const updates = [];
  for (const p of rows) {
    if (p.vendor_id === 'sun-stone') { updates.push({ id: p.id, fields: { active: false, updated_at: new Date().toISOString() } }); report.sunStoneRemoved++; continue; }
    // name tokens outrank everything — "Sea Pearl Quartzite" labeled Quartz is just wrong
    const tok = p.name.match(/\b(Quartzite|Granite|Marble|Dolomite|Travertine|Soapstone|Onyx|Limestone)\b/i);
    const auth = tok ? (tok[1][0].toUpperCase() + tok[1].slice(1).toLowerCase()) : authority.get(norm(baseName(p.name)));
    if (!auth) continue;
    const cur = p.subcategory || '';
    const conflict = (NATURALS.has(auth) && /^quartz$/i.test(cur)) || !cur;
    if (!conflict || auth === cur) continue;
    updates.push({ id: p.id, fields: { subcategory: auth, specs: { ...(p.specs || {}), material: auth }, updated_at: new Date().toISOString() } });
    report.corrected++;
    report.byVendor[p.vendor_id] = (report.byVendor[p.vendor_id] || 0) + 1;
  }
  console.log(JSON.stringify(report, null, 2));
  if (!WRITE) { console.log('DRY RUN — add --write'); process.exit(0); }
  let ok = 0, fail = 0, i = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (i < updates.length) {
      const u = updates[i++];
      const { error } = await supa.from('catalog_products').update(u.fields).eq('id', u.id);
      if (error) fail++; else ok++;
    }
  }));
  console.log(`WROTE ${ok} (${fail} failed)`);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
