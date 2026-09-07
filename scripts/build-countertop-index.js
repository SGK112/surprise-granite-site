#!/usr/bin/env node
/**
 * Write data/countertop-index.json — handle -> the ONE page for that stone.
 *
 * A countertop is a slab. There is no reason for a stone to answer on two URLs,
 * and it was answering on three: the real page at /countertops/<slug>/, the same
 * stone again through /marketplace/product/?handle=<slug>&category=slabs, and
 * (for colours we merged) a redirect stub at its old slug.
 *
 * This index lets the dynamic template hand a visitor straight to the real page.
 * Stubs are resolved here rather than at request time, so a merged colour goes
 * to the surviving stone in ONE hop instead of bouncing through the stub:
 *
 *   absoluteblack-daltile  ->  /countertops/absolute-black-granite/
 *   absolute-black-granite ->  /countertops/absolute-black-granite/
 *
 * Kept separate from data/pdp-index.json (goods) so a shower panel's page does
 * not download 3,600 stone handles it will never look at.
 *
 * Usage: node scripts/build-countertop-index.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'countertops');
const OUT = path.join(ROOT, 'data', 'countertop-index.json');
const SITE = 'https://www.surprisegranite.com';

const index = {};
let stubs = 0, real = 0;

for (const slug of fs.readdirSync(DIR)) {
  const file = path.join(DIR, slug, 'index.html');
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');

  // A merged colour keeps a small stub whose canonical names the survivor.
  // Follow it here so the redirect lands on the real page first time.
  const canon = html.match(/<link rel="canonical" href="([^"]+)"/i);
  let target = `/countertops/${slug}/`;
  if (canon) {
    const href = canon[1].replace(SITE, '');
    if (/^\/countertops\/[^/]+\/$/.test(href) && href !== target) { target = href; stubs++; }
    else real++;
  } else { real++; }

  index[slug.toLowerCase()] = target;
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(index));
console.log(`wrote data/countertop-index.json — ${Object.keys(index).length} handles ` +
  `(${real} own page, ${stubs} resolved through a stub to the surviving stone), ` +
  `${(fs.statSync(OUT).size / 1024).toFixed(0)}KB`);
