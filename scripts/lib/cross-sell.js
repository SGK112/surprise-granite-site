/**
 * Shared cross-sell strips — ONE source of truth used by:
 *   • scripts/inject-cross-sell.js   (injects into existing pages)
 *   • scripts/gen-marketplace-pages.js + build-countertop-pages.js (emit at build)
 *
 * Product pages emit serviceStrip(); content pages get productStrip() via the
 * injector. Both carry the <!--cross-sell--> marker so the injector never
 * double-adds to a page a generator already produced.
 */
const MARKER = '<!--cross-sell-->';

const PRODUCTS = [
  ['Countertops', '/materials/all-countertops/', 'Granite, quartz & marble slabs'],
  ['Kitchen & Bath Sinks', '/marketplace/sinks/', 'Undermount, farmhouse & vessel'],
  ['Faucets', '/marketplace/faucets/', 'Kitchen & bathroom faucets'],
  ['Tile & Backsplash', '/materials/all-tile/', 'Floor, wall & backsplash tile'],
  ['Flooring', '/materials/flooring/', 'Tile, wood-look & LVP'],
  ['Kitchen Accessories', '/marketplace/kitchen-accessories/', 'Racks, drains & organizers'],
];
const SERVICES = [
  ['Countertop Installation', '/services/countertop-installation/', 'Fabrication & install, lifetime warranty'],
  ['Countertop Replacement', '/services/countertop-replacement/', 'Tear-out & new tops, one day'],
  ['Kitchen Remodeling', '/services/home/kitchen-remodeling-arizona/', 'Full kitchens across the Valley'],
  ['Bathroom Remodeling', '/services/home/bathroom-remodeling-arizona/', 'Vanities, showers & tile'],
  ['Sink Installation', '/services/sink-installation/', 'Undermount & drop-in fitting'],
  ['Free In-Home Estimate', '/get-a-free-estimate', 'We come measure & quote, no obligation'],
];

function build(kind) {
  const isProduct = kind === 'product';
  const items = isProduct ? PRODUCTS : SERVICES;
  const label = isProduct ? 'Shop the Materials' : 'Professional Installation & Remodeling';
  const heading = isProduct ? 'Shop Materials for Your Project' : 'Let Us Install It — Phoenix Metro';
  const sub = isProduct
    ? 'Browse the countertops, sinks, faucets, tile, and flooring we carry — then let us fabricate and install.'
    : 'Surprise Granite is a licensed AZ contractor (ROC #367593). We fabricate, install, and remodel across the Phoenix Valley.';
  const cards = items.map(([t, href, d]) => `
      <a href="${href}" style="display:block;background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:18px 20px;text-decoration:none;transition:box-shadow .2s;">
        <div style="color:#1a2b3c;font-weight:700;font-size:15px;margin-bottom:4px;">${t}</div>
        <div style="color:#666;font-size:13px;line-height:1.5;">${d}</div>
      </a>`).join('');
  return `
${MARKER}
<section class="sg-xsell" style="background:#f8f9fa;border-top:1px solid #e5e5e5;padding:56px 20px;font-family:'Inter',system-ui,sans-serif;">
  <div style="max-width:1100px;margin:0 auto;">
    <div style="text-align:center;margin-bottom:28px;">
      <span style="color:#cca600;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:13px;">${label}</span>
      <h2 style="color:#1a2b3c;font-size:clamp(22px,4vw,30px);margin:8px 0 10px;">${heading}</h2>
      <p style="color:#555;max-width:720px;margin:0 auto;line-height:1.6;">${sub}</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;">${cards}
    </div>
  </div>
</section>
`;
}

const productStrip = build('product');
const serviceStrip = build('service');

module.exports = { MARKER, productStrip, serviceStrip };
