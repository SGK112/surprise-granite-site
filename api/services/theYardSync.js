// Hourly re-sync of The Yard (theyardaz.com) live inventory → catalog_products.
// The Yard posts real-time stock + prices on an open API; we mirror their
// in-stock FULL SLABS as color rows (vendor 'the-yard-az', category 'slab')
// and their REMNANTS as piece rows (category 'remnant', sku theyard-rem-<id>).
// Remnants churn daily — without this sync the store advertises sold pieces,
// which violates the owner rule: never sell what the vendor doesn't have.
//
// Safety: a failed or suspiciously small pull (< MIN_SANE_PIECES) skips the
// reconcile entirely so a Yard outage can't mass-deactivate the catalog.
// Cambria is banned from the store (owner order 2026-07-07): any piece whose
// PublicNotes mentions Cambria is never inserted and gets deactivated if seen.

const YARD_API = 'https://theyardaz.com/api/v4/products/stone/search/cached/30m';
const IMG = (base) => `https://theyardaz.com/api/v4/stone-images/${base}/600/0?image-type=webp&compression=90`;
const INTERVAL_MS = 60 * 60 * 1000;
const MIN_SANE_PIECES = 200; // full pull is ~1,700; below this = bad pull, skip
const VENDOR_ID = 'the-yard-az';
const MATS = { Quartz: 'Quartz', Quartzite: 'Quartzite', Granite: 'Granite', Marble: 'Marble', Dolomite: 'Dolomite', Limestone: 'Limestone', Soapstone: 'Soapstone', Travertine: 'Travertine', Onyx: 'Onyx', Slate: 'Slate', Terrazzo: 'Terrazzo' };

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const isCambria = (r) => /cambria/i.test(String(r.PublicNotes || '') + ' ' + String(r.StoneName || ''));

// The Yard posts THEIR price (= our material cost). We fabricate + install: our cost is
// +$26/sqft, we charge the customer +$55/sqft (owner rule 2026-07-15). Both are per-piece
// ('each'). The raw Yard price is kept in specs.each_price so this stays idempotent.
const FAB_COST_SQFT = 26, FAB_CHARGE_SQFT = 55;
const r2 = (n) => Math.round(Number(n) * 100) / 100;
const yardCost = (price, sqft) => r2(Number(price) + FAB_COST_SQFT * Number(sqft || 0));
const yardRetail = (price, sqft) => r2(Number(price) + FAB_CHARGE_SQFT * Number(sqft || 0));

async function pullInventory() {
  const all = [];
  let pages = 1;
  for (let page = 1; page <= Math.min(pages, 120); page++) {
    const url = `${YARD_API}?Clearance=false&OrderBy=Popularity&PageNumber=${page}&PageSize=24&stone_search_type=shop-stone&`;
    const res = await fetch(url, { headers: { 'User-Agent': 'SurpriseGranite-sync/1.0', Accept: 'application/json' } });
    if (!res.ok) throw new Error(`yard api ${res.status} on page ${page}`);
    const j = await res.json();
    pages = j.TotalPages || pages;
    for (const r of j.searchResults || []) all.push(r);
  }
  const seen = new Set();
  return all.filter((r) => r.ProductID && !seen.has(r.ProductID) && seen.add(r.ProductID));
}

async function syncOnce(supabase, logger) {
  const log = logger || console;
  if (!supabase) return { skipped: 'no supabase' };
  const out = { pieces: 0, remAdded: 0, remRetired: 0, remUpdated: 0, slabColors: 0, slabRetired: 0, slabUpdated: 0, slabAdded: 0 };

  const inv = await pullInventory();
  out.pieces = inv.length;
  if (inv.length < MIN_SANE_PIECES) return { ...out, skipped: `only ${inv.length} pieces — bad pull, reconcile skipped` };

  const instock = inv.filter((r) => /instock/i.test(r.Status || '') && !isCambria(r));
  const remnants = instock.filter((r) => !r.FullSlab);
  const fullSlabs = instock.filter((r) => r.FullSlab);

  // ---------- remnants: piece-level by yard ProductID ----------
  const liveById = new Map(remnants.map((r) => [String(r.ProductID), r]));
  let existing = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('catalog_products')
      .select('id, sku, active, retail_price, vendor_cost, specs')
      .eq('vendor_id', VENDOR_ID).eq('category', 'remnant').range(from, from + 999);
    if (error) throw new Error(error.message);
    existing = existing.concat(data || []);
    if (!data || data.length < 1000) break;
  }
  const haveById = new Map(existing.map((p) => [String(p.sku).replace('theyard-rem-', ''), p]));

  for (const p of existing) {
    const pid = String(p.sku).replace('theyard-rem-', '');
    const live = liveById.get(pid);
    if (!live && p.active) {
      await supabase.from('catalog_products').update({ active: false, in_stock: false, updated_at: new Date().toISOString() }).eq('id', p.id);
      out.remRetired++;
    } else if (live) {
      const fields = {};
      if (!p.active) { fields.active = true; fields.in_stock = true; }
      const cost = yardCost(live.Price, live.SQFt), retail = yardRetail(live.Price, live.SQFt);
      if (Number(p.retail_price) !== retail || Number(p.vendor_cost) !== cost) {
        fields.retail_price = retail; fields.vendor_cost = cost; fields.sample_price = null;
      }
      const specs = { ...(p.specs || {}), each_price: live.Price, piece_sqft: live.SQFt };
      if (JSON.stringify(specs) !== JSON.stringify(p.specs || {})) fields.specs = specs;
      if (Object.keys(fields).length) {
        fields.updated_at = new Date().toISOString();
        await supabase.from('catalog_products').update(fields).eq('id', p.id);
        out.remUpdated++;
      }
    }
  }
  for (const [pid, r] of liveById) {
    if (haveById.has(pid)) continue;
    const name = `${(r.StoneNamePlain || r.StoneName || 'Stone').trim()} Remnant ${Math.round(r.Dim1)}" x ${Math.round(r.Dim2)}"`;
    const { error } = await supabase.from('catalog_products').insert({
      vendor_id: VENDOR_ID, brand: (r.PublicNotes || 'The Yard').trim(), sku: `theyard-rem-${pid}`,
      name, slug: `remnant-${norm(r.StoneNamePlain || r.StoneName)}-${pid.toLowerCase()}`,
      category: 'remnant', subcategory: MATS[r.StoneType] || r.StoneType || 'Granite',
      description: `${r.StoneNamePlain || r.StoneName} ${(r.StoneType || 'stone').toLowerCase()} remnant, ${Math.round(r.Dim1)}" x ${Math.round(r.Dim2)}" (~${r.SQFt} sqft), ${r.Thickness || 3}cm. In stock at The Yard, Phoenix — live inventory, posted price.`,
      primary_image_url: IMG(r.Basename), image_urls: [IMG(r.Basename)],
      retail_price: yardRetail(r.Price, r.SQFt), vendor_cost: yardCost(r.Price, r.SQFt), sample_price: null, price_unit: 'each',
      sample_eligible: false, in_stock: true, active: true,
      vendor_url: 'https://theyardaz.com/shop/stone/new-arrivals/remnants',
      tags: ['remnant', 'live-inventory', 'no-sample', 'vendor-import'], currency: 'USD',
      specs: { _source: 'theyardaz-api', material: r.StoneType, piece_size: `${Math.round(r.Dim1)} x ${Math.round(r.Dim2)}`, piece_sqft: r.SQFt, thickness: `${r.Thickness || 3}cm`, each_price: r.Price, yard_product_id: pid, yard_location: r.CurrentLocation },
      size: `${Math.round(r.Dim1)}" x ${Math.round(r.Dim2)}"`,
    });
    if (!error) out.remAdded++;
  }

  // ---------- full slabs: color-level ----------
  const colors = new Map();
  for (const r of fullSlabs) {
    const name = (r.StoneNamePlain || r.StoneName || '').trim();
    if (!name) continue;
    const c = colors.get(norm(name)) || { name, pieces: [], type: r.StoneType, notes: new Set() };
    c.pieces.push(r);
    if (r.PublicNotes) c.notes.add(String(r.PublicNotes).trim());
    colors.set(norm(name), c);
  }
  out.slabColors = colors.size;

  let slabRows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('catalog_products')
      .select('id, name, active, retail_price, vendor_cost, specs')
      .eq('vendor_id', VENDOR_ID).eq('category', 'slab').range(from, from + 999);
    if (error) throw new Error(error.message);
    slabRows = slabRows.concat(data || []);
    if (!data || data.length < 1000) break;
  }
  const rowByName = new Map(slabRows.map((p) => [norm(p.name), p]));

  for (const p of slabRows) {
    const c = colors.get(norm(p.name));
    if (!c && p.active) {
      await supabase.from('catalog_products').update({ active: false, in_stock: false, updated_at: new Date().toISOString() }).eq('id', p.id);
      out.slabRetired++;
    } else if (c) {
      const best = c.pieces.reduce((a, b) => (b.Price / b.SQFt < a.Price / a.SQFt ? b : a));
      const sqftPrice = Math.round((best.Price / best.SQFt) * 100) / 100;
      const fields = {};
      if (!p.active) { fields.active = true; fields.in_stock = true; }
      const cost = yardCost(best.Price, best.SQFt), retail = yardRetail(best.Price, best.SQFt);
      if (Number(p.retail_price) !== retail || Number(p.vendor_cost) !== cost) { fields.retail_price = retail; fields.vendor_cost = cost; fields.sample_price = null; }
      const specs = { ...(p.specs || {}), sqft_price: sqftPrice, each_price: best.Price, slab_sqft: best.SQFt, slab_count: c.pieces.length, yard_product_ids: c.pieces.slice(0, 20).map((x) => x.ProductID) };
      if (JSON.stringify(specs) !== JSON.stringify(p.specs || {})) fields.specs = specs;
      if (Object.keys(fields).length) {
        fields.updated_at = new Date().toISOString();
        await supabase.from('catalog_products').update(fields).eq('id', p.id);
        out.slabUpdated++;
      }
    }
  }
  for (const [key, c] of colors) {
    if (rowByName.has(key)) continue;
    const best = c.pieces.reduce((a, b) => (b.Price / b.SQFt < a.Price / a.SQFt ? b : a));
    const big = c.pieces.reduce((a, b) => (b.SQFt > a.SQFt ? b : a));
    const sqftPrice = Math.round((best.Price / best.SQFt) * 100) / 100;
    const mat = MATS[c.type] || c.type || 'Granite';
    const { error } = await supabase.from('catalog_products').insert({
      vendor_id: VENDOR_ID, brand: [...c.notes][0] || 'The Yard', sku: `import-theyard-${key}`.slice(0, 60),
      name: c.name, slug: `${key}-${norm(mat)}-theyard`, category: 'slab', subcategory: mat,
      description: `${c.name} ${mat.toLowerCase()} — ${c.pieces.length} full slab${c.pieces.length > 1 ? 's' : ''} in stock at The Yard, Phoenix (live inventory, prices posted). From $${sqftPrice}/sqft per slab.`,
      primary_image_url: IMG(best.Basename), image_urls: c.pieces.slice(0, 4).map((x) => IMG(x.Basename)),
      retail_price: yardRetail(best.Price, best.SQFt), vendor_cost: yardCost(best.Price, best.SQFt), sample_price: null, price_unit: 'each',
      sample_eligible: false, in_stock: true, active: true,
      vendor_url: `https://theyardaz.com/shop/stone?SearchTerm=${encodeURIComponent(c.name)}`,
      tags: ['vendor-import', 'no-sample', 'live-inventory'], currency: 'USD',
      specs: { _source: 'theyardaz-api', material: mat, sqft_price: sqftPrice, each_price: best.Price, slab_size: `${Math.round(big.Dim1)} x ${Math.round(big.Dim2)}`, slab_sqft: best.SQFt, slab_count: c.pieces.length, yard_product_ids: c.pieces.slice(0, 20).map((x) => x.ProductID) },
      size: `${Math.round(big.Dim1)}" x ${Math.round(big.Dim2)}"`,
    });
    if (!error) out.slabAdded++;
  }

  // enforce the Cambria ban on anything that slipped in previously
  await supabase.from('catalog_products').update({ active: false, in_stock: false })
    .eq('vendor_id', VENDOR_ID).eq('active', true).ilike('brand', '%cambria%');

  return out;
}

function startTheYardSync(supabase, logger) {
  const log = logger || console;
  const run = async () => {
    try {
      const out = await syncOnce(supabase, log);
      log.info ? log.info('[theYardSync]', out) : console.log('[theYardSync]', JSON.stringify(out));
    } catch (e) {
      log.warn ? log.warn('[theYardSync] failed', { error: e.message }) : console.warn('[theYardSync] failed:', e.message);
    }
  };
  setTimeout(run, 90 * 1000); // first run shortly after boot
  setInterval(run, INTERVAL_MS).unref?.();
}

module.exports = { startTheYardSync, syncOnce };
