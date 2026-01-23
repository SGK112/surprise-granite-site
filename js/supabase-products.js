/**
 * Supabase Products - Replaces Shopyflow with Supabase data
 * Loads products from shopify_products table
 */

(function() {
  'use strict';

  // Use centralized config
  const config = window.SG_CONFIG || {};
  const SUPABASE_URL = config.SUPABASE_URL || 'https://ypeypgwsycxcagncgdur.supabase.co';
  const SUPABASE_KEY = config.SUPABASE_ANON_KEY || '';

  let supabaseClient = null;
  let allProducts = [];

  // Initialize
  async function init() {
    // Wait for Supabase
    let attempts = 0;
    while (!window.supabase && attempts < 50) {
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }

    if (!window.supabase) {
      console.error('Supabase not loaded');
      return;
    }

    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    await loadProducts();

    // Replace Shopyflow content
    replaceShopyflowProducts();

    // Intercept any remaining Shopify links
    interceptLinks();
  }

  // Load products
  async function loadProducts() {
    try {
      const { data, error } = await supabaseClient
        .from('shopify_products')
        .select('*')
        .eq('status', 'active')
        .eq('show_on_website', true)
        .order('name');

      if (error) throw error;
      allProducts = data || [];
      console.log('Loaded', allProducts.length, 'products from Supabase');
    } catch (err) {
      console.error('Error loading products:', err);
    }
  }

  // Format price
  function formatPrice(price) {
    return '$' + (parseFloat(price) || 0).toFixed(2);
  }

  // Replace Shopyflow-rendered products with Supabase data
  function replaceShopyflowProducts() {
    // Find all product cards/links that point to Shopify
    const productLinks = document.querySelectorAll('a[href*="store.surprisegranite.com/products"], a[href*="myshopify.com/products"], a[href*="/products/"]');

    productLinks.forEach(link => {
      try {
        const url = new URL(link.href, window.location.origin);
        const pathParts = url.pathname.split('/products/');
        if (pathParts.length > 1) {
          const handle = pathParts[1].split('?')[0].split('/')[0];
          const product = allProducts.find(p => p.handle === handle);

          if (product) {
            // Update the link to our product page
            link.href = '/product/?id=' + product.id;

            // Update price if visible
            const priceEl = link.querySelector('[class*="price"], .product-card_current-price, .sf-price');
            if (priceEl) {
              priceEl.textContent = formatPrice(product.price);
            }

            // Update compare price
            const comparePriceEl = link.querySelector('[class*="compare"], .product-card_compare-price');
            if (comparePriceEl && product.compare_at_price) {
              comparePriceEl.textContent = formatPrice(product.compare_at_price);
            }
          } else {
            // Product not found - link to search or handle lookup
            link.href = '/product/?handle=' + handle;
          }
        }
      } catch (e) {
        // Invalid URL, skip
      }
    });

    // Also update any "Add to Cart" or "View" buttons within product cards
    const viewButtons = document.querySelectorAll('a[href*="store.surprisegranite.com"], a[href*="myshopify.com"]');
    viewButtons.forEach(btn => {
      try {
        const url = new URL(btn.href);
        if (url.pathname.includes('/products/')) {
          const handle = url.pathname.split('/products/')[1]?.split('?')[0];
          const product = allProducts.find(p => p.handle === handle);
          if (product) {
            btn.href = '/product/?id=' + product.id;
          } else if (handle) {
            btn.href = '/product/?handle=' + handle;
          }
        }
      } catch (e) {}
    });

    console.log('Updated', productLinks.length, 'product links');
  }

  // Intercept clicks on any remaining Shopify links
  function interceptLinks() {
    document.addEventListener('click', function(e) {
      const link = e.target.closest('a');
      if (!link || !link.href) return;

      try {
        const url = new URL(link.href);

        // Check for Shopify domains
        if (url.hostname === 'store.surprisegranite.com' ||
            url.hostname.includes('myshopify.com') ||
            url.hostname.includes('shopify.com')) {

          if (url.pathname.includes('/products/')) {
            e.preventDefault();
            e.stopPropagation();

            const handle = url.pathname.split('/products/')[1]?.split('?')[0];
            const product = allProducts.find(p => p.handle === handle);

            if (product) {
              window.location.href = '/product/?id=' + product.id;
            } else if (handle) {
              window.location.href = '/product/?handle=' + handle;
            }
          }
          return;
        }

        // Check for /products/ on same domain
        if (url.pathname.startsWith('/products/') && url.hostname === window.location.hostname) {
          e.preventDefault();
          const handle = url.pathname.replace('/products/', '').split('?')[0];
          const product = allProducts.find(p => p.handle === handle);
          if (product) {
            window.location.href = '/product/?id=' + product.id;
          } else {
            window.location.href = '/product/?handle=' + handle;
          }
        }
      } catch (err) {}
    }, true);
  }

  // Add to cart
  window.addProductToCart = function(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    const cartItem = {
      id: product.id,
      handle: product.handle,
      name: product.name,
      price: parseFloat(product.price) || 0,
      image: product.image_url,
      quantity: 1
    };

    if (typeof window.addToCart === 'function') {
      window.addToCart(cartItem);
    } else {
      const cart = JSON.parse(localStorage.getItem('sg_cart') || '[]');
      const idx = cart.findIndex(item => item.id === productId);
      if (idx >= 0) {
        cart[idx].quantity += 1;
      } else {
        cart.push(cartItem);
      }
      localStorage.setItem('sg_cart', JSON.stringify(cart));
    }

    showToast(product.name + ' added to cart!');
  };

  function showToast(message) {
    let toast = document.getElementById('supabase-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'supabase-toast';
      toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#1a1a2e;color:#fff;padding:12px 24px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:10000;transition:opacity 0.3s;';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 3000);
  }

  // Expose API
  window.SupabaseProducts = {
    getProducts: () => allProducts,
    getProduct: (id) => allProducts.find(p => p.id === id),
    getProductByHandle: (handle) => allProducts.find(p => p.handle === handle),
    formatPrice
  };

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
