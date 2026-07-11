#!/usr/bin/env node
/**
 * Build data/sinks.json from the CRM master price sheet (lineitemlibraries).
 * The master sheet is the single source of truth: cost by SKU, synced from
 * vendor price sheets. Retail = cost x (1 + TAX) x (1 + MARKUP), rounded.
 *
 *   node scripts/build-sinks-from-master.js            # dry run (report only)
 *   node scripts/build-sinks-from-master.js --write    # write data/sinks.json
 *
 * Images: the master sheet has none yet, so cards fall back to the placeholder
 * (image-fallback.js). Image enrichment is the next vendor-sync step.
 */
const path = require('path'), fs = require('fs');
const { MongoClient } = require(path.join(__dirname, '../api/node_modules/mongodb'));
// Reads the CRM connection from MONGODB_URI, or from ~/voiceNow-crm/.env as a
// convenience when run locally.
const URI = process.env.MONGODB_URI || (() => {
  try {
    const env = fs.readFileSync(path.join(require('os').homedir(), 'voiceNow-crm/.env'), 'utf8');
    return (env.match(/^MONGODB_URI=(.+)$/m) || [])[1].replace(/^["']|["']$/g, '').trim();
  } catch { return null; }
})();
if (!URI) { console.error('Set MONGODB_URI (the CRM price-library connection).'); process.exit(1); }

const TAX = 0.085;      // AZ TPT (Surprise) — cost is taxable
const MARKUP = 0.35;    // 35% after tax
const WRITE = process.argv.includes('--write');

// Vendors with clean, image-able sink data in the master sheet today. ESI + Vigo
// are verified real sinks; other vendors (Alfi console/pedestal/towel-bar rows,
// stone-yard cutouts) need data cleanup before they can be listed. Widen this as
// the master sheet is cleaned up per vendor.
const SINK_VENDORS = /^(esi|vigo)$/i;
// Exclude accessories / parts that the "sink" regex catches
// "drain" alone is excluded on purpose — it appears as "Drain Center Rear"
// (placement) inside real sink names. Only match true parts/accessories.
const ACCESSORY = /\b(grid set|sink grid|grd|strainer|bracket|caddy|colander|cutting board|rinse ring|soap dispenser|flange|template|towel bar|drain assembly|drain kit|pop.?up drain)\b/i;

const brandName = v => ({ 'esi':'ESI SharpSinks','vigo':'Vigo','alfi trade':'ALFI','ruvati':'Ruvati','kibi usa':'KIBI','msi':'MSI' }[v.toLowerCase()] || v);
const skuOf = d => ((d.description||'').match(/SKU\s+([A-Za-z0-9\-\/]+)/i)||[])[1] || null;

function specsOf(name) {
  const n = name.toLowerCase(), s = {};
  s.material = /vitreous china|porcelain/.test(n) ? 'vitreous china'
    : /stainless/.test(n) ? 'stainless steel'
    : /quartz/.test(n) ? 'quartz composite'
    : /fireclay/.test(n) ? 'fireclay'
    : /granite/.test(n) ? 'granite composite'
    : /copper/.test(n) ? 'copper'
    : /apron|workstation|handmade/.test(n) ? 'stainless steel' : '';
  s.installation = /apron|farmhouse/.test(n) ? 'farmhouse'
    : /undermount/.test(n) ? 'undermount'
    : /vessel/.test(n) ? 'vessel'
    : /drop.?in|top.?mount/.test(n) ? 'drop-in' : 'undermount';
  const g = n.match(/(\d{2})\s*ga/); if (g) s.gauge = g[1];
  const dim = name.match(/(\d[\d\-\/]*"?\s*x\s*\d[\d\-\/]*"?[^,|]*)/i); if (dim) s.exteriorDimensions = dim[1].trim();
  s.bowlType = /double|50\/50|60\/40|40\/60/.test(n) ? 'double' : 'single';
  return s;
}
const roomOf = n => /vanity|bathroom|\bbath\b|lavatory|vessel|wall.?mount|pedestal|console|powder/i.test(n) ? 'Bathroom' : 'Kitchen';
function styleOf(n){ n=n.toLowerCase();
  if(/workstation/.test(n))return 'Workstation';
  if(/apron|farmhouse/.test(n))return 'Farmhouse';
  if(/vanity/.test(n))return 'Vanity';
  if(/double|50\/50|60\/40/.test(n))return 'Double Bowl';
  if(/bar|prep/.test(n))return 'Bar/Prep';
  return 'Single Bowl';
}
function title(vendor, name){
  // Turn "Sink, Vitreous China Vanity - White Undermount Rectangular 18\"x13\"ID|6\"D" into something readable
  let t = name.replace(/^sink,\s*/i,'').replace(/\s*\|.*$/,'').replace(/\s*\(.*?\)\s*/g,' ').replace(/#\S+/g,'').replace(/\s+/g,' ').trim();
  return `${brandName(vendor)} ${t}`.replace(/\s+/g,' ').trim();
}
const priceOf = cost => Math.round(cost * (1+TAX) * (1+MARKUP));

(async () => {
  const c = new MongoClient(URI); await c.connect();
  const rows = await c.db('voiceflow-crm').collection('lineitemlibraries').find({
    vendor: SINK_VENDORS, cost: { $gt: 0 },
    $expr: { $regexMatch: { input: { $concat: ['$name',' ',{$ifNull:['$description','']}] }, regex: 'sink', options: 'i' } }
  }).project({ name:1, description:1, cost:1, vendor:1, taxable:1 }).toArray();
  await c.close();

  const seen = new Set(), products = [];
  for (const r of rows) {
    const nm = r.name || '';
    if (ACCESSORY.test(nm + ' ' + (r.description||''))) continue;   // skip parts
    const sku = skuOf(r) || nm.slice(0,20);
    if (seen.has(sku)) continue; seen.add(sku);
    const specs = specsOf(nm);
    const room = roomOf(nm);
    const style = styleOf(nm);
    const handle = (brandName(r.vendor)+'-'+sku).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
    products.push({
      id: handle, title: title(r.vendor, nm), handle, sku,
      vendor: r.vendor.toUpperCase()==='MSI'?'MSI Surfaces':brandName(r.vendor),
      brandDisplay: brandName(r.vendor), brandTier: 'standard',
      productType: room==='Bathroom' ? 'Vanity Sinks' : 'Kitchen Sinks',
      category: 'sinks',
      description: nm,
      tags: [ `Room_${room}`, specs.material?`Material_${specs.material}`:null, `Style_${style}`, `Installation_${specs.installation}`, `Brand_${brandName(r.vendor)}` ].filter(Boolean),
      available: true, price: priceOf(r.cost).toFixed(2), currency: 'USD',
      _cost: r.cost, _masterSheet: true,
      images: [],
      variants: [{ id: handle+'-default', title:'Default Title', price: priceOf(r.cost).toFixed(2), available:true }],
      specs
    });
  }
  products.sort((a,b)=> (a.vendor.localeCompare(b.vendor)) || (parseFloat(a.price)-parseFloat(b.price)));

  console.log(`Built ${products.length} master-sheet sinks (${rows.length} sink rows, minus accessories/dupes).`);
  const byV={}; products.forEach(p=>byV[p.vendor]=(byV[p.vendor]||0)+1);
  console.log('by vendor:', JSON.stringify(byV));
  const byR={}; products.forEach(p=>byR[p.tags.find(t=>/^Room_/.test(t))]=(byR[p.tags.find(t=>/^Room_/.test(t))]||0)+1);
  console.log('by room:', JSON.stringify(byR));
  console.log('\nsample:');
  products.slice(0,14).forEach(p=>console.log(`  ${p.sku.padEnd(15)} $${String(p.price).padEnd(7)} [${p.tags.find(t=>/^Room_/.test(t)).replace('Room_','')}/${p.specs.material||'?'}] ${p.title}`));

  if (WRITE) { fs.writeFileSync('data/sinks.json', JSON.stringify(products, null, 2)); console.log('\nWROTE data/sinks.json ('+products.length+' products)'); }
  else console.log('\n(dry run — pass --write to save)');
})().catch(e=>{console.error(e.stack);process.exit(1)});
