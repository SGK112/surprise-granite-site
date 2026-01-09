/**
 * Shopify Products Integration - Item-to-Item Matching
 * Links each product page to its matching Shopify product
 */

(function() {
  'use strict';

  // Shopify Storefront API Configuration
  const SHOPIFY_CONFIG = {
    domain: 'surprise-granite.myshopify.com',
    token: '17a4557623df390a5a866c7640ec021a',
    collections: {
      countertopSamples: 'gid://shopify/Collection/278939041927',
      all: 'gid://shopify/Collection/276721336455'
    }
  };

  // State
  let allProducts = null;
  let countertopSamples = null;
  let isInitialized = false;

  // Extract product name from current page
  function getProductName() {
    // Try JSON-LD structured data first (most accurate)
    const jsonLd = document.querySelector('script[type="application/ld+json"]');
    if (jsonLd) {
      try {
        const data = JSON.parse(jsonLd.textContent);
        if (data.name) return data.name;
        if (data['@graph']) {
          const product = data['@graph'].find(item => item['@type'] === 'Product');
          if (product?.name) return product.name;
        }
      } catch (e) {}
    }

    // Try og:title
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) {
      const title = ogTitle.content.split('|')[0].trim();
      if (title && title.length > 2) return title;
    }

    // Try page title
    const pageTitle = document.title;
    if (pageTitle) {
      const title = pageTitle.split('|')[0].trim();
      if (title && title.length > 2) return title;
    }

    // Try h1
    const h1 = document.querySelector('h1');
    if (h1) {
      const title = h1.textContent.split('|')[0].trim();
      if (title && title.length > 2) return title;
    }

    // Fall back to URL slug
    const path = window.location.pathname;
    const slug = path.split('/').filter(s => s).pop() || '';
    return slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  // Get product category from URL
  function getProductCategory() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('/countertop') || path.includes('/granite') ||
        path.includes('/quartz') || path.includes('/marble') ||
        path.includes('/quartzite') || path.includes('/all-countertop')) {
      return 'countertops';
    }
    if (path.includes('/flooring')) return 'flooring';
    if (path.includes('/tile')) return 'tile';
    return null;
  }

  // Normalize string for matching
  function normalize(str) {
    return (str || '')
      .toLowerCase()
      .replace(/\s*sample\s*/gi, ' ')  // Remove "sample"
      .replace(/\s*quartz\s*/gi, ' ')  // Remove "quartz"
      .replace(/\s*granite\s*/gi, ' ') // Remove "granite"
      .replace(/\s*marble\s*/gi, ' ')  // Remove "marble"
      .replace(/\s*quartzite\s*/gi, ' ') // Remove "quartzite"
      .replace(/\s*porcelain\s*/gi, ' ') // Remove "porcelain"
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Calculate match score between two strings
  function matchScore(str1, str2) {
    const n1 = normalize(str1);
    const n2 = normalize(str2);

    // Exact match
    if (n1 === n2) return 100;

    // One contains the other
    if (n1.includes(n2) || n2.includes(n1)) return 85;

    // Word matching
    const words1 = n1.split(' ').filter(w => w.length > 2);
    const words2 = n2.split(' ').filter(w => w.length > 2);

    let matchedWords = 0;
    for (const w1 of words1) {
      for (const w2 of words2) {
        if (w1 === w2) {
          matchedWords += 1;
          break;
        } else if (w1.includes(w2) || w2.includes(w1)) {
          matchedWords += 0.7;
          break;
        }
      }
    }

    if (words1.length === 0) return 0;
    return Math.round((matchedWords / Math.max(words1.length, 1)) * 75);
  }

  // Storefront API GraphQL query
  async function fetchStorefrontAPI(query) {
    try {
      const response = await fetch(`https://${SHOPIFY_CONFIG.domain}/api/2024-01/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': SHOPIFY_CONFIG.token
        },
        body: JSON.stringify({ query })
      });
      return await response.json();
    } catch (error) {
return null;
    }
  }

  // Fetch countertop samples collection
  async function fetchCountertopSamples() {
    if (countertopSamples) return countertopSamples;

    const query = `{
      collection(id: "${SHOPIFY_CONFIG.collections.countertopSamples}") {
        title
        products(first: 250) {
          edges {
            node {
              id
              title
              handle
              productType
              tags
              priceRange {
                minVariantPrice {
                  amount
                  currencyCode
                }
              }
              images(first: 1) {
                edges {
                  node {
                    url
                    altText
                  }
                }
              }
              onlineStoreUrl
              variants(first: 1) {
                edges {
                  node {
                    id
                    title
                    availableForSale
                  }
                }
              }
            }
          }
        }
      }
    }`;

    const data = await fetchStorefrontAPI(query);

    if (data?.data?.collection?.products?.edges) {
      countertopSamples = data.data.collection.products.edges;
return countertopSamples;
    }

    return [];
  }

  // Fetch all products from Shopify
  async function fetchAllProducts() {
    if (allProducts) return allProducts;

    const query = `{
      products(first: 250) {
        edges {
          node {
            id
            title
            handle
            productType
            tags
            priceRange {
              minVariantPrice {
                amount
                currencyCode
              }
            }
            images(first: 1) {
              edges {
                node {
                  url
                  altText
                }
              }
            }
            onlineStoreUrl
            variants(first: 1) {
              edges {
                node {
                  id
                  title
                  availableForSale
                }
              }
            }
          }
        }
      }
    }`;

    const data = await fetchStorefrontAPI(query);

    if (data?.data?.products?.edges) {
      allProducts = data.data.products.edges;
      return allProducts;
    }

    return [];
  }

  // Find matching Shopify product for current page
  function findMatchingProduct(products, productName) {
    if (!products || !productName) return null;

    let bestMatch = null;
    let bestScore = 0;

    for (const product of products) {
      const node = product.node;
      const shopifyTitle = node.title;

      const score = matchScore(productName, shopifyTitle);

      if (score > bestScore && score >= 40) {
        bestScore = score;
        bestMatch = { ...node, matchScore: score };
      }
    }

    return bestMatch;
  }

  // Find related products
  function findRelatedProducts(products, currentProduct, limit = 6) {
    if (!products) return [];

    const currentTitle = currentProduct ? normalize(currentProduct.title) : '';

    return products
      .filter(p => {
        const title = normalize(p.node.title);
        return !currentProduct || title !== currentTitle;
      })
      .slice(0, limit)
      .map(p => p.node);
  }

  // Create the product match section HTML
  function createMatchSection(matchedProduct, relatedProducts, category) {
    const section = document.createElement('section');
    section.id = 'shopify-match-section';
    section.className = 'shopify-match-section';

    let html = '<div class="shopify-match-container">';

    // Header
    const categoryLabels = {
      countertops: 'Countertop Sample',
      tile: 'Tile',
      flooring: 'Flooring'
    };

    // If we found a matching product
    if (matchedProduct) {
      const img = matchedProduct.images?.edges?.[0]?.node?.url ||
        'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder.png';
      const price = matchedProduct.priceRange?.minVariantPrice?.amount
        ? parseFloat(matchedProduct.priceRange.minVariantPrice.amount).toFixed(2)
        : null;
      const url = matchedProduct.onlineStoreUrl ||
        `https://${SHOPIFY_CONFIG.domain}/products/${matchedProduct.handle}`;
      const available = matchedProduct.variants?.edges?.[0]?.node?.availableForSale;

      html += `
        <div class="shopify-match-main">
          <div class="shopify-match-badge">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            ${categoryLabels[category] || 'Product'} Available
          </div>
          <div class="shopify-match-card">
            <div class="shopify-match-image">
              <img src="${img}" alt="${matchedProduct.title}" loading="lazy">
            </div>
            <div class="shopify-match-info">
              <h3 class="shopify-match-title">${matchedProduct.title}</h3>
              ${price ? `<p class="shopify-match-price">$${price}</p>` : ''}
              ${available !== false ? `
                <a href="${url}" target="_blank" class="shopify-match-btn">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
                  </svg>
                  Order Sample Now
                </a>
              ` : `
                <span class="shopify-match-unavailable">Currently Out of Stock</span>
              `}
              <p class="shopify-match-note">Free shipping on orders over $50</p>
            </div>
          </div>
        </div>
      `;
    }

    // Related products section
    if (relatedProducts && relatedProducts.length > 0) {
      html += `
        <div class="shopify-related">
          <div class="shopify-related-header">
            <h3 class="shopify-related-title">${matchedProduct ? 'More Samples' : 'Order Samples'}</h3>
            <a href="/shop?collection=countertop-samples" class="shopify-related-link">
              View All Samples
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
            </a>
          </div>
          <div class="shopify-related-grid">
      `;

      for (const product of relatedProducts) {
        const img = product.images?.edges?.[0]?.node?.url ||
          'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder.png';
        const price = product.priceRange?.minVariantPrice?.amount
          ? parseFloat(product.priceRange.minVariantPrice.amount).toFixed(2)
          : null;
        const url = product.onlineStoreUrl ||
          `https://${SHOPIFY_CONFIG.domain}/products/${product.handle}`;

        html += `
          <a href="${url}" target="_blank" class="shopify-related-card">
            <div class="shopify-related-image">
              <img src="${img}" alt="${product.title}" loading="lazy">
            </div>
            <div class="shopify-related-info">
              <h4 class="shopify-related-name">${product.title}</h4>
              ${price ? `<span class="shopify-related-price">$${price}</span>` : ''}
            </div>
          </a>
        `;
      }

      html += '</div></div>';
    }

    // No products found - show link to shop
    if (!matchedProduct && (!relatedProducts || relatedProducts.length === 0)) {
      html += `
        <div class="shopify-match-empty">
          <h3>Order Samples Online</h3>
          <p>Get samples delivered to your door to see colors in your space</p>
          <a href="/shop?collection=countertop-samples" class="shopify-match-btn">Browse All Samples</a>
        </div>
      `;
    }

    html += '</div>';
    section.innerHTML = html;

    return section;
  }

  // Add CSS styles
  function addStyles() {
    if (document.getElementById('shopify-match-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'shopify-match-styles';
    styles.textContent = `
      .shopify-match-section {
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        padding: 40px 20px;
        margin: 30px 0 0;
      }

      .shopify-match-container {
        max-width: 1200px;
        margin: 0 auto;
      }

      .shopify-match-main {
        margin-bottom: 40px;
      }

      .shopify-match-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: rgba(16, 185, 129, 0.15);
        color: #10b981;
        font-size: 13px;
        font-weight: 600;
        padding: 8px 16px;
        border-radius: 20px;
        margin-bottom: 16px;
      }

      .shopify-match-card {
        display: flex;
        gap: 24px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 16px;
        padding: 20px;
        border: 1px solid rgba(255, 255, 255, 0.1);
      }

      .shopify-match-image {
        width: 200px;
        height: 200px;
        border-radius: 12px;
        overflow: hidden;
        flex-shrink: 0;
        background: rgba(0,0,0,0.2);
      }

      .shopify-match-image img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .shopify-match-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
      }

      .shopify-match-title {
        color: #fff;
        font-size: 24px;
        font-weight: 700;
        margin: 0 0 8px;
      }

      .shopify-match-price {
        color: #f9cb00;
        font-size: 28px;
        font-weight: 700;
        margin: 0 0 16px;
      }

      .shopify-match-btn {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        background: #f9cb00;
        color: #1a1a2e;
        padding: 14px 28px;
        border-radius: 10px;
        text-decoration: none;
        font-weight: 700;
        font-size: 15px;
        transition: all 0.2s ease;
        width: fit-content;
      }

      .shopify-match-btn:hover {
        background: #e6b800;
        transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(249, 203, 0, 0.3);
      }

      .shopify-match-unavailable {
        color: #f87171;
        font-weight: 600;
        font-size: 14px;
      }

      .shopify-match-note {
        color: rgba(255, 255, 255, 0.5);
        font-size: 13px;
        margin: 12px 0 0;
      }

      .shopify-related {
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        padding-top: 30px;
      }

      .shopify-related-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
      }

      .shopify-related-title {
        color: #fff;
        font-size: 18px;
        font-weight: 600;
        margin: 0;
      }

      .shopify-related-link {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: #f9cb00;
        text-decoration: none;
        font-size: 14px;
        font-weight: 600;
      }

      .shopify-related-link:hover {
        text-decoration: underline;
      }

      .shopify-related-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 16px;
      }

      .shopify-related-card {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 12px;
        overflow: hidden;
        text-decoration: none;
        transition: all 0.2s ease;
        border: 1px solid rgba(255, 255, 255, 0.08);
      }

      .shopify-related-card:hover {
        transform: translateY(-4px);
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(249, 203, 0, 0.3);
      }

      .shopify-related-image {
        aspect-ratio: 1;
        overflow: hidden;
        background: rgba(0,0,0,0.2);
      }

      .shopify-related-image img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.3s ease;
      }

      .shopify-related-card:hover .shopify-related-image img {
        transform: scale(1.05);
      }

      .shopify-related-info {
        padding: 12px;
      }

      .shopify-related-name {
        color: #fff;
        font-size: 13px;
        font-weight: 600;
        margin: 0 0 6px;
        line-height: 1.3;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .shopify-related-price {
        color: #f9cb00;
        font-size: 14px;
        font-weight: 700;
      }

      .shopify-match-empty {
        text-align: center;
        padding: 40px 20px;
      }

      .shopify-match-empty h3 {
        color: #fff;
        font-size: 22px;
        margin: 0 0 8px;
      }

      .shopify-match-empty p {
        color: rgba(255, 255, 255, 0.7);
        margin: 0 0 20px;
      }

      @media (max-width: 768px) {
        .shopify-match-section {
          padding: 30px 16px;
        }

        .shopify-match-card {
          flex-direction: column;
          padding: 16px;
        }

        .shopify-match-image {
          width: 100%;
          height: 200px;
        }

        .shopify-match-title {
          font-size: 20px;
        }

        .shopify-match-price {
          font-size: 24px;
        }

        .shopify-match-btn {
          width: 100%;
          justify-content: center;
          padding: 14px 20px;
        }

        .shopify-related-grid {
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }

        .shopify-related-header {
          flex-direction: column;
          align-items: flex-start;
          gap: 10px;
        }
      }
    `;

    document.head.appendChild(styles);
  }

  // Insert section into page
  function insertSection(section) {
    // Remove existing section if present
    const existing = document.getElementById('shopify-match-section');
    if (existing) existing.remove();

    // Also remove old sections
    const oldSection = document.getElementById('shopify-products-section');
    if (oldSection) oldSection.remove();
    const oldTile = document.getElementById('shopify-tile-section');
    if (oldTile) oldTile.remove();

    // Find best insertion point - before footer
    const footer = document.querySelector('footer, .footer, .section_footer, [class*="footer"]');
    if (footer) {
      footer.parentNode.insertBefore(section, footer);
      return;
    }

    // Try before closing body scripts
    const scripts = document.querySelectorAll('body > script');
    if (scripts.length > 0) {
      scripts[0].parentNode.insertBefore(section, scripts[0]);
      return;
    }

    // Fallback to end of body
    document.body.appendChild(section);
  }

  // Main initialization
  async function init() {
    if (isInitialized) return;
    isInitialized = true;

    // Check if we're on a product page
    const category = getProductCategory();
    if (!category) {
return;
    }

    // Get current product name
    const productName = getProductName();
// Add styles
    addStyles();

    let matchedProduct = null;
    let relatedProducts = [];

    // For countertops, fetch from the samples collection
    if (category === 'countertops') {
      const samples = await fetchCountertopSamples();

      if (samples && samples.length > 0) {
        matchedProduct = findMatchingProduct(samples, productName);
        relatedProducts = findRelatedProducts(samples, matchedProduct, 6);

        if (matchedProduct) {
} else {
}
      }
    } else {
      // For tile/flooring, fetch all products
      const products = await fetchAllProducts();

      if (products && products.length > 0) {
        matchedProduct = findMatchingProduct(products, productName);
        relatedProducts = findRelatedProducts(products, matchedProduct, 6);
      }
    }

    // Create and insert section
    const section = createMatchSection(matchedProduct, relatedProducts, category);
    insertSection(section);
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for debugging
  window.ShopifyProducts = {
    getProductName,
    getProductCategory,
    findMatch: async (name) => {
      const samples = await fetchCountertopSamples();
      return findMatchingProduct(samples, name);
    },
    listSamples: async () => {
      const samples = await fetchCountertopSamples();
      return samples.map(s => s.node.title);
    },
    refresh: () => {
      isInitialized = false;
      init();
    }
  };

})();
