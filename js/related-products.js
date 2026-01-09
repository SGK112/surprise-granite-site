/**
 * Related Products - Shows similar materials on product pages
 * Matches by material type, color, and brand
 */

(function() {
  'use strict';

  let allProducts = null;

  // Get current product info from page
  function getCurrentProduct() {
    // Try JSON-LD first
    const jsonLd = document.querySelector('script[type="application/ld+json"]');
    if (jsonLd) {
      try {
        const data = JSON.parse(jsonLd.textContent);
        return {
          name: data.name || '',
          material: data.material || '',
          brand: data.brand?.name || '',
          category: data.category || ''
        };
      } catch (e) {}
    }

    // Fallback to meta tags and page content
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const title = ogTitle ? ogTitle.content.split('|')[0].trim() : document.title.split('|')[0].trim();

    // Extract material type from URL or page
    const path = window.location.pathname.toLowerCase();
    let material = 'granite';
    if (path.includes('quartz')) material = 'quartz';
    if (path.includes('marble')) material = 'marble';
    if (path.includes('quartzite')) material = 'quartzite';
    if (path.includes('porcelain')) material = 'porcelain';

    return { name: title, material, brand: '', category: '' };
  }

  // Get category from URL
  function getCategory() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('/countertop') || path.includes('/granite') ||
        path.includes('/quartz') || path.includes('/marble') ||
        path.includes('/quartzite')) {
      return 'countertops';
    }
    if (path.includes('/flooring')) return 'flooring';
    if (path.includes('/tile')) return 'tile';
    return null;
  }

  // Load products data
  async function loadProducts(category) {
    if (allProducts) return allProducts;

    const jsonPaths = {
      countertops: '/data/countertops.json',
      tile: '/data/tile.json',
      flooring: '/data/flooring.json'
    };

    try {
      const response = await fetch(jsonPaths[category] || jsonPaths.countertops);
      if (!response.ok) throw new Error('Failed to load');
      const data = await response.json();
      allProducts = data.countertops || data.products || data.tiles || data.flooring || [];
      return allProducts;
    } catch (e) {
      return [];
    }
  }

  // Normalize string for matching
  function normalize(str) {
    return (str || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Calculate similarity score
  function getSimilarityScore(product, current) {
    let score = 0;

    // Same material type = +30
    if (product.type && current.material) {
      if (normalize(product.type).includes(normalize(current.material))) {
        score += 30;
      }
    }

    // Same brand = +20
    if (product.brand && current.brand) {
      if (normalize(product.brand) === normalize(current.brand)) {
        score += 20;
      }
    }

    // Similar color = +25
    if (product.primaryColor) {
      const colors = ['white', 'black', 'gray', 'grey', 'brown', 'beige', 'blue', 'green', 'gold'];
      for (const color of colors) {
        if (normalize(product.primaryColor).includes(color) &&
            normalize(current.name).includes(color)) {
          score += 25;
          break;
        }
      }
    }

    // Name similarity (word matching) = up to +25
    const productWords = normalize(product.name).split(' ').filter(w => w.length > 2);
    const currentWords = normalize(current.name).split(' ').filter(w => w.length > 2);
    let matchedWords = 0;
    for (const w1 of productWords) {
      for (const w2 of currentWords) {
        if (w1 === w2 && !['granite', 'quartz', 'marble', 'quartzite', 'countertop'].includes(w1)) {
          matchedWords++;
          break;
        }
      }
    }
    score += Math.min(matchedWords * 10, 25);

    return score;
  }

  // Find related products
  function findRelatedProducts(products, current, limit = 8) {
    const currentNorm = normalize(current.name);

    // Score and sort products
    const scored = products
      .filter(p => normalize(p.name) !== currentNorm) // Exclude current product
      .map(p => ({ ...p, score: getSimilarityScore(p, current) }))
      .filter(p => p.score > 0) // Only include products with some similarity
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored;
  }

  // Create related products section
  function createRelatedSection(products, category) {
    const section = document.createElement('section');
    section.id = 'related-products-section';
    section.className = 'related-products-section';

    const categoryLabels = {
      countertops: 'Countertops',
      tile: 'Tile',
      flooring: 'Flooring'
    };

    let html = `
      <div class="related-products-container">
        <div class="related-products-header">
          <h2 class="related-products-title">Similar ${categoryLabels[category] || 'Products'}</h2>
          <a href="/materials/all-countertops/" class="related-products-link">
            View All
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </a>
        </div>
        <div class="related-products-grid">
    `;

    for (const product of products) {
      const slug = product.slug || product.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const url = `/${category}/${slug}/`;
      const img = product.primaryImage || product.image || '/images/placeholder.webp';
      const type = product.type || category;

      html += `
        <a href="${url}" class="related-product-card">
          <div class="related-product-image">
            <img src="${img}" alt="${product.name}" loading="lazy">
          </div>
          <div class="related-product-info">
            <span class="related-product-type">${type}</span>
            <h3 class="related-product-name">${product.name}</h3>
            ${product.brand ? `<span class="related-product-brand">${product.brand}</span>` : ''}
          </div>
        </a>
      `;
    }

    html += '</div></div>';
    section.innerHTML = html;
    return section;
  }

  // Add styles
  function addStyles() {
    if (document.getElementById('related-products-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'related-products-styles';
    styles.textContent = `
      .related-products-section {
        background: #ffffff;
        padding: 48px 20px;
        margin: 30px 0 0;
        border-top: 1px solid #e5e7eb;
      }

      .related-products-container {
        max-width: 1400px;
        margin: 0 auto;
      }

      .related-products-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
      }

      .related-products-title {
        color: #1e293b;
        font-size: 24px;
        font-weight: 700;
        margin: 0;
      }

      .related-products-link {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: #b8860b;
        text-decoration: none;
        font-size: 14px;
        font-weight: 600;
      }

      .related-products-link:hover {
        color: #996b00;
        text-decoration: underline;
      }

      .related-products-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 20px;
      }

      .related-product-card {
        background: #f8f9fa;
        border-radius: 12px;
        overflow: hidden;
        text-decoration: none;
        transition: all 0.2s ease;
        border: 1px solid #e5e7eb;
      }

      .related-product-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 12px 24px rgba(0,0,0,0.1);
        border-color: #f9cb00;
      }

      .related-product-image {
        aspect-ratio: 4/3;
        overflow: hidden;
        background: #e5e7eb;
      }

      .related-product-image img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.3s ease;
      }

      .related-product-card:hover .related-product-image img {
        transform: scale(1.05);
      }

      .related-product-info {
        padding: 16px;
      }

      .related-product-type {
        display: inline-block;
        background: #f9cb00;
        color: #1a1a2e;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        padding: 3px 8px;
        border-radius: 4px;
        margin-bottom: 8px;
      }

      .related-product-name {
        color: #1e293b;
        font-size: 15px;
        font-weight: 600;
        margin: 0 0 4px;
        line-height: 1.3;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .related-product-brand {
        color: #64748b;
        font-size: 12px;
      }

      @media (max-width: 768px) {
        .related-products-section {
          padding: 30px 16px;
        }

        .related-products-grid {
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }

        .related-products-header {
          flex-direction: column;
          align-items: flex-start;
          gap: 10px;
        }

        .related-product-info {
          padding: 12px;
        }

        .related-product-name {
          font-size: 13px;
        }
      }
    `;

    document.head.appendChild(styles);
  }

  // Insert section into page
  function insertSection(section) {
    // Remove existing if present
    const existing = document.getElementById('related-products-section');
    if (existing) existing.remove();

    // Insert before Shopify section or footer
    const shopifySection = document.getElementById('shopify-match-section');
    if (shopifySection) {
      shopifySection.parentNode.insertBefore(section, shopifySection);
      return;
    }

    // Try before footer
    const footer = document.querySelector('footer, .footer, .section_footer, [class*="footer"]');
    if (footer) {
      footer.parentNode.insertBefore(section, footer);
      return;
    }

    // Fallback to end of body
    document.body.appendChild(section);
  }

  // Main initialization
  async function init() {
    const category = getCategory();
    if (!category) return;

    const current = getCurrentProduct();
    if (!current.name) return;

    const products = await loadProducts(category);
    if (!products.length) return;

    const related = findRelatedProducts(products, current, 8);
    if (!related.length) return;

    addStyles();
    const section = createRelatedSection(related, category);
    insertSection(section);
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
