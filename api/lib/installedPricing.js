/**
 * Installed-price math — the single source of truth for turning a catalog row's
 * raw material price into what we quote a customer and what it actually costs us.
 *
 * Extracted from routes/catalog.js so the public catalog, the admin catalog and
 * anything else that renders margin all use ONE copy. Two copies of this formula
 * drift, and a drifted copy shows the owner a margin that doesn't exist.
 *
 * Why a naive (retail - cost) / retail is WRONG for The Yard:
 *   retail_price there is the pre-tax raw material price, while vendor_cost is
 *   that same price + 9.1% AZ tax. Comparing them yields exactly -9.1% on every
 *   row — which reads as "selling every remnant at a loss" when in fact the
 *   margin lives in fabrication ($55/sqft charged vs $26/sqft cost).
 */

// The Yard charges us 9.1% AZ sales tax on the material (we're not tax-exempt with them —
// see order #67349: $295 + $26.85 tax). That tax is a real cost, so our cost = raw*1.091 +
// $26/sqft fab. Customer price is unchanged (margin absorbs the tax).
const YARD_TAX = 1.091;

const FAB_INSTALL_CHARGED = 55; // $/sqft billed to the customer
const FAB_INSTALL_COST = 26;    // $/sqft it costs us
const REMNANT_PICKUP = 150;     // flat pickup on remnants

function sqftFromSize(size) {
  if (!size) return 0;
  const m = String(size).match(/(\d+(?:\.\d+)?)\D+?(\d+(?:\.\d+)?)/);
  return m ? (parseFloat(m[1]) * parseFloat(m[2])) / 144 : 0;
}

/**
 * @param p        catalog_products row
 * @param internal when true, attach cost + margin fields (staff/Aria only)
 */
function withInstalled(p, internal) {
  if (!p) return p;

  // The Yard: retail_price is the WHOLE-PIECE raw price; installed = piece + pickup + $55/sqft.
  if (p.vendor_id === 'the-yard-az') {
    const sqft = sqftFromSize(p.size);
    const raw = Number(p.retail_price) || 0;
    if (!sqft || !raw) return p;
    const pickup = p.category === 'remnant' ? REMNANT_PICKUP : 0;
    const total = Math.round(raw + pickup + FAB_INSTALL_CHARGED * sqft); // customer installed price
    const out = { ...p, installed_total: total, installed_sqft: Math.round((total / sqft) * 100) / 100,
      price_note: 'installed (fab+install); retail_price is pre-tax Yard material' };
    if (internal) {
      const materialTaxed = raw * YARD_TAX;                             // Yard price + 9.1% AZ tax we pay
      const ourCost = Math.round(materialTaxed + FAB_INSTALL_COST * sqft); // + $26/sqft fab/install cost
      out.material_cost_taxed = Math.round(materialTaxed);
      out.installed_cost = ourCost;
      out.margin_pct = total > 0 ? Math.round(((total - ourCost) / total) * 100) : null;
      out.margin_basis = 'installed';
    }
    return out;
  }

  // Distributor slabs: retail_price (from the master sheet) is the MATERIAL price PER SQFT.
  // Installed = material + $55/sqft fab & install — the same rate as the countertop
  // calculator and the Yard formula, so every surface quotes the same number. Sanity-gate
  // to per-sqft-looking prices so a stray lump-sum row can't produce a nonsense quote.
  if (p.category === 'slab') {
    const perSqft = Number(p.retail_price) || 0;
    if (perSqft > 0 && perSqft <= 500) {
      return { ...p, installed_sqft: Math.round((perSqft + FAB_INSTALL_CHARGED) * 100) / 100,
        price_note: 'installed_sqft = material $/sqft + $55/sqft fab & install; retail_price is material per sqft' };
    }
  }
  return p;
}

/**
 * Margin for a row where retail_price and vendor_cost are directly comparable
 * (drop-ship goods: sinks, faucets, tile, fixtures). Returns null when either
 * side is missing — callers must render that as "unknown", never as 0%.
 */
function simpleMarginPct(p) {
  const cost = Number(p && p.vendor_cost) || 0;
  const price = Number(p && p.retail_price) || 0;
  if (cost <= 0 || price <= 0) return null;
  return Math.round(((price - cost) / price) * 100);
}

module.exports = { withInstalled, sqftFromSize, simpleMarginPct, YARD_TAX };
