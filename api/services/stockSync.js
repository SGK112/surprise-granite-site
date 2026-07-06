// Hourly vendor-stock propagation: vendorinventories (Mongo, refreshed by the
// nightly portal syncs) → catalog_products.in_stock/vendor_cost (Supabase,
// what the store actually reads). Before this, flags were only corrected when
// someone ran a script by hand — the store's FIRST order (2026-07-06) was a
// Ruvati item that had been qty-0 at the vendor for weeks but still showed
// available. Requires MONGODB_URI; no-ops quietly without it.
const { MongoClient } = require('mongodb');

const VENDOR_MAP = { ruvati: ['ruvati', 'ruvati-sinks'], vigo: ['vigo'], kibi: ['kibi'] };
const INTERVAL_MS = 60 * 60 * 1000;

async function syncOnce(supabase, logger) {
  if (!process.env.MONGODB_URI || !supabase) return { skipped: true };
  const mongo = new MongoClient(process.env.MONGODB_URI);
  const out = { checked: 0, corrected: 0 };
  try {
    await mongo.connect();
    const vi = await mongo.db('voiceflow-crm').collection('vendorinventories')
      .find({}, { projection: { vendor: 1, sku: 1, inStock: 1, dealerCost: 1 } }).toArray();
    const bySku = new Map(vi.map((r) => [`${r.vendor}|${String(r.sku).toUpperCase()}`, r]));

    for (const [viVendor, catalogVendors] of Object.entries(VENDOR_MAP)) {
      for (const vendorId of catalogVendors) {
        let from = 0;
        for (;;) {
          const { data, error } = await supabase.from('catalog_products')
            .select('id,sku,in_stock,vendor_cost')
            .eq('vendor_id', vendorId).eq('active', true).range(from, from + 999);
          if (error || !data) break;
          for (const p of data) {
            if (!p.sku) continue;
            const inv = bySku.get(`${viVendor}|${String(p.sku).toUpperCase()}`);
            if (!inv || typeof inv.inStock !== 'boolean') continue;
            out.checked++;
            const fields = {};
            if (p.in_stock !== inv.inStock) fields.in_stock = inv.inStock;
            if (inv.dealerCost > 0 && Number(p.vendor_cost) !== inv.dealerCost) fields.vendor_cost = inv.dealerCost;
            if (Object.keys(fields).length) {
              fields.updated_at = new Date().toISOString();
              const { error: uerr } = await supabase.from('catalog_products').update(fields).eq('id', p.id);
              if (!uerr) out.corrected++;
            }
          }
          if (data.length < 1000) break;
          from += 1000;
        }
      }
    }
  } catch (e) {
    (logger || console).warn ? logger.warn('stockSync failed', { error: e.message }) : console.warn('stockSync failed:', e.message);
  } finally {
    await mongo.close().catch(() => {});
  }
  return out;
}

function startStockSync(supabase, logger) {
  if (!process.env.MONGODB_URI) {
    (logger || console).info?.('stockSync disabled — MONGODB_URI not set');
    return;
  }
  const run = () => syncOnce(supabase, logger).then((r) => {
    if (!r.skipped) (logger || console).info?.(`stockSync: checked ${r.checked}, corrected ${r.corrected}`);
  }).catch(() => {});
  setTimeout(run, 90 * 1000); // first pass shortly after boot
  setInterval(run, INTERVAL_MS).unref?.();
}

module.exports = { startStockSync, syncOnce };
