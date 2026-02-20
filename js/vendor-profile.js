/**
 * SURPRISE GRANITE - VENDOR PROFILE PAGE
 * Renders vendor info + filtered product grid for stone yard partners
 * Reads window.VENDOR_SLUG set by each HTML shell
 * Version: 1.0
 */
(function() {
  'use strict';

  // ============ INJECT STYLES ============
  const styles = document.createElement('style');
  styles.textContent = `
    :root {
      --vp-gold: #f9cb00;
      --vp-gold-dark: #d4a900;
      --vp-navy: #1a1a2e;
      --vp-navy-light: #2d2d44;
      --vp-bg: #ffffff;
      --vp-bg-secondary: #f8fafc;
      --vp-bg-tertiary: #f1f5f9;
      --vp-border: #e2e8f0;
      --vp-text: #1a1a2e;
      --vp-text-secondary: #64748b;
      --vp-text-muted: #94a3b8;
      --vp-radius: 12px;
      --vp-shadow: 0 4px 20px rgba(0,0,0,0.08);
      --vp-shadow-lg: 0 10px 40px rgba(0,0,0,0.12);
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
      background: var(--vp-bg);
      color: var(--vp-text);
      min-height: 100vh;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      margin: 0;
      overflow-x: hidden;
    }

    /* ===== HERO ===== */
    .vp-hero {
      background: linear-gradient(135deg, var(--vp-navy) 0%, var(--vp-navy-light) 100%);
      padding: 60px 24px;
      text-align: center;
      position: relative;
    }
    .vp-hero-inner { max-width: 700px; margin: 0 auto; }
    .vp-hero h1 {
      font-size: clamp(28px, 5vw, 42px);
      font-weight: 800;
      color: #fff;
      letter-spacing: -0.5px;
      margin-bottom: 8px;
      line-height: 1.1;
    }
    .vp-hero-tag {
      font-size: 16px;
      color: var(--vp-gold);
      font-weight: 500;
      margin-bottom: 16px;
    }
    .vp-hero-count {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 20px;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 100px;
      font-size: 14px;
      font-weight: 600;
      color: rgba(255,255,255,0.9);
    }

    /* ===== INFO SECTION ===== */
    .vp-info-section {
      max-width: 1200px;
      margin: 0 auto;
      padding: 40px 24px;
      display: grid;
      grid-template-columns: 1fr;
      gap: 24px;
    }
    @media (min-width: 768px) {
      .vp-info-section {
        grid-template-columns: 1fr 1fr;
      }
    }

    /* Contact Card */
    .vp-contact-card {
      background: var(--vp-bg);
      border: 1px solid var(--vp-border);
      border-radius: var(--vp-radius);
      padding: 28px;
      box-shadow: var(--vp-shadow);
    }
    .vp-contact-card h3 {
      font-size: 18px;
      font-weight: 700;
      color: var(--vp-navy);
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 2px solid var(--vp-bg-tertiary);
    }
    .vp-contact-row {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      margin-bottom: 16px;
      font-size: 14px;
      color: var(--vp-text-secondary);
      line-height: 1.5;
    }
    .vp-contact-row:last-of-type { margin-bottom: 20px; }
    .vp-contact-row svg {
      width: 20px; height: 20px;
      color: var(--vp-gold);
      flex-shrink: 0;
      margin-top: 1px;
    }
    .vp-contact-row a {
      color: var(--vp-text-secondary);
      text-decoration: none;
      transition: color 0.2s;
    }
    .vp-contact-row a:hover { color: var(--vp-navy); }
    .vp-contact-actions {
      display: flex;
      gap: 10px;
      margin-top: 20px;
    }
    .vp-contact-btn {
      flex: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s;
      cursor: pointer;
      border: none;
    }
    .vp-contact-btn svg { width: 16px; height: 16px; }
    .vp-contact-btn-primary {
      background: var(--vp-navy);
      color: var(--vp-gold);
    }
    .vp-contact-btn-primary:hover {
      background: var(--vp-navy-light);
      transform: translateY(-1px);
    }
    .vp-contact-btn-secondary {
      background: var(--vp-bg);
      color: var(--vp-text);
      border: 2px solid var(--vp-border);
    }
    .vp-contact-btn-secondary:hover {
      border-color: var(--vp-navy);
      background: var(--vp-bg-secondary);
    }

    /* Map */
    .vp-map-card {
      background: var(--vp-bg);
      border: 1px solid var(--vp-border);
      border-radius: var(--vp-radius);
      overflow: hidden;
      box-shadow: var(--vp-shadow);
    }
    #vp-map {
      width: 100%;
      height: 300px;
    }
    @media (min-width: 768px) {
      #vp-map { height: 100%; min-height: 300px; }
    }

    /* Leaflet marker */
    .vp-marker-pin {
      width: 30px; height: 42px; position: relative;
    }
    .vp-marker-pin-inner {
      width: 30px; height: 30px;
      background: linear-gradient(180deg, var(--vp-gold) 0%, var(--vp-gold-dark) 100%);
      border: 3px solid #fff;
      border-radius: 50% 50% 50% 0;
      position: absolute;
      transform: rotate(-45deg);
      box-shadow: 0 3px 10px rgba(0,0,0,0.25);
    }
    .vp-marker-pin-inner::after {
      content: '';
      width: 10px; height: 10px;
      background: #fff; border-radius: 50%;
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
    }

    /* ===== DESCRIPTION ===== */
    .vp-description {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 24px 32px;
    }
    .vp-description p {
      font-size: 15px;
      color: var(--vp-text-secondary);
      line-height: 1.7;
      max-width: 800px;
    }

    /* ===== TABS ===== */
    .vp-products-section {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 24px 60px;
    }
    .vp-tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 32px;
      border-bottom: 2px solid var(--vp-bg-tertiary);
      overflow-x: auto;
    }
    .vp-tab {
      padding: 14px 24px;
      font-size: 14px;
      font-weight: 600;
      color: var(--vp-text-muted);
      background: none;
      border: none;
      cursor: pointer;
      white-space: nowrap;
      border-bottom: 3px solid transparent;
      margin-bottom: -2px;
      transition: all 0.2s;
    }
    .vp-tab:hover { color: var(--vp-text); }
    .vp-tab.active {
      color: var(--vp-navy);
      border-bottom-color: var(--vp-gold);
    }
    .vp-tab-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 24px;
      height: 22px;
      padding: 0 7px;
      background: var(--vp-bg-tertiary);
      border-radius: 100px;
      font-size: 12px;
      font-weight: 700;
      margin-left: 8px;
    }
    .vp-tab.active .vp-tab-count {
      background: var(--vp-gold);
      color: var(--vp-navy);
    }

    /* ===== PRODUCT GRID ===== */
    .vp-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 20px;
    }
    @media (min-width: 480px) {
      .vp-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (min-width: 768px) {
      .vp-grid { grid-template-columns: repeat(3, 1fr); }
    }
    @media (min-width: 1024px) {
      .vp-grid { grid-template-columns: repeat(4, 1fr); gap: 20px; }
    }

    .vp-card {
      background: var(--vp-bg);
      border: 1px solid var(--vp-border);
      border-radius: var(--vp-radius);
      overflow: hidden;
      transition: all 0.25s;
      text-decoration: none;
      color: inherit;
      display: block;
    }
    .vp-card:hover {
      border-color: var(--vp-gold);
      box-shadow: var(--vp-shadow-lg);
      transform: translateY(-4px);
    }
    .vp-card-img {
      width: 100%;
      aspect-ratio: 4/3;
      object-fit: cover;
      background: var(--vp-bg-tertiary);
      display: block;
    }
    .vp-card-body {
      padding: 14px 16px;
    }
    .vp-card-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--vp-navy);
      margin-bottom: 4px;
      line-height: 1.3;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .vp-card-meta {
      font-size: 12px;
      color: var(--vp-text-muted);
    }

    /* ===== LOAD MORE ===== */
    .vp-load-more-wrap {
      text-align: center;
      margin-top: 32px;
    }
    .vp-load-more {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 14px 32px;
      background: var(--vp-bg);
      border: 2px solid var(--vp-border);
      border-radius: 100px;
      font-size: 14px;
      font-weight: 600;
      color: var(--vp-text);
      cursor: pointer;
      transition: all 0.2s;
    }
    .vp-load-more:hover {
      border-color: var(--vp-gold);
      background: rgba(249,203,0,0.08);
      transform: translateY(-1px);
    }

    /* ===== EMPTY STATE ===== */
    .vp-empty {
      text-align: center;
      padding: 60px 24px;
    }
    .vp-empty-icon {
      width: 64px; height: 64px;
      margin: 0 auto 20px;
      color: var(--vp-text-muted);
    }
    .vp-empty h3 {
      font-size: 20px;
      font-weight: 700;
      color: var(--vp-navy);
      margin-bottom: 8px;
    }
    .vp-empty p {
      font-size: 15px;
      color: var(--vp-text-secondary);
      max-width: 400px;
      margin: 0 auto 24px;
      line-height: 1.6;
    }
    .vp-empty-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 14px 28px;
      background: var(--vp-navy);
      color: var(--vp-gold);
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s;
    }
    .vp-empty-btn:hover {
      background: var(--vp-navy-light);
      transform: translateY(-1px);
    }

    /* ===== CTA BANNER ===== */
    .vp-cta-banner {
      max-width: 1200px;
      margin: 0 auto 60px;
      padding: 0 24px;
    }
    .vp-cta-inner {
      background: linear-gradient(135deg, var(--vp-navy) 0%, var(--vp-navy-light) 100%);
      border-radius: var(--vp-radius);
      padding: 40px 32px;
      text-align: center;
    }
    .vp-cta-inner h3 {
      font-size: clamp(20px, 3vw, 24px);
      font-weight: 800;
      color: #fff;
      margin-bottom: 8px;
    }
    .vp-cta-inner p {
      font-size: 15px;
      color: rgba(255,255,255,0.8);
      margin-bottom: 24px;
      line-height: 1.6;
    }
    .vp-cta-btn {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 16px 32px;
      background: linear-gradient(135deg, var(--vp-gold) 0%, var(--vp-gold-dark) 100%);
      color: var(--vp-navy);
      border-radius: 10px;
      font-size: 16px;
      font-weight: 700;
      text-decoration: none;
      transition: all 0.25s;
      box-shadow: 0 4px 20px rgba(249,203,0,0.3);
      border: none;
      cursor: pointer;
    }
    .vp-cta-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 30px rgba(249,203,0,0.4);
    }
    .vp-cta-btn svg { width: 20px; height: 20px; }

    /* ===== LOADING ===== */
    .vp-loading {
      text-align: center;
      padding: 80px 24px;
    }
    .vp-spinner {
      width: 40px; height: 40px;
      border: 4px solid var(--vp-bg-tertiary);
      border-top-color: var(--vp-gold);
      border-radius: 50%;
      animation: vp-spin 0.8s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes vp-spin { to { transform: rotate(360deg); } }
    .vp-loading p {
      font-size: 14px;
      color: var(--vp-text-muted);
    }

    /* ===== MOBILE ===== */
    @media (max-width: 768px) {
      #vendor-profile { padding-top: 10px; }
      .vp-back { margin: 0 16px 16px; padding: 8px 16px; }
      .vp-hero { padding: 32px 16px; }
      .vp-info-section { padding: 24px 16px; }
      .vp-description { padding: 0 16px 24px; }
      .vp-products-section { padding: 0 16px 40px; }
      .vp-contact-card { padding: 20px; }
      .vp-contact-actions { flex-direction: column; }
      .vp-contact-btn { width: 100%; min-height: 48px; }
      .vp-cta-banner { padding: 0 16px; }
      .vp-cta-inner { padding: 32px 20px; }
      .vp-tabs { gap: 0; }
      .vp-tab { padding: 12px 16px; font-size: 13px; }
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
      }
    }

    .footer-spacer { height: 80px; }
    @supports (padding-bottom: env(safe-area-inset-bottom)) {
      .footer-spacer { height: calc(80px + env(safe-area-inset-bottom)); }
    }
  `;
  document.head.appendChild(styles);

  // ============ CONSTANTS ============
  const ITEMS_PER_PAGE = 24;
  const SLUG = window.VENDOR_SLUG;
  if (!SLUG) {
    console.error('VENDOR_SLUG not set');
    return;
  }

  const container = document.getElementById('vendor-profile');
  if (!container) return;

  // State
  let vendor = null;
  let products = { countertops: [], slabs: [], flooring: [] };
  let activeTab = '';
  let currentPage = { countertops: 1, slabs: 1, flooring: 1 };

  // ============ SHOW LOADING ============
  container.innerHTML = `
    <div class="vp-loading">
      <div class="vp-spinner"></div>
      <p>Loading vendor profile...</p>
    </div>
  `;

  // ============ FETCH DATA ============
  async function loadData() {
    try {
      const [vendorsRes, countertopsRes, slabsRes, flooringRes] = await Promise.all([
        fetch('/data/stone-yards.json'),
        fetch('/data/countertops.json'),
        fetch('/data/slabs.json'),
        fetch('/data/flooring.json')
      ]);

      const vendors = await vendorsRes.json();
      vendor = vendors.find(v => v.slug === SLUG);
      if (!vendor) {
        container.innerHTML = '<div class="vp-empty"><h3>Vendor not found</h3><p>This vendor profile could not be loaded.</p><a href="/stone-yards/" class="vp-empty-btn">Back to Stone Yards</a></div>';
        return;
      }

      const countertopsData = await countertopsRes.json();
      const slabsData = await slabsRes.json();
      const flooringData = await flooringRes.json();

      // Extract arrays
      const allCountertops = countertopsData.countertops || [];
      const allSlabs = Array.isArray(slabsData) ? slabsData : [];
      const allFlooring = flooringData.flooring || [];

      // Filter by brand keys
      const bk = vendor.brandKeys;

      if (bk.countertops && bk.countertops.length > 0) {
        products.countertops = allCountertops.filter(p =>
          bk.countertops.includes(p.brand)
        );
      }

      if (bk.slabs && bk.slabs.length > 0) {
        products.slabs = allSlabs.filter(p =>
          bk.slabs.includes(p.vendor)
        );
      }

      if (bk.flooring && bk.flooring.length > 0) {
        products.flooring = allFlooring.filter(p =>
          bk.flooring.includes(p.brand)
        );
      }

      render();
    } catch (err) {
      console.error('Failed to load vendor data:', err);
      container.innerHTML = '<div class="vp-empty"><h3>Error loading data</h3><p>Please try refreshing the page.</p><a href="/stone-yards/" class="vp-empty-btn">Back to Stone Yards</a></div>';
    }
  }

  // ============ RENDER ============
  function render() {
    const totalProducts = products.countertops.length + products.slabs.length + products.flooring.length;

    // Determine which tabs to show
    const tabs = [];
    if (products.countertops.length > 0) tabs.push({ key: 'countertops', label: 'Countertops', count: products.countertops.length });
    if (products.slabs.length > 0) tabs.push({ key: 'slabs', label: 'Slabs', count: products.slabs.length });
    if (products.flooring.length > 0) tabs.push({ key: 'flooring', label: 'Flooring', count: products.flooring.length });

    activeTab = tabs.length > 0 ? tabs[0].key : '';

    const mapsUrl = 'https://maps.google.com/?q=' + encodeURIComponent(vendor.address);
    const phoneDigits = vendor.phone.replace(/[^0-9]/g, '');

    let html = '';

    // Hero
    html += `
      <section class="vp-hero">
        <div class="vp-hero-inner">
          <h1>${esc(vendor.name)}</h1>
          <div class="vp-hero-tag">${esc(vendor.tag)}</div>
          ${totalProducts > 0 ? `<div class="vp-hero-count">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
            ${totalProducts.toLocaleString()} products available
          </div>` : ''}
        </div>
      </section>
    `;

    // Info section: contact + map
    html += `
      <section class="vp-info-section">
        <div class="vp-contact-card">
          <h3>Contact Information</h3>
          <div class="vp-contact-row">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            <span>${esc(vendor.address)}</span>
          </div>
          <div class="vp-contact-row">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
            <a href="tel:+1${phoneDigits}">${esc(vendor.phone)}</a>
          </div>
          <div class="vp-contact-row">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/></svg>
            <a href="${esc(vendor.website)}" target="_blank" rel="noopener">${esc(vendor.website.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>
          </div>
          <div class="vp-contact-row">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span>${esc(vendor.hours)}</span>
          </div>
          <div class="vp-contact-actions">
            <a href="${esc(mapsUrl)}" target="_blank" rel="noopener" class="vp-contact-btn vp-contact-btn-primary">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>
              Directions
            </a>
            <a href="${esc(vendor.website)}" target="_blank" rel="noopener" class="vp-contact-btn vp-contact-btn-secondary">Website</a>
          </div>
        </div>
        <div class="vp-map-card">
          <div id="vp-map"></div>
        </div>
      </section>
    `;

    // Description
    if (vendor.description) {
      html += `
        <div class="vp-description">
          <p>${esc(vendor.description)}</p>
        </div>
      `;
    }

    // Products section
    if (tabs.length > 0) {
      html += `<section class="vp-products-section">`;

      // Tabs
      html += `<div class="vp-tabs">`;
      tabs.forEach(tab => {
        html += `<button class="vp-tab${tab.key === activeTab ? ' active' : ''}" data-tab="${tab.key}">${tab.label}<span class="vp-tab-count">${tab.count}</span></button>`;
      });
      html += `</div>`;

      // Tab content containers
      tabs.forEach(tab => {
        html += `<div class="vp-tab-content" data-content="${tab.key}" style="${tab.key !== activeTab ? 'display:none;' : ''}">`;
        html += `<div class="vp-grid" id="vp-grid-${tab.key}"></div>`;
        html += `<div class="vp-load-more-wrap" id="vp-more-${tab.key}" style="display:none;"><button class="vp-load-more" data-tab="${tab.key}">Load More</button></div>`;
        html += `</div>`;
      });

      html += `</section>`;
    } else {
      // Empty state for vendors with 0 products
      html += `
        <div class="vp-empty">
          <svg class="vp-empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008z"/>
          </svg>
          <h3>Visit Their Showroom</h3>
          <p>This vendor's products aren't listed online yet. Visit their showroom in person to browse slabs and surfaces.</p>
          <a href="${esc(mapsUrl)}" target="_blank" rel="noopener" class="vp-empty-btn">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>
            Get Directions
          </a>
        </div>
      `;
    }

    // CTA banner
    html += `
      <div class="vp-cta-banner">
        <div class="vp-cta-inner">
          <h3>Tell them "Surprise Granite is my fabricator"</h3>
          <p>Get a free in-home estimate for countertop fabrication and installation.</p>
          <a href="/book/" class="vp-cta-btn" id="vp-cta-book">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            Get Free Estimate
          </a>
        </div>
      </div>
    `;

    html += '<div class="footer-spacer"></div>';

    container.innerHTML = html;

    // ============ POST-RENDER ============

    // Init map
    initMap();

    // Render product grids
    Object.keys(products).forEach(key => {
      if (products[key].length > 0) {
        renderGrid(key);
      }
    });

    // Tab switching
    container.querySelectorAll('.vp-tab').forEach(btn => {
      btn.addEventListener('click', function() {
        const tab = this.dataset.tab;
        activeTab = tab;
        container.querySelectorAll('.vp-tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        container.querySelectorAll('.vp-tab-content').forEach(c => {
          c.style.display = c.dataset.content === tab ? '' : 'none';
        });
      });
    });

    // Load more buttons
    container.querySelectorAll('.vp-load-more').forEach(btn => {
      btn.addEventListener('click', function() {
        const tab = this.dataset.tab;
        currentPage[tab]++;
        renderGrid(tab);
      });
    });

    // CTA book button - try booking modal
    const ctaBook = document.getElementById('vp-cta-book');
    if (ctaBook) {
      ctaBook.addEventListener('click', function(e) {
        if (window.SGWidgets && window.SGWidgets.showBookingModal) {
          e.preventDefault();
          window.SGWidgets.showBookingModal();
        }
      });
    }
  }

  // ============ RENDER GRID ============
  function renderGrid(tab) {
    const grid = document.getElementById('vp-grid-' + tab);
    const moreWrap = document.getElementById('vp-more-' + tab);
    if (!grid) return;

    const items = products[tab];
    const page = currentPage[tab];
    const visible = items.slice(0, page * ITEMS_PER_PAGE);

    let html = '';
    visible.forEach(item => {
      const card = buildCard(item, tab);
      html += card;
    });

    grid.innerHTML = html;

    // Show/hide load more
    if (moreWrap) {
      moreWrap.style.display = visible.length < items.length ? '' : 'none';
    }
  }

  // ============ BUILD CARD ============
  function buildCard(item, tab) {
    let href = '#';
    let img = '';
    let name = '';
    let meta = '';

    if (tab === 'countertops') {
      href = '/countertops/' + item.slug + '/';
      img = item.primaryImage || '';
      name = item.name;
      meta = [item.type, item.primaryColor].filter(Boolean).join(' &middot; ');
    } else if (tab === 'slabs') {
      href = '/marketplace/product/?handle=' + encodeURIComponent(item.handle) + '&category=slabs';
      img = (item.images && item.images[0]) || '';
      name = item.title;
      meta = [item.productType, item.primaryColor].filter(Boolean).join(' &middot; ');
    } else if (tab === 'flooring') {
      href = '/marketplace/product/?handle=' + encodeURIComponent(item.slug) + '&category=flooring';
      img = item.primaryImage || '';
      name = item.name;
      meta = [item.type, item.primaryColor].filter(Boolean).join(' &middot; ');
    }

    return `
      <a href="${esc(href)}" class="vp-card">
        <img class="vp-card-img" src="${esc(img)}" alt="${esc(name)}" loading="lazy" onerror="this.style.display='none'">
        <div class="vp-card-body">
          <div class="vp-card-name">${esc(name)}</div>
          <div class="vp-card-meta">${meta}</div>
        </div>
      </a>
    `;
  }

  // ============ MAP ============
  function initMap() {
    const mapEl = document.getElementById('vp-map');
    if (!mapEl || !vendor || typeof L === 'undefined') return;

    const map = L.map('vp-map', {
      scrollWheelZoom: false,
      zoomControl: true
    }).setView([vendor.lat, vendor.lng], 14);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '',
      maxZoom: 19
    }).addTo(map);

    const pinIcon = L.divIcon({
      className: 'vp-marker-wrapper',
      html: '<div class="vp-marker-pin"><div class="vp-marker-pin-inner"></div></div>',
      iconSize: [30, 42],
      iconAnchor: [15, 42],
      popupAnchor: [0, -38]
    });

    L.marker([vendor.lat, vendor.lng], { icon: pinIcon })
      .addTo(map)
      .bindPopup('<strong>' + esc(vendor.name) + '</strong><br>' + esc(vendor.address));
  }

  // ============ HELPERS ============
  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ============ INIT ============
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadData);
  } else {
    loadData();
  }
})();
