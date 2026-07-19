#!/usr/bin/env node
/**
 * Inject a crawlable SSR link index into the JS-grid browse pages so their products aren't
 * orphaned (discoverable only via sitemap). Links are built from the category sitemap
 * (authoritative, real URLs only) with names pulled from each detail page's <h1>/<title>.
 * Idempotent: replaces any prior injected block. Run after the page generators.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const TARGETS = [
  { file: 'materials/all-countertops/index.html', sitemap: 'sitemap-countertops.xml', label: 'countertop colors', extraLinks: [
    ['/materials/countertops/granite-countertops/', 'Granite countertops'],
    ['/materials/countertops/quartz-countertops/', 'Quartz countertops'],
    ['/materials/countertops/marble-countertops/', 'Marble countertops'],
    ['/materials/countertops/quartzite-countertops/', 'Quartzite countertops'],
    ['/materials/countertops/porcelain-countertops/', 'Porcelain countertops'],
    ['/materials/countertops/dekton-countertops/', 'Dekton countertops'],
  ] },
  { file: 'marketplace/sinks/index.html', sitemap: 'sitemap-sinks.xml', label: 'sinks' },
  { file: 'marketplace/faucets/index.html', sitemap: 'sitemap-faucets.xml', label: 'faucets' },
  { file: 'marketplace/tile/index.html', sitemap: 'sitemap-tile.xml', label: 'tile' },
  { file: 'marketplace/bathroom/index.html', sitemap: 'sitemap-bathroom.xml', label: 'bathroom fixtures' },
  { file: 'marketplace/kitchen-accessories/index.html', sitemap: 'sitemap-kitchen-accessories.xml', label: 'kitchen accessories' },
  { file: 'materials/all-tile/index.html', sitemap: 'sitemap-tile.xml', label: 'tile' },
  { file: 'materials/flooring/index.html', sitemap: 'sitemap-flooring.xml', label: 'flooring' },
];

const START = '<!--seo-links-->';
const END = '<!--/seo-links-->';
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// H1/title text is already HTML-escaped in the source pages — decode first so we don't double-escape.
const decode = s => String(s == null ? '' : s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function localPathFor(url) {
  const p = url.replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '');
  return path.join(ROOT, p, 'index.html');
}
function nameFor(url) {
  try {
    const h = fs.readFileSync(localPathFor(url), 'utf8');
    const h1 = h.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1) return decode(h1[1].trim());
    const t = h.match(/<title>([^<|]+)/i);
    if (t) return decode(t[1].trim());
  } catch {}
  // fallback: prettify slug
  const slug = (url.match(/\/([^/]+)\/?$/) || [, ''])[1];
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

let total = 0;
for (const t of TARGETS) {
  const file = path.join(ROOT, t.file);
  if (!fs.existsSync(file)) { console.log('skip (no file):', t.file); continue; }
  const smPath = path.join(ROOT, t.sitemap);
  if (!fs.existsSync(smPath)) { console.log('skip (no sitemap):', t.sitemap); continue; }

  const sm = fs.readFileSync(smPath, 'utf8');
  const browsePath = '/' + t.file.replace(/index\.html$/, '').replace(/\/$/, '') + '/';
  const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim())
    .filter(u => { const p = u.replace(/^https?:\/\/[^/]+/, ''); return p !== browsePath && p.replace(/\/$/, '') !== browsePath.replace(/\/$/, ''); });

  const items = urls.map(u => {
    const p = u.replace(/^https?:\/\/[^/]+/, '');
    return `<a href="${esc(p)}">${esc(nameFor(u))}</a>`;
  });
  const extra = (t.extraLinks || []).map(([href, name]) => `<a href="${esc(href)}">${esc(name)}</a>`);

  const block = `${START}
<section class="seo-links" aria-label="All ${esc(t.label)}">
<style>.seo-links{max-width:1180px;margin:0 auto;padding:10px 20px 28px;border-top:1px solid #e6e1d6}.seo-links summary{font-size:13px;font-weight:700;color:#6b6e78;cursor:pointer;padding:8px 0;list-style-position:inside}.seo-links summary:hover{color:#e5b800}.seo-links p{font-size:12px;color:#6b6e78;margin:8px 0 12px}.seo-links .l{display:flex;flex-wrap:wrap;gap:6px 14px}.seo-links .l a{font-size:12.5px;color:#6b6e78;text-decoration:none}.seo-links .l a:hover{color:#e5b800;text-decoration:underline}.seo-links .cats{margin-bottom:12px}.seo-links .cats a{font-weight:700;color:#e5b800}</style>
<details>
<summary>Browse all ${esc(t.label)} (${items.length})</summary>
<p>Every ${esc(t.label.replace(/s$/, ''))} option we carry — pick one to see details, pricing, and a free estimate.</p>
${extra.length ? `<div class="l cats">${extra.join('')}</div>` : ''}
<div class="l">${items.join('')}</div>
</details>
</section>
${END}`;

  let html = fs.readFileSync(file, 'utf8');
  const re = new RegExp(START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), '');
  if (re.test(html)) html = html.replace(re, block);
  else if (/<footer/i.test(html)) html = html.replace(/<footer/i, block + '\n<footer');
  else html = html.replace(/<\/body>/i, block + '\n</body>');
  fs.writeFileSync(file, html);
  console.log(`${t.file}: injected ${items.length} + ${extra.length} links`);
  total += items.length + extra.length;
}
console.log('total crawlable links injected:', total);
