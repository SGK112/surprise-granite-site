#!/usr/bin/env node
/**
 * Walk real pages and assert the things a customer needs, the way a customer
 * meets them.
 *
 * Every bug found on 2026-09-06 was invisible to the data and obvious in a
 * browser: a search that could not find a product we had just sold, 760 products
 * whose buy button vanished on click-through, galleries of one floor showing
 * photos of another, countertop thumbnails that did nothing, a review form with
 * no way out. Nothing checked the pages themselves, so the owner was the test
 * suite.
 *
 * Assertions are deliberately about OUTCOMES, not markup: "this page can be
 * bought from", "these thumbnails do something", "this price is the price we
 * would charge". Markup can be refactored; those must stay true.
 *
 *   node scripts/smoke-check.js            # generated files on disk (run after a build)
 *   node scripts/smoke-check.js --live     # the deployed site
 *   node scripts/smoke-check.js --sample 8 # pages per section (default 5)
 *
 * Exits non-zero if anything fails, so it can gate a deploy.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIVE = process.argv.includes('--live');
const si = process.argv.indexOf('--sample');
const SAMPLE = si !== -1 && process.argv[si + 1] ? parseInt(process.argv[si + 1], 10) : 5;
const SITE = 'https://www.surprisegranite.com';
const API = 'https://surprise-granite-email-api.onrender.com';

const results = [];
const ok = (name, detail) => results.push({ pass: true, name, detail });
const bad = (name, detail) => results.push({ pass: false, name, detail });
function check(name, condition, detail) { (condition ? ok : bad)(name, detail); return !!condition; }

// Deterministic sample: same pages every run, so a failure is reproducible and
// a fix is verifiable. Random sampling turns a red build into a coin flip.
function pick(list, n) {
  const sorted = [...list].sort();
  if (sorted.length <= n) return sorted;
  const step = Math.floor(sorted.length / n);
  return Array.from({ length: n }, (_, i) => sorted[i * step]);
}

async function readPage(rel) {
  if (LIVE) {
    const res = await fetch(SITE + rel, { redirect: 'follow' });
    return res.ok ? await res.text() : null;
  }
  const file = path.join(ROOT, rel.replace(/^\/|\/$/g, ''), 'index.html');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

const dirsIn = (rel) => {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs)
    ? fs.readdirSync(abs, { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(abs, e.name, 'index.html')))
      .map((e) => e.name)
    : [];
};

// ── A marketplace product page must be buyable, or say why not ──────────────
async function checkMarketplace(dir, label) {
  const handles = pick(dirsIn(`marketplace/${dir}`), SAMPLE);
  if (!handles.length) return bad(`${label}: pages exist`, `no pages under marketplace/${dir}`);

  for (const h of handles) {
    const html = await readPage(`/marketplace/${dir}/${h}/`);
    if (!html) { bad(`${label}/${h}`, 'page did not load'); continue; }

    const retired = /content="noindex/i.test(html);
    const hasBuy = /class="add-to-cart-btn"/.test(html);
    const buyDisabled = /add-to-cart-btn"[^>]*\bdisabled/.test(html);

    if (retired) {
      // A product we no longer sell must not offer a button checkout will refuse.
      check(`${label}/${h}: retired page has no live buy button`, !hasBuy || buyDisabled,
        'noindexed page still offers Add to Cart');
    } else {
      check(`${label}/${h}: can be bought`, hasBuy && !buyDisabled,
        hasBuy ? 'Add to Cart is disabled on a live product' : 'no Add to Cart at all');
      check(`${label}/${h}: has a price`, /class="pdp-price">\$[0-9]/.test(html), 'no price rendered');
      check(`${label}/${h}: cart carries the same price the page shows`,
        (() => {
          const shown = /class="pdp-price">\$([0-9,.]+)/.exec(html);
          const cart = /SG_PRODUCT = \{[^}]*"price":([0-9.]+)/.exec(html);
          if (!shown || !cart) return false;
          return Math.abs(parseFloat(shown[1].replace(/,/g, '')) - parseFloat(cart[1])) < 0.01;
        })(), 'the displayed price and the price added to the cart disagree');
    }

    check(`${label}/${h}: description is prose, not markup`,
      !/<div class="pdp-desc">\s*[{[<]/.test(html) && !/pdp-desc">[^<]*@context/.test(html),
      'description begins with markup or JSON');

    const thumbs = (html.match(/class="pdp-thumb/g) || []).length;
    if (thumbs > 1) {
      check(`${label}/${h}: thumbnails do something`,
        /class="pdp-thumb[^"]*"[^>]*onclick=/.test(html), `${thumbs} thumbnails, none clickable`);
    }
  }
}

// ── A countertop page is a picture of a rock; the pictures must work ────────
async function checkCountertops() {
  const all = dirsIn('countertops');
  // Stubs and redirects have no gallery to check; test real pages.
  const real = all.filter((d) => fs.statSync(path.join(ROOT, 'countertops', d, 'index.html')).size > 3000);
  for (const h of pick(real, SAMPLE)) {
    const html = await readPage(`/countertops/${h}/`);
    if (!html) { bad(`countertops/${h}`, 'page did not load'); continue; }

    const thumbs = (html.match(/class="thumb[ "]/g) || []).length;
    if (thumbs) {
      check(`countertops/${h}: thumbnails swap the main image`,
        /id="ctHero"/.test(html) && /function ctShow/.test(html) && /data-src=/.test(html),
        `${thumbs} thumbnails but no working swap`);
    }
    // Only for pages we actually want indexed. The 856 no-data stubs are
    // deliberately noindexed and canonical to the browse page; that is a
    // decision, not a defect, and asserting against it would train everyone to
    // ignore this check.
    if (!/content="noindex/i.test(html)) {
      check(`countertops/${h}: self-canonical`,
        new RegExp(`<link rel="canonical" href="[^"]*/countertops/${h}/"`).test(html),
        'an indexable stone page whose canonical points somewhere else');
    }
  }
}

// ── The review form must have a way out ────────────────────────────────────
async function checkReviewForm() {
  const html = await readPage('/product-review/');
  if (!check('review form: loads', !!html, 'page did not load')) return;
  check('review form: has an exit', /id="closeBtn"/.test(html), 'no close control — the form is a dead end');
  check('review form: the exit works without JS',
    /<a class="close"[^>]*href="\/[^"]+"/.test(html), 'close has no href to fall back on');
}

// ── One product, one page ──────────────────────────────────────────────────
async function checkOneSurface() {
  const html = await readPage('/marketplace/product/');
  if (!check('dynamic product page: loads', !!html, 'page did not load')) return;
  check('dynamic page hands goods to their static page',
    /pdp-index\.json/.test(html), 'no handoff — two pages per product again');
  check('dynamic page hands stone to /countertops/',
    /countertop-index\.json/.test(html), 'no handoff — stone renders on two surfaces again');

  for (const [file, key] of [['data/pdp-index.json', 'bathroom'], ['data/countertop-index.json', null]]) {
    let idx = null;
    if (LIVE) {
      const r = await fetch(`${SITE}/${file}`);
      idx = r.ok ? await r.json() : null;
    } else if (fs.existsSync(path.join(ROOT, file))) {
      idx = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    }
    // The goods index is a handful of department keys holding thousands of
    // handles; the stone index is thousands of top-level keys. Count what each
    // one actually holds rather than assuming one shape.
    const entries = idx ? (key ? (idx[key] || []).length : Object.keys(idx).length) : 0;
    check(`${file}: present and populated`, entries > 100,
      `handoff index has ${entries} entries — every redirect silently stops working`);
  }
}

// ── Search must find what we sell ──────────────────────────────────────────
async function checkSearch() {
  const cases = [
    ['Vigo Dilana', 1, 'brand + product name across two columns'],
    ['VG08001', 1, 'a SKU'],
    ['dilana', 1, 'one word'],
  ];
  for (const [q, min, why] of cases) {
    try {
      const r = await fetch(`${API}/api/catalog?search=${encodeURIComponent(q)}&limit=5&in_stock=false`);
      const j = await r.json();
      check(`search "${q}" finds something`, (j.total || 0) >= min, `${why} returned ${j.total} results`);
    } catch (e) { bad(`search "${q}"`, e.message); }
  }
}

// ── The page price is the price we would charge ────────────────────────────
async function checkPriceAgreement() {
  const handles = pick(dirsIn('marketplace/bathroom'), 3);
  for (const h of handles) {
    const html = await readPage(`/marketplace/bathroom/${h}/`);
    if (!html || /content="noindex/i.test(html)) continue;
    const shown = /class="pdp-price">\$([0-9,.]+)/.exec(html);
    if (!shown) continue;
    try {
      const r = await fetch(`${API}/api/catalog/${encodeURIComponent(h)}`);
      const p = (await r.json()).product;
      if (!p) { bad(`price agrees with catalog: ${h}`, 'live product page for a product the catalog does not return'); continue; }
      check(`price agrees with catalog: ${h}`,
        Math.abs(parseFloat(shown[1].replace(/,/g, '')) - Number(p.retail_price)) < 0.01,
        `page says $${shown[1]}, catalog says $${p.retail_price} — checkout would charge the catalog price`);
    } catch (e) { bad(`price agrees with catalog: ${h}`, e.message); }
  }
}

(async () => {
  console.log(`smoke check — ${LIVE ? 'LIVE SITE' : 'generated files on disk'}, ${SAMPLE} pages per section\n`);
  await checkMarketplace('bathroom', 'bathroom');
  await checkMarketplace('sinks', 'sinks');
  await checkMarketplace('faucets', 'faucets');
  await checkCountertops();
  await checkReviewForm();
  await checkOneSurface();
  await checkSearch();
  await checkPriceAgreement();

  const failed = results.filter((r) => !r.pass);
  for (const f of failed) console.log(`  FAIL  ${f.name}\n        ${f.detail}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) { console.log(`\n${failed.length} FAILED`); process.exit(1); }
  console.log('all clear');
})();
