/**
 * SURPRISE GRANITE - SHOPIFY CART & CHECKOUT
 * Uses Shopify Storefront API for cart management and checkout
 * Handles taxes and shipping automatically through Shopify
 */

(function() {
  'use strict';

  const SHOPIFY_STORE = 'surprise-granite.myshopify.com';
  const STOREFRONT_TOKEN = '17a4557623df390a5a866c7640ec021a';
  const CART_STORAGE_KEY = 'sg_shopify_cart_id';

  // GraphQL helper
  async function shopifyFetch(query, variables = {}) {
    const response = await fetch(`https://${SHOPIFY_STORE}/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN,
      },
      body: JSON.stringify({ query, variables })
    });
    return response.json();
  }

  // Cart class
  class ShopifyCart {
    constructor() {
      this.cartId = localStorage.getItem(CART_STORAGE_KEY);
      this.cart = null;
      this.listeners = [];
    }

    // Subscribe to cart changes
    onChange(callback) {
      this.listeners.push(callback);
    }

    // Notify listeners
    _notify() {
      this.listeners.forEach(cb => cb(this.cart));
      this._updateBadge();
    }

    // Update cart badge in nav
    _updateBadge() {
      const count = this.getItemCount();
      document.querySelectorAll('.cart-count, .unified-nav-cart-badge, #cart-count, #account-cart-count').forEach(el => {
        el.textContent = count;
        el.dataset.count = count;
        el.style.display = count > 0 ? 'flex' : 'none';
      });
    }

    // Get item count
    getItemCount() {
      if (!this.cart || !this.cart.lines) return 0;
      return this.cart.lines.edges.reduce((sum, edge) => sum + edge.node.quantity, 0);
    }

    // Get cart total
    getTotal() {
      if (!this.cart) return 0;
      return parseFloat(this.cart.cost?.totalAmount?.amount || 0);
    }

    // Get cart items
    getItems() {
      if (!this.cart || !this.cart.lines) return [];
      return this.cart.lines.edges.map(edge => ({
        id: edge.node.id,
        variantId: edge.node.merchandise.id,
        productId: edge.node.merchandise.product.id,
        title: edge.node.merchandise.product.title,
        variantTitle: edge.node.merchandise.title,
        quantity: edge.node.quantity,
        price: parseFloat(edge.node.merchandise.price.amount),
        image: edge.node.merchandise.image?.url || edge.node.merchandise.product.featuredImage?.url,
        handle: edge.node.merchandise.product.handle
      }));
    }

    // Initialize cart - load existing or create new
    async init() {
      if (this.cartId) {
        try {
          await this._fetchCart();
          if (this.cart) {
            this._notify();
            return;
          }
        } catch (e) {
          console.warn('Could not fetch existing cart:', e);
        }
      }
      // Cart doesn't exist or failed, clear storage
      localStorage.removeItem(CART_STORAGE_KEY);
      this.cartId = null;
      this._notify();
    }

    // Fetch existing cart
    async _fetchCart() {
      const query = `
        query getCart($cartId: ID!) {
          cart(id: $cartId) {
            id
            checkoutUrl
            cost {
              totalAmount { amount currencyCode }
              subtotalAmount { amount currencyCode }
              totalTaxAmount { amount currencyCode }
            }
            lines(first: 100) {
              edges {
                node {
                  id
                  quantity
                  merchandise {
                    ... on ProductVariant {
                      id
                      title
                      price { amount currencyCode }
                      image { url altText }
                      product {
                        id
                        title
                        handle
                        featuredImage { url }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const result = await shopifyFetch(query, { cartId: this.cartId });
      if (result.data?.cart) {
        this.cart = result.data.cart;
      } else {
        this.cart = null;
        this.cartId = null;
      }
    }

    // Create a new cart with items
    async _createCart(lines = []) {
      const query = `
        mutation cartCreate($input: CartInput!) {
          cartCreate(input: $input) {
            cart {
              id
              checkoutUrl
              cost {
                totalAmount { amount currencyCode }
                subtotalAmount { amount currencyCode }
              }
              lines(first: 100) {
                edges {
                  node {
                    id
                    quantity
                    merchandise {
                      ... on ProductVariant {
                        id
                        title
                        price { amount currencyCode }
                        image { url altText }
                        product {
                          id
                          title
                          handle
                          featuredImage { url }
                        }
                      }
                    }
                  }
                }
              }
            }
            userErrors { field message }
          }
        }
      `;

      const result = await shopifyFetch(query, { input: { lines } });

      if (result.data?.cartCreate?.cart) {
        this.cart = result.data.cartCreate.cart;
        this.cartId = this.cart.id;
        localStorage.setItem(CART_STORAGE_KEY, this.cartId);
        return true;
      }

      if (result.data?.cartCreate?.userErrors?.length) {
        console.error('Cart creation errors:', result.data.cartCreate.userErrors);
      }
      return false;
    }

    // Add item to cart
    async addItem(variantId, quantity = 1) {
      // If no cart exists, create one
      if (!this.cartId) {
        const success = await this._createCart([{ merchandiseId: variantId, quantity }]);
        if (success) {
          this._notify();
          return true;
        }
        return false;
      }

      // Add to existing cart
      const query = `
        mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
          cartLinesAdd(cartId: $cartId, lines: $lines) {
            cart {
              id
              checkoutUrl
              cost {
                totalAmount { amount currencyCode }
                subtotalAmount { amount currencyCode }
              }
              lines(first: 100) {
                edges {
                  node {
                    id
                    quantity
                    merchandise {
                      ... on ProductVariant {
                        id
                        title
                        price { amount currencyCode }
                        image { url altText }
                        product {
                          id
                          title
                          handle
                          featuredImage { url }
                        }
                      }
                    }
                  }
                }
              }
            }
            userErrors { field message }
          }
        }
      `;

      const result = await shopifyFetch(query, {
        cartId: this.cartId,
        lines: [{ merchandiseId: variantId, quantity }]
      });

      if (result.data?.cartLinesAdd?.cart) {
        this.cart = result.data.cartLinesAdd.cart;
        this._notify();
        return true;
      }

      // Cart might be expired, try creating new one
      if (result.data?.cartLinesAdd?.userErrors?.length) {
        console.warn('Cart add error, creating new cart');
        localStorage.removeItem(CART_STORAGE_KEY);
        this.cartId = null;
        return this.addItem(variantId, quantity);
      }

      return false;
    }

    // Update item quantity
    async updateQuantity(lineId, quantity) {
      if (!this.cartId) return false;

      const query = `
        mutation cartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
          cartLinesUpdate(cartId: $cartId, lines: $lines) {
            cart {
              id
              checkoutUrl
              cost {
                totalAmount { amount currencyCode }
                subtotalAmount { amount currencyCode }
              }
              lines(first: 100) {
                edges {
                  node {
                    id
                    quantity
                    merchandise {
                      ... on ProductVariant {
                        id
                        title
                        price { amount currencyCode }
                        image { url altText }
                        product {
                          id
                          title
                          handle
                          featuredImage { url }
                        }
                      }
                    }
                  }
                }
              }
            }
            userErrors { field message }
          }
        }
      `;

      const result = await shopifyFetch(query, {
        cartId: this.cartId,
        lines: [{ id: lineId, quantity }]
      });

      if (result.data?.cartLinesUpdate?.cart) {
        this.cart = result.data.cartLinesUpdate.cart;
        this._notify();
        return true;
      }
      return false;
    }

    // Remove item from cart
    async removeItem(lineId) {
      if (!this.cartId) return false;

      const query = `
        mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
          cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
            cart {
              id
              checkoutUrl
              cost {
                totalAmount { amount currencyCode }
                subtotalAmount { amount currencyCode }
              }
              lines(first: 100) {
                edges {
                  node {
                    id
                    quantity
                    merchandise {
                      ... on ProductVariant {
                        id
                        title
                        price { amount currencyCode }
                        image { url altText }
                        product {
                          id
                          title
                          handle
                          featuredImage { url }
                        }
                      }
                    }
                  }
                }
              }
            }
            userErrors { field message }
          }
        }
      `;

      const result = await shopifyFetch(query, {
        cartId: this.cartId,
        lineIds: [lineId]
      });

      if (result.data?.cartLinesRemove?.cart) {
        this.cart = result.data.cartLinesRemove.cart;
        this._notify();
        return true;
      }
      return false;
    }

    // Clear cart
    async clear() {
      localStorage.removeItem(CART_STORAGE_KEY);
      this.cartId = null;
      this.cart = null;
      this._notify();
    }

    // Go to Shopify checkout
    checkout() {
      if (this.cart?.checkoutUrl) {
        window.location.href = this.cart.checkoutUrl;
      } else {
        console.error('No checkout URL available');
        alert('Your cart is empty or checkout is not available.');
      }
    }

    // Get checkout URL
    getCheckoutUrl() {
      return this.cart?.checkoutUrl || null;
    }
  }

  // Create global instance
  const cart = new ShopifyCart();

  // Initialize on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => cart.init());
  } else {
    cart.init();
  }

  // Expose globally
  window.ShopifyCart = cart;

  // Legacy support - map old SgCart API to new ShopifyCart
  window.SgCart = {
    addToCart: async function(item) {
      // item has: id, name, price, image, quantity, variant
      // We need the Shopify variant ID
      if (item.variantId) {
        return cart.addItem(item.variantId, item.quantity || 1);
      }
      console.warn('SgCart.addToCart requires variantId for Shopify checkout');
      return false;
    },
    getCart: () => cart.getItems(),
    getTotal: () => cart.getTotal(),
    getCount: () => cart.getItemCount(),
    clear: () => cart.clear(),
    checkout: () => cart.checkout()
  };

})();
