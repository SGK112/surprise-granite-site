#!/usr/bin/env node
/**
 * build-city-service-pages.js — generate local landing pages for the
 * replacement + remodeling side, per city, at /locations/<city>/<service>/.
 * The existing /locations/<city>/{countertops,flooring,cabinets}/ pages were
 * built elsewhere; this fills the gap for the high-intent replacement/remodel
 * queries. Rerunnable — overwrites its own output (marked data-generated).
 *
 *   node scripts/build-city-service-pages.js            # dry run (lists)
 *   node scripts/build-city-service-pages.js --write
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const WRITE = process.argv.includes('--write');
const SITE = 'https://www.surprisegranite.com';

// Cities (slug -> display, lat, lon, and a short unique local hook to avoid
// duplicate-content across cities). Matches the existing /locations/ slugs.
const CITIES = {
  'surprise':        ['Surprise', 33.63, -112.37, 'our West Valley home base'],
  'peoria':          ['Peoria', 33.58, -112.24, 'from Old Town to Vistancia'],
  'glendale':        ['Glendale', 33.54, -112.19, 'near Westgate and the stadium district'],
  'goodyear':        ['Goodyear', 33.44, -112.36, "one of the Valley's fastest-growing suburbs"],
  'avondale':        ['Avondale', 33.44, -112.35, 'across the southwest Valley'],
  'litchfield-park': ['Litchfield Park', 33.50, -112.36, 'from the historic core to newer builds'],
  'buckeye':         ['Buckeye', 33.37, -112.58, 'the far West Valley'],
  'phoenix':         ['Phoenix', 33.45, -112.07, 'from Arcadia to Ahwatukee'],
  'scottsdale':      ['Scottsdale', 33.49, -111.93, 'where luxury finishes are the norm'],
  'mesa':            ['Mesa', 33.42, -111.83, 'across the East Valley'],
  'chandler':        ['Chandler', 33.31, -111.84, 'from the tech corridor to Ocotillo'],
  'gilbert':         ['Gilbert', 33.35, -111.79, 'one of the Valley’s top family suburbs'],
  'sun-city':        ['Sun City', 33.60, -112.28, 'the original active-adult community'],
  'sun-city-west':   ['Sun City West', 33.66, -112.34, 'the West Valley 55+ community'],
  'vistancia':       ['Vistancia', 33.75, -112.34, 'the master-planned Peoria community'],
};

const SERVICES = {
  'countertop-replacement': {
    label: 'Countertop Replacement',
    parent: '/services/countertop-replacement/',
    title: (c) => `Countertop Replacement in ${c}, AZ | Surprise Granite`,
    desc: (c) => `Replace old, cracked, or dated countertops in ${c}, AZ. We tear out and haul away your existing tops, then fabricate and install new granite or quartz — tear-out included, free estimates, lifetime warranty.`,
    intro: (c, hook) => `Ready to replace the countertops in your ${c} kitchen or bath? Whether your current tops are cracked, stained, hard-water-etched, or just dated, we remove and haul them away, then fabricate and install new <a href="/materials/countertops/granite-countertops/">granite</a> or <a href="/materials/countertops/quartz-countertops/">quartz</a> — protecting your existing cabinets and backsplash. We serve homeowners throughout ${c} (${hook}) with tear-out included in every quote.`,
    points: ['Old countertop tear-out & disposal — included', 'New granite, quartz, marble & porcelain', 'Cabinets & backsplash protected during removal', 'Most replacements done in one day'],
    faqs: (c) => [
      [`How much does countertop replacement cost in ${c}?`, `In ${c} and the greater Phoenix area, countertop replacement runs about $40–$150 per square foot installed, including removal of your old tops. An average 30 sq ft kitchen runs $1,500–$4,500 with tear-out, disposal, and installation — no separate demo fee.`],
      [`Do you remove my old countertops?`, `Yes — tear-out and haul-away of your existing countertops is included in every ${c} replacement at no extra charge, the same day the new tops go in.`],
    ],
  },
  'kitchen-remodeling': {
    label: 'Kitchen Remodeling',
    parent: '/services/home/kitchen-remodeling-arizona/',
    title: (c) => `Kitchen Remodeling in ${c}, AZ | Surprise Granite`,
    desc: (c) => `Kitchen remodeling in ${c}, AZ — new countertops, custom cabinets & refacing, tile backsplash, islands, sinks, and flooring. Family-owned, licensed, free estimates.`,
    intro: (c, hook) => `Remodeling your ${c} kitchen? From a countertop-and-backsplash refresh to a full gut renovation, we handle <a href="/materials/all-countertops/">countertops</a>, <a href="/services/cabinets/">cabinets</a>, <a href="/materials/all-tile/">tile backsplash</a>, islands, <a href="/marketplace/sinks/">sinks</a>, and <a href="/materials/flooring/">flooring</a> for homeowners across ${c} (${hook}).`,
    points: ['New countertops, cabinets & refacing', 'Tile backsplash & accent walls', 'Islands, sinks & faucets', 'Flooring built for the Arizona climate'],
    faqs: (c) => [
      [`How much does a kitchen remodel cost in ${c}?`, `Kitchen remodels in ${c} range from about $5,000 for a countertop-and-backsplash refresh to $35,000+ for a full renovation with new cabinets, countertops, and flooring. Most mid-range ${c} kitchens land in the $15,000–$35,000 range.`],
      [`Do you do full kitchen remodels or just countertops?`, `Both. In ${c} we do everything from a countertop-only swap to a complete kitchen renovation — cabinets, counters, backsplash, sink, and flooring in one coordinated project.`],
    ],
  },
  'bathroom-remodeling': {
    label: 'Bathroom Remodeling',
    parent: '/services/home/bathroom-remodeling-arizona/',
    title: (c) => `Bathroom Remodeling in ${c}, AZ | Surprise Granite`,
    desc: (c) => `Bathroom remodeling in ${c}, AZ — vanities, custom showers, tile, and countertops. Family-owned, licensed, free in-home estimates.`,
    intro: (c, hook) => `Updating a bathroom in ${c}? We remodel bathrooms across ${c} (${hook}) — <a href="/services/vanity-installation/">vanities</a> with new stone tops, <a href="/services/custom-showers/">custom tile showers</a>, <a href="/materials/all-tile/">tile</a>, flooring, and <a href="/marketplace/faucets/">fixtures</a> — from a shower refresh to a full renovation.`,
    points: ['Vanities with new stone countertops', 'Custom walk-in tile showers', 'Tile floors & wall surrounds', 'Fixtures, sinks & faucets'],
    faqs: (c) => [
      [`How much does a bathroom remodel cost in ${c}?`, `Bathroom remodels in ${c} range from about $8,000 for a shower or vanity refresh to $30,000+ for a full renovation. Most ${c} bathroom projects land in the $12,000–$25,000 range.`],
      [`How long does a bathroom remodel take?`, `A shower or vanity update in ${c} takes a few days to a week; a full bathroom renovation typically runs 2–4 weeks depending on tile work and plumbing.`],
    ],
  },
};

const AREA = '"areaServed":[{"@type":"City","name":"Surprise"},{"@type":"City","name":"Peoria"},{"@type":"City","name":"Glendale"},{"@type":"City","name":"Phoenix"},{"@type":"City","name":"Scottsdale"},{"@type":"City","name":"Goodyear"},{"@type":"City","name":"Mesa"},{"@type":"City","name":"Chandler"},{"@type":"City","name":"Gilbert"}]';

function page(citySlug, city, lat, lon, hook, svcSlug, svc) {
  const url = `${SITE}/locations/${citySlug}/${svcSlug}/`;
  const faqs = svc.faqs(city);
  const faqLd = faqs.map(([q, a]) => `{"@type":"Question","name":${JSON.stringify(q)},"acceptedAnswer":{"@type":"Answer","text":${JSON.stringify(a)}}}`).join(',');
  const points = svc.points.map((p) => `<li style="margin:6px 0;">${p}</li>`).join('');
  const faqHtml = faqs.map(([q, a]) => `<details style="margin:10px 0;"><summary style="cursor:pointer;font-weight:600;color:#1a2b3c;">${q}</summary><p style="color:#555;">${a}</p></details>`).join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${svc.title(city)}</title>
  <link rel="canonical" href="${url}"/>
  <meta name="description" content="${svc.desc(city).replace(/"/g, '&quot;')}"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta property="og:title" content="${svc.label} in ${city} | Surprise Granite"/>
  <meta property="og:type" content="website"/>
  <meta property="og:url" content="${url}"/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
  <link href="/migrated/6456ce4476abb25581fbad0c/6456ce4476abb269c6fbb176_Surprise-Granite-favicon-32x32px.png" rel="shortcut icon" type="image/x-icon"/>
  <link rel="stylesheet" href="/css/unified-nav.css?v=20260718o"/>
  <script defer src="/js/unified-nav.js?v=20260713c"></script>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Service","serviceType":${JSON.stringify(svc.label)},"name":${JSON.stringify(svc.label + ' in ' + city + ', AZ')},"description":${JSON.stringify(svc.desc(city))},"provider":{"@type":"HomeAndConstructionBusiness","name":"Surprise Granite","telephone":"+1-602-833-3189","url":"${SITE}","address":{"@type":"PostalAddress","streetAddress":"15464 W Aster Dr","addressLocality":"Surprise","addressRegion":"AZ","postalCode":"85379","addressCountry":"US"}},"areaServed":{"@type":"City","name":${JSON.stringify(city)},"geo":{"@type":"GeoCoordinates","latitude":${lat},"longitude":${lon}}}}</script>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"${SITE}/"},{"@type":"ListItem","position":2,"name":"Locations","item":"${SITE}/locations/"},{"@type":"ListItem","position":3,"name":${JSON.stringify(city)},"item":"${SITE}/locations/${citySlug}/"},{"@type":"ListItem","position":4,"name":${JSON.stringify(svc.label)},"item":"${url}"}]}</script>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[${faqLd}]}</script>
  <style>body{font-family:'Inter',system-ui,sans-serif;color:#1a1a2e;margin:0;line-height:1.7}.wrap{max-width:1000px;margin:0 auto;padding:0 20px}.hero{background:linear-gradient(135deg,#1a2b3c,#0f1a24);color:#fff;padding:64px 20px}.hero h1{font-size:clamp(28px,5vw,42px);margin:0 0 14px}.hero p{opacity:.9;max-width:720px}.btn{display:inline-block;background:#f9cb00;color:#1a2b3c;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;margin-top:8px}.sec{padding:48px 20px}.sec h2{color:#1a2b3c;font-size:clamp(22px,4vw,30px)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:20px}.card{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:18px 20px;text-decoration:none;display:block}.card b{color:#1a2b3c}.card span{color:#666;font-size:13px}a{color:#cca600}</style>
</head>
<body class="unified-nav-active">
  <section class="hero"><div class="wrap">
    <h1>${svc.label} in ${city}, AZ</h1>
    <p>${svc.intro(city, hook)}</p>
    <a class="btn" href="/get-a-free-estimate?service=${svcSlug}&city=${citySlug}">Get a Free ${city} Estimate</a>
  </div></section>

  <section class="sec"><div class="wrap">
    <h2>What's Included</h2>
    <ul style="color:#333;padding-left:20px;">${points}</ul>
    <p style="color:#555;margin-top:16px;">Surprise Granite is a family-owned, licensed Arizona General Contractor (ROC #341113) serving ${city} and the entire Phoenix Valley. See our full <a href="${svc.parent}">${svc.label.toLowerCase()}</a> service, or <a href="/get-a-free-estimate">get a free in-home estimate</a> — we come to you in ${city}.</p>
  </div></section>

  <section class="sec" style="background:#f8f9fa;"><div class="wrap">
    <h2>${city} Services</h2>
    <div class="grid">
      <a class="card" href="/services/countertop-replacement/"><b>Countertop Replacement</b><br><span>Tear-out & new tops</span></a>
      <a class="card" href="/services/countertop-installation/"><b>Countertop Installation</b><br><span>Fabrication & install</span></a>
      <a class="card" href="/services/home/kitchen-remodeling-arizona/"><b>Kitchen Remodeling</b><br><span>Full kitchen remodels</span></a>
      <a class="card" href="/services/home/bathroom-remodeling-arizona/"><b>Bathroom Remodeling</b><br><span>Vanities, showers & tile</span></a>
    </div>
  </div></section>

  <section class="sec"><div class="wrap">
    <h2>Shop Materials</h2>
    <div class="grid">
      <a class="card" href="/materials/all-countertops/"><b>Countertops</b><br><span>Granite, quartz & marble</span></a>
      <a class="card" href="/marketplace/sinks/"><b>Sinks</b><br><span>Kitchen & bath</span></a>
      <a class="card" href="/marketplace/faucets/"><b>Faucets</b><br><span>Kitchen & bath</span></a>
      <a class="card" href="/materials/all-tile/"><b>Tile</b><br><span>Backsplash & floor</span></a>
    </div>
  </div></section>

  <section class="sec" style="background:#f8f9fa;"><div class="wrap">
    <h2>Frequently Asked Questions</h2>
    ${faqHtml}
  </div></section>

  <section class="sec" style="background:#1a2b3c;color:#fff;text-align:center;"><div class="wrap">
    <h2 style="color:#fff;">Ready to Start in ${city}?</h2>
    <p style="opacity:.9;">Free in-home estimate — we measure and quote your ${city} project with no obligation.</p>
    <a class="btn" href="/get-a-free-estimate?service=${svcSlug}&city=${citySlug}">Get My Free Estimate</a>
  </div></section>
</body>
</html>
`;
}

let count = 0;
const sitemapUrls = [];
for (const [citySlug, [city, lat, lon, hook]] of Object.entries(CITIES)) {
  if (!fs.existsSync(path.join(ROOT, 'locations', citySlug))) { console.warn('  city dir missing (skip):', citySlug); continue; }
  for (const [svcSlug, svc] of Object.entries(SERVICES)) {
    const dir = path.join(ROOT, 'locations', citySlug, svcSlug);
    const html = page(citySlug, city, lat, lon, hook, svcSlug, svc);
    count++;
    sitemapUrls.push(`${SITE}/locations/${citySlug}/${svcSlug}/`);
    console.log(`  ${WRITE ? 'write' : 'would write'}: locations/${citySlug}/${svcSlug}/`);
    if (WRITE) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'index.html'), html); }
  }
}
if (WRITE) fs.writeFileSync(path.join(ROOT, 'scripts', '.city-service-urls.txt'), sitemapUrls.join('\n'));
console.log(`\n${WRITE ? 'WROTE' : 'DRY RUN'} — ${count} city×service pages`);
