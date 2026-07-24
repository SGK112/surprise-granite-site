#!/usr/bin/env node
/**
 * build-material-city-pages.js — high-intent material+city landing pages at
 * /locations/<city>/<material>-countertops/ (e.g. "Granite Countertops in
 * Scottsdale, AZ"). Complements the general /locations/<city>/countertops/ page
 * by targeting the narrower "<material> countertops <city>" query. Rerunnable.
 *
 *   node scripts/build-material-city-pages.js            # dry run
 *   node scripts/build-material-city-pages.js --write
 */
const fs = require('fs');
const path = require('path');
const { serviceStrip } = require('./lib/cross-sell');
const ROOT = path.join(__dirname, '..');
const WRITE = process.argv.includes('--write');
const SITE = 'https://www.surprisegranite.com';
const IMG = '/migrated/6456ce4476abb2d4f9fbad10/651c69d8e6c77c995d99b4d7_arizona-countertop-installation-service_thumbnail.avif';

const CITIES = {
  'surprise': ['Surprise', 33.63, -112.37, 'our West Valley home base'],
  'peoria': ['Peoria', 33.58, -112.24, 'from Old Town to Vistancia'],
  'glendale': ['Glendale', 33.54, -112.19, 'near Westgate'],
  'goodyear': ['Goodyear', 33.44, -112.36, 'the fast-growing southwest Valley'],
  'avondale': ['Avondale', 33.44, -112.35, 'the southwest Valley'],
  'litchfield-park': ['Litchfield Park', 33.50, -112.36, 'the West Valley'],
  'buckeye': ['Buckeye', 33.37, -112.58, 'the far West Valley'],
  'phoenix': ['Phoenix', 33.45, -112.07, 'from Arcadia to Ahwatukee'],
  'scottsdale': ['Scottsdale', 33.49, -111.93, 'where luxury finishes are the norm'],
  'mesa': ['Mesa', 33.42, -111.83, 'the East Valley'],
  'chandler': ['Chandler', 33.31, -111.84, 'the tech corridor'],
  'gilbert': ['Gilbert', 33.35, -111.79, 'a top family suburb'],
  'sun-city': ['Sun City', 33.60, -112.28, 'the active-adult community'],
  'sun-city-west': ['Sun City West', 33.66, -112.34, 'the West Valley 55+ community'],
  'vistancia': ['Vistancia', 33.75, -112.34, 'the master-planned Peoria community'],
};

const MATERIALS = {
  'granite': {
    label: 'Granite', parent: '/materials/countertops/granite-countertops/', low: 45, high: 80,
    intro: (c, hook) => `Looking for granite countertops in ${c}? Granite is 100% natural stone — every slab is one of a kind, heat- and scratch-resistant, and built to last decades in an Arizona kitchen. We fabricate and install granite for homeowners throughout ${c} (${hook}), with hundreds of colors to pick from at local <a href="/vendors/">stone yards</a>.`,
    points: ['Natural stone — every slab unique', 'Excellent heat & scratch resistance', 'Hundreds of colors & movement patterns', 'Sealed on install; re-seal every 1–2 years'],
    faqs: (c) => [
      [`How much do granite countertops cost in ${c}?`, `Granite countertops in ${c} typically run $45–$80 per square foot installed, depending on the color and slab. An average 30 sq ft kitchen runs about $1,500–$2,700 with fabrication, edge, and installation included.`],
      [`Do granite countertops need sealing in Arizona?`, `Yes — we seal your granite on installation, and a quick re-seal every 1–2 years keeps it stain-resistant. Arizona's dry climate is easy on stone; the main thing is wiping spills and resealing on schedule.`],
      [`Is granite or quartz better for a ${c} kitchen?`, `Granite gives you natural, one-of-a-kind stone and top heat resistance; quartz gives you a consistent pattern and no sealing. Both are excellent in ${c} — we'll show you both and help you choose.`],
    ],
  },
  'quartz': {
    label: 'Quartz', parent: '/materials/countertops/quartz-countertops/', low: 55, high: 120,
    intro: (c, hook) => `Want quartz countertops in ${c}? Engineered quartz is non-porous, never needs sealing, and comes in consistent, designer-friendly patterns — from bright whites to bold marble looks. We fabricate and install quartz across ${c} (${hook}) from the top brands, so your ${c} kitchen or bath gets a durable, low-maintenance surface.`,
    points: ['Non-porous — no sealing, ever', 'Consistent color & pattern slab to slab', 'Marble looks without marble upkeep', 'Highly stain- and scratch-resistant'],
    faqs: (c) => [
      [`How much do quartz countertops cost in ${c}?`, `Quartz countertops in ${c} typically run $55–$120 per square foot installed depending on the brand and pattern. An average 30 sq ft kitchen runs about $1,800–$4,000 with fabrication and installation included.`],
      [`Is quartz good for Arizona kitchens?`, `Very. Quartz is non-porous so it shrugs off spills, needs no sealing, and holds up to daily use — ideal for busy ${c} kitchens. Just avoid setting very hot pans directly on it (use a trivet).`],
      [`Does quartz fade in the Arizona sun?`, `Quartz can fade under constant direct UV, so for a sun-drenched ${c} window or an outdoor kitchen we'll steer you to granite or a UV-stable option. For normal indoor kitchens, quartz holds its color beautifully.`],
    ],
  },
  'marble': {
    label: 'Marble', parent: '/materials/countertops/marble-countertops/', low: 60, high: 150,
    intro: (c, hook) => `Dreaming of marble countertops in ${c}? Nothing matches the soft veining and timeless elegance of natural marble. We fabricate and install marble for ${c} homeowners (${hook}) who want a luxury look — and we'll walk you through care so it stays beautiful in an Arizona home.`,
    points: ['Timeless natural veining & elegance', 'Cool surface — great for baths & vanities', 'Best sealed and maintained regularly', 'Quartzite available as a harder alternative'],
    faqs: (c) => [
      [`How much do marble countertops cost in ${c}?`, `Marble countertops in ${c} run about $60–$150 per square foot installed depending on the marble. It's a premium, luxury surface priced above granite and most quartz.`],
      [`Is marble too soft for a ${c} kitchen?`, `Marble is softer and etches from acids (lemon, vinegar), so many ${c} homeowners use it on vanities, islands, and baths and choose quartz or granite for heavy-use kitchen runs. If you love marble in the kitchen, we'll seal it and show you how to care for it — or suggest a marble-look quartz.`],
    ],
  },
  'quartzite': {
    label: 'Quartzite', parent: '/materials/all-countertops/', low: 60, high: 120,
    intro: (c, hook) => `Considering quartzite countertops in ${c}? Natural quartzite gives you marble-like beauty with granite-like hardness — a favorite for ${c} homeowners (${hook}) who want dramatic veining that still stands up to a busy kitchen.`,
    points: ['Natural stone, marble-like veining', 'Harder and more durable than marble', 'Heat resistant', 'Sealed on install for stain resistance'],
    faqs: (c) => [
      [`How much do quartzite countertops cost in ${c}?`, `Quartzite in ${c} typically runs $60–$120 per square foot installed, in the premium tier alongside high-end granite and quartz.`],
      [`Is quartzite the same as quartz?`, `No — quartzite is 100% natural stone (like granite), while quartz is engineered. Quartzite gives you natural veining and needs sealing; quartz is man-made and doesn't. We carry both and can compare them side by side for your ${c} project.`],
    ],
  },
};

function page(citySlug, city, lat, lon, hook, matSlug, m) {
  const url = `${SITE}/locations/${citySlug}/${matSlug}-countertops/`;
  const name = `${m.label} Countertops in ${city}, AZ`;
  const desc = `${m.label} countertops in ${city}, AZ — fabrication and installation by Surprise Granite. $${m.low}–$${m.high}/sq ft installed, free in-home estimates, lifetime workmanship warranty.`;
  const faqs = m.faqs(city);
  const faqLd = faqs.map(([q, a]) => `{"@type":"Question","name":${JSON.stringify(q)},"acceptedAnswer":{"@type":"Answer","text":${JSON.stringify(a)}}}`).join(',');
  const points = m.points.map((p) => `<li style="margin:6px 0;">${p}</li>`).join('');
  const faqHtml = faqs.map(([q, a]) => `<details style="margin:10px 0;"><summary style="cursor:pointer;font-weight:600;color:#1a2b3c;">${q}</summary><p style="color:#555;">${a}</p></details>`).join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${m.label} Countertops in ${city}, AZ | Surprise Granite</title>
  <link rel="canonical" href="${url}"/>
  <meta name="description" content="${desc.replace(/"/g, '&quot;')}"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta property="og:title" content="${m.label} Countertops in ${city} | Surprise Granite"/>
  <meta property="og:type" content="website"/>
  <meta property="og:url" content="${url}"/>
  <meta property="og:image" content="${SITE}${IMG}"/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
  <link href="/migrated/6456ce4476abb25581fbad0c/6456ce4476abb269c6fbb176_Surprise-Granite-favicon-32x32px.png" rel="shortcut icon" type="image/x-icon"/>
  <link rel="stylesheet" href="/css/unified-nav.css?v=20260718o"/>
  <script defer src="/js/unified-nav.js?v=20260713c"></script>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Service","serviceType":${JSON.stringify(m.label + ' Countertop Installation')},"name":${JSON.stringify(name)},"description":${JSON.stringify(desc)},"provider":{"@type":"HomeAndConstructionBusiness","name":"Surprise Granite","telephone":"+1-602-833-3189","url":"${SITE}","address":{"@type":"PostalAddress","streetAddress":"15464 W Aster Dr","addressLocality":"Surprise","addressRegion":"AZ","postalCode":"85379","addressCountry":"US"}},"areaServed":{"@type":"City","name":${JSON.stringify(city)},"geo":{"@type":"GeoCoordinates","latitude":${lat},"longitude":${lon}}},"offers":{"@type":"AggregateOffer","priceCurrency":"USD","lowPrice":"${m.low}","highPrice":"${m.high}","priceSpecification":{"@type":"UnitPriceSpecification","priceCurrency":"USD","unitText":"per square foot installed"}}}</script>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"${SITE}/"},{"@type":"ListItem","position":2,"name":"Locations","item":"${SITE}/locations/"},{"@type":"ListItem","position":3,"name":${JSON.stringify(city)},"item":"${SITE}/locations/${citySlug}/"},{"@type":"ListItem","position":4,"name":${JSON.stringify(m.label + ' Countertops')},"item":"${url}"}]}</script>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[${faqLd}]}</script>
  <style>body{font-family:'Inter',system-ui,sans-serif;color:#1a1a2e;margin:0;line-height:1.7}.wrap{max-width:1000px;margin:0 auto;padding:0 20px}.hero{background:linear-gradient(135deg,#1a2b3c,#0f1a24);color:#fff;padding:64px 20px}.hero h1{font-size:clamp(28px,5vw,42px);margin:0 0 14px}.hero p{opacity:.9;max-width:720px}.btn{display:inline-block;background:#f9cb00;color:#1a2b3c;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;margin-top:8px}.sec{padding:48px 20px}.sec h2{color:#1a2b3c;font-size:clamp(22px,4vw,30px)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:20px}.card{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:18px 20px;text-decoration:none;display:block}.card b{color:#1a2b3c}.card span{color:#666;font-size:13px}a{color:#cca600}</style>
</head>
<body class="unified-nav-active">
  <section class="hero"><div class="wrap">
    <h1>${m.label} Countertops in ${city}, AZ</h1>
    <p>${m.intro(city, hook)}</p>
    <a class="btn" href="/get-a-free-estimate?service=countertops&material=${matSlug}&city=${citySlug}">Get a Free ${city} Estimate</a>
  </div></section>

  <img src="${IMG}" alt="${m.label} countertops in ${city}, AZ by Surprise Granite" width="1200" height="420" loading="lazy" style="width:100%;max-height:420px;object-fit:cover;display:block;"/>

  <section class="sec"><div class="wrap">
    <h2>Why ${m.label} in ${city}?</h2>
    <ul style="color:#333;padding-left:20px;">${points}</ul>
    <p style="color:#555;margin-top:16px;">Surprise Granite fabricates and installs ${m.label.toLowerCase()} countertops throughout ${city} and the Phoenix Valley — licensed AZ contractor (ROC #341113), free in-home estimates. Browse all <a href="${m.parent}">${m.label.toLowerCase()} options</a> or <a href="/locations/${citySlug}/countertops/">${city} countertops</a>.</p>
  </div></section>

  <section class="sec" style="background:#f8f9fa;"><div class="wrap">
    <h2>Other Materials</h2>
    <div class="grid">
      <a class="card" href="/locations/${citySlug}/granite-countertops/"><b>Granite</b><br><span>Natural stone, heat-resistant</span></a>
      <a class="card" href="/locations/${citySlug}/quartz-countertops/"><b>Quartz</b><br><span>Engineered, no sealing</span></a>
      <a class="card" href="/locations/${citySlug}/marble-countertops/"><b>Marble</b><br><span>Timeless luxury veining</span></a>
      <a class="card" href="/locations/${citySlug}/quartzite-countertops/"><b>Quartzite</b><br><span>Marble look, granite hardness</span></a>
    </div>
  </div></section>

  <section class="sec"><div class="wrap">
    <h2>${city} Countertop Services</h2>
    <div class="grid">
      <a class="card" href="/services/countertop-installation/"><b>Countertop Installation</b><br><span>Fabrication & install</span></a>
      <a class="card" href="/services/countertop-replacement/"><b>Countertop Replacement</b><br><span>Tear-out & new tops</span></a>
      <a class="card" href="/services/home/kitchen-remodeling-arizona/"><b>Kitchen Remodeling</b><br><span>Full kitchen remodels</span></a>
      <a class="card" href="/tools/countertop-calculator/"><b>Cost Calculator</b><br><span>Estimate your square footage</span></a>
    </div>
  </div></section>

  <section class="sec" style="background:#f8f9fa;"><div class="wrap">
    <h2>Frequently Asked Questions</h2>
    ${faqHtml}
  </div></section>
  ${serviceStrip}
  <section class="sec" style="background:#1a2b3c;color:#fff;text-align:center;"><div class="wrap">
    <h2 style="color:#fff;">Get ${m.label} Countertops in ${city}</h2>
    <p style="opacity:.9;">Free in-home estimate — we measure and quote your ${city} project with no obligation.</p>
    <a class="btn" href="/get-a-free-estimate?service=countertops&material=${matSlug}&city=${citySlug}">Get My Free Estimate</a>
  </div></section>
</body>
</html>
`;
}

const MATS = process.argv.includes('--all') ? Object.keys(MATERIALS) : ['granite', 'quartz'];
let count = 0; const urls = [];
for (const [citySlug, [city, lat, lon, hook]] of Object.entries(CITIES)) {
  if (!fs.existsSync(path.join(ROOT, 'locations', citySlug))) { console.warn('  city dir missing (skip):', citySlug); continue; }
  for (const matSlug of MATS) {
    const m = MATERIALS[matSlug];
    const dir = path.join(ROOT, 'locations', citySlug, `${matSlug}-countertops`);
    count++;
    urls.push(`${SITE}/locations/${citySlug}/${matSlug}-countertops/`);
    console.log(`  ${WRITE ? 'write' : 'would write'}: locations/${citySlug}/${matSlug}-countertops/`);
    if (WRITE) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'index.html'), page(citySlug, city, lat, lon, hook, matSlug, m)); }
  }
}
if (WRITE) fs.writeFileSync(path.join(ROOT, 'scripts', '.material-city-urls.txt'), urls.join('\n'));
console.log(`\n${WRITE ? 'WROTE' : 'DRY RUN'} — ${count} material×city pages (${MATS.join(', ')})`);
