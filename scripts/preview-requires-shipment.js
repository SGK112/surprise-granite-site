#!/usr/bin/env node
// Dry-run preview of the requires_shipment backfill. READ-ONLY.
// Usage: node scripts/preview-requires-shipment.js

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', 'api', '.env');
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8').split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const URL = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }

// NOTE: "invoice payment" intentionally NOT in this regex — it's too ambiguous
// (could be a generic label slapped on a real shippable item, e.g. Miranda Gaona's
// $15 sample that was labelled "Invoice Payment" at checkout). Leave those in
// the queue so staff can resolve manually.
const PROJECT_RE = /(deposit|final\s*payment|balance|EST-?\d|INV-?\d|countertop|backsplash|remodel|installation|f&i\s|change\s*order|materials\s*for)/i;
const GENERIC_RE = /^(customer|payment|order|charge)\s*$/i;

function classify(o) {
  const md = o.metadata || {};
  const items = Array.isArray(o.items) ? o.items : [];
  if (['invoice','deposit','balance','final','quick-pay','custom','subscription','lead_purchase'].includes(md.payment_type)) return ['rule1_metadata_payment_type', false];
  if (md.source === 'quick-pay') return ['rule2_metadata_source_quickpay', false];
  if (md.invoice_ref || md.invoice_id || md.lead_id) return ['rule3_metadata_project_ref', false];
  if (o.kind === 'project') return ['rule4_kind_project', false];
  if (items.length === 0 && !o.shipping_address_line1) return ['rule5_no_items_no_address', false];
  if (items.some(i => PROJECT_RE.test(i.name || i.title || ''))) return ['rule6_item_matches_project_regex', false];
  if (items.some(i => GENERIC_RE.test(i.name || i.title || ''))) return ['rule7_generic_item_label', false];
  return ['default_shippable', true];
}

async function fetchAll() {
  const all = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const u = `${URL}/rest/v1/orders?select=id,order_number,customer_name,customer_email,total,items,metadata,kind,status,shipping_address_line1,created_at&order=created_at.desc&limit=${pageSize}&offset=${from}`;
    const r = await fetch(u, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    if (!r.ok) throw new Error(`PostgREST ${r.status}: ${await r.text()}`);
    const rows = await r.json();
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

(async () => {
  const orders = await fetchAll();
  console.log(`\n== TOTAL ORDERS: ${orders.length} ==\n`);

  const tagged = orders.map(o => { const [reason, ship] = classify(o); return { ...o, reason, ship }; });

  // SUMMARY
  console.log('== SUMMARY ==');
  const groups = {};
  for (const o of tagged) {
    const key = `${o.ship ? 'SHIPPABLE' : 'NON-SHIPPABLE'}|${o.reason}`;
    groups[key] = groups[key] || { rows: 0, volume: 0 };
    groups[key].rows++;
    groups[key].volume += parseFloat(o.total) || 0;
  }
  console.log('classification    | reason                            | rows | volume');
  console.log('------------------|-----------------------------------|------|---------');
  Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .forEach(([k, v]) => {
      const [cls, reason] = k.split('|');
      console.log(`${cls.padEnd(17)} | ${reason.padEnd(33)} | ${String(v.rows).padStart(4)} | $${v.volume.toFixed(2)}`);
    });

  // DETAIL: flip to non-shippable
  console.log('\n== ROWS THAT WOULD FLIP TO NON-SHIPPABLE ==');
  const flipped = tagged.filter(o => !o.ship);
  console.log(`Count: ${flipped.length}\n`);
  flipped.forEach(o => {
    const items = (o.items || []).map(i => i.name || i.title || '?').join(' | ') || '(no items)';
    console.log(`${o.order_number || o.id?.slice(0,8)} — ${o.customer_name || '?'} — $${(parseFloat(o.total)||0).toFixed(2)}`);
    console.log(`  status=${o.status || '?'} kind=${o.kind || '?'} reason=${o.reason}`);
    console.log(`  items: ${items.slice(0, 120)}`);
    if (o.shipping_address_line1) console.log(`  ship_to: ${o.shipping_address_line1}`);
    console.log(`  date: ${(o.created_at || '').slice(0,10)}\n`);
  });

  // DETAIL: staying shippable AND not yet shipped
  console.log('\n== ROWS STAYING SHIPPABLE & NOT YET SHIPPED ==');
  const stillNeeds = tagged.filter(o => o.ship && !['shipped','delivered','fulfilled','cancelled','refunded'].includes((o.status||'').toLowerCase()));
  console.log(`Count: ${stillNeeds.length}\n`);
  stillNeeds.forEach(o => {
    const items = (o.items || []).map(i => i.name || i.title || '?').join(' | ') || '(no items)';
    console.log(`${o.order_number || o.id?.slice(0,8)} — ${o.customer_name || '?'} — $${(parseFloat(o.total)||0).toFixed(2)} — ${o.status || '?'}`);
    console.log(`  items: ${items.slice(0, 120)}`);
    if (o.shipping_address_line1) console.log(`  ship_to: ${o.shipping_address_line1}`);
    console.log(`  date: ${(o.created_at || '').slice(0,10)}\n`);
  });
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
