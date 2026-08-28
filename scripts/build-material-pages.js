#!/usr/bin/env node
/**
 * Rebuild the 6 material category pages on the all-countertops catalog engine, each
 * pre-filtered to its material so they show LIVE colors + installed pricing (the static
 * Webflow versions had no pricing). Preserves/improves SEO: unique title + description +
 * H1 + intro + FAQ/Breadcrumb schema, self-canonical, index,follow.
 *
 * Template = materials/all-countertops/index.html (single source of truth for the grid).
 * Run after any change to that engine so the material pages never drift.
 *
 *   node scripts/build-material-pages.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://www.surprisegranite.com';
const TEMPLATE = path.join(ROOT, 'materials/all-countertops/index.html');

// key = the value matOf() returns in the engine (must match exactly to filter).
const MATERIALS = [
  {
    key: 'Granite', slug: 'granite',
    title: 'Granite Countertops in Surprise & Phoenix, AZ | Colors + Pricing',
    desc: 'Browse granite countertop colors we fabricate & install across metro Phoenix. See installed pricing per sq ft, order a $12.99 sample, or book a free in-home estimate.',
    h1: 'Granite Countertops',
    heroP: 'Every granite color we fabricate and install across the Phoenix metro — natural stone that’s heat- and scratch-resistant, with one-of-a-kind veining. Tap any color for installed pricing, a $12.99 sample, or a free in-home estimate.',
    introH2: 'Granite countertops for Phoenix kitchens & bathrooms',
    introP: 'Granite is a natural stone prized for its durability, heat resistance, and unique movement — no two slabs are alike. Surprise Granite sources granite from Arizona Tile, MSI, and top distributors, then fabricates and installs across the Phoenix metro from $55/sqft. Browse colors above with live installed pricing, order a $12.99 sample, or book a free in-home estimate. Licensed AZ ROC #367593.',
    faqs: [
      ['How much do granite countertops cost in Phoenix?', 'Installed granite starts around $55/sq ft for fabrication and installation on top of the slab material cost. Each color above shows its installed price per square foot; a free in-home measure gives you an exact quote.'],
      ['Does granite need to be sealed?', 'Yes — granite is a natural stone and we seal it during installation. A quick reseal every 1–2 years keeps it stain-resistant. It only takes a few minutes.'],
      ['Is granite better than quartz?', 'Granite is 100% natural with unique veining and excellent heat resistance; quartz is engineered, non-porous, and never needs sealing. We install both — the right choice depends on your look and maintenance preference.'],
    ],
  },
  {
    key: 'Quartz', slug: 'quartz',
    title: 'Quartz Countertops in Surprise & Phoenix, AZ | Colors + Pricing',
    desc: 'Browse engineered quartz countertop colors we install across metro Phoenix — non-porous, no sealing. See installed pricing, order a $12.99 sample, or book a free estimate.',
    h1: 'Quartz Countertops',
    heroP: 'Every engineered quartz color we install across the Phoenix metro — non-porous, low-maintenance, and consistent from slab to slab. Tap any color for installed pricing, a $12.99 sample, or a free in-home estimate.',
    introH2: 'Quartz countertops for Phoenix kitchens & bathrooms',
    introP: 'Engineered quartz is non-porous, stain-resistant, and never needs sealing — ideal for busy kitchens. Surprise Granite installs quartz from MSI Q, Caesarstone, Silestone, Cambria alternatives, and more across the Phoenix metro from $55/sqft. Browse colors above with live installed pricing, order a $12.99 sample, or book a free in-home estimate. Licensed AZ ROC #367593.',
    faqs: [
      ['How much do quartz countertops cost in Phoenix?', 'Installed quartz starts around $55/sq ft for fabrication and installation plus the slab cost. Each color above lists its installed price per square foot; a free in-home measure gives you an exact quote.'],
      ['Does quartz need to be sealed?', 'No. Engineered quartz is non-porous, so it never needs sealing — just clean with soap and water.'],
      ['Is quartz heat resistant?', 'Quartz resists everyday heat, but the resin binder can scorch under very hot pans, so we recommend using trivets. For maximum heat tolerance, ask us about porcelain or Dekton.'],
    ],
  },
  {
    key: 'Quartzite', slug: 'quartzite',
    title: 'Quartzite Countertops in Surprise & Phoenix, AZ | Colors + Pricing',
    desc: 'Browse natural quartzite countertop colors we install across metro Phoenix — marble looks with granite-plus durability. See installed pricing, samples & free estimates.',
    h1: 'Quartzite Countertops',
    heroP: 'Every natural quartzite color we install across the Phoenix metro — the marble look you want with hardness that beats granite. Tap any color for installed pricing, a $12.99 sample, or a free in-home estimate.',
    introH2: 'Quartzite countertops for Phoenix kitchens & bathrooms',
    introP: 'Quartzite is a natural stone that offers the soft, flowing look of marble with a hardness greater than granite — colors like Taj Mahal, Mont Blanc, and Sea Pearl are favorites. Surprise Granite fabricates and installs quartzite across the Phoenix metro from $55/sqft. Browse colors above with live installed pricing, order a $12.99 sample, or book a free in-home estimate. Licensed AZ ROC #367593.',
    faqs: [
      ['Is quartzite the same as quartz?', 'No. Quartzite is a 100% natural stone quarried from the earth; quartz is an engineered, man-made material. Quartzite has natural veining and excellent hardness, while quartz offers consistent color and zero maintenance.'],
      ['How much do quartzite countertops cost in Phoenix?', 'Installed quartzite starts around $55/sq ft for fabrication and installation plus the slab cost. Each color above shows its installed price; a free in-home measure gives an exact quote.'],
      ['Does quartzite scratch or etch?', 'Quartzite is harder than granite and resists scratching well. Because it’s natural stone we seal it on install; unlike marble, true quartzite resists acid etching.'],
    ],
  },
  {
    key: 'Marble', slug: 'marble',
    title: 'Marble Countertops in Surprise & Phoenix, AZ | Colors + Pricing',
    desc: 'Browse natural marble countertop colors we install across metro Phoenix — timeless Carrara & Calacatta looks. See installed pricing, order a sample, or book a free estimate.',
    h1: 'Marble Countertops',
    heroP: 'Every natural marble color we install across the Phoenix metro — timeless, luminous, and one of a kind. Tap any color for installed pricing, a $12.99 sample, or a free in-home estimate.',
    introH2: 'Marble countertops for Phoenix kitchens & bathrooms',
    introP: 'Marble brings unmatched elegance — the soft veining of Carrara, Calacatta, and Statuario has defined luxury kitchens and baths for centuries. It’s a softer natural stone that develops a lived-in patina; we seal it on install and can guide you on care. Surprise Granite fabricates and installs marble across the Phoenix metro from $55/sqft. Browse colors above, order a $12.99 sample, or book a free in-home estimate. Licensed AZ ROC #367593.',
    faqs: [
      ['Is marble too soft for kitchen countertops?', 'Marble is softer than granite or quartzite and can etch or scratch with acidic spills, so it’s often chosen for baths, vanities, and lower-traffic kitchens — or by homeowners who love its natural patina. We’ll help you decide.'],
      ['How much do marble countertops cost in Phoenix?', 'Installed marble starts around $55/sq ft for fabrication and installation plus the slab cost. Each color above shows installed pricing; a free in-home measure gives an exact quote.'],
      ['How do I maintain marble countertops?', 'We seal marble on installation, and periodic resealing plus wiping spills promptly keeps it looking its best. Use cutting boards and trivets to protect the surface.'],
    ],
  },
  {
    key: 'Porcelain', slug: 'porcelain',
    title: 'Porcelain Countertops in Surprise & Phoenix, AZ | Colors + Pricing',
    desc: 'Browse large-format porcelain countertop colors we install across metro Phoenix — UV-stable, heat- & scratch-resistant, indoor/outdoor. See pricing, samples & free estimates.',
    h1: 'Porcelain Countertops',
    heroP: 'Every large-format porcelain color we install across the Phoenix metro — UV-stable, heat- and scratch-resistant, and perfect for indoor or outdoor kitchens. Tap any color for installed pricing, a $12.99 sample, or a free in-home estimate.',
    introH2: 'Porcelain countertops for Phoenix kitchens & bathrooms',
    introP: 'Porcelain slabs are ultra-durable, UV-stable, and highly heat- and scratch-resistant — ideal for sun-exposed Arizona outdoor kitchens and modern large-format looks. Surprise Granite fabricates and installs porcelain across the Phoenix metro from $55/sqft. Browse colors above with live installed pricing, order a $12.99 sample, or book a free in-home estimate. Licensed AZ ROC #367593.',
    faqs: [
      ['Are porcelain countertops good for outdoor kitchens?', 'Yes — porcelain is UV-stable so it won’t fade in Arizona sun, and it resists heat, scratches, and moisture, making it one of the best choices for outdoor kitchens.'],
      ['How much do porcelain countertops cost in Phoenix?', 'Installed porcelain starts around $55/sq ft for fabrication and installation plus the slab cost. Each color above shows installed pricing; a free in-home measure gives an exact quote.'],
      ['Is porcelain durable enough for a kitchen?', 'Very — porcelain resists heat, scratches, stains, and UV. It’s thinner than stone, so proper fabrication matters; our installers are experienced with large-format porcelain.'],
    ],
  },
  {
    key: 'Dekton', slug: 'dekton',
    title: 'Dekton Countertops in Surprise & Phoenix, AZ | Colors + Pricing',
    desc: 'Browse Dekton ultracompact countertop colors we install across metro Phoenix — scratch-, heat- & UV-proof, indoor/outdoor. See installed pricing, samples & free estimates.',
    h1: 'Dekton Countertops',
    heroP: 'Every Dekton ultracompact color we install across the Phoenix metro — virtually scratch-, heat-, and UV-proof for the most demanding kitchens, indoors or out. Tap any color for installed pricing, a $12.99 sample, or a free in-home estimate.',
    introH2: 'Dekton countertops for Phoenix kitchens & bathrooms',
    introP: 'Dekton by Cosentino is a sintered, ultracompact surface engineered for extreme durability — highly resistant to scratches, heat, stains, and UV fading, so it excels indoors and in Arizona outdoor kitchens. Surprise Granite fabricates and installs Dekton across the Phoenix metro from $55/sqft. Browse colors above with live installed pricing, order a $12.99 sample, or book a free in-home estimate. Licensed AZ ROC #367593.',
    faqs: [
      ['What is Dekton made of?', 'Dekton is an ultracompact surface by Cosentino made from a sintered blend of raw materials used in glass, porcelain, and quartz — engineered for maximum durability indoors and outdoors.'],
      ['How much do Dekton countertops cost in Phoenix?', 'Installed Dekton starts around $55/sq ft for fabrication and installation plus the slab cost. Each color above shows installed pricing; a free in-home measure gives an exact quote.'],
      ['Is Dekton heat and scratch resistant?', 'Yes — Dekton is highly resistant to heat, scratches, stains, and UV, making it one of the most durable countertop surfaces available.'],
    ],
  },
];

// Material pills as links to sibling pages (each material keeps its own URL).
function pillsHtml(currentSlug) {
  const links = [['all-countertops', 'All', 'all']].concat(
    MATERIALS.map(m => [`countertops/${m.slug}-countertops`, m.key, m.slug]));
  return links.map(([pathPart, label, slug]) => {
    const href = slug === 'all' ? '/materials/all-countertops/' : `/materials/${pathPart}/`;
    const on = slug === currentSlug ? ' on' : '';
    return `      <a class="pill${on}" href="${href}">${label}</a>`;
  }).join('\n');
}

function schema(m) {
  const url = `${SITE}/materials/countertops/${m.slug}-countertops/`;
  const graph = [
    { '@type': 'CollectionPage', name: `${m.key} Countertops`, url,
      description: m.desc,
      isPartOf: { '@type': 'WebSite', name: 'Surprise Granite', url: SITE + '/' },
      about: { '@type': 'Service', name: `${m.key} countertop fabrication & installation`, areaServed: 'Phoenix metro, AZ' } },
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Countertops', item: SITE + '/materials/all-countertops/' },
      { '@type': 'ListItem', position: 3, name: `${m.key} Countertops`, item: url } ] },
    { '@type': 'FAQPage', mainEntity: m.faqs.map(([q, a]) => (
      { '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ];
  return `<script type="application/ld+json">\n${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })}\n</script>`;
}

function faqSection(m) {
  const items = m.faqs.map(([q, a]) =>
    `    <details class="m-faq"><summary>${q}</summary><p>${a}</p></details>`).join('\n');
  return `  <section class="m-intro">\n    <h2>${m.introH2}</h2>\n    <p>${m.introP}</p>\n`
    + `    <h2 style="margin-top:22px">${m.key} countertop FAQs</h2>\n${items}\n  </section>`;
}

const FAQ_CSS = `  .m-faq{border-top:1px solid var(--line);padding:12px 0;}
  .m-faq summary{cursor:pointer;font-weight:700;color:var(--ink);list-style:none;}
  .m-faq summary::-webkit-details-marker{display:none;}
  .m-faq summary::before{content:"+";color:var(--gold-ink);font-weight:800;margin-right:8px;}
  .m-faq[open] summary::before{content:"–";}
  .m-faq p{color:var(--ink-2);margin:8px 0 0;font-size:14.5px;}
`;

function assertReplace(html, from, to, label) {
  if (html.indexOf(from) < 0) throw new Error(`template anchor not found: ${label}`);
  return html.split(from).join(to);
}

const template = fs.readFileSync(TEMPLATE, 'utf8');
let built = 0;

for (const m of MATERIALS) {
  const url = `${SITE}/materials/countertops/${m.slug}-countertops/`;
  let html = template;

  // <head> SEO
  html = assertReplace(html,
    '<title>All Countertop Colors | Granite, Quartz &amp; Quartzite | Surprise Granite</title>',
    `<title>${m.title.replace(/&/g, '&amp;')}</title>`, 'title');
  html = assertReplace(html,
    '<meta name="description" content="Browse every granite, quartz, quartzite, marble &amp; porcelain countertop color we fabricate &amp; install across metro Phoenix — order a sample or free estimate."/>',
    `<meta name="description" content="${m.desc.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"/>`, 'description');
  html = assertReplace(html,
    '<link rel="canonical" href="https://www.surprisegranite.com/materials/all-countertops/"/>',
    `<link rel="canonical" href="${url}"/>`, 'canonical');
  html = assertReplace(html,
    '<meta property="og:title" content="All Countertop Colors — Surprise Granite"/>',
    `<meta property="og:title" content="${m.key} Countertops — Surprise Granite"/>`, 'og:title');
  html = assertReplace(html,
    '<meta property="og:description" content="Every granite, quartz &amp; quartzite color we install, shown in real kitchens &amp; baths."/>',
    `<meta property="og:description" content="${m.desc.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"/>`, 'og:description');
  html = assertReplace(html,
    '<meta property="og:url" content="https://www.surprisegranite.com/materials/all-countertops/"/>',
    `<meta property="og:url" content="${url}"/>`, 'og:url');

  // JSON-LD: replace the CollectionPage block with material @graph (CollectionPage + Breadcrumb + FAQ)
  const oldLd = '<script type="application/ld+json">\n{"@context":"https://schema.org","@type":"CollectionPage","name":"All Countertop Colors","url":"https://www.surprisegranite.com/materials/all-countertops/","description":"Granite, quartz, quartzite, marble and porcelain countertop colors fabricated and installed across the Phoenix metro.","isPartOf":{"@type":"WebSite","name":"Surprise Granite","url":"https://www.surprisegranite.com/"},"about":{"@type":"Service","name":"Countertop fabrication & installation","areaServed":"Phoenix metro, AZ"}}\n</script>';
  html = assertReplace(html, oldLd, schema(m), 'json-ld');

  // FAQ CSS (inject before closing </style> of the first style block — anchor on footer-enhanced link is safer: add right after :root vars line)
  html = assertReplace(html, '<style>\n  :root{', `<style>\n${FAQ_CSS}  :root{`, 'faq-css');

  // Hero H1 + intro
  html = assertReplace(html,
    '<h1 class="heading-style-h1">All Countertop Colors</h1>',
    `<h1 class="heading-style-h1">${m.h1}</h1>`, 'h1');
  html = assertReplace(html,
    '<p>Every granite, quartz, quartzite, marble &amp; porcelain color we fabricate and install across the Phoenix metro — shown in real kitchens &amp; baths. Tap any color for details, a $12.99 sample, or a free in-home estimate.</p>',
    `<p>${m.heroP}</p>`, 'hero-p');

  // Pills → sibling links
  const oldPills = `      <button class="pill on" data-mat="all">All</button>
      <button class="pill" data-mat="Quartz">Quartz</button>
      <button class="pill" data-mat="Granite">Granite</button>
      <button class="pill" data-mat="Quartzite">Quartzite</button>
      <button class="pill" data-mat="Marble">Marble</button>
      <button class="pill" data-mat="Porcelain">Porcelain</button>
      <button class="pill" data-mat="Dekton">Dekton</button>`;
  html = assertReplace(html, oldPills, pillsHtml(m.slug), 'pills');

  // Bottom intro + FAQ section
  const oldIntro = `  <section class="m-intro">
    <h2>Countertop colors for Phoenix kitchens &amp; bathrooms</h2>
    <p>Surprise Granite fabricates and installs granite, quartz, quartzite, marble, and porcelain countertops across the Phoenix metro — from Arizona Tile, MSI, Cosentino, Caesarstone, Daltile and more. Browse the full color range above, see each stone in a finished space, then order a $12.99 sample, view slabs in person at a partner yard, or book a free in-home estimate. Fabrication &amp; install from $55/sqft. Licensed AZ ROC #367593.</p>
  </section>`;
  html = assertReplace(html, oldIntro, faqSection(m), 'intro');

  // Lock the grid to this material (engine default was mat='all')
  html = assertReplace(html, "mat='all'", `mat='${m.key}'`, 'mat-default');

  const outDir = path.join(ROOT, 'materials/countertops', `${m.slug}-countertops`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  built++;
  console.log(`built ${m.slug}-countertops (mat=${m.key})`);
}

console.log(`\ndone — ${built} material pages rebuilt on the catalog engine`);
