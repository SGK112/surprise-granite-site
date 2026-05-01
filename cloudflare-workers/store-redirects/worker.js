/**
 * store.surprisegranite.com → www.surprisegranite.com 301 redirect worker.
 *
 * Deploy: Cloudflare Dashboard → Workers & Pages → Create → paste this file.
 * Bind to route: store.surprisegranite.com/*
 *
 * After deploy, point store.surprisegranite.com DNS at the Worker:
 *   Cloudflare DNS → CNAME store → <worker-name>.workers.dev (proxied/orange-cloud)
 *
 * Then cancel Shopify. The Worker keeps the redirect graph alive for 6+ months
 * so Google can fully migrate ranking signals to www.
 */

const TARGET_HOST = 'https://www.surprisegranite.com';

// Shopify collection handles → www marketplace pages.
// Add or override here as you find unmapped collections in the GSC export.
const COLLECTION_MAP = {
  'sinks': '/marketplace/sinks/',
  'kitchen-sinks': '/marketplace/sinks/',
  'bathroom-sinks': '/marketplace/sinks/',
  'faucets': '/marketplace/faucets/',
  'kitchen-faucets': '/marketplace/faucets/',
  'bathroom-faucets': '/marketplace/faucets/',
  'tile': '/marketplace/tile/',
  'tiles': '/marketplace/tile/',
  'flooring': '/marketplace/flooring/',
  'lvp': '/marketplace/flooring/',
  'hardwood': '/marketplace/flooring/',
  'quartz': '/marketplace/slabs/?material=quartz',
  'granite': '/marketplace/slabs/?material=granite',
  'marble': '/marketplace/slabs/?material=marble',
  'quartzite': '/marketplace/slabs/?material=quartzite',
  'porcelain': '/marketplace/slabs/?material=porcelain',
  'dekton': '/marketplace/slabs/?material=dekton',
  'slabs': '/marketplace/slabs/',
  'remnants': '/marketplace/remnants/',
  'all': '/marketplace/'
};

// One-off page slug overrides. Anything not listed falls through to the
// generic /pages/{slug}/ → /{slug}/ rule.
const PAGE_MAP = {
  'about': '/about/',
  'about-us': '/about/',
  'contact': '/contact/',
  'contact-us': '/contact/',
  'privacy': '/privacy-policy/',
  'privacy-policy': '/privacy-policy/',
  'terms': '/terms/',
  'shipping': '/policies/shipping/',
  'returns': '/policies/returns/'
};

// Drop the CSV-derived per-URL overrides here. Format:
//   '/products/exact-old-handle': '/marketplace/sinks/?q=ruvati-rvh8307'
// Anything in URL_MAP wins over the regex rules below.
const URL_MAP = {
  // populated from store.surprisegranite.com GSC export (TODO: paste CSV-derived entries)
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const search = url.search;

    // 1. Exact override — highest priority
    if (URL_MAP[path]) {
      return redirect(URL_MAP[path] + search);
    }
    if (URL_MAP[path + '/']) {
      return redirect(URL_MAP[path + '/'] + search);
    }

    // 2. Collections
    const collMatch = path.match(/^\/collections\/([^/]+)/);
    if (collMatch) {
      const handle = collMatch[1].toLowerCase();
      if (COLLECTION_MAP[handle]) return redirect(COLLECTION_MAP[handle]);
      // unknown collection → marketplace landing
      return redirect('/marketplace/');
    }

    // 3. Products — preserve handle as a search query so visitors land on
    //    a relevant marketplace page instead of a dead end.
    const prodMatch = path.match(/^\/products\/([^/]+)/);
    if (prodMatch) {
      const handle = prodMatch[1].toLowerCase();
      // Heuristic routing by handle keywords — tweak as you see GSC data.
      if (/sink|basin|drain/.test(handle)) {
        return redirect(`/marketplace/sinks/?q=${encodeURIComponent(handle)}`);
      }
      if (/faucet|tap|spout|pulldown|pull-down/.test(handle)) {
        return redirect(`/marketplace/faucets/?q=${encodeURIComponent(handle)}`);
      }
      if (/tile|mosaic|subway|porcelain/.test(handle)) {
        return redirect(`/marketplace/tile/?q=${encodeURIComponent(handle)}`);
      }
      if (/floor|lvp|hardwood|laminate|vinyl/.test(handle)) {
        return redirect(`/marketplace/flooring/?q=${encodeURIComponent(handle)}`);
      }
      if (/quartz|granite|marble|quartzite|dekton|slab/.test(handle)) {
        return redirect(`/marketplace/slabs/?q=${encodeURIComponent(handle)}`);
      }
      // unknown product type → marketplace search
      return redirect(`/marketplace/?q=${encodeURIComponent(handle)}`);
    }

    // 4. Blog posts → keep /blog/ path
    const blogMatch = path.match(/^\/blogs\/[^/]+\/([^/]+)/);
    if (blogMatch) {
      return redirect(`/blog/${blogMatch[1]}/`);
    }
    if (path === '/blogs' || path.startsWith('/blogs/')) {
      return redirect('/blog/');
    }

    // 5. Pages
    const pageMatch = path.match(/^\/pages\/([^/]+)/);
    if (pageMatch) {
      const slug = pageMatch[1].toLowerCase();
      return redirect(PAGE_MAP[slug] || `/${slug}/`);
    }

    // 6. Cart / account / search → marketplace home
    if (/^\/(cart|account|checkout|search)/.test(path)) {
      return redirect('/marketplace/');
    }

    // 7. Root → www root
    if (path === '/') return redirect('/');

    // 8. Anything else → www homepage (Google sees a 301 chain, signal flows)
    return redirect('/');
  }
};

function redirect(toPath) {
  const dest = toPath.startsWith('http') ? toPath : TARGET_HOST + toPath;
  return Response.redirect(dest, 301);
}
