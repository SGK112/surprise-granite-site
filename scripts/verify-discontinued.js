#!/usr/bin/env node
/**
 * Trust-but-verify the discontinued list against vendor sites.
 *
 * The catalog's specs.discontinued flag came from a past audit and can be stale —
 * a vendor may still list a color we call dead. This checks each discontinued
 * color against its vendor and writes a review report.
 *
 * Reality of vendor sites (measured 2026-07):
 *   - Arizona Tile: plain HTML, real 404s for missing colors — VERIFIABLE by fetch.
 *   - Cosentino (Silestone/Dekton/Sensa), Hanstone, Caesarstone, Bolder Image,
 *     MSI: JS-rendered SPAs or bot-protected — a fetch can't confirm them. These
 *     are marked needs-browser (route through the vendor-sync browser agent) with
 *     a manual search link.
 *
 * Verdicts:
 *   still-listed   — 200 + the color name on the page => NOT discontinued (false
 *                    positive to un-flag)
 *   gone           — 404/410 => discontinued confirmed
 *   needs-browser  — vendor not fetch-verifiable; human/agent must check
 *
 * Never auto-writes the catalog. Writes data/discontinued-review.json for review;
 * un-flag confirmed false positives deliberately after reading it.
 *
 * Usage: NODE_PATH=api/node_modules node scripts/verify-discontinued.js [--limit N]
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supa = createClient('https://ypeypgwsycxcagncgdur.supabase.co', process.env.SUPABASE_SERVICE_KEY);
const OUT = path.join(__dirname, '..', 'data', 'discontinued-review.json');
const UA = { headers: { 'user-agent': 'Mozilla/5.0 (compatible; SurpriseGraniteBot/1.0; +https://www.surprisegranite.com)' } };

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const slugify = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Which vendors we can verify by fetch, and how to reach a color's page.
function vendorPlan(row) {
  const brand = String(row.brand || row.vendor_id || '').toLowerCase();
  const mat = slugify(row.subcategory || '');
  const cslug = slugify(row.name);
  if (brand.includes('arizona tile')) {
    return {
      fetchable: true,
      urls: [
        row.vendor_url,
        `https://www.arizonatile.com/products/slab/${mat}-slab/${cslug}/`,
        `https://www.arizonatile.com/products/outer-limits/natural-stone-slab/${mat}/${cslug}/`,
      ].filter(Boolean),
    };
  }
  // SPA / bot-protected vendors — give a human/agent a search link.
  let search = `https://www.google.com/search?q=${encodeURIComponent(row.name + ' ' + (row.brand || '') + ' countertop')}`;
  return { fetchable: false, search, urls: row.vendor_url ? [row.vendor_url] : [] };
}

async function fetchStatus(url, colorName) {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 12000);
    const r = await fetch(url, { ...UA, redirect: 'follow', signal: c.signal });
    clearTimeout(t);
    if (r.status === 404 || r.status === 410) return { status: r.status, listed: false };
    if (r.status >= 200 && r.status < 300) {
      const body = (await r.text()).toLowerCase();
      const listed = body.includes(norm(colorName)) || body.includes(colorName.toLowerCase());
      return { status: r.status, listed };
    }
    return { status: r.status, listed: null }; // redirect/blocked/uncertain
  } catch (e) { return { status: 0, listed: null, error: e.message }; }
}

async function run() {
  const limitArg = process.argv.indexOf('--limit');
  const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

  // active twins (already handled by the list) — verify the truly-listed set.
  let active = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supa.from('catalog_products').select('name, slug').eq('category', 'slab').eq('active', true).order('id').range(from, from + 999);
    active = active.concat(data); if (data.length < 1000) break;
  }
  const activeNames = new Set(active.filter((r) => !/-sample$/.test(r.slug)).map((r) => norm(r.name)));

  let rows = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supa.from('catalog_products').select('slug, name, subcategory, brand, vendor_id, vendor_url, specs').eq('category', 'slab').eq('specs->>discontinued', 'true').order('name').range(from, from + 999);
    rows = rows.concat(data); if (data.length < 1000) break;
  }
  const byColor = new Map();
  for (const r of rows) { const k = norm(r.name); if (!byColor.has(k)) byColor.set(k, r); }
  // Only verify colors with NO active twin — the twins are already excluded.
  let list = [...byColor.values()].filter((r) => !activeNames.has(norm(r.name))).slice(0, LIMIT);

  const results = [];
  const CONCURRENCY = 5;
  let i = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (i < list.length) {
      const row = list[i++];
      const plan = vendorPlan(row);
      let verdict, detail = {};
      if (!plan.fetchable) {
        verdict = 'needs-browser';
        detail = { reason: 'vendor not fetch-verifiable (SPA/protected)', search: plan.search };
      } else {
        let hit = null;
        for (const url of plan.urls) {
          const s = await fetchStatus(url, row.name);
          detail[url] = s;
          if (s.listed === true) { hit = { verdict: 'still-listed', url }; break; }
          if (s.listed === false && !hit) hit = { verdict: 'gone', url };
        }
        verdict = hit ? hit.verdict : 'needs-browser';
      }
      results.push({ name: row.name, slug: row.slug, brand: row.brand || row.vendor_id, material: row.subcategory, verdict, detail });
    }
  }));

  const tally = {};
  results.forEach((r) => { tally[r.verdict] = (tally[r.verdict] || 0) + 1; });
  console.log('=== discontinued verification ===');
  console.log('checked:', results.length);
  console.log(JSON.stringify(tally, null, 1));
  const falsePos = results.filter((r) => r.verdict === 'still-listed');
  if (falsePos.length) {
    console.log('\nSTILL LISTED on vendor site (likely NOT discontinued — review to un-flag):');
    falsePos.forEach((r) => console.log('  ', r.name, '(' + r.brand + ') ', Object.keys(r.detail)[0]));
  }
  const byVendorNeedsBrowser = {};
  results.filter((r) => r.verdict === 'needs-browser').forEach((r) => { byVendorNeedsBrowser[r.brand] = (byVendorNeedsBrowser[r.brand] || 0) + 1; });
  console.log('\nneeds browser-agent verification, by vendor:', JSON.stringify(byVendorNeedsBrowser, null, 1));

  fs.writeFileSync(OUT, JSON.stringify({ checkedAt: null, tally, results }, null, 1));
  console.log('\nwrote', OUT);
  process.exit(0);
}
run().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
