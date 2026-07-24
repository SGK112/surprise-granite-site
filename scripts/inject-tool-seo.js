#!/usr/bin/env node
/**
 * inject-tool-seo.js — give the public /tools/ pages the SEO substance they lack:
 * SoftwareApplication/WebApplication + BreadcrumbList (+ FAQPage where FAQs are
 * defined) schema, and a crawlable SSR content section (intro, how-it-works,
 * local relevance, FAQ) for the thin ones. Rerunnable + idempotent (marker
 * <!--tool-seo-->). Internal tools (bridge/e-sign/invoicing) are already noindex
 * and intentionally NOT listed here. The visualizer was done by hand.
 *
 *   node scripts/inject-tool-seo.js           # dry run
 *   node scripts/inject-tool-seo.js --write
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const WRITE = process.argv.includes('--write');
const MARKER = '<!--tool-seo-->';
const SITE = 'https://www.surprisegranite.com';

const CITIES = 'Surprise, Peoria, Glendale, Phoenix, Scottsdale, Goodyear, Mesa, Chandler, Gilbert and across the Valley';

// Per-tool config. `content` (optional) adds a crawlable section for thin pages.
const TOOLS = {
  'tools': {
    type: 'WebSite', cat: null, name: 'Design & Estimating Tools',
    desc: 'Free countertop, tile, flooring, and remodel calculators plus AI visualizers from Surprise Granite.',
    content: {
      h2: 'Free Design & Estimating Tools for Your Remodel',
      intro: `Plan your Phoenix kitchen or bath remodel before you spend a dollar. Our free tools help you <a href="/tools/countertop-calculator/">size and price countertops</a>, <a href="/tools/tile-calculator/">tile</a>, and <a href="/tools/flooring-calculator/">flooring</a>, <a href="/tools/visualizer/">visualize new materials in your room</a>, and <a href="/tools/remodel-calculator/">budget a full remodel</a> — no signup, no obligation.`,
      faqs: [],
    },
  },
  'countertop-calculator': {
    type: 'SoftwareApplication', cat: 'UtilityApplication', name: 'Countertop Square Footage Calculator',
    desc: 'Free calculator that estimates the square footage and installed cost of new granite or quartz countertops for your kitchen or bathroom.',
    content: {
      h2: 'How Much Countertop Do I Need?',
      intro: `Enter your counter dimensions and this free calculator estimates your total square footage and a ballpark installed price for <a href="/materials/countertops/granite-countertops/">granite</a>, <a href="/materials/countertops/quartz-countertops/">quartz</a>, and more. It's the fastest way to budget before you pick a slab.`,
      faqs: [
        ['How do I measure countertop square footage?', 'Measure each counter run in inches (length × depth), multiply, and divide by 144 to get square feet. Add all sections together, then add about 10% for waste, seams, and backsplash. This calculator does the math for you.'],
        ['How much do countertops cost installed in Phoenix?', 'Installed countertops in the Phoenix area run about $40–$150 per square foot depending on material. Granite $45–$80, quartz $55–$120, marble $60–$150. An average 30 sq ft kitchen runs $1,500–$4,500 with fabrication and installation included.'],
        ['Is the countertop calculator accurate?', 'It gives a solid budgeting estimate. Your exact price depends on the slab, edge profile, cutouts, and seams — confirmed on a free in-home measure.'],
      ],
    },
  },
  'tile-calculator': {
    type: 'SoftwareApplication', cat: 'UtilityApplication', name: 'Tile Calculator',
    desc: 'Free tile calculator for square footage, box count, and installed cost of floor, wall, backsplash, and shower tile.',
    content: {
      h2: 'Tile Calculator — Square Footage & Boxes You Need',
      intro: `Figure out exactly how much <a href="/materials/all-tile/">tile</a> your floor, wall, backsplash, or shower needs. Enter the area and this free calculator returns the square footage, the number of boxes to buy (with waste), and a ballpark installed cost.`,
      faqs: [
        ['How much extra tile should I order?', 'Order about 10% extra for standard layouts and 15–20% for diagonal or herringbone patterns, to cover cuts, breakage, and future repairs. This calculator adds a waste factor automatically.'],
        ['How much does tile installation cost in Phoenix?', 'Tile installation in the Phoenix area typically runs $8–$20 per square foot installed depending on the tile, layout, and prep. Backsplashes and showers with detailed patterns cost more per foot than open floors.'],
        ['How many square feet is a box of tile?', 'It varies by tile size — most boxes cover 8–15 sq ft and the coverage is printed on the box. Enter your box coverage and this tool tells you how many boxes to buy.'],
      ],
    },
  },
  'flooring-calculator': {
    type: 'SoftwareApplication', cat: 'UtilityApplication', name: 'Flooring Calculator',
    desc: 'Free flooring calculator for square footage, boxes, and installed cost of tile, wood-look, LVP, and stone flooring.',
    content: {
      h2: 'Flooring Calculator — Square Footage & Cost',
      intro: `Estimate how much <a href="/materials/flooring/">flooring</a> your room needs and what it will cost installed. Works for tile, wood-look plank, luxury vinyl (LVP), and natural stone. Enter your room size and get square footage, boxes with waste, and a ballpark installed price.`,
      faqs: [
        ['How much flooring do I need for a room?', 'Multiply room length × width in feet for square footage, then add 7–10% for waste and cuts (more for diagonal or plank layouts). This calculator handles the waste factor for you.'],
        ['How much does flooring installation cost in Phoenix?', 'Installed flooring in the Phoenix area runs roughly $5–$15 per square foot depending on material and subfloor prep — tile and stone at the higher end, LVP at the lower end.'],
      ],
    },
  },
  'remodel-calculator': {
    type: 'SoftwareApplication', cat: 'UtilityApplication', name: 'Bathroom & Shower Remodel Calculator',
    desc: 'Free calculator to estimate the cost of a bathroom or shower remodel in the Phoenix area.',
    content: {
      h2: 'What Does a Bathroom Remodel Cost?',
      intro: `Get a ballpark budget for your <a href="/services/home/bathroom-remodeling-arizona/">bathroom or shower remodel</a> before you call anyone. Pick your scope — a <a href="/services/tile-shower-remodel/">shower tile update</a>, a <a href="/services/vanity-installation/">vanity and countertop</a> refresh, or a full renovation — and this calculator estimates the cost range.`,
      faqs: [
        ['How much does a bathroom remodel cost in Phoenix?', 'Phoenix bathroom remodels range from about $8,000 for a shower or vanity refresh to $30,000+ for a full renovation with new tile, shower, vanity, countertop, and flooring. Most mid-range remodels land in the $12,000–$25,000 range.'],
        ['How long does a bathroom remodel take?', 'A shower or vanity update takes a few days to a week. A full bathroom renovation typically runs 2–4 weeks depending on scope, tile work, and plumbing changes.'],
      ],
    },
  },
  'countertop-edge-visualizer': {
    type: 'WebApplication', cat: 'DesignApplication', name: 'Countertop Edge Visualizer',
    desc: 'Free tool to preview and compare countertop edge profiles — eased, bullnose, ogee, bevel, mitered, and waterfall.',
    content: {
      h2: 'Compare Countertop Edge Profiles',
      intro: `The edge profile changes the whole feel of a countertop. This free visualizer lets you preview and compare popular <a href="/materials/all-countertops/">countertop</a> edges side by side — eased, half and full bullnose, beveled, ogee, mitered, and waterfall — so you can choose the right look for your kitchen or bath before fabrication.`,
      faqs: [
        ['What is the most popular countertop edge?', 'The eased (straight with a slightly softened top) and half-bullnose edges are the most popular for modern kitchens — clean, easy to clean, and included in most base pricing. Ogee and mitered edges are premium upgrades.'],
        ['Do fancy edge profiles cost more?', 'Yes. A standard eased edge is usually included, while detailed profiles like ogee, dupont, or a mitered/waterfall edge add to the fabrication cost because they take more machining and hand-finishing.'],
      ],
    },
  },
  'interior-design-gallery': {
    type: 'CollectionPage', cat: null, name: 'Kitchen & Bath Design Gallery',
    desc: 'Real kitchen and bathroom projects by Surprise Granite showing countertops, tile, and cabinetry in Phoenix-area homes.',
    content: {
      h2: 'Kitchen & Bath Design Inspiration from Real Phoenix Projects',
      intro: `Browse real <a href="/services/home/kitchen-remodeling-arizona/">kitchen</a> and <a href="/services/home/bathroom-remodeling-arizona/">bathroom</a> projects we've completed across the Valley — countertops, tile, backsplashes, and cabinetry in actual Arizona homes. Use it to gather ideas, then <a href="/tools/visualizer/">preview a look in your own space</a> or <a href="/get-a-free-estimate">get a free estimate</a>.`,
      faqs: [],
    },
  },
  'blueprint-takeoff': {
    type: 'SoftwareApplication', cat: 'BusinessApplication', name: 'AI Quantity Takeoff & Estimating',
    desc: 'AI-powered construction quantity takeoff and estimating tool — upload a blueprint and get material quantities and a cost estimate.',
    content: null, // already content-rich; schema only
  },
  'room-designer': {
    type: 'WebApplication', cat: 'DesignApplication', name: 'Room Designer',
    desc: 'Design your kitchen or bath online — lay out the space and try countertops, cabinets, tile, and flooring.',
    content: null, // 16k chars already; schema only. No <footer> — anchor on </body>.
  },
};

function faqSchema(faqs) {
  if (!faqs || !faqs.length) return '';
  const items = faqs.map(([q, a]) => `{"@type":"Question","name":${JSON.stringify(q)},"acceptedAnswer":{"@type":"Answer","text":${JSON.stringify(a)}}}`).join(',');
  return `\n  <script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[${items}]}</script>`;
}

function schemaFor(slug, cfg, url) {
  const app = cfg.cat
    ? `{"@context":"https://schema.org","@type":${JSON.stringify(cfg.type)},"name":${JSON.stringify(cfg.name)},"url":${JSON.stringify(url)},"applicationCategory":${JSON.stringify(cfg.cat)},"operatingSystem":"Any (web browser)","offers":{"@type":"Offer","price":"0","priceCurrency":"USD"},"description":${JSON.stringify(cfg.desc)},"provider":{"@type":"HomeAndConstructionBusiness","name":"Surprise Granite","telephone":"+1-602-833-3189","url":"${SITE}"}}`
    : `{"@context":"https://schema.org","@type":${JSON.stringify(cfg.type)},"name":${JSON.stringify(cfg.name)},"url":${JSON.stringify(url)},"description":${JSON.stringify(cfg.desc)},"isPartOf":{"@type":"WebSite","name":"Surprise Granite","url":"${SITE}"}}`;
  const crumbs = `{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"${SITE}/"},{"@type":"ListItem","position":2,"name":"Tools","item":"${SITE}/tools/"}${slug === 'tools' ? '' : `,{"@type":"ListItem","position":3,"name":${JSON.stringify(cfg.name)},"item":${JSON.stringify(url)}}`}]}`;
  return `\n  <script type="application/ld+json">${app}</script>\n  <script type="application/ld+json">${crumbs}</script>${faqSchema(cfg.content && cfg.content.faqs)}\n`;
}

function contentFor(cfg) {
  const c = cfg.content;
  if (!c) return '';
  const faqHtml = (c.faqs || []).map(([q, a]) =>
    `  <details style="margin:10px 0;"><summary style="cursor:pointer;font-weight:600;color:#1a2b3c;">${q}</summary><p style="color:#555;">${a}</p></details>`).join('\n');
  const faqBlock = faqHtml ? `\n  <h3 style="color:#1a2b3c;margin-top:32px;">Frequently Asked Questions</h3>\n${faqHtml}` : '';
  return `
<section class="sg-seo" style="max-width:1000px;margin:0 auto;padding:56px 20px;font-family:'Inter',system-ui,sans-serif;color:#1a1a2e;line-height:1.7;">
  <h2 style="color:#1a2b3c;font-size:clamp(24px,4vw,30px);margin-bottom:14px;">${c.h2}</h2>
  <p style="color:#555;">${c.intro}</p>
  <p style="color:#555;margin-top:20px;">Surprise Granite is a family-owned, licensed Arizona General Contractor (ROC #341113) serving ${CITIES}. This tool is free to use — when you're ready, <a href="/get-a-free-estimate">get a free in-home estimate</a>.</p>${faqBlock}
</section>
`;
}

function inject(html, snippet, anchors) {
  for (const re of anchors) {
    const m = html.match(re);
    if (m) return html.slice(0, m.index) + snippet + '\n' + html.slice(m.index);
  }
  return null;
}

let done = 0, skip = 0, fail = 0;
for (const [slug, cfg] of Object.entries(TOOLS)) {
  const file = path.join(ROOT, slug === 'tools' ? 'tools/index.html' : `tools/${slug}/index.html`);
  if (!fs.existsSync(file)) { console.warn('  MISSING:', slug); continue; }
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes(MARKER)) { skip++; continue; }
  const url = `${SITE}/tools/${slug === 'tools' ? '' : slug + '/'}`;
  // schema before </head>
  let next = inject(html, MARKER + schemaFor(slug, cfg, url), [/<\/head>/i]);
  if (!next) { fail++; console.warn('  NO </head>:', slug); continue; }
  // content before <footer or </body>
  const content = contentFor(cfg);
  if (content) {
    const withContent = inject(next, content, [/<footer[\s>]/i, /<\/body>/i]);
    if (withContent) next = withContent;
  }
  done++;
  console.log(`  ${WRITE ? 'wrote' : 'would write'}: tools/${slug}  (schema${content ? ' + content' : ''})`);
  if (WRITE) fs.writeFileSync(file, next);
}
console.log(`\n${WRITE ? 'WROTE' : 'DRY RUN'} — ${done} tools, skipped ${skip}, failed ${fail}`);
if (!WRITE) console.log('Re-run with --write to apply.');
