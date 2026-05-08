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

  // Cabinets (per linear foot — cabinets purchased separately, install only)
  cabinet_stock_install:       { material: 0, labor: 175, unit: 'lf' },
  cabinet_semi_custom_install: { material: 0, labor: 325, unit: 'lf' },
  cabinet_custom_install:      { material: 0, labor: 525, unit: 'lf' },
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

function lineItem({ category, description, code, qty, unit, matRate, labRate, source, extra }) {
  const matCost = Math.round(qty * matRate);
  const labCost = Math.round(qty * labRate);
  return {
    category,
    description,
    code: code || null,
    qty: Math.round(qty * 10) / 10,
    unit,
    material_unit: matRate,
    labor_unit: labRate,
    material_cost: matCost,
    labor_cost: labCost,
    total: matCost + labCost,
    source,
    ...(extra || {}),
  };
}

function buildEstimate({ takeoff = {}, materials = [], projectType = 'commercial', options = {} } = {}) {
  const margin = Number.isFinite(options.margin) ? options.margin : 0.30;
  const waste = Number.isFinite(options.waste) ? options.waste : 0.10;

  const lineItems = [];
  const notes = [];

  const num = v => {
    const n = +v;
    return Number.isFinite(n) ? n : 0;
  };

  // ---- Countertop slab ----
  const ctSqft = num(takeoff.countertop_sqft);
  if (ctSqft > 0) {
    const ctMat = pickMaterial(materials, m => /quartz|granite|marble|quartzite|stone/i.test(m.category) || /quartz|granite|marble|quartzite/i.test(m.spec || ''));
    const refined = ctMat ? (refineCategory(ctMat.spec, ctMat.category) || 'stone') : 'quartz';
    const rateKey = `${refined}_countertop`;
    const rates = INDUSTRY_RATES[rateKey] || INDUSTRY_RATES.stone_countertop;
    const qty = ctSqft * (1 + waste);
    lineItems.push(lineItem({
      category: 'countertop',
      description: ctMat?.spec || `${refined.charAt(0).toUpperCase()}${refined.slice(1)} countertop`,
      code: ctMat?.code,
      qty,
      unit: 'sf',
      matRate: rates.material,
      labRate: rates.labor,
      source: 'industry avg (Phoenix mid-range)',
      extra: { waste_applied: waste },
    }));
    if (!ctMat) notes.push('No quartz/granite/marble spec found in materials — defaulted to quartz @ industry avg. Edit the materials table for accuracy.');
  }

  // ---- Countertop edge ----
  const ctLf = num(takeoff.countertop_lf);
  if (ctLf > 0) {
    const rates = INDUSTRY_RATES.edge_eased;
    lineItems.push(lineItem({
      category: 'countertop_edge',
      description: 'Edge profile — eased (default; bullnose +$6/lf)',
      qty: ctLf,
      unit: 'lf',
      matRate: rates.material,
      labRate: rates.labor,
      source: 'industry avg',
    }));
  }

  // ---- Cabinets (install) ----
  const cabLf = num(takeoff.cabinet_lf);
  const cabCount = num(takeoff.cabinet_count);
  if (cabLf > 0) {
    const cabMat = pickMaterial(materials, m => /cabinet|millwork/i.test(m.category));
    const refined = cabMat ? (refineCategory(cabMat.spec, cabMat.category) || 'cabinet_stock') : 'cabinet_stock';
    const rateKey = `${refined}_install`;
    const rates = INDUSTRY_RATES[rateKey] || INDUSTRY_RATES.cabinet_stock_install;
    lineItems.push(lineItem({
      category: 'cabinet',
      description: cabMat?.spec || 'Cabinets — install labor only (cabinets supplied separately)',
      code: cabMat?.code,
      qty: cabLf,
      unit: 'lf',
      matRate: 0,
      labRate: rates.labor,
      source: 'industry avg (install only)',
      extra: { cabinet_count: cabCount },
    }));
    notes.push('Cabinet material cost is NOT included — assumes GC or owner supplies cabinets. Add a cabinet supply line manually if SG is providing.');
  }

  // ---- Flooring ----
  const flSqft = num(takeoff.flooring_sqft);
  if (flSqft > 0) {
    const flMat = pickMaterial(materials, m => /flooring/i.test(m.category));
    const refined = flMat ? (refineCategory(flMat.spec, flMat.category) || 'flooring_lvp') : 'flooring_lvp';
    const rates = INDUSTRY_RATES[refined] || INDUSTRY_RATES.flooring_lvp;
    const qty = flSqft * (1 + waste);
    lineItems.push(lineItem({
      category: 'flooring',
      description: flMat?.spec || refined.replace(/_/g, ' '),
      code: flMat?.code,
      qty,
      unit: 'sf',
      matRate: rates.material,
      labRate: rates.labor,
      source: 'industry avg',
      extra: { waste_applied: waste },
    }));
  }

  // ---- Tile ----
  const tileSqft = num(takeoff.tile_sqft);
  if (tileSqft > 0) {
    const tileMat = pickMaterial(materials, m => /tile/i.test(m.category));
    const refined = tileMat ? (refineCategory(tileMat.spec, tileMat.category) || 'tile') : 'tile';
    const rates = INDUSTRY_RATES[refined] || INDUSTRY_RATES.tile_floor;
    const qty = tileSqft * (1 + waste);
    lineItems.push(lineItem({
      category: 'tile',
      description: tileMat?.spec || 'Tile (assumed floor — adjust for wall/backsplash)',
      code: tileMat?.code,
      qty,
      unit: 'sf',
      matRate: rates.material,
      labRate: rates.labor,
      source: 'industry avg',
      extra: { waste_applied: waste },
    }));
  }

  // ---- Subtotals ----
  const matSub = lineItems.reduce((s, li) => s + li.material_cost, 0);
  const labSub = lineItems.reduce((s, li) => s + li.labor_cost, 0);
  const subtotal = matSub + labSub;
  const overhead = Math.round(subtotal * margin);
  const total = subtotal + overhead;

  // Reference-only material codes that didn't make it into a priced line
  // (e.g. paint specs, hardware, accent tile callouts) — surface these so
  // the estimator knows to add them manually.
  const usedCodes = new Set(lineItems.map(li => li.code).filter(Boolean));
  const unbilled = materials
    .filter(m => m && m.code && !usedCodes.has(m.code))
    .map(m => ({ code: m.code, category: m.category, spec: m.spec }));

  return {
    line_items: lineItems,
    subtotals: { material: matSub, labor: labSub, overhead, subtotal },
    total,
    margin_range: {
      low: Math.round(total * 0.85),
      high: Math.round(total * 1.15),
    },
    waste_factor: waste,
    margin_factor: margin,
    project_type: projectType,
    notes,
    unbilled_materials: unbilled,
    generated_at: new Date().toISOString(),
    rate_source: 'V1 — industry averages only. V2 will match against SG catalog (stone-pricing.json).',
  };
}

module.exports = { buildEstimate, INDUSTRY_RATES, refineCategory };
