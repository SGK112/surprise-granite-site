#!/usr/bin/env node
/**
 * Sun Stone (sunstoneus.com / sunstonesurfaces.com) — price list -> library ->
 * catalog. Rep: Luis Nevarez <luis@sunstoneus.com>. The 2026 QUARTZ Price List
 * (updated 4/6/26, Gmail msg 19d7346996e6550f) is the availability authority:
 * only listed colors go live ("not on the price list = don't advertise").
 *
 * Many colors are "(3D Printed Full Body)" — printed quartz. Owner guidance
 * (Josh 2026-07-06): the pattern is HD-printed on the surface, NOT through-body;
 * cut edges expose the white quartz core, so recommend mitered/waterfall edge
 * (keeps the design continuous) or a euro-style edge with the white edge as an
 * accent. Rows get specs.printed_quartz=true + an education blurb; the product
 * page renders a callout for that flag.
 *
 * Inputs (scratchpad): sunstone-pricelist.txt, sunstone-products.json
 * Usage: NODE_PATH=api/node_modules node scripts/import-sunstone.js <scratchpad-dir> [--write]
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
const { createClient } = require('@supabase/supabase-js');
const { MongoClient } = require('mongodb');

const supa = createClient('https://ypeypgwsycxcagncgdur.supabase.co', process.env.SUPABASE_SERVICE_KEY);
const MONGO = fs.readFileSync('/Users/homepc/voiceNow-crm/.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const WRITE = process.argv.includes('--write');
const DIR = process.argv.slice(2).filter((a) => a !== '--write')[0];

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const baseOf = (s) => String(s || '')
  .replace(/\(3d printed[^)]*\)/gi, ' ').replace(/\(3d print\)/gi, ' ')
  .replace(/\*+[^*]*\*+/g, ' ') // **Closeout** / *Jumbo*
  .replace(/\b(high definition|polished|brushed|hd)\b/gi, ' ')
  .replace(/\s+/g, ' ').trim();

const PRINTED_BLURB = (name) =>
  `${name} is a printed quartz slab: the veining is applied to the surface with ` +
  `high-definition 3D printing — like screen-printing a shirt — rather than running ` +
  `through the body of the stone. Cut edges expose the slab's white quartz core, so ` +
  `we recommend a mitered or waterfall edge (wraps the pattern over the edge so the ` +
  `design stays continuous) or a euro-style edge that shows the clean white edge as ` +
  `a deliberate accent.`;

(async () => {
  // ---- 1. parse the price list
  const txt = fs.readFileSync(path.join(DIR, 'sunstone-pricelist.txt'), 'utf8');
  const rows = [];
  const rx = /^(QZ-SLB-[A-Z0-9]+)\s+(.+?)\s+(\d{3})X(\d{2,3})"X[^\s]+\s*(?:\(2cm\))?\s*([\d.]+)?(?:\s*sqft)?\s*(?:\$([\d,]+\.\d{2})\s+)?\$([\d,]+\.\d{2})\s*$/;
  for (const line of txt.split('\n')) {
    const m = line.trim().match(rx);
    if (!m) continue;
    const [, sku, rawName, L, W, sqftStr, wasPrice, price] = m;
    const sqft = sqftStr ? parseFloat(sqftStr) : (+L * +W) / 144;
    const slab = +price.replace(/,/g, '');
    rows.push({
      sku, rawName: rawName.trim(), L: +L, W: +W, sqft,
      slabPrice: slab, perSqft: Math.round((slab / sqft) * 100) / 100,
      printed: /3d printed/i.test(rawName),
      closeout: /closeout/i.test(rawName), sale: /\*\*sale\*\*/i.test(rawName),
      jumbo: /jumbo/i.test(rawName),
      finish: /brushed/i.test(rawName) ? 'Brushed' : 'Polished',
      base: baseOf(rawName),
    });
  }
  console.log('price-list rows parsed:', rows.length);

  // ---- 2. library upsert (vendor 'Sun Stone')
  const mongo = new MongoClient(MONGO); await mongo.connect();
  const col = mongo.db('voiceflow-crm').collection('lineitemlibraries');
  const anyRow = await col.findOne({ vendor: 'Bolder Image Stone' }, { projection: { userId: 1 } });
  const existing = await col.find({ vendor: 'Sun Stone' }, { projection: { name: 1 } }).toArray();
  const haveLib = new Set(existing.map((r) => norm(r.name)));
  const libDocs = rows.filter((r) => !haveLib.has(norm(r.rawName))).map((r) => ({
    userId: anyRow.userId, businessId: null, name: r.rawName, unit: 'sqft', cost: r.perSqft,
    rate: 0, category: 'materials', taxable: true, source: 'supplier_email', vendor: 'Sun Stone',
    description: `Quartz ${r.L}x${r.W}=${r.sqft}sqft 2cm ${r.finish}${r.printed ? ' 3D-printed' : ''}${r.closeout ? ' CLOSEOUT' : ''} slab $${r.slabPrice} (${r.sku})`,
    costUpdatedAt: new Date(), usageCount: 0, syncVersion: 1, createdAt: new Date(), updatedAt: new Date(),
  }));
  console.log('library rows to insert:', libDocs.length, '| already there:', haveLib.size);
  if (WRITE && libDocs.length) await col.insertMany(libDocs);
  await mongo.close();

  // ---- 3. aggregate to colors (price list = availability authority)
  const colors = new Map();
  for (const r of rows) {
    const key = norm(r.base);
    if (!key) continue;
    const c = colors.get(key) || {
      name: r.base, printed: false, closeout: true, perSqft: Infinity,
      sizes: new Set(), finishes: new Set(), sqft: null,
    };
    c.printed = c.printed || r.printed;
    c.closeout = c.closeout && r.closeout; // only closeout if ALL variants are
    if (r.perSqft < c.perSqft) c.perSqft = r.perSqft;
    if (!r.jumbo) { c.sizes.add(`${r.L} x ${r.W}`); c.sqft = c.sqft || r.sqft; }
    c.finishes.add(r.finish);
    colors.set(key, c);
  }
  console.log('distinct colors on list:', colors.size);

  // ---- 4. site images + the three hi-res email photos now hosted in-repo
  const site = JSON.parse(fs.readFileSync(path.join(DIR, 'sunstone-products.json'), 'utf8'));
  const imgByBase = new Map();
  for (const p of site) {
    const b = norm(baseOf(p.name));
    if (b && p.image && !imgByBase.has(b)) imgByBase.set(b, p.images && p.images.length ? p.images : [p.image]);
  }
  const EMAIL_PHOTOS = {
    carolina: '/images/vendors/sunstone/carolina-full-slab.jpg',
    vesper: '/images/vendors/sunstone/vesper-full-slab.jpg',
    monaco: '/images/vendors/sunstone/monaco-full-slab.jpg',
  };
  // price-list name -> site name (list typos / long-form names)
  const ALIASES = {
    calacatta9100altissimo: 'calacattaaltissimo',
    blizzad: 'blizzard',
    tajmahalprint: 'tajmahallight',
  };

  // ---- 5. catalog import
  let existingProds = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products').select('id,slug,sku,name,vendor_id,category').order('id').range(from, from + 999);
    if (error) throw error;
    existingProds = existingProds.concat(data);
    if (data.length < 1000) break;
  }
  const slugs = new Set(existingProds.map((p) => p.slug));
  const haveVendor = new Set(existingProds.filter((p) => p.vendor_id === 'sun-stone' && p.category === 'slab').map((p) => norm(baseOf(p.name))));

  const creates = [];
  let noImage = 0;
  for (const [key, c] of colors) {
    if (haveVendor.has(key)) continue;
    let images = imgByBase.get(key) || imgByBase.get(ALIASES[key]) || [];
    // unique-prefix image fallback
    if (!images.length) {
      const hits = [...imgByBase.keys()].filter((k) => k.startsWith(key) || key.startsWith(k));
      if (hits.length === 1) images = imgByBase.get(hits[0]);
    }
    if (EMAIL_PHOTOS[key]) images = [EMAIL_PHOTOS[key], ...images];
    if (!images.length) { noImage++; console.log('  NO IMAGE (skipped):', c.name); continue; }
    let slug = `${key}-quartz-sunstone`;
    if (slugs.has(slug)) slug += '-2';
    slugs.add(slug);
    const size = [...c.sizes][0] || null;
    const desc = `${c.name} quartz slab from Sun Stone, Phoenix, Arizona.` +
      (c.printed ? ` ${PRINTED_BLURB(c.name)}` : '') +
      (c.closeout ? ' Closeout color — available while remaining stock lasts.' : '');
    creates.push({
      vendor_id: 'sun-stone', brand: 'Sun Stone', sku: `import-sun-stone-${key}`.slice(0, 60),
      name: c.name, slug, category: 'slab', subcategory: 'Quartz',
      description: desc, primary_image_url: images[0], image_urls: images.slice(0, 4),
      retail_price: c.perSqft, sample_price: c.perSqft, vendor_cost: c.perSqft,
      price_unit: 'each', sample_eligible: true, in_stock: true, active: true,
      vendor_url: 'https://www.sunstonesurfaces.com/product-category/quartz-slabs',
      tags: ['vendor-import', ...(c.printed ? ['printed-quartz'] : []), ...(c.closeout ? ['closeout'] : [])],
      currency: 'USD',
      specs: {
        _source: 'sunstone-pricelist+scrape', imported_at: '2026-07-06', material: 'Quartz',
        thickness: '2cm', finish: [...c.finishes].join(', '),
        ...(size ? { slab_size: size, slab_sqft: c.sqft } : {}),
        sample_pricing: 'sqft-price', sqft_price: c.perSqft,
        ...(c.printed ? { printed_quartz: true } : {}),
        ...(c.closeout ? { closeout: true } : {}),
      },
      ...(size ? { size: size.replace(/(\d+) x (\d+)/, '$1" x $2"') } : {}),
    });
  }
  console.log('to create:', creates.length, '| printed:', creates.filter((c) => c.specs.printed_quartz).length, '| no image skipped:', noImage);
  creates.slice(0, 8).forEach((c) => console.log('  ', c.name, `$${c.retail_price}/sqft`, c.specs.printed_quartz ? '[PRINTED]' : '', c.specs.closeout ? '[CLOSEOUT]' : ''));

  if (!WRITE) { console.log('DRY RUN — add --write'); process.exit(0); }
  let created = 0;
  for (let j = 0; j < creates.length; j += 50) {
    const { error } = await supa.from('catalog_products').insert(creates.slice(j, j + 50));
    if (error) console.error('batch error:', error.message);
    else created += Math.min(50, creates.length - j);
  }
  console.log('CREATED', created);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
