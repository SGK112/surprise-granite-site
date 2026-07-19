/* Shared marketplace browse grid. Page sets window.MP_CONFIG then includes this.
   Renders side-panel facet filters, floating boxless cards, add-to-cart flyout,
   sort, search, load-more, and a working mobile filter drawer. */
(function () {
  var C = window.MP_CONFIG || {};
  var API = (window.SG_CONFIG && window.SG_CONFIG.API_BASE) || 'https://surprise-granite-email-api.onrender.com';
  var PH = '/images/placeholder-card.svg';
  var ALL = [], bySlug = {}, view = [], shown = 0, BATCH = 48;
  var F = { q: '', sort: 'featured' };
  var grid, moreBtn, countEl, side, backdrop, toast;

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
  function sqftOf(size){ if(!size) return 0; var m=String(size).match(/(\d+(?:\.\d+)?)\D+?(\d+(?:\.\d+)?)/); return m ? (parseFloat(m[1])*parseFloat(m[2]))/144 : 0; }
  function titlecase(s){ return (s||'').replace(/\b\w/g, function(c){return c.toUpperCase();}); }
  function brandOf(p){ return C.brandOf ? C.brandOf(p) : titlecase((p.brand||p.vendor_id||'').replace(/-/g,' ')); }

  function sellable(p){
    var pr = +p.retail_price || 0;
    var img = p.primary_image_url || (p.image_urls && p.image_urls[0]);
    // Honor an explicit priceMin:0 — `C.priceMin||1` turned 0 into 1, hiding every
    // unpriced-but-real product (e.g. flooring lines shown as "See price →"). Default
    // stays 1 when unset so faucets/sinks still drop $0 junk.
    var minP = (C.priceMin != null) ? C.priceMin : 1;
    if (!(pr >= minP && pr <= (C.priceMax||100000) && img)) return false;
    if (C.accRegex && C.accRegex.test(p.name||'')) return false;
    return true;
  }
  // Product pages key purchasable detection on the PLURAL route category
  // (sinks/faucets/kitchen-accessories), not the singular catalog category.
  var ROUTE = { sink:'sinks', faucet:'faucets', accessory:'kitchen-accessories', remnant:'remnants' };
  function build(rows, cat){
    rows.forEach(function(p){
      if (!sellable(p)) return;
      var x = { slug:p.slug||p.id, name:p.name||'Product',
        img:p.primary_image_url||(p.image_urls&&p.image_urls[0]), price:+p.retail_price||0, hasPrice:!!(+p.retail_price), brand:brandOf(p),
        sqft: sqftOf(p.size), _cat: ROUTE[cat] || C.cardCategory || cat || 'product' };
      (C.facets||[]).forEach(function(f){ x[f.key] = f.derive(p) || ''; });
      // roomDefault needs x.room even when there is no room facet (e.g. the bathroom page)
      if (!x.room && C.roomOf) x.room = C.roomOf(p) || '';
      ALL.push(x); bySlug[x.slug] = x;
    });
  }

  // ---- side panel ----
  function buildFacets(){
    (C.facets||[]).forEach(function(f){
      var counts = {};
      ALL.forEach(function(x){ var v=x[f.key]; if(v && v!=='Other') counts[v]=(counts[v]||0)+1; });
      var items = Object.keys(counts).sort(function(a,b){
        if (f.order){ var ia=f.order.indexOf(a), ib=f.order.indexOf(b); if(ia>-1||ib>-1) return (ia<0?99:ia)-(ib<0?99:ib); }
        return counts[b]-counts[a];
      });
      if (!items.length) return;
      F[f.key] = 'all';
      var g = document.createElement('div'); g.className='fg';
      var h = '<h3>'+esc(f.label)+'</h3><button class="opt on" data-f="'+f.key+'" data-v="all">All</button>';
      items.forEach(function(v){ h += '<button class="opt" data-f="'+f.key+'" data-v="'+esc(v)+'">'+esc(f.labelOf?f.labelOf(v):v)+' <span>'+counts[v]+'</span></button>'; });
      g.innerHTML = h; side.appendChild(g);
    });
    var clr = document.createElement('button'); clr.className='mp-clr'; clr.type='button'; clr.textContent='Clear all filters';
    clr.addEventListener('click', clearAll); side.appendChild(clr);
  }
  function clearAll(){
    (C.facets||[]).forEach(function(f){ F[f.key]='all'; });
    side.querySelectorAll('.opt').forEach(function(o){ o.classList.toggle('on', o.getAttribute('data-v')==='all'); });
    apply();
  }
  function passes(x){
    for (var i=0;i<(C.facets||[]).length;i++){ var k=C.facets[i].key; if(F[k]!=='all' && x[k]!==F[k]) return false; }
    if (F.q){ var h=(x.name+' '+x.brand+' '+(C.facets||[]).map(function(f){return x[f.key];}).join(' ')).toLowerCase(); if(h.indexOf(F.q)<0) return false; }
    return true;
  }

  function card(x){
    var url = '/marketplace/product/?handle='+encodeURIComponent(x.slug)+'&category='+(x._cat||C.cardCategory||'product');
    var priceHtml;
    if (C.installed){
      // Quote a per-SQUARE-FOOT installed price, never the raw slab cost or a
      // lump-sum total: total = slab + pickup + sqft·fab, shown as total/sqft.
      var total = x.price + (C.installed.pickup||0) + (x.sqft||0)*(C.installed.fabRate||0);
      var perSqft = x.sqft ? Math.round(total / x.sqft) : 0;
      priceHtml = perSqft
        ? '<div class="pr">from $'+perSqft.toLocaleString('en-US')+'<span style="font-size:.62em;font-weight:700">/sq ft</span></div>'
          + '<div class="ship" style="color:var(--ink-3);font-weight:600">installed · '+(x.sqft?'~'+x.sqft.toFixed(1)+' sq ft piece · ':'')+'free in-home measure</div>'
        : '<div class="pr">Free measure</div><div class="ship" style="color:var(--ink-3);font-weight:600">installed price quoted in-home</div>';
    } else if (x.hasPrice) {
      if (C.unit) {
        // Per-unit goods (tile/flooring sold by the sq ft): keep cents and show the unit —
        // never round (Math.round turns $6.63 into "$7") and never imply a lump-sum total.
        priceHtml = '<div class="pr">$'+x.price.toFixed(2)+'<span style="font-size:.62em;font-weight:700">'+C.unit+'</span></div>';
      } else {
        priceHtml = '<div class="pr">$'+Math.round(x.price).toLocaleString('en-US')+'</div>' + (x.price>=500?'<div class="ship">Free shipping</div>':'');
      }
    } else {
      // No price on file (e.g. tile lines) — never render "$0"; invite the click.
      priceHtml = '<div class="pr" style="font-size:15px;color:var(--ink-3,#8b96a3)">See price &rarr;</div>';
    }
    return '<a class="pc" href="'+url+'" data-slug="'+esc(x.slug)+'"><div class="im"><img loading="lazy" src="'+esc(x.img)+'" alt="'+esc(x.name)+'" onerror="this.onerror=null;this.src=\''+PH+'\';this.style.mixBlendMode=\'normal\'"/></div>'
      + '<div class="br">'+esc(x.brand||'')+'</div><div class="nm">'+esc(x.name)+'</div>'
      + priceHtml
      + (C.noAdd ? (C.addNote?'<div class="ship" style="color:var(--ink-3)">'+esc(C.addNote)+'</div>':'') : '<button class="add" type="button">Add to cart</button>')
      + '</a>';
  }
  function apply(){
    view = ALL.filter(passes);
    var s = F.sort;
    if (s==='price-asc') view.sort(function(a,b){return a.price-b.price;});
    else if (s==='price-desc') view.sort(function(a,b){return b.price-a.price;});
    else if (s==='name') view.sort(function(a,b){return a.name.localeCompare(b.name);});
    // Featured: lead with priced items so the grid doesn't open on a wall of "See price →"
    // (matters for flooring, where the catalog returns unpriced lines first). Stable sort
    // preserves catalog order within each group; a no-op where everything is priced.
    else view.sort(function(a,b){return (b.hasPrice?1:0)-(a.hasPrice?1:0);});
    shown = 0; grid.innerHTML = '';
    if (!view.length){ grid.innerHTML='<div class="mp-empty">Nothing matches these filters. <button class="mp-clr" id="mpClr2" type="button">Clear filters</button></div>'; var c2=document.getElementById('mpClr2'); if(c2)c2.addEventListener('click',clearAll); countEl.textContent=''; moreBtn.style.display='none'; return; }
    render(); countEl.textContent = view.length.toLocaleString('en-US')+' '+(C.noun||'items');
    var ap = document.getElementById('mpApply'); if (ap) ap.textContent = 'Show '+view.length+' '+(C.noun||'items');
  }
  function render(){
    var sl = view.slice(shown, shown+BATCH), f=document.createElement('div');
    f.innerHTML = sl.map(card).join(''); while(f.firstChild) grid.appendChild(f.firstChild);
    shown += sl.length; moreBtn.style.display = shown<view.length ? 'block':'none';
  }

  // ---- add to cart + flyout ----
  function addToCart(x){
    var url='/marketplace/product/?handle='+encodeURIComponent(x.slug)+'&category='+(x._cat||C.cardCategory||'product');
    try{ var raw=localStorage.getItem('sg_cart'), cart=raw?JSON.parse(raw):[]; if(!Array.isArray(cart))cart=[];
      var ix=cart.findIndex(function(i){return i&&i.id===x.slug&&(i.variant||'')==='';});
      if(ix>-1) cart[ix].quantity=(+cart[ix].quantity||1)+1;
      else cart.push({id:x.slug,name:x.name,price:x.price,originalPrice:x.price,pricingTier:'guest',image:x.img,variant:'',quantity:1,category:C.cardCategory||'product',href:url});
      localStorage.setItem('sg_cart',JSON.stringify(cart));
    }catch(e){}
    showToast(x); try{ window.dispatchEvent(new Event('cartUpdated')); }catch(e){}
  }
  function showToast(x){
    if(!toast){ toast=document.createElement('div'); toast.className='mp-toast';
      toast.innerHTML='<img alt=""/><div class="t"><b>&#10003; Added to cart</b><div class="n"></div></div><a href="/cart/">View cart</a>';
      document.body.appendChild(toast); }
    toast.querySelector('img').src=x.img; toast.querySelector('.n').textContent=x.name;
    toast.classList.add('on'); clearTimeout(toast._t); toast._t=setTimeout(function(){toast.classList.remove('on');},3600);
  }

  // ---- mobile drawer ----
  function initDrawer(){
    var layout = document.querySelector('.mp-layout');
    var toggle = document.createElement('button'); toggle.className='mp-filt-toggle'; toggle.type='button'; toggle.textContent='☰ Filters';
    layout.insertAdjacentElement('beforebegin', toggle);
    backdrop = document.createElement('div'); backdrop.className='mp-backdrop'; document.body.appendChild(backdrop);
    var x = document.createElement('button'); x.className='mp-side-x'; x.type='button'; x.innerHTML='Filters <b>&times;</b>'; side.insertBefore(x, side.firstChild);
    var apply = document.createElement('button'); apply.className='mp-side-apply'; apply.id='mpApply'; apply.type='button'; apply.textContent='Show results'; document.body.appendChild(apply);
    function open(){ side.classList.add('open'); backdrop.classList.add('on'); document.body.classList.add('mp-drawer-open'); document.body.style.overflow='hidden'; }
    function close(){ side.classList.remove('open'); backdrop.classList.remove('on'); document.body.classList.remove('mp-drawer-open'); document.body.style.overflow=''; }
    toggle.addEventListener('click', open); x.addEventListener('click', close); backdrop.addEventListener('click', close); apply.addEventListener('click', close);
  }

  function init(){
    grid=document.getElementById('mpGrid'); moreBtn=document.getElementById('mpMore'); countEl=document.getElementById('mpCount'); side=document.getElementById('mpSide');
    grid.innerHTML = Array.from({length:12}).map(function(){return '<div class="mp-skel"></div>';}).join('');
    moreBtn.addEventListener('click', render);
    side.addEventListener('click', function(e){ var b=e.target.closest('.opt'); if(!b) return; var k=b.getAttribute('data-f'); F[k]=b.getAttribute('data-v'); side.querySelectorAll('.opt[data-f="'+k+'"]').forEach(function(o){o.classList.toggle('on',o===b);}); apply(); });
    grid.addEventListener('click', function(e){ var add=e.target.closest('.add'); if(!add) return; e.preventDefault(); e.stopPropagation(); var pc=add.closest('.pc'); var x=bySlug[pc&&pc.getAttribute('data-slug')]; if(!x) return; addToCart(x); var t=add.textContent; add.textContent='Added ✓'; setTimeout(function(){add.textContent=t;},1300); });
    var sf=document.getElementById('mpSearch'); if(sf) sf.addEventListener('submit', function(e){e.preventDefault(); F.q=document.getElementById('mpQ').value.trim().toLowerCase(); apply();});
    var qi=document.getElementById('mpQ'); if(qi) qi.addEventListener('input', function(e){ F.q=e.target.value.trim().toLowerCase(); apply(); });
    var so=document.getElementById('mpSort'); if(so) so.addEventListener('change', function(e){ F.sort=e.target.value; apply(); });

    (async function(){
      var TO = { signal: AbortSignal.timeout(12000) };
      function getPage(cat, off){
        return fetch(API+'/api/catalog?category='+encodeURIComponent(cat)+'&limit=250&offset='+off, TO)
          .then(function(r){ return r.ok ? r.json() : {}; }).catch(function(){ return {}; });
      }
      var cats = Array.isArray(C.category) ? C.category : [C.category];
      for (var ci=0; ci<cats.length; ci++){
        var cat = cats[ci];
        // First page tells us the total; then pull the remaining pages in PARALLEL
        // (was up to 14 serial round-trips → now 1 + a single Promise.all). Cold API
        // fails fast per-page (12s) instead of hanging the whole grid.
        var first = await getPage(cat, 0);
        build(first.products || []);
        var total = Math.min(first.total || (first.products ? first.products.length : 0), 3500);
        var offs = [];
        for (var off=250; off<total; off+=250) offs.push(off);
        if (offs.length){
          var pages = await Promise.all(offs.map(function(o){ return getPage(cat, o); }));
          pages.forEach(function(j){ build(j.products || []); });
        }
      }
      if (C.roomDefault && ALL.length){ ALL = ALL.filter(function(x){ return x.room===C.roomDefault; }); }
      buildFacets(); initDrawer();
      // presets from URL (?brand= / ?room=)
      var qs=new URLSearchParams(location.search);
      (C.facets||[]).forEach(function(f){ var v=qs.get(f.key); if(!v) return; var want=f.presetOf?f.presetOf(v):v; var btn=side.querySelector('.opt[data-f="'+f.key+'"][data-v="'+CSS.escape(want)+'"]'); if(btn) btn.click(); });
      apply();
    })();
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
