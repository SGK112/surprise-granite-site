/**
 * Blueprint takeoff → estimate generator.
 *
 * Inputs: aggregated takeoff numbers (countertop sf/lf, cabinet count/lf,
 * flooring sf, tile sf) + extracted materials_called_out specs from the
 * finish/cabinet schedules.
 *
 * Output: structured estimate with line items, subtotals, margin range, and
 * source attribution (catalog hit vs. industry-average fallback).
 *
 * V1 uses industry-standard rates only. Catalog matching against the SG
 * stone-pricing.json comes in V2 — we'd ship a slim {category, brand, name,
 * price} snapshot inside api/lib/takeoff/ so this Node service doesn't have
 * to reach across to the static site's data files at request time.
 */

// Material-specific waste % — what to over-order to handle cuts, breakage,
// pattern matching, and offcuts. Applied to QUANTITY before pricing.
// User can still override with a global options.waste, but the per-category
// numbers are what a real GC actually plans against.
const WASTE_BY_CATEGORY = {
  // Slabs — vein matching + edge waste + breakage
  quartz:    0.15,
  granite:   0.15,
  quartzite: 0.25, // harder, more breakage
  marble:    0.20,
  porcelain_slab: 0.18,
  stone:     0.15,

  // Tile — pattern + cuts at perimeter
  tile:           0.10, // straight lay
  tile_lg_format: 0.12, // 12x24+ has more cuts
  tile_diagonal:  0.15,
  tile_mosaic:    0.08,

  // Resilient + wood
  flooring_lvp:        0.08,
  flooring_engineered: 0.10,
  flooring_hardwood:   0.12, // random lengths, defect cuts
  flooring_carpet:     0.07,
  flooring_polished_concrete: 0,

  // Cabinets — install only; no slab waste
  cabinet_stock:       0,
  cabinet_semi_custom: 0,
  cabinet_custom:      0,

  // Edge profile — measured to the LF, no waste
  edge_eased:    0,
  edge_bullnose: 0,
};

// Slab yield — usable sf of countertop per slab after edge waste / vein loss.
// 5'x10' slab is 50 sf gross; ~38 sf usable is the rule of thumb most
// fabricators plan against. Override per project if SG buys jumbo slabs.
const USABLE_SF_PER_SLAB = 38;

// Tile carton size — typical SKUs ship 10-15 sf per box. We use 12 as a
// reasonable default; real catalog matching will read the actual box size
// off the product line in V2.
const TILE_SF_PER_CARTON = 12;

// Crew hourly rate used to derive hours from labor $ when no explicit
// hours/unit is set. $65/hr is a reasonable Phoenix mid-market crew rate;
// override with options.crewRate.
const DEFAULT_CREW_RATE = 65;

// Hours per unit by rate key — gives the user a real schedule signal,
// not just dollar amounts. These are mid-range install-time benchmarks.
// `null` = derive from labor_cost / crewRate at runtime.
const HOURS_PER_UNIT = {
  quartz_countertop:    0.50, // template + fab + install per sf
  granite_countertop:   0.55,
  marble_countertop:    0.60,
  quartzite_countertop: 0.65,
  stone_countertop:     0.55,
  edge_eased:           0.12,
  edge_bullnose:        0.20,
  tile_floor:           0.45,
  tile_wall:            0.55,
  tile_lg_format:       0.50,
  porcelain_slab:       0.80,
  flooring_lvp:         0.15,
  flooring_hardwood:    0.40,
  flooring_engineered:  0.30,
  flooring_carpet:      0.10,
  flooring_polished_concrete: 0.25,
  cabinet_stock_install:        2.50, // per LF
  cabinet_semi_custom_install:  3.50,
  cabinet_custom_install:       5.00,
};

// Phoenix-area mid-range rates, $ per unit installed unless flagged otherwise.
// Material rate = product cost; labor rate = fab + install combined.
const INDUSTRY_RATES = {
  // Slabs (per sqft)
  quartz_countertop:   { material: 60, labor: 25, unit: 'sf' },
  granite_countertop:  { material: 55, labor: 22, unit: 'sf' },
  marble_countertop:   { material: 75, labor: 28, unit: 'sf' },
  quartzite_countertop:{ material: 80, labor: 28, unit: 'sf' },
  stone_countertop:    { material: 60, labor: 25, unit: 'sf' }, // generic fallback

  // Edges (per linear foot)
  edge_eased:          { material: 0,  labor: 8,  unit: 'lf' },
  edge_bullnose:       { material: 0,  labor: 14, unit: 'lf' },

  // Tile (per sqft)
  tile_floor:          { material: 8,  labor: 7,  unit: 'sf' },
  tile_wall:           { material: 8,  labor: 9,  unit: 'sf' },
  tile_lg_format:      { material: 11, labor: 9,  unit: 'sf' }, // 12x24 / 24x24 / 24x48
  porcelain_slab:      { material: 45, labor: 28, unit: 'sf' },

  // Flooring (per sqft)
  flooring_lvp:        { material: 4,  labor: 3,  unit: 'sf' },
  flooring_hardwood:   { material: 8,  labor: 6,  unit: 'sf' },
  flooring_engineered: { material: 6,  labor: 4,  unit: 'sf' },
  flooring_carpet:     { material: 3.5,labor: 1.5,unit: 'sf' },
  flooring_polished_concrete: { material: 0, labor: 5, unit: 'sf' },

  // Cabinets (per linear foot — supply + install). GC convention varies:
  // some GCs supply, some defer to owner. We default to supply included so
  // SG (which sells cabinets) gets a complete bid; user can zero out the
  // material with the "owner supplies" toggle on the cabinet line if needed.
  cabinet_stock_install:       { material: 200, labor: 175, unit: 'lf' },
  cabinet_semi_custom_install: { material: 425, labor: 325, unit: 'lf' },
  cabinet_custom_install:      { material: 700, labor: 525, unit: 'lf' },
};

/**
 * Best-effort categorization of a free-text material spec into our rate keys.
 * Returns null if we can't classify confidently — caller falls back to
 * generic per-category default.
 */
function refineCategory(spec, category) {
  const s = (spec || '').toLowerCase();
  const c = (category || '').toLowerCase();

  if (c === 'quartz' || /quartz|caesarstone|silestone|cambria|hanstone|msi[\s-]?q|viatera|corian/.test(s)) return 'quartz';
  if (c === 'granite' || /granite/.test(s)) return 'granite';
  if (c === 'marble' || /marble|carrar[ai]|calacat[at]a|statuario|thassos/.test(s)) return 'marble';
  if (c === 'quartzite' || /quartzite|taj mahal|fantasy brown/.test(s)) return 'quartzite';
  if (/porcelain.*slab|panoramic.*porcelain/.test(s)) return 'porcelain_slab';

  // Tile size hints
  if (c === 'tile' || /\btile\b|porcelain|ceramic/.test(s)) {
    if (/12x24|24x24|24x48|24x36|6x24|9x36/.test(s)) return 'tile_lg_format';
    return 'tile';
  }

  if (c === 'flooring' || /\bflooring\b/.test(s)) {
    if (/lvp|luxury vinyl|spc|wpc|vinyl plank/.test(s)) return 'flooring_lvp';
    if (/engineered/.test(s)) return 'flooring_engineered';
    if (/hardwood|solid oak|solid maple|solid hickory|brazilian/.test(s)) return 'flooring_hardwood';
    if (/carpet|broadloom/.test(s)) return 'flooring_carpet';
    if (/polished concrete|sealed concrete|exposed concrete/.test(s)) return 'flooring_polished_concrete';
    return 'flooring_lvp';
  }

  if (c === 'cabinet' || c === 'millwork') {
    if (/full custom|fully custom/.test(s)) return 'cabinet_custom';
    if (/semi[\s-]?custom/.test(s)) return 'cabinet_semi_custom';
    return 'cabinet_stock';
  }

  return null;
}

function pickMaterial(materials, predicate) {
  if (!Array.isArray(materials)) return null;
  return materials.find(m => m && predicate(m));
}

// Push one combined line, OR — when both material and labor rates are
// non-zero — push a material-supply line + a labor-install line as a pair.
// Splitting is enabled by default: GCs want to price-shop material and labor
// separately, mark either as owner-supplied, swap subs on the labor line, or
// send the material list to a vendor for a quote. Same total cost either way.
//
// Each split line keeps category/trade/code/qty/unit/ordering identical so the
// trade rollup and ordering math (slabs, cartons) still aggregate correctly.
function buildSplit(opts, { splitMatLab = true } = {}) {
  const matRate = Number(opts.matRate) || 0;
  const labRate = Number(opts.labRate) || 0;
  // No real split needed if one side is already zero.
  if (!splitMatLab || matRate === 0 || labRate === 0) {
    return [lineItem(opts)];
  }
  const matLine = lineItem({
    ...opts,
    description: `${opts.description} — material`,
    matRate,
    labRate: 0,
    extra: { ...(opts.extra || {}), bid_split: 'material', paired_with: opts.rateKey || opts.category },
  });
  // Field hours are an attribute of labor, not material — zero out the
  // material-side hours so they don't double-count in the rollup.
  matLine.hours = 0;
  const labLine = lineItem({
    ...opts,
    description: `${opts.description} — labor (install)`,
    matRate: 0,
    labRate,
    ordering: null, // ordering math (slabs, cartons) belongs to the material line only
    extra: { ...(opts.extra || {}), bid_split: 'labor', paired_with: opts.rateKey || opts.category },
  });
  return [matLine, labLine];
}

function lineItem({ category, trade, description, code, qty, unit, matRate, labRate, source, selfPerform, ordering, rateKey, crewRate, extra }) {
  const matCost = Math.round(qty * matRate);
  const labCost = Math.round(qty * labRate);
  // Hours: prefer explicit hours/unit benchmark, else derive from labor $ ÷ crew rate.
  const hpu = HOURS_PER_UNIT[rateKey];
  const cr = Number.isFinite(crewRate) && crewRate > 0 ? crewRate : DEFAULT_CREW_RATE;
  const hours = Number.isFinite(hpu) ? Math.round(qty * hpu * 10) / 10 : Math.round((labCost / cr) * 10) / 10;
  return {
    category,
    trade: trade || category,
    description,
    code: code || null,
    qty: Math.round(qty * 10) / 10,
    unit,
    material_unit: matRate,
    labor_unit: labRate,
    material_cost: matCost,
    labor_cost: labCost,
    total: matCost + labCost,
    hours,
    rate_key: rateKey || null,
    source,
    self_perform: selfPerform || 'sub',
    ordering: ordering || null,
    ...(extra || {}),
  };
}

// Default self-perform assignment for SG (countertop fab is core competency,
// other trades are typically subbed on commercial GC work).
function defaultSelfPerform(trade) {
  if (trade === 'countertops' || trade === 'countertop_edge') return 'self';
  if (trade === 'general_conditions') return 'self';
  return 'sub';
}

function buildEstimate({ takeoff = {}, materials = [], projectType = 'commercial', options = {} } = {}) {
  const margin = Number.isFinite(options.margin) ? options.margin : 0.30;
  // Global waste override; if not provided, each line uses its category default.
  const wasteOverride = Number.isFinite(options.waste) ? options.waste : null;
  const gcOverheadPct = Number.isFinite(options.gcOverhead) ? options.gcOverhead : 0.08;
  const usableSfPerSlab = Number.isFinite(options.usableSfPerSlab) ? options.usableSfPerSlab : USABLE_SF_PER_SLAB;
  const tileSfPerCarton = Number.isFinite(options.tileSfPerCarton) ? options.tileSfPerCarton : TILE_SF_PER_CARTON;

  // userRates: { rateKey: { material, labor } } — overlays INDUSTRY_RATES per
  // category. Lets a user save their actual SG pricing once and have every
  // future estimate use those numbers instead of the Phoenix industry avg.
  const userRates = (options.userRates && typeof options.userRates === 'object') ? options.userRates : {};
  // materialPriceOverrides: { [materialCode]: { material: $/u, source: "Vendor SKU" } }
  // Set by frontend after matching extracted materials against vendor catalogs.
  // Wins over both userRates and industry avg for the matching line.
  const matOverrides = (options.materialPriceOverrides && typeof options.materialPriceOverrides === 'object') ? options.materialPriceOverrides : {};
  const crewRate = Number.isFinite(options.crewRate) && options.crewRate > 0 ? options.crewRate : DEFAULT_CREW_RATE;
  const ratesFor = key => {
    const base = INDUSTRY_RATES[key] || {};
    const ovr = userRates[key] || {};
    return {
      material: Number.isFinite(+ovr.material) ? +ovr.material : base.material,
      labor:    Number.isFinite(+ovr.labor)    ? +ovr.labor    : base.labor,
      unit:     base.unit || ovr.unit,
      _override: !!(Number.isFinite(+ovr.material) || Number.isFinite(+ovr.labor)),
    };
  };

  const wasteFor = key => (wasteOverride !== null ? wasteOverride : (WASTE_BY_CATEGORY[key] ?? 0.10));

  // splitMatLab: emit two line items per trade (material + labor) instead of
  // one combined line. Default true — GCs typically want them apart so they
  // can price-shop materials, hire labor subs separately, or mark either as
  // owner-supplied. Set options.splitMatLab=false to keep the legacy combined view.
  const splitMatLab = options.splitMatLab !== false;

  const lineItems = [];
  const notes = [];
  const num = v => { const n = +v; return Number.isFinite(n) ? n : 0; };

  // Helper that pushes either 1 combined or 2 split lines per the option.
  const pushLine = (opts) => lineItems.push(...buildSplit(opts, { splitMatLab }));

  // ---- Countertop slab ----
  const ctSqft = num(takeoff.countertop_sqft);
  if (ctSqft > 0) {
    const ctMat = pickMaterial(materials, m => /quartz|granite|marble|quartzite|stone/i.test(m.category) || /quartz|granite|marble|quartzite/i.test(m.spec || ''));
    const refined = ctMat ? (refineCategory(ctMat.spec, ctMat.category) || 'stone') : 'quartz';
    const rateKey = `${refined}_countertop`;
    const rates = ratesFor(rateKey).material != null ? ratesFor(rateKey) : ratesFor('stone_countertop');
    const wf = wasteFor(refined);
    const qty = ctSqft * (1 + wf);
    const slabsToOrder = Math.ceil(qty / usableSfPerSlab);

    // Priority order for material price:
    //   1. Frontend-resolved vendor catalog match (matOverrides[code])
    //   2. User My Pricing override (rates._override)
    //   3. SG slab catalog match (matchCatalog)
    //   4. Industry avg (rates.material)
    const codeOverride = ctMat?.code ? matOverrides[ctMat.code] : null;
    const hit = ctMat && !codeOverride ? matchCatalog(ctMat.spec, refined) : null;
    const matRate = codeOverride ? Number(codeOverride.material)
                  : rates._override ? rates.material
                  : (hit?.item?.price > 0 ? hit.item.price : rates.material);
    const description = codeOverride && codeOverride.source
      ? codeOverride.source
      : hit
      ? `${hit.item.name}${hit.item.brand ? ' — ' + hit.item.brand : ''}${hit.item.tier ? ' (' + hit.item.tier + ')' : ''}`
      : (ctMat?.spec || `${refined.charAt(0).toUpperCase()}${refined.slice(1)} countertop`);
    const source = codeOverride
      ? `Vendor catalog match (${codeOverride.source})`
      : rates._override
      ? 'My Pricing (saved override)'
      : (hit ? `SG catalog (${hit.confidence} match: ${hit.matchedOn})` : 'industry avg (Phoenix mid-range)');

    pushLine({
      category: 'countertop',
      trade: 'countertops',
      description,
      code: ctMat?.code,
      qty,
      unit: 'sf',
      matRate,
      labRate: rates.labor,
      source,
      selfPerform: 'self',
      rateKey, crewRate,
      ordering: {
        slabs: slabsToOrder,
        usable_sf_per_slab: usableSfPerSlab,
        raw_sf: ctSqft,
        waste_pct: Math.round(wf*100),
        catalog_id: hit?.item?.id || null,
        catalog_brand: hit?.item?.brand || null,
      },
    });

    if (!ctMat) {
      notes.push(`No quartz/granite/marble spec found in materials — defaulted to ${refined} @ industry avg. Edit the Materials table to refine.`);
    } else if (!hit) {
      notes.push(`Spec "${ctMat.spec}" not matched in SG catalog — used industry avg $${rates.material}/sf. Add to catalog or edit spec for exact pricing.`);
    }
  }

  // ---- Countertop edge ----
  const ctLf = num(takeoff.countertop_lf);
  if (ctLf > 0) {
    const rates = ratesFor('edge_eased');
    pushLine({
      category: 'countertop_edge',
      trade: 'countertops',
      description: 'Edge profile — eased (bullnose +$6/lf, ogee +$10/lf)',
      qty: ctLf,
      unit: 'lf',
      matRate: rates.material,
      labRate: rates.labor,
      source: rates._override ? 'My Pricing' : 'industry avg',
      selfPerform: 'self',
      rateKey: 'edge_eased', crewRate,
    });
  }

  // ---- Cabinets (install) ----
  const cabLf = num(takeoff.cabinet_lf);
  const cabCount = num(takeoff.cabinet_count);
  if (cabLf > 0) {
    const cabMat = pickMaterial(materials, m => /cabinet|millwork/i.test(m.category));
    const refined = cabMat ? (refineCategory(cabMat.spec, cabMat.category) || 'cabinet_stock') : 'cabinet_stock';
    const rateKey = `${refined}_install`;
    const rates = ratesFor(rateKey).labor != null ? ratesFor(rateKey) : ratesFor('cabinet_stock_install');
    pushLine({
      category: 'cabinet',
      trade: 'cabinets',
      description: cabMat?.spec || `Cabinets — ${refined.replace(/_/g,' ')} (supply + install)`,
      code: cabMat?.code,
      qty: cabLf,
      unit: 'lf',
      matRate: rates.material,
      labRate: rates.labor,
      source: rates._override ? 'My Pricing' : 'industry avg (supply + install)',
      selfPerform: 'self',
      rateKey, crewRate,
      extra: { cabinet_count: cabCount, owner_supplies_toggle: true },
    });
    if (!cabMat) {
      notes.push('Cabinet style/brand not specified on plans — assumed stock supply + install. Edit the cabinet line if owner supplies, or refine the spec for accurate pricing.');
    }
  }

  // ---- Flooring ----
  const flSqft = num(takeoff.flooring_sqft);
  if (flSqft > 0) {
    const flMat = pickMaterial(materials, m => /flooring/i.test(m.category));
    const refined = flMat ? (refineCategory(flMat.spec, flMat.category) || 'flooring_lvp') : 'flooring_lvp';
    const rates = ratesFor(refined).material != null ? ratesFor(refined) : ratesFor('flooring_lvp');
    const wf = wasteFor(refined);
    const qty = flSqft * (1 + wf);
    const codeOverride = flMat?.code ? matOverrides[flMat.code] : null;
    const matRate = codeOverride ? Number(codeOverride.material) : rates.material;
    pushLine({
      category: 'flooring',
      trade: 'flooring',
      description: codeOverride?.source || flMat?.spec || refined.replace(/_/g, ' '),
      code: flMat?.code,
      qty,
      unit: 'sf',
      matRate,
      labRate: rates.labor,
      source: codeOverride ? `Vendor catalog match (${codeOverride.source})` : (rates._override ? 'My Pricing' : 'industry avg'),
      selfPerform: 'sub',
      rateKey: refined, crewRate,
      ordering: { raw_sf: flSqft, waste_pct: Math.round(wf*100) },
    });
  }

  // ---- Tile ----
  const tileSqft = num(takeoff.tile_sqft);
  if (tileSqft > 0) {
    const tileMat = pickMaterial(materials, m => /tile/i.test(m.category));
    const refined = tileMat ? (refineCategory(tileMat.spec, tileMat.category) || 'tile') : 'tile';
    const rates = ratesFor(refined).material != null ? ratesFor(refined) : ratesFor('tile_floor');
    const wf = wasteFor(refined === 'tile_lg_format' ? 'tile_lg_format' : 'tile');
    const qty = tileSqft * (1 + wf);
    const cartons = Math.ceil(qty / tileSfPerCarton);
    const codeOverride = tileMat?.code ? matOverrides[tileMat.code] : null;
    const matRate = codeOverride ? Number(codeOverride.material) : rates.material;
    pushLine({
      category: 'tile',
      trade: 'tile',
      description: codeOverride?.source || tileMat?.spec || 'Tile (assumed floor — adjust for wall/backsplash)',
      code: tileMat?.code,
      qty,
      unit: 'sf',
      matRate,
      labRate: rates.labor,
      source: codeOverride ? `Vendor catalog match (${codeOverride.source})` : (rates._override ? 'My Pricing' : 'industry avg'),
      selfPerform: 'sub',
      rateKey: refined, crewRate,
      ordering: { cartons, sf_per_carton: tileSfPerCarton, raw_sf: tileSqft, waste_pct: Math.round(wf*100) },
    });
  }

  // ---- General Conditions (GC overhead) ----
  // Supervision, project mgmt, dumpster, port-a-john, temp utilities, insurance.
  // Industry-standard 5-10% of trade subtotal; default 8%. This is GC overhead
  // BEFORE margin — margin is on top of this.
  const tradeSub = lineItems.reduce((s, li) => s + li.total, 0);
  if (tradeSub > 0 && gcOverheadPct > 0) {
    const gc = Math.round(tradeSub * gcOverheadPct);
    lineItems.push({
      category: 'general_conditions',
      trade: 'general_conditions',
      description: 'General conditions — supervision, PM, dumpster, port-a-john, temp utilities, insurance',
      code: null,
      qty: 1,
      unit: 'lump',
      material_unit: 0,
      labor_unit: gc,
      material_cost: 0,
      labor_cost: gc,
      total: gc,
      hours: 0, // GC overhead is a fee, not field hours
      rate_key: null,
      source: `GC overhead — ${Math.round(gcOverheadPct*100)}% of trade subtotal`,
      self_perform: 'self',
      ordering: null,
    });
  }

  // ---- Subtotals + per-trade rollup ----
  const matSub = lineItems.reduce((s, li) => s + li.material_cost, 0);
  const labSub = lineItems.reduce((s, li) => s + li.labor_cost, 0);
  const subtotal = matSub + labSub;
  const overhead = Math.round(subtotal * margin);
  const total = subtotal + overhead;

  const trades = {};
  for (const li of lineItems) {
    const t = li.trade || 'other';
    if (!trades[t]) trades[t] = { trade: t, material: 0, labor: 0, total: 0, items: 0 };
    trades[t].material += li.material_cost;
    trades[t].labor += li.labor_cost;
    trades[t].total += li.total;
    trades[t].items += 1;
  }
  const tradeRollup = Object.values(trades).sort((a, b) => b.total - a.total);

  // Reference-only material codes that didn't make it into a priced line
  // (e.g. paint specs, hardware, accent tile callouts) — surface these so
  // the estimator knows to add them manually.
  const usedCodes = new Set(lineItems.map(li => li.code).filter(Boolean));
  const unbilled = materials
    .filter(m => m && m.code && !usedCodes.has(m.code))
    .map(m => ({ code: m.code, category: m.category, spec: m.spec }));

  const totalHours = lineItems.reduce((s, li) => s + (li.hours || 0), 0);

  return {
    line_items: lineItems,
    trade_rollup: tradeRollup,
    subtotals: {
      material: matSub,
      labor: labSub,
      overhead,
      subtotal,
      gc_overhead_pct: gcOverheadPct,
    },
    total_hours: Math.round(totalHours * 10) / 10,
    crew_rate: crewRate,
    total,
    margin_range: {
      low: Math.round(total * 0.85),
      high: Math.round(total * 1.15),
    },
    waste_strategy: wasteOverride !== null
      ? `flat ${Math.round(wasteOverride*100)}% override`
      : 'per-category (granite/quartz 15%, quartzite 25%, marble 20%, tile 10-15%, LVP 8%, hardwood 12%)',
    margin_factor: margin,
    gc_overhead_factor: gcOverheadPct,
    project_type: projectType,
    notes,
    unbilled_materials: unbilled,
    generated_at: new Date().toISOString(),
    rate_source: 'Industry averages, Phoenix mid-range. SG catalog matching layered on top for slabs.',
  };
}

// ---------------------------------------------------------------------------
// Catalog matching — match a free-text material spec against the SG
// stone-pricing.json (granite/quartz/quartzite/marble/porcelain). Returns
// { item, confidence, matchedOn } or null. Confidence: name | brand+token | tier.
// Used by buildEstimate's V2 path; cached at module load.
// ---------------------------------------------------------------------------
let __catalog = null;
function loadCatalog() {
  if (__catalog) return __catalog;
  const path = require('path');
  const fs = require('fs');
  const candidates = [
    path.join(__dirname, '../../../tools/room-designer/stone-pricing.json'),
    path.join(__dirname, '../../data/stone-pricing.json'),
    path.join(process.cwd(), 'tools/room-designer/stone-pricing.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        __catalog = JSON.parse(fs.readFileSync(p, 'utf8'));
        return __catalog;
      }
    } catch (_) { /* try next */ }
  }
  __catalog = {}; // empty fallback so we don't keep stat'ing
  return __catalog;
}

function matchCatalog(spec, categoryHint) {
  if (!spec) return null;
  const catalog = loadCatalog();
  if (!catalog || typeof catalog !== 'object') return null;

  const s = spec.toLowerCase();
  // Decide which catalog buckets to search based on category hint.
  let buckets;
  const c = (categoryHint || '').toLowerCase();
  if (c === 'granite') buckets = ['granite'];
  else if (c === 'quartz') buckets = ['quartz'];
  else if (c === 'quartzite') buckets = ['quartzite'];
  else if (c === 'marble') buckets = ['marble'];
  else if (c === 'stone') buckets = ['granite','quartz','quartzite','marble'];
  else buckets = Object.keys(catalog).filter(k => Array.isArray(catalog[k]));

  let best = null;

  for (const bucket of buckets) {
    const items = catalog[bucket];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const name = (item.name || '').toLowerCase();
      const brand = (item.brand || '').toLowerCase();
      if (!name) continue;

      // Tier 1: full name appears in spec — high confidence
      if (name.length > 3 && s.includes(name)) {
        return { item, confidence: 'name', matchedOn: name, bucket };
      }
      // Tier 2: brand match + at least one significant name token (>3 chars)
      if (brand && s.includes(brand)) {
        const tokens = name.split(/\s+/).filter(t => t.length > 3);
        for (const t of tokens) {
          if (s.includes(t)) {
            const cand = { item, confidence: 'brand+token', matchedOn: `${brand}/${t}`, bucket };
            if (!best) best = cand;
          }
        }
      }
    }
  }
  return best;
}

module.exports = { buildEstimate, INDUSTRY_RATES, refineCategory, matchCatalog, loadCatalog };
