/**
 * Sample Order Integration
 * Enables one-click sample ordering from countertop pages
 */

(function() {
  'use strict';

  // Sample product data
  const SAMPLE_PRICE = 25.00;
  const SAMPLE_IMAGE = 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb21a6cfbc44d_Msi-surfaces-surprise-quartz-calacatta-abezzo-quartz-slab.avif';

  // Convert Order Sample links to direct cart add
  function convertSampleLinks() {
    const sampleLinks = document.querySelectorAll('a[href*="countertop-samples"], .btn-sample, [class*="sample"]');

    sampleLinks.forEach(link => {
      if (link.dataset.sampleConverted) return;
      link.dataset.sampleConverted = 'true';

      // Get the stone name from the page or nearby elements
      const pageTitle = document.querySelector('h1, .product-title, .stone-name');
      const stoneName = pageTitle ? pageTitle.textContent.trim() : 'Stone Sample';

      // Get stone image from page
      const stoneImage = document.querySelector('.product-image img, .stone-image img, .main-image img');
      const imageUrl = stoneImage ? stoneImage.src : SAMPLE_IMAGE;

      // Update link behavior
      link.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();

        // Wait for cart to be available
        if (!window.SgCart) {
          window.location.href = '/shop/?collection=countertop-samples';
          return;
        }

        const sampleName = `${stoneName} - Sample`;
        const sampleId = sampleName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        // Add to cart
        window.SgCart.addToCart({
          id: sampleId,
          name: sampleName,
          price: SAMPLE_PRICE,
          image: imageUrl,
          quantity: 1,
          category: 'samples'
        });

        // Show success and open cart drawer
        if (window.openCartDrawer) {
          window.openCartDrawer();
        }

        // Visual feedback
        const originalText = link.textContent;
        link.textContent = 'Added to Cart!';
        link.style.background = '#22c55e';
        link.style.color = '#fff';

        setTimeout(() => {
          link.textContent = originalText;
          link.style.background = '';
          link.style.color = '';
        }, 2000);
      });
    });
  }

  // Add sample order panel to countertop pages
  function addSamplePanel() {
    // Only add on countertop detail pages
    if (!window.location.pathname.includes('/countertops/') ||
        window.location.pathname === '/countertops/' ||
        window.location.pathname === '/countertops/index.html') {
      return;
    }

    // Check if panel already exists
    if (document.querySelector('.sg-sample-panel')) return;

    // Get stone info
    const pageTitle = document.querySelector('h1, .product-title, .stone-name');
    const stoneName = pageTitle ? pageTitle.textContent.trim() : 'This Stone';

    const stoneImage = document.querySelector('.product-image img, .stone-image img, .main-image img, .hero-image img');
    const imageUrl = stoneImage ? stoneImage.src : SAMPLE_IMAGE;

    // Find good insertion point
    const insertAfter = document.querySelector('.product-actions, .cta-section, .product-details, .stone-details');

    if (!insertAfter) return;

    // Create panel
    const panel = document.createElement('div');
    panel.className = 'sg-sample-panel';
    panel.innerHTML = `
      <div class="sg-sample-panel-inner">
        <div class="sg-sample-icon">
          <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l4.59-4.58L18 11l-6 6z"/></svg>
        </div>
        <div class="sg-sample-info">
          <h4>Want to see ${stoneName} in person?</h4>
          <p>Order a sample delivered to your door for just $${SAMPLE_PRICE.toFixed(2)}</p>
        </div>
        <button class="sg-sample-add-btn" id="sgAddSampleBtn">
          <svg viewBox="0 0 24 24"><path d="M11 9h2V6h3V4h-3V1h-2v3H8v2h3v3zm-4 9c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>
          Add Sample to Cart
        </button>
      </div>
    `;

    insertAfter.parentNode.insertBefore(panel, insertAfter.nextSibling);

    // Bind click
    document.getElementById('sgAddSampleBtn').addEventListener('click', function() {
      if (!window.SgCart) {
        window.location.href = '/shop/?collection=countertop-samples';
        return;
      }

      const sampleName = `${stoneName} - Sample`;
      const sampleId = sampleName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      window.SgCart.addToCart({
        id: sampleId,
        name: sampleName,
        price: SAMPLE_PRICE,
        image: imageUrl,
        quantity: 1,
        category: 'samples'
      });

      if (window.openCartDrawer) {
        window.openCartDrawer();
      }

      this.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Added!';
      this.style.background = '#22c55e';

      setTimeout(() => {
        this.innerHTML = '<svg viewBox="0 0 24 24"><path d="M11 9h2V6h3V4h-3V1h-2v3H8v2h3v3zm-4 9c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg> Add Sample to Cart';
        this.style.background = '';
      }, 2000);
    });
  }

  // Add styles
  function addStyles() {
    if (document.getElementById('sg-sample-styles')) return;

    const style = document.createElement('style');
    style.id = 'sg-sample-styles';
    style.textContent = `
      .sg-sample-panel {
        background: linear-gradient(135deg, #f8f9fa 0%, #e8ebee 100%);
        border-radius: 16px;
        padding: 24px;
        margin: 30px 0;
        border: 2px solid #e5e5e5;
      }

      .sg-sample-panel-inner {
        display: flex;
        align-items: center;
        gap: 20px;
        flex-wrap: wrap;
      }

      .sg-sample-icon {
        width: 56px;
        height: 56px;
        background: linear-gradient(135deg, #f9cb00 0%, #e5b800 100%);
        border-radius: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .sg-sample-icon svg {
        width: 28px;
        height: 28px;
        fill: #1a2b3c;
      }

      .sg-sample-info {
        flex: 1;
        min-width: 200px;
      }

      .sg-sample-info h4 {
        font-size: 18px;
        font-weight: 700;
        color: #1a2b3c;
        margin: 0 0 6px;
      }

      .sg-sample-info p {
        font-size: 14px;
        color: #666;
        margin: 0;
      }

      .sg-sample-add-btn {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 16px 28px;
        background: linear-gradient(135deg, #f9cb00 0%, #e5b800 100%);
        color: #1a2b3c;
        border: none;
        border-radius: 12px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        white-space: nowrap;
      }

      .sg-sample-add-btn:hover {
        transform: translateY(-3px);
        box-shadow: 0 10px 30px rgba(249, 203, 0, 0.4);
      }

      .sg-sample-add-btn svg {
        width: 20px;
        height: 20px;
        fill: currentColor;
      }

      @media (max-width: 600px) {
        .sg-sample-panel-inner {
          flex-direction: column;
          text-align: center;
        }

        .sg-sample-add-btn {
          width: 100%;
          justify-content: center;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Initialize
  function init() {
    addStyles();
    convertSampleLinks();
    addSamplePanel();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
