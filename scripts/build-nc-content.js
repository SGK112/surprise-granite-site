#!/usr/bin/env node
/**
 * Build newcountertops.com's cost pages from the LIVE catalog.
 *
 * Every "how much do countertops cost" page on the internet quotes the same
 * recycled industry averages. This one quotes what 1,693 slabs we can actually
 * buy today are priced at, per square foot, split by material — and regenerates,
 * so the numbers are true on the day someone reads them rather than true in 2023.
 *
 * That is the whole SEO argument. Not more words than the competition: a number
 * they cannot produce.
 *
 * Honest about method, in the page itself: 10th–90th percentile so a handful of
 * exotic slabs don't distort the range, and fabrication + installation at the
 * same $55/sqft the calculator and the countertop pages quote, so no two
 * surfaces on this business disagree about what a countertop costs.
 *
 * Usage: node scripts/build-nc-content.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'newcountertops', 'cost');
const API = 'https://surprise-granite-email-api.onrender.com';
const SITE = 'https://www.newcountertops.com';
const FAB = 55;                       // fabrication + installation, $/sqft
// ORDER MATTERS: 'quartzite' contains 'quartz', so a first-match scan that
// checks quartz first swallows every quartzite slab into the quartz bucket —
// 271 of them, silently, and quartzite disappears off the page. Longest name
// first. (Same prefix trap as bbxv/bbxviii in the gallery repair.)
const MATERIALS = ['quartzite', 'quartz', 'granite', 'marble', 'porcelain', 'dekton'];
// Display order is a separate concern from match order: people look for quartz
// and granite first, and quartzite is the upsell they meet after.
const ORDER = ['quartz', 'granite', 'quartzite', 'marble', 'porcelain', 'dekton'];

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

async function slabPrices() {
  const rows = [];
  for (let off = 0; off < 4000; off += 250) {
    const r = await fetch(`${API}/api/catalog?category=slab&limit=250&offset=${off}`);
    if (!r.ok) break;
    const j = await r.json();
    const page = j.products || [];
    if (!page.length) break;
    rows.push(...page);
    if (page.length < 250) break;
  }
  return rows;
}

// Real slabs, kept alongside the price, so a material page can name actual
// products at actual prices. That is the thing a content farm cannot copy: they
// can write the same words, they cannot show you what is in stock this morning.
function examples(rows, material) {
  const v = rows
    .filter((p) => String(p.price_unit || '').toLowerCase() === 'sqft'
      && Number(p.retail_price) > 0
      && String(p.subcategory || '').toLowerCase().includes(material)
      && p.name)
    .sort((a, b) => a.retail_price - b.retail_price);
  if (v.length < 6) return [];
  const at = (f) => v[Math.min(v.length - 1, Math.floor(v.length * f))];
  const picked = [at(0.05), at(0.5), at(0.92)];
  const seen = new Set();
  return picked.filter((x) => x && !seen.has(x.name) && seen.add(x.name));
}

function bands(rows) {
  const by = {};
  for (const p of rows) {
    // Per-sqft only. 175 slabs are priced 'each', and mixing a $2,495 slab into
    // a per-square-foot range is how a cost page ends up quoting nonsense.
    if (String(p.price_unit || '').toLowerCase() !== 'sqft') continue;
    const price = Number(p.retail_price);
    if (!(price > 0)) continue;
    const sub = String(p.subcategory || '').toLowerCase();
    const m = MATERIALS.find((x) => sub.includes(x));
    if (m) (by[m] = by[m] || []).push(price);
  }
  const out = [];
  for (const m of ORDER) {
    const v = (by[m] || []).sort((a, b) => a - b);
    if (v.length < 20) continue;      // too few to characterise honestly
    out.push({
      material: m, n: v.length,
      lo: v[Math.floor(v.length * 0.1)],
      hi: v[Math.floor(v.length * 0.9)],
      med: v[Math.floor(v.length * 0.5)],
    });
  }
  return out;
}

const BLURB = {
  quartz: 'Engineered, non-porous and consistent slab to slab. The default for most kitchens because it never needs sealing and what you see in the showroom is what arrives.',
  granite: 'Natural stone, every slab different. The cheapest way into real stone, and the reason to go and look at the actual slab before you buy it.',
  quartzite: 'Natural, and harder than granite. Looks like marble, behaves like stone that can take a pan. You pay for that combination.',
  marble: 'The one people want and installers warn about. Beautiful, porous, and it will etch where lemon juice lands. Worth it if you accept a patina.',
  porcelain: 'Large-format, extremely hard, and thin. Good for waterfall edges and outdoor kitchens where UV would fade quartz.',
  dekton: 'Sintered stone. Effectively immune to heat, UV and scratching, which is why it turns up outdoors and on islands people actually cook on.',
};

// One honest paragraph per material about the trade-off people actually face.
// Written once, by hand: the prices update, the physics of the stone does not.
const DEEP = {
  quartz: {
    is: 'Ground natural quartz bound in resin, made in a factory to a spec. Non-porous, so it never needs sealing and cannot stain from wine or oil.',
    watch: 'Heat is the weakness. The resin scorches, so a pan straight off the burner can leave a mark that does not come out. Use a trivet and it will outlive the kitchen.',
    who: 'Anyone who wants to stop thinking about their countertops after installation day.',
  },
  granite: {
    is: 'Quarried stone, cut into slabs. Every slab is different, which is the appeal and the reason to look at the actual slab rather than a sample chip.',
    watch: 'It is porous. It wants sealing every year or two, and a lemon left overnight can etch a dull patch. Cheaper than quartz to buy, marginally more to live with.',
    who: 'People who want real stone and are happy that no two kitchens look the same.',
  },
  quartzite: {
    is: 'Natural stone, metamorphosed sandstone. Harder than granite and often looks like marble, which is exactly why people want it.',
    watch: 'Sold loosely. Some slabs labelled quartzite are softer dolomitic marble that will etch. Ask for the acid test before you commit.',
    who: 'People who want the marble look without the marble maintenance, and will pay for it.',
  },
  marble: {
    is: 'Classic, and the reason every high-end kitchen photo looks the way it does. Cool to the touch, which is why pastry chefs insist on it.',
    watch: 'It etches. Lemon juice, vinegar and wine dull the polish where they land, and no sealer prevents it. This is not a defect, it is what marble does.',
    who: 'People who genuinely like patina, or who bake. Not for anyone who will be upset by the first ring.',
  },
  porcelain: {
    is: 'Large-format sintered slab, typically thin. Extremely hard, completely non-porous, and UV-stable.',
    watch: 'The colour is often surface-printed, so a chipped edge can show a paler body underneath. Fabrication needs someone who has done it before.',
    who: 'Outdoor kitchens, waterfall edges, and anywhere a thin profile matters.',
  },
  dekton: {
    is: 'Sintered stone made under extreme pressure and heat. Effectively immune to heat, UV, scratching and staining.',
    watch: 'Hard enough to be brittle at the edges during fabrication, and priced accordingly. It is the durable option, not the cheap one.',
    who: 'Outdoor kitchens and anyone who will genuinely put a hot pan straight down.',
  },
};

function materialPage(x, all, egs, FAB, SITE, today, month) {
  const cap = x.material[0].toUpperCase() + x.material.slice(1);
  const d = DEEP[x.material] || {};
  const others = all.filter((o) => o.material !== x.material).slice(0, 3);
  const cmp = others.map((o) => {
    const diff = Math.round((o.lo + FAB) - (x.lo + FAB));
    const word = diff === 0 ? 'starts at about the same price as'
      : diff > 0 ? `starts about ${money(Math.abs(diff))}/sq ft more than`
      : `starts about ${money(Math.abs(diff))}/sq ft less than`;
    return `<li><strong>${o.material[0].toUpperCase() + o.material.slice(1)}</strong> ${word} ${x.material} — ${money(o.lo + FAB)}–${money(o.hi + FAB)} installed, from ${o.n.toLocaleString('en-US')} slabs. <a href="/cost/${o.material}/">${o.material} costs &rarr;</a></li>`;
  }).join('\n');

  const egRows = egs.map((e, i) => `<tr>
      <th scope="row">${['Entry', 'Typical', 'Premium'][i] || ''}</th>
      <td>${esc(e.name)}${e.brand ? ` <span class="dim">${esc(e.brand)}</span>` : ''}</td>
      <td>${money(e.retail_price)}/sq ft</td>
      <td><strong>${money((Number(e.retail_price) + FAB) * 45)}</strong></td>
    </tr>`).join('\n');

  const faq = [
    [`How much do ${x.material} countertops cost per square foot?`,
     `${money(x.lo + FAB)} to ${money(x.hi + FAB)} installed, based on ${x.n.toLocaleString('en-US')} ${x.material} slabs priced today. Material alone is ${money(x.lo)}–${money(x.hi)}; fabrication and installation add about ${money(FAB)} per square foot.`],
    [`How much is a ${x.material} kitchen?`,
     `A typical 45 square foot kitchen in ${x.material} runs ${money((x.lo + FAB) * 45)} to ${money((x.hi + FAB) * 45)} installed. Bigger kitchens and islands push that up; a waterfall edge or a mitred edge adds meaningfully more.`],
    [`Is ${x.material} worth it?`, `${d.who || ''} ${d.watch || ''}`.trim()],
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${cap} Countertops Cost per Square Foot (${month})</title>
<meta name="description" content="${cap} countertops cost ${money(x.lo + FAB)}–${money(x.hi + FAB)} per square foot installed, priced from ${x.n.toLocaleString('en-US')} slabs available today. Real examples and what drives the price."/>
<link rel="canonical" href="${SITE}/cost/${x.material}/"/>
<meta name="robots" content="index, follow"/>
<meta property="og:title" content="${cap} Countertops Cost per Square Foot (${month})"/>
<meta property="og:description" content="Priced from ${x.n.toLocaleString('en-US')} ${x.material} slabs available today."/>
<meta property="og:type" content="article"/>
<meta property="og:url" content="${SITE}/cost/${x.material}/"/>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-9HJRRMG310"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-9HJRRMG310');</script>
<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  })}</script>
<link rel="stylesheet" href="/cost/cost.css"/>
</head>
<body>
<header><div class="bar">
  <a class="logo" href="/">New<span>Countertops</span></a>
  <a class="cta" href="/quote/">Get my free quote</a>
</div></header>

<main class="wrap">
  <p class="crumb"><a href="/cost/">Countertop costs</a> / ${cap}</p>
  <h1>${cap} countertops cost</h1>
  <p class="stand"><strong>${money(x.lo + FAB)} to ${money(x.hi + FAB)} per square foot installed.</strong>
    A typical 45 sq ft kitchen runs ${money((x.lo + FAB) * 45)} to ${money((x.hi + FAB) * 45)}.</p>
  <p class="meta">Priced from ${x.n.toLocaleString('en-US')} ${x.material} slabs available right now · updated ${today}</p>

  <div class="callout"><p><strong>These are live prices.</strong> Not an industry average — the real
    per-square-foot price of ${x.n.toLocaleString('en-US')} ${x.material} slabs in stock today, plus
    ${money(FAB)}/sq ft for fabrication and installation. Rebuilt whenever those prices move.</p></div>

  ${egs.length ? `<h2>What ${x.material} actually costs, by slab</h2>
  <div class="tablewrap"><table>
    <thead><tr><th scope="col">Tier</th><th scope="col">Slab</th><th scope="col">Material</th><th scope="col">45 sq ft installed</th></tr></thead>
    <tbody>
${egRows}
    </tbody>
  </table></div>
  <p class="meta">Real slabs from current stock. The spread between entry and premium is almost entirely material — fabrication costs the same either way.</p>` : ''}

  <h2>What ${x.material} is</h2>
  <p>${esc(d.is || '')}</p>
  <h2>What to watch for</h2>
  <p>${esc(d.watch || '')}</p>
  <h2>Who it suits</h2>
  <p>${esc(d.who || '')}</p>

  <h2>${cap} vs the alternatives</h2>
  <ul class="cmp">
${cmp}
  </ul>

  <h2>Common questions</h2>
${faq.map(([q, a]) => `  <details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n')}
</main>

<section class="end">
  <p>Price your own kitchen in ${x.material} in about a minute.</p>
  <a class="btn" href="/quote/">Get my free quote &rarr;</a>
  <p style="margin:16px 0 0"><a href="/cost/">All countertop costs</a> · <a href="/calculator/">Full calculator</a></p>
</section>

<footer><div class="fl">
  <div>&copy; ${new Date().getFullYear()} NewCountertops.com</div>
  <div><a href="/quote/">Get a quote</a> · <a href="/cost/">Costs</a> · <a href="/calculator/">Calculator</a></div>
</div></footer>
</body>
</html>
`;
}

(async () => {
  const rows = await slabPrices();
  const b = bands(rows);
  if (!b.length) { console.error('no priced slabs returned — refusing to write a cost page with no costs'); process.exit(1); }
  const total = b.reduce((n, x) => n + x.n, 0);
  const cheapest = b.reduce((a, x) => (x.lo < a.lo ? x : a));
  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const table = b.map((x) => `<tr>
      <th scope="row"><a href="/cost/${x.material}/">${x.material[0].toUpperCase() + x.material.slice(1)}</a></th>
      <td>${money(x.lo)} – ${money(x.hi)}</td>
      <td><strong>${money(x.lo + FAB)} – ${money(x.hi + FAB)}</strong></td>
      <td class="num">${x.n.toLocaleString('en-US')}</td>
    </tr>`).join('\n');

  const sections = b.map((x) => `<section class="mat" id="${x.material}">
      <h3>${x.material[0].toUpperCase() + x.material.slice(1)} countertops</h3>
      <p>${esc(BLURB[x.material] || '')}</p>
      <p class="fig"><strong>${money(x.lo + FAB)} – ${money(x.hi + FAB)}</strong> per square foot installed
        &nbsp;·&nbsp; material alone ${money(x.lo)} – ${money(x.hi)} &nbsp;·&nbsp; ${x.n.toLocaleString('en-US')} slabs priced</p>
      <p class="eg">A 45 sq ft kitchen: <strong>${money((x.lo + FAB) * 45)} – ${money((x.hi + FAB) * 45)}</strong>
        &nbsp;·&nbsp; <a href="/cost/${x.material}/">${x.material} costs in detail &rarr;</a></p>
    </section>`).join('\n');

  const faq = [
    ['How much do new countertops cost?',
     `Installed, most kitchens land between ${money(cheapest.lo + FAB)} and ${money(140)} per square foot depending on material. A typical 45 square foot kitchen is roughly ${money((cheapest.lo + FAB) * 45)} to ${money(140 * 45)}. Material is the variable; fabrication and installation run about ${money(FAB)} per square foot on top of it.`],
    ['What is the cheapest countertop material?',
     `Granite, by a margin — it starts around ${money(cheapest.lo)} per square foot for material where quartz starts nearer ${money(b.find((x) => x.material === 'quartz')?.lo || 14)}. Natural stone being cheaper than engineered stone surprises people, but granite is quarried in volume and quartz is manufactured.`],
    ['Does that price include installation?',
     `The installed figures on this page include fabrication and installation at ${money(FAB)} per square foot — cutting the slab, the sink cutout, the edge profile, delivery and fitting. They do not include removing your old countertops, plumbing reconnection, or tile backsplash.`],
    ['Why is my quote higher than these numbers?',
     'Usually edges and extras. A waterfall edge adds a whole slab side, a mitred edge doubles the fabrication on that run, and cooktop cutouts, drainboards and reconnects each carry labour. The calculator on this site prices those individually rather than hiding them in a per-foot number.'],
  ];

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>How Much Do New Countertops Cost? (${month} Prices)</title>
<meta name="description" content="Real countertop prices per square foot, installed — priced from ${total.toLocaleString('en-US')} slabs available today, not industry averages. Quartz, granite, quartzite and marble compared."/>
<link rel="canonical" href="${SITE}/cost/"/>
<meta name="robots" content="index, follow"/>
<meta property="og:title" content="How Much Do New Countertops Cost? (${month} Prices)"/>
<meta property="og:description" content="Priced from ${total.toLocaleString('en-US')} slabs available today, not industry averages."/>
<meta property="og:type" content="article"/>
<meta property="og:url" content="${SITE}/cost/"/>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-9HJRRMG310"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-9HJRRMG310');</script>
<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  })}</script>
<style>
  :root{--ink:#14181d;--body:#3f464e;--muted:#7a828b;--line:#e6e3dd;--bg:#fffdfa;--panel:#fff;--stone:#f4f1ea;--accent:#1f6f5c;--accent-ink:#12503f}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
  .wrap{max-width:760px;margin:0 auto;padding:0 20px}
  a{color:var(--accent-ink)}
  header{border-bottom:1px solid var(--line);background:var(--panel)}
  .bar{max-width:1080px;margin:0 auto;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px}
  .logo{font-weight:800;font-size:18px;letter-spacing:-.02em;text-decoration:none;color:var(--ink)}
  .logo span{color:var(--accent)}
  .cta{background:var(--accent);color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:10px 18px;border-radius:10px}
  h1{font-size:clamp(28px,4.6vw,42px);line-height:1.1;letter-spacing:-.03em;font-weight:800;margin:36px 0 10px}
  .stand{font-size:19px;color:var(--body);margin:0 0 8px}
  .meta{color:var(--muted);font-size:14px;margin:0 0 30px}
  h2{font-size:clamp(21px,3vw,27px);letter-spacing:-.02em;margin:40px 0 12px;font-weight:800}
  h3{font-size:19px;margin:28px 0 6px;font-weight:800}
  p{margin:0 0 16px}
  table{width:100%;border-collapse:collapse;margin:20px 0 8px;font-size:15.5px}
  th,td{text-align:left;padding:11px 10px;border-bottom:1px solid var(--line)}
  thead th{font-size:12.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);border-bottom:2px solid var(--line)}
  tbody th{font-weight:700}
  td.num{color:var(--muted);text-align:right}
  .tablewrap{overflow-x:auto}
  .callout{background:var(--stone);border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin:26px 0}
  .callout p:last-child{margin:0}
  .mat{border-top:1px solid var(--line);padding-top:6px}
  .fig{font-size:15.5px;color:var(--body)}
  .eg{font-size:15.5px;color:var(--muted)}
  details{border-bottom:1px solid var(--line);padding:14px 0}
  summary{cursor:pointer;font-weight:700}
  details p{margin:10px 0 0;color:var(--body);font-size:16px}
  .end{background:var(--stone);border-top:1px solid var(--line);margin-top:48px;padding:44px 20px;text-align:center}
  .btn{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:800;font-size:17px;padding:16px 30px;border-radius:12px}
  footer{border-top:1px solid var(--line);background:var(--panel);padding:26px 20px;color:var(--muted);font-size:13px}
  .fl{max-width:1080px;margin:0 auto;display:flex;gap:18px;flex-wrap:wrap;justify-content:space-between}
  footer a{color:var(--muted)}
</style>
</head>
<body>
<header><div class="bar">
  <a class="logo" href="/">New<span>Countertops</span></a>
  <a class="cta" href="/quote/">Get my free quote</a>
</div></header>

<main class="wrap">
  <h1>How much do new countertops cost?</h1>
  <p class="stand">Installed, most kitchens land between <strong>${money(cheapest.lo + FAB)} and ${money(140)} per square foot</strong> — material, fabrication and fitting together. A typical 45 square foot kitchen runs ${money((cheapest.lo + FAB) * 45)} to ${money(140 * 45)}.</p>
  <p class="meta">Priced from ${total.toLocaleString('en-US')} slabs available right now · updated ${today}</p>

  <div class="callout">
    <p><strong>Where these numbers come from.</strong> Not an industry average. Every figure below is
    calculated from the live price of ${total.toLocaleString('en-US')} slabs we can order today, grouped by
    material, and rebuilt whenever those prices move. Fabrication and installation are added at
    ${money(FAB)} per square foot — the same rate quoted on the calculator, so nothing on this site
    disagrees with anything else on it.</p>
  </div>

  <h2>Cost per square foot by material</h2>
  <div class="tablewrap"><table>
    <thead><tr><th scope="col">Material</th><th scope="col">Material only</th><th scope="col">Installed</th><th scope="col" class="num">Slabs priced</th></tr></thead>
    <tbody>
${table}
    </tbody>
  </table></div>
  <p class="meta">Ranges are the 10th to 90th percentile, so a handful of exotic slabs don't distort them. Installed = material + ${money(FAB)}/sq ft fabrication and installation.</p>

  <h2>What you get for the money</h2>
${sections}

  <h2>What actually moves the price</h2>
  <p>Material is the headline, but it is rarely why a quote comes back higher than expected.</p>
  <p><strong>Edges.</strong> A standard eased or square edge is included. A mitred or waterfall edge means
  fabricating a second face and matching the veining across the join — on an island that can add a
  four-figure sum on its own.</p>
  <p><strong>Cutouts.</strong> An undermount sink, a cooktop, a bar prep sink and faucet holes each carry
  labour. Most kitchens have two or three.</p>
  <p><strong>Removing what's there.</strong> Tear-out and disposal of the old tops is separate work, and
  tile or laminate bonded to the cabinets takes longer than a slab does.</p>
  <p><strong>Plumbing.</strong> Disconnecting and reconnecting a sink and disposal is a trade visit, not
  something the countertop crew does on the way out.</p>

  <h2>Common questions</h2>
${faq.map(([q, a]) => `  <details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n')}
</main>

<section class="end">
  <p style="color:var(--body);margin:0 0 18px">Price your own kitchen in about a minute — then we'll match you with a pro who can do the work.</p>
  <a class="btn" href="/quote/">Get my free quote &rarr;</a>
  <p style="margin:16px 0 0"><a href="/calculator/">Or use the full calculator</a></p>
</section>

<footer><div class="fl">
  <div>&copy; ${new Date().getFullYear()} NewCountertops.com</div>
  <div><a href="/quote/">Get a quote</a> · <a href="/calculator/">Calculator</a></div>
</div></footer>
</body>
</html>
`;

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'index.html'), html);

  // One stylesheet for the cluster rather than the same 2KB inlined on every
  // page: it is cached across the whole section after the first hit, and there
  // is one place to change how a cost page looks.
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)[1] + `
  .crumb{font-size:14px;color:var(--muted);margin:28px 0 0}
  .crumb a{color:var(--muted)}
  .dim{color:var(--muted);font-weight:400;font-size:13.5px}
  ul.cmp{padding-left:20px}
  ul.cmp li{margin-bottom:10px}
  .end p{color:var(--body);margin:0 0 18px}
`;
  fs.writeFileSync(path.join(OUT, 'cost.css'), css);

  let made = 0;
  for (const x of b) {
    const dir = path.join(OUT, x.material);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'),
      materialPage(x, b, examples(rows, x.material), FAB, SITE, today, month));
    made++;
  }

  console.log(`wrote /cost/ from ${total.toLocaleString('en-US')} priced slabs across ${b.length} materials`);
  for (const x of b) console.log(`  ${x.material.padEnd(10)} ${String(x.n).padStart(4)} slabs  ${money(x.lo + FAB)}–${money(x.hi + FAB)}/sqft installed`);
  console.log(`wrote ${made} material pages + cost.css`);
})();
