#!/usr/bin/env node
/**
 * "No pricing, no color" (Josh, 2026-07-04): a slab color stays in the
 * marketplace only if the vendor cost library has a per-sqft price for it.
 * Active slab products with no price match are deactivated with
 * specs.no_pricing_hidden=true — one flag to find/revert them all when a
 * vendor's price list gets learned (then re-run this script; it also
 * REACTIVATES hidden colors that have since gained pricing).
 *
 * Usage: node scripts/hide-unpriced-colors.js [--write]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
require('dotenv').config({ path: '/Users/homepc/voiceNow-crm/.env' });
const { createClient } = require('@supabase/supabase-js');
const { MongoClient } = require('mongodb');

const supa = createClient('https://ypeypgwsycxcagncgdur.supabase.co', process.env.SUPABASE_SERVICE_KEY);

const VENDOR_MAP = {
  'msi': 'MSI',
  'cosentino': 'Cosentino',
  'silestone': 'Cosentino',
  'arizona-tile': 'Arizona Tile',
  'bolder-image-stone': 'Bolder Image Stone',
  'pentalquartz': 'Architectural Surfaces (ASG)',
  'hanstone': 'ESI',
  'daltile': 'Daltile',
  'classic-surfaces': 'Classic Surfaces',
  'caesarstone': null, 'lx-hausys': null, 'sun-stone': null, // no price source yet
};

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const baseName = (s) => String(s || '')
  .replace(/\(aka:[^)]*\)/gi, '')
  .replace(/\([^)]*\)/g, ' ')
  .replace(/\b\d+(?:\.\d+)?\s*cm\b/gi, ' ')
  .replace(/\bjumbo\s*\d+x\d+\b/gi, ' ')
  .replace(/\b(polished|honed|leathered|leather|caressed|brushed|matte|lava|dual|suede|satin|1st choice|finish|slabs?)\b/gi, ' ')
  .replace(/\b(quartzite|quartz|granite|marble|porcelain|dekton|soapstone|travertine|dolomite|scalea|sensa by cosentino|sensa)\b/gi, ' ')
  .trim();
const digitless = (s) => s.replace(/\d+$/, '');

(async () => {
  const write = process.argv.includes('--write');
  const mongo = new MongoClient(process.env.MONGODB_URI); await mongo.connect();
  const lil = await mongo.db('voiceflow-crm').collection('lineitemlibraries')
    .find({ unit: 'sqft', cost: { $gt: 0 } }, { projection: { name: 1, vendor: 1 } }).toArray();
  await mongo.close();

  const priced = new Set();
  for (const r of lil) priced.add(r.vendor + '|' + norm(baseName(r.name)));
  const hasPrice = (libVendor, name) => {
    const k = norm(baseName(name));
    return priced.has(libVendor + '|' + k) || priced.has(libVendor + '|' + digitless(norm(baseName(name))))
      || [...priced].some((p) => p.startsWith(libVendor + '|') && digitless(p.split('|')[1]) === digitless(k));
  };

  let products = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products')
      .select('id,name,vendor_id,active,specs')
      .eq('category', 'slab').order('id').range(from, from + 999);
    if (error) throw error;
    products = products.concat(data || []);
    if (data.length < 1000) break;
  }

  const report = { hidden: {}, kept: {}, reactivated: 0 };
  let hideN = 0;
  for (const p of products) {
    const libVendor = VENDOR_MAP[p.vendor_id];
    const ok = libVendor ? hasPrice(libVendor, p.name) : false;
    if (p.active && !ok) {
      report.hidden[p.vendor_id] = (report.hidden[p.vendor_id] || 0) + 1;
      hideN++;
      if (write) await supa.from('catalog_products').update({
        active: false,
        specs: { ...(p.specs || {}), no_pricing_hidden: true, hidden_reason: 'no vendor price list match', hidden_at: '2026-07-04' },
        updated_at: new Date().toISOString(),
      }).eq('id', p.id);
    } else if (p.active && ok) {
      report.kept[p.vendor_id] = (report.kept[p.vendor_id] || 0) + 1;
    } else if (!p.active && ok && p.specs?.no_pricing_hidden) {
      report.reactivated++;
      if (write) {
        const specs = { ...(p.specs || {}) };
        delete specs.no_pricing_hidden; delete specs.hidden_reason; delete specs.hidden_at;
        await supa.from('catalog_products').update({ active: true, specs, updated_at: new Date().toISOString() }).eq('id', p.id);
      }
    }
  }
  console.log(JSON.stringify(report, null, 2));
  console.log(`${write ? 'WROTE' : 'DRY RUN (add --write)'} — hidden: ${hideN}, kept active: ${Object.values(report.kept).reduce((a, b) => a + b, 0)}, reactivated: ${report.reactivated}`);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
