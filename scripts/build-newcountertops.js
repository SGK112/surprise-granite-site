#!/usr/bin/env node
/**
 * Port the Surprise Granite countertop calculator onto newcountertops.com.
 *
 * The calculator works and is trusted, so it is COPIED from the canonical file
 * rather than rewritten — and copied by a script rather than by hand, so when
 * the Surprise Granite version improves this one gets the improvement by
 * re-running instead of quietly drifting a year behind it.
 *
 * What gets stripped is the Surprise Granite shell: the unified nav, auth,
 * tracking, the Webflow stylesheet and the SG favicons. None of it belongs on a
 * different brand, and each one is a file that can fail to load on a domain that
 * does not host it. The calculator carries 43KB of its own inline CSS and uses
 * no Webflow classes, so it stands up without them.
 *
 * Usage: node scripts/build-newcountertops.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'tools', 'countertop-calculator', 'index.html');
const OUT = path.join(ROOT, 'newcountertops', 'calculator', 'index.html');

// Anything served only by surprisegranite.com. Leaving one of these in means a
// 404 on every page load at best, and SG's navigation bar on someone else's
// brand at worst.
const SG_ONLY = [
  'unified-nav', 'auth-state', 'user-tracking', 'remodely-hub', 'site-search',
  'schedule-cta', 'image-fallback', 'rate-limiter', 'footer-enhanced',
  'marketplace-mobile-fix', 'mobile-optimizations', 'surprisegranite.webflow',
  '/js/config.js', '/migrated/',
];

const HEADER = `<header class="nc-head">
  <div class="nc-bar">
    <a class="nc-logo" href="/">New<span>Countertops</span></a>
    <a class="nc-cta" href="/quote/">Get my free quote</a>
  </div>
</header>
<style>
  .nc-head{border-bottom:1px solid #e6e3dd;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif}
  .nc-bar{max-width:1080px;margin:0 auto;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px}
  .nc-logo{font-weight:800;font-size:18px;letter-spacing:-.02em;text-decoration:none;color:#14181d}
  .nc-logo span{color:#1f6f5c}
  .nc-cta{background:#1f6f5c;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:10px 18px;border-radius:10px}
  .nc-cta:hover{background:#12503f}
</style>`;

let h = fs.readFileSync(SRC, 'utf8');
const before = h.length;

// 1. Drop every SG-only stylesheet, script and icon.
let stripped = 0;
h = h.replace(/[ \t]*<(?:link|script)\b[^>]*>(?:\s*<\/script>)?\s*\n?/gi, (tag) => {
  if (SG_ONLY.some((s) => tag.includes(s))) { stripped++; return ''; }
  return tag;
});

// 2. The nav class drives body padding for a fixed header that no longer exists.
h = h.replace(/<body class="unified-nav-active">/, '<body>');

// 3. Our own header, right after <body>.
h = h.replace(/<body>/, '<body>\n' + HEADER);

// 4. Identity. A page that still says Surprise Granite in the tab and canonical
//    tells Google these are the same page and tells the visitor they were
//    redirected somewhere unexpected.
h = h.replace(/<title>[\s\S]*?<\/title>/i,
  '<title>Countertop Cost Calculator — NewCountertops.com</title>');
h = h.replace(/<link rel="canonical"[^>]*>/i,
  '<link rel="canonical" href="https://www.newcountertops.com/calculator/"/>');
h = h.replace(/<meta name="description"[^>]*>/i,
  '<meta name="description" content="Price your countertops by the square foot — material, fabrication and installation. Free, instant, no showroom visit."/>');

// 5. Breadcrumb points home, not into a site this domain does not have.
h = h.replace(/<nav class="breadcrumb"[\s\S]*?<\/nav>/i,
  '<nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a> / Countertop calculator</nav>');

// 6. Leads from here are newcountertops leads. Without this they arrive looking
//    like SG tool traffic and the whole point — measuring whether this domain
//    works — is lost.
h = h.replace(/source: '\/tools\/countertop-calculator\/'/g,
  "source: 'newcountertops.com/calculator'");

// 7. Send finishers to the quote funnel, which is the only place that routes by
//    ZIP. It goes BEFORE the footer — appended at </body> it rendered underneath
//    the copyright band and read as jammed into it.
const CLOSER = `
<section style="background:#f4f1ea;border-top:1px solid #e6e3dd;padding:44px 20px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,system-ui,sans-serif">
  <p style="color:#4a5159;font-size:16px;margin:0 0 18px">Want a real quote and a pro who can do the work?</p>
  <a href="/quote/" style="display:inline-block;background:#1f6f5c;color:#fff;text-decoration:none;font-weight:800;font-size:16px;padding:16px 30px;border-radius:12px">Get my free quote &rarr;</a>
</section>
`;
h = h.includes('<footer')
  ? h.replace(/<footer/i, CLOSER + '<footer')
  : h.replace(/<\/body>/i, CLOSER + '</body>');

// 8. The "Schedule Free Consultation" button's handler lives in schedule-cta.js,
//    which we just stripped. A button that looks live and does nothing is the
//    exact fault we spent today removing from the storefront.
h = h.replace(/[ \t]*<button class="cta-btn cta-btn-secondary" data-schedule-cta>[\s\S]*?<\/button>\s*\n/i, '');

// 9. Replace the Surprise Granite footer wholesale. It carries SG's warranty
//    links, copyright, card logos served from a path this domain does not host —
//    and ROC #367593, which on a site that refers work to other states would
//    claim a licence Surprise Granite does not hold there.
h = h.replace(/<footer[\s\S]*?<\/footer>/i, `<footer style="border-top:1px solid #e6e3dd;background:#fff;padding:26px 20px;color:#7a828b;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,system-ui,sans-serif">
  <div style="max-width:1080px;margin:0 auto;display:flex;gap:18px;flex-wrap:wrap;justify-content:space-between;align-items:center">
    <div>&copy; 2026 NewCountertops.com</div>
    <div><a href="/quote/" style="color:#7a828b">Get a quote</a></div>
  </div>
</footer>`);

// 10. The estimate modal is branded Surprise Granite. On a national funnel the
//     estimate is from NewCountertops until a fabricator is assigned.
h = h.replace(/<p>Surprise Granite Marble &amp; Quartz<\/p>/i, '<p>NewCountertops.com</p>');

// 11a. Whatever is left. Blunt on purpose: after the targeted edits above, ANY
//     surviving mention of Surprise Granite on this domain is either a false
//     claim (a licence that does not cover the visitor's state) or a branding
//     leak, and there is no case where leaving one is correct. Ampersand in two
//     encodings because the page uses both.
h = h.replace(/Surprise Granite Marble (?:&amp;|&) Quartz/g, 'NewCountertops.com')
     .replace(/Surprise Granite/g, 'NewCountertops.com');

// 11. Drop the SEO block. It is Phoenix copy — "how much do countertops cost
//     installed in Phoenix", ROC #367593, the cities SG serves. On this domain
//     it would be false for most visitors AND would rank newcountertops.com for
//     Phoenix terms, competing with surprisegranite.com for the same searches.
//     National content belongs here later; SG's does not.
h = h.replace(/<section class="sg-seo"[\s\S]*?<\/section>/i, '');

// 12. Card the form, and put the lead in front of the estimate.
//
//     Thirteen inputs on one screen is a wall; people abandon walls. The same
//     thirteen in four cards is a conversation. This works by SHOWING AND HIDING
//     the blocks that are already there — it never moves a node — so every
//     listener the calculator binds keeps working and a re-sync from the SG
//     version cannot break it. If a selector goes missing the page simply stays
//     the long form it is today, which is a working page, not a broken one.
h = h.replace(/<\/body>/i, `<script>
(function(){
  var card = document.querySelector('.calculator-card');
  var sections = document.getElementById('sections');
  var grids = document.querySelectorAll('.project-options .options-grid');
  var genBtn = document.querySelector('.generate-quote-btn');
  if(!card || !sections || grids.length < 2 || !genBtn) return;   // stay long-form

  // A step owns a LIST of elements, not one. The "Material & Service" and
  // "Sinks & Cutouts" headings are siblings of their grids, not parents, so
  // hiding the grid alone left both headings stacked on the measurements card
  // with nothing under them.
  var labels = document.querySelectorAll('.project-options .edge-label');
  var note   = document.querySelector('.project-options .edge-note');
  var addBtn = document.querySelector('.add-section-btn');
  var pick = function(){ return Array.prototype.slice.call(arguments).filter(Boolean); };

  var STEPS = [
    { els: pick(sections, addBtn),          title: 'Measure your counters',   sub: 'Length and depth of each run. Rough numbers are fine.' },
    { els: pick(labels[0], grids[0]),       title: 'Material and service',    sub: 'What you want, and how much of the work is ours.' },
    { els: pick(labels[1], grids[1], note), title: 'Sinks, cooktops, extras', sub: 'Only what applies — most kitchens need one or two.' }
  ];

  // The calculator's own "Save your estimate or request an exact quote!" block
  // is replaced by the nav below. Hiding just the button inside it left an empty
  // white panel that collided with the footer.
  var cta = document.querySelector('.cta-section');
  if(cta) cta.style.display = 'none';

  // Everything goes INSIDE .calc-section, which owns the 24px/20px padding.
  // Putting the header on .calculator-card (transparent, no padding) left it
  // flush against the edge while every field sat 20px in — that misalignment
  // was the whole "margins are messed up".
  var host = document.querySelector('.calc-section') || card;
  var title = host.querySelector('.calc-section-title');
  if(title) title.style.display = 'none';        // .nc-title replaces it

  var bar = document.createElement('div');
  bar.className = 'nc-steps';
  bar.innerHTML = '<div class="nc-prog">' + STEPS.concat([0]).map(function(){ return '<i></i>'; }).join('') + '</div>' +
    '<h2 class="nc-title"></h2><p class="nc-sub"></p>';
  host.insertBefore(bar, host.firstChild);

  // The lead card. The estimate is the thing they came for, so it is what the
  // form is exchanged for — asking first would be a toll, asking after is a trade.
  var lead = document.createElement('div');
  lead.className = 'nc-lead';
  lead.innerHTML =
    '<label>Your name</label><input id="ncName" type="text" autocomplete="name" placeholder="First and last">' +
    '<label>Email</label><input id="ncEmail" type="email" autocomplete="email" placeholder="you@example.com">' +
    '<label>Phone</label><input id="ncPhone" type="tel" autocomplete="tel" placeholder="(602) 555-0134">' +
    '<label>ZIP code</label><input id="ncZip" type="text" inputmode="numeric" maxlength="5" placeholder="85379">' +
    '<label class="nc-ok"><input type="checkbox" id="ncConsent"> I agree to be contacted about this estimate by phone, text or email, ' +
    'including by a licensed fabricator near me if the work is outside Arizona. Consent is not a condition of purchase.</label>' +
    '<div class="nc-err" id="ncErr">Add your name, a valid email, a ZIP and tick the box.</div>';
  sections.parentNode.insertBefore(lead, sections);

  var nav = document.createElement('div');
  nav.className = 'nc-nav';
  nav.innerHTML = '<button type="button" class="nc-back">← Back</button><button type="button" class="nc-next">Continue</button>';
  host.appendChild(nav);

  // ("Add another section" is a sibling of #sections, not a child, so it rides
  //  with the measurements step above rather than following it around.)

  var i = 0, LAST = STEPS.length;
  function draw(){
    STEPS.forEach(function(s, n){
      s.els.forEach(function(el){ el.style.display = (n === i) ? '' : 'none'; });
    });
    lead.style.display = (i === LAST) ? '' : 'none';
    genBtn.style.display = 'none';
    bar.querySelector('.nc-title').textContent = i === LAST ? 'Where should we send it?' : STEPS[i].title;
    bar.querySelector('.nc-sub').textContent   = i === LAST ? 'Your estimate lands in your inbox, and a real person checks the numbers.' : STEPS[i].sub;
    Array.prototype.forEach.call(bar.querySelectorAll('.nc-prog i'), function(d, n){ d.classList.toggle('on', n <= i); });
    // display, not visibility: a hidden-but-present Back button kept its width
    // and shoved Continue off-centre.
    nav.querySelector('.nc-back').style.display = i ? '' : 'none';
    nav.querySelector('.nc-next').textContent = i === LAST ? 'Send me my estimate' : (i === LAST - 1 ? 'Almost done' : 'Continue');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  nav.querySelector('.nc-back').addEventListener('click', function(){ if(i){ i--; draw(); } });
  nav.querySelector('.nc-next').addEventListener('click', function(){
    if(i < LAST){ i++; draw(); return; }
    var nm = document.getElementById('ncName').value.trim();
    var em = document.getElementById('ncEmail').value.trim();
    var zip = document.getElementById('ncZip').value.replace(/\\D/g,'');
    if(!nm || !/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(em) || zip.length !== 5 || !document.getElementById('ncConsent').checked){
      document.getElementById('ncErr').style.display = 'block'; return;
    }
    document.getElementById('ncErr').style.display = 'none';
    var sqft = (document.getElementById('totalSqft')||{}).textContent || '';
    var az = (function(n){ return n >= 85001 && n <= 86556; })(parseInt(zip,10));
    fetch('https://surprise-granite-email-api.onrender.com/api/leads', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        homeowner_name: nm, homeowner_email: em, homeowner_phone: document.getElementById('ncPhone').value.trim(),
        project_type:'kitchen_countertops', project_zip: zip,
        project_details: 'ROUTING: ' + (az ? 'in-house (AZ)' : 'REFERRAL — needs a fabricator in ' + zip) +
          ' | calculator sqft: ' + sqft + ' | consent captured: yes (' + new Date().toISOString() + ')',
        source: 'newcountertops.com/calculator'
      })
    }).catch(function(e){ console.error('lead capture failed', e); });
    // Hand back to the calculator's own estimate flow, untouched.
    var em2 = document.getElementById('quoteEmail') || document.getElementById('email');
    if(em2 && !em2.value) em2.value = em;
    generateQuote();
  });
  draw();
})();
</script>
<style>
  .nc-steps{margin:0 0 20px}
  .nc-prog{display:flex;gap:6px;margin-bottom:16px}
  .nc-prog i{flex:1;height:4px;border-radius:2px;background:#e6e3dd}
  .nc-prog i.on{background:#1f6f5c}
  .nc-title{font-size:20px;font-weight:800;margin:0 0 4px;letter-spacing:-.01em}
  .nc-sub{color:#4a5159;font-size:14.5px;margin:0}
  .nc-nav{display:flex;gap:12px;align-items:center;justify-content:center;max-width:520px;margin:22px auto 4px}
  .nc-lead{margin-bottom:4px}
  /* Not 0. Zeroing this is what pushed "Add Another Section" flush against the
     Section 1 card — the gap belonged to .countertop-sections all along. */
  .calc-section > .project-options{margin-bottom:0}
  .calc-section > .countertop-sections{margin-bottom:16px}
  .add-section-btn{margin-bottom:8px}
  .nc-nav button{font:inherit;font-weight:800;border-radius:12px;cursor:pointer;border:0;padding:15px 22px}
  .nc-back{background:none;color:#7a828b;text-decoration:underline}
  .nc-next{flex:1;background:#1f6f5c;color:#fff;font-size:16px}
  .nc-next:hover{background:#12503f}
  .nc-lead label{display:block;font-weight:700;font-size:14px;margin:0 0 7px}
  .nc-lead input[type=text],.nc-lead input[type=email],.nc-lead input[type=tel]{
    width:100%;font:inherit;font-size:16px;padding:14px;border:1px solid #e6e3dd;border-radius:11px;margin-bottom:16px}
  .nc-ok{display:flex;gap:10px;align-items:flex-start;font-weight:400;font-size:12.5px;color:#7a828b;line-height:1.5}
  .nc-ok input{width:18px;height:18px;margin-top:2px;flex-shrink:0}
  .nc-err{display:none;color:#a3271f;font-size:14px;margin-top:10px}

  /* One column, one gutter. The panels inherited three different widths from the
     source page — breadcrumb and hero at one inset, the calculator card
     at another, the tips panel wider than both — so nothing lined up down the
     left edge. Same max-width and the same auto margins puts every block on one
     grid line. */
  .page-content > .breadcrumb,
  .page-content > .calc-hero,
  .page-content > .calculator-card,
  .page-content > .tips-section,
  .page-content > .other-tools{max-width:900px;margin-left:auto;margin-right:auto;width:100%}
  .page-content{padding-left:20px;padding-right:20px;box-sizing:border-box}
  .results-panel{margin-left:0;margin-right:0}
  /* The estimate button is the one thing on the page that should sit dead
     centre, so it reads as the end of the flow rather than another field. */
  .nc-next{max-width:340px}
</style>
</body>`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, h);

const leftover = SG_ONLY.concat(['ROC #367593', 'Surprise Granite', 'sg-seo']).filter((s) => h.includes(s));
console.log(`calculator ported: ${(before / 1024).toFixed(0)}KB -> ${(h.length / 1024).toFixed(0)}KB, ${stripped} SG-only tags removed`);
console.log(leftover.length ? `  ⚠ still references: ${leftover.join(', ')}` : '  no Surprise Granite dependencies left');
