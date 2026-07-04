// Countertop JOB quote engine — mirrors how Surprise Granite quotes today in
// Moraware CounterGo (rates confirmed by Josh, 2026-07). Countertops are a
// quote-to-job product (slab bought per-job via distributor), NOT a shippable
// e-commerce item — this prices a fabrication+install job, not a cart checkout.
//
// Slab: priced by the SQFT, sold by the slab; add 20% for waste.
// Everything else is per-sqft / per-unit / per-linear-ft as below. Rates live in
// COUNTERTOP_PRICING so Josh can tune them in one place (or override per-quote).

const COUNTERTOP_PRICING = {
  wastePct: 0.20,                 // +20% material for waste (slabs sold whole)
  materialMarkupX: 2.0,           // sell price = vendor cost/sqft x this (override per quote)
  fabricationPerSqft: 35.00,      // fabrication STARTS at $35/sqft
  installPerSqft: 20.00,          // install $20/sqft (priced + sold by sqft)
  demoPerSqft: { none: 0, light: 5, standard: 10, heavy: 20 }, // tear-out tiers
  plumbing: { kitchenSink: 550, bathroomSink: 250 },           // reconnect per sink
  edge: {
    flat: 0,          // flat polish is free
    mitered: 20,      // mitered edge $20 / linear ft
  },
};

const round2 = (n) => Math.round(n * 100) / 100;
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/**
 * Quote a countertop job.
 * @param {object} o
 * @param {number} o.sqft            finished countertop area (sqft)
 * @param {number} o.materialPerSqft slab price per sqft (the color's $/sqft)
 * @param {number} [o.edgeLinearFt]  linear ft of edge
 * @param {string} [o.edgeType]      'flat' (free) | 'mitered'
 * @param {number} [o.kitchenSinks]  # kitchen sink plumbing reconnects
 * @param {number} [o.bathroomSinks] # bathroom sink plumbing reconnects
 * @param {string} [o.demoLevel]     'none'|'light'|'standard'|'heavy'
 * @param {number} [o.demoSqft]      area to demo (defaults to sqft)
 * @param {object} [o.rates]         override any COUNTERTOP_PRICING field
 * @param {Array}  [o.extras]        [{ description, amount }] misc line items
 */
function quoteCountertop(o = {}) {
  const P = { ...COUNTERTOP_PRICING, ...(o.rates || {}) };
  const sqft = num(o.sqft);
  if (!(sqft > 0)) throw new Error('sqft is required and must be > 0');
  const materialPerSqft = num(o.materialPerSqft);

  const lines = [];
  const add = (description, qty, unit, unitPrice) => {
    const amount = round2(qty * unitPrice);
    lines.push({ description, quantity: round2(qty), unit, unitPrice: round2(unitPrice), amount });
    return amount;
  };

  // Material — slab priced by sqft, +20% waste (sold whole, so we bill the waste).
  const billedSqft = round2(sqft * (1 + P.wastePct));
  if (materialPerSqft > 0) {
    add(`Slab material (${sqft} sqft + ${Math.round(P.wastePct * 100)}% waste)`, billedSqft, 'sqft', materialPerSqft);
  }
  // Fabrication + install (on finished sqft).
  add('Fabrication', sqft, 'sqft', P.fabricationPerSqft);
  add('Installation', sqft, 'sqft', P.installPerSqft);
  // Demo / tear-out.
  const demoLevel = o.demoLevel || 'none';
  const demoRate = P.demoPerSqft[demoLevel] || 0;
  if (demoRate > 0) add(`Demo / tear-out (${demoLevel})`, num(o.demoSqft, sqft), 'sqft', demoRate);
  // Edge detail (flat polish free).
  const edgeType = (o.edgeType || 'flat').toLowerCase();
  const edgeRate = P.edge[edgeType] ?? 0;
  const edgeLf = num(o.edgeLinearFt);
  if (edgeRate > 0 && edgeLf > 0) add(`Edge detail (${edgeType})`, edgeLf, 'linear ft', edgeRate);
  // Plumbing reconnects.
  if (num(o.kitchenSinks) > 0) add('Kitchen sink plumbing', num(o.kitchenSinks), 'each', P.plumbing.kitchenSink);
  if (num(o.bathroomSinks) > 0) add('Bathroom sink plumbing', num(o.bathroomSinks), 'each', P.plumbing.bathroomSink);
  // Misc extras.
  for (const e of (o.extras || [])) if (e && e.description && num(e.amount)) lines.push({ description: e.description, quantity: 1, unit: 'ea', unitPrice: round2(num(e.amount)), amount: round2(num(e.amount)) });

  const total = round2(lines.reduce((s, l) => s + l.amount, 0));
  return {
    sqft, billedSqft, materialPerSqft: round2(materialPerSqft),
    lineItems: lines,
    total,
    perSqftAllIn: sqft > 0 ? round2(total / sqft) : 0,
    rates: P,
  };
}

/**
 * Resolve a color name to its vendor cost per sqft from the master price list
 * (catalog_products carries the cost library's $/sqft via the nightly join and
 * the sample-pricer; specs.sqft_price marks a deterministic price-book match).
 * Returns { name, vendor, costPerSqft, productId, source } or null.
 */
async function resolveColorCost(supabase, colorName) {
  const q = String(colorName || '').trim();
  if (!q || !supabase) return null;
  const { data, error } = await supabase
    .from('catalog_products')
    .select('id,name,vendor_id,vendor_cost,specs')
    .eq('category', 'slab').eq('active', true)
    .ilike('name', `%${q.replace(/[%_]/g, '')}%`)
    .limit(12);
  if (error || !data || !data.length) return null;
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const scored = data.map((p) => {
    const sqftPrice = Number(p.specs?.sqft_price) || 0;
    const cost = sqftPrice || Number(p.vendor_cost) || 0;
    let score = 0;
    if (norm(p.name) === norm(q)) score += 4;                    // exact color
    else if (norm(p.name).startsWith(norm(q))) score += 2;       // prefix (finish variants)
    if (sqftPrice > 0) score += 2;                               // price-book verified
    else if (cost > 0) score += 1;
    return { p, cost, score };
  }).filter((x) => x.cost > 0).sort((a, b) => b.score - a.score || a.cost - b.cost);
  if (!scored.length) return null;
  const best = scored[0];
  return {
    name: best.p.name, vendor: best.p.vendor_id, productId: best.p.id,
    costPerSqft: round2(best.cost),
    source: best.p.specs?.sqft_price ? 'price-book' : 'master-list join',
  };
}

module.exports = { quoteCountertop, resolveColorCost, COUNTERTOP_PRICING };
