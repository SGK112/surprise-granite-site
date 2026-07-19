#!/usr/bin/env node
/**
 * Migrate materials/flooring + materials/all-tile onto the shared marketplace-grid.js
 * standard (identical UI to marketplace/faucets & /sinks): filter side-panel, sort,
 * consistent cards, mobile drawer. Template = marketplace/faucets/index.html so the UI
 * is guaranteed identical; only SEO head, hero, and MP_CONFIG (category + facets) change.
 * Prices are per-sq-ft (unit:'/sq ft'). Keeps each page's own /materials/ URL + canonical.
 *
 *   node scripts/build-browse-pages.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SITE = 'https://www.surprisegranite.com';
const TEMPLATE = path.join(ROOT, 'marketplace/faucets/index.html');
const GRID_VER = '20260719a'; // bump when marketplace-grid.js changes

const PAGES = [
  {
    out: 'materials/flooring',
    url: `${SITE}/materials/flooring/`,
    title: 'Flooring — LVP, SPC, Laminate & Tile | Surprise Granite',
    desc: 'Shop luxury vinyl plank, SPC, WPC, laminate & tile flooring installed across metro Phoenix. Filter by type, brand & look — per-sq-ft pricing or request a quote.',
    kicker: 'Flooring',
    h1: 'Flooring',
    heroP: 'Luxury vinyl plank, SPC, WPC, laminate & tile flooring — durable, waterproof options installed across the Phoenix metro. Filter by type, brand & look.',
    searchPh: 'Search flooring…',
    collName: 'Flooring',
    helpers: `function _flType(p){var t=((p.subcategory||'')+' '+(p.productType||'')+' '+(p.name||'')).toLowerCase();if(/\\bspc\\b/.test(t))return'SPC';if(/\\bwpc\\b/.test(t))return'WPC';if(/laminate/.test(t))return'Laminate';if(/loose.?lay/.test(t))return'Loose-Lay';if(/\\blvp\\b|luxury vinyl|vinyl plank/.test(t))return'LVP';if(/vinyl/.test(t))return'Vinyl';if(/hardwood|engineered wood/.test(t))return'Hardwood';if(/porcelain|ceramic|\\btile\\b/.test(t))return'Tile';return'Other';}
function _flLook(t){t=(t||'').toLowerCase();if(/oak|hickory|walnut|maple|pine|birch|acacia|teak|\\bwood\\b/.test(t))return'Wood-look';if(/marble|travertine|slate|\\bstone\\b|concrete|cement/.test(t))return'Stone-look';if(/herringbone|chevron/.test(t))return'Herringbone';return'Solid';}`,
    config: `window.MP_CONFIG={category:'flooring',cardCategory:'flooring',noun:'floors',unit:'/sq ft',priceMin:0,priceMax:2000,brandOf:_brand,facets:[{key:'type',label:'Type',order:['LVP','SPC','WPC','Laminate','Loose-Lay','Vinyl','Hardwood','Tile'],derive:_flType},{key:'brand',label:'Brand',presetOf:function(v){return _brand({brand:v});},derive:function(p){return _brand(p);}},{key:'look',label:'Look',derive:function(p){return _flLook(p.name||'');}}]};`,
  },
  {
    out: 'materials/all-tile',
    url: `${SITE}/materials/all-tile/`,
    title: 'Tile & Backsplash — Porcelain, Stone & Pavers | Surprise Granite',
    desc: 'Shop porcelain, natural stone & paver tile for floors, walls & backsplashes across metro Phoenix. Filter by material, brand & finish — per-sq-ft pricing or request a quote.',
    kicker: 'Tile',
    h1: 'Tile & Backsplash',
    heroP: 'Porcelain, natural stone & paver tile for floors, walls & backsplashes — installed across the Phoenix metro. Filter by material, brand & finish.',
    searchPh: 'Search tile…',
    collName: 'Tile & Backsplash',
    helpers: `function _tileMat(p){var t=((p.subcategory||'')+' '+(p.productType||'')).toLowerCase();if(/porcelain/.test(t))return'Porcelain';if(/paver/.test(t))return'Pavers';if(/natural stone|marble|travertine|granite|slate|limestone/.test(t))return'Natural Stone';if(/ceramic/.test(t))return'Ceramic';if(/glass/.test(t))return'Glass';if(/mosaic/.test(t))return'Mosaic';return'Tile';}
function _tileFinish(t){t=(t||'').toLowerCase();if(/matte/.test(t))return'Matte';if(/polished/.test(t))return'Polished';if(/honed/.test(t))return'Honed';if(/textured|structured/.test(t))return'Textured';if(/lappato|satin/.test(t))return'Satin';if(/natural/.test(t))return'Natural';return'Other';}`,
    config: `window.MP_CONFIG={category:'tile',cardCategory:'tile',noun:'tiles',unit:'/sq ft',priceMin:0,priceMax:2000,brandOf:_brand,facets:[{key:'material',label:'Material',derive:_tileMat},{key:'brand',label:'Brand',presetOf:function(v){return _brand({brand:v});},derive:function(p){return _brand(p);}},{key:'finish',label:'Finish',derive:function(p){return _tileFinish(p.name||'');}}]};`,
  },
];

function schema(p) {
  const graph = [
    { '@type': 'CollectionPage', name: p.collName, url: p.url,
      isPartOf: { '@type': 'WebSite', name: 'Surprise Granite', url: SITE + '/' } },
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Marketplace', item: SITE + '/marketplace/' },
      { '@type': 'ListItem', position: 3, name: p.collName, item: p.url } ] },
  ];
  return `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })}</script>`;
}

function rep(html, from, to, label) {
  if (from instanceof RegExp) {
    if (!from.test(html)) throw new Error(`anchor not found: ${label}`);
    return html.replace(from, () => to); // function replacement avoids $-pattern surprises
  }
  if (html.indexOf(from) < 0) throw new Error(`anchor not found: ${label}`);
  return html.split(from).join(to);
}

const template = fs.readFileSync(TEMPLATE, 'utf8');
let built = 0;

for (const p of PAGES) {
  let html = template;
  html = rep(html, '<title>Kitchen & Bathroom Faucets | Surprise Granite Marketplace</title>', `<title>${p.title.replace(/&/g, '&amp;')}</title>`, 'title');
  html = rep(html, '<meta name="description" content="Shop kitchen & bathroom faucets — pull-down, widespread, pot fillers in premium finishes. Free shipping over $500."/>', `<meta name="description" content="${p.desc.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"/>`, 'desc');
  html = rep(html, '<link rel="canonical" href="https://www.surprisegranite.com/marketplace/faucets/"/>', `<link rel="canonical" href="${p.url}"/>`, 'canonical');
  html = rep(html, '<script type="application/ld+json">{"@context":"https://schema.org","@type":"CollectionPage","name":"Kitchen & Bathroom Faucets","url":"https://www.surprisegranite.com/marketplace/faucets/","isPartOf":{"@type":"WebSite","name":"Surprise Granite","url":"https://www.surprisegranite.com/"}}</script>', schema(p), 'json-ld');
  html = rep(html,
    '<section class="mp-hero"><div class="mp-wrap"><div class="k">Marketplace</div><h1>Kitchen & Bathroom Faucets</h1><p>Pull-down, widespread, single-hole & pot fillers in matte black, brushed gold, nickel & chrome — free shipping over $500.</p></div></section>',
    `<section class="mp-hero"><div class="mp-wrap"><div class="k">${p.kicker}</div><h1>${p.h1}</h1><p>${p.heroP}</p></div></section>`, 'hero');
  html = rep(html, 'placeholder="Search kitchen & bathroom faucets…"', `placeholder="${p.searchPh}"`, 'search');
  html = rep(html, /window\.MP_CONFIG=\{category:'faucet'[\s\S]*?\}\]\};/, p.helpers + '\n' + p.config, 'mp-config');
  html = rep(html, 'marketplace-grid.js?v=20260716b', `marketplace-grid.js?v=${GRID_VER}`, 'grid-ver');

  const dir = path.join(ROOT, p.out);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  built++;
  console.log(`built ${p.out}`);
}
console.log(`\ndone — ${built} browse pages migrated to marketplace-grid.js standard`);
