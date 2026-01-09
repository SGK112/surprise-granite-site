/**
 * Surprise Granite - Remnant Count Widget
 * Shows "X people have this stone" on product pages
 * Links to the marketplace filtered by this stone
 */

(function() {
  // Supabase config
  const SUPABASE_URL = 'https://ypeypgwsycxcagncgdur.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwZXlwZ3dzeWN4Y2FnbmNnZHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTQ4MjMsImV4cCI6MjA4MzMzMDgyM30.R13pNv2FDtGhfeu7gUcttYNrQAbNYitqR4FIq3O2-ME';

  // Get stone slug from URL path
  function getStoneSlug() {
    const path = window.location.pathname;
    const match = path.match(/\/countertops\/([^\/]+)/);
    return match ? match[1] : null;
  }

  // Create and inject the remnant count widget
  async function initRemnantCount() {
    const slug = getStoneSlug();
    if (!slug) return;

    try {
      // Query Supabase for active listings with this stone slug
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/stone_listings?stone_slug=eq.${encodeURIComponent(slug)}&status=eq.active&select=id`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
          }
        }
      );

      if (!response.ok) return;

      const listings = await response.json();
      const count = listings.length;

      // Only show if there are listings
      if (count === 0) return;

      // Find insertion point - after specs-grid or color swatches
      const specsGrid = document.querySelector('.specs-grid');
      const colorSwatches = document.querySelector('.color-swatches');
      const insertAfter = specsGrid || colorSwatches;

      if (!insertAfter) return;

      // Create the widget
      const widget = document.createElement('div');
      widget.className = 'sg-remnant-widget';
      widget.innerHTML = `
        <div class="sg-remnant-content">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
          </svg>
          <div class="sg-remnant-text">
            <span class="sg-remnant-count">${count} ${count === 1 ? 'person has' : 'people have'} this stone available</span>
            <span class="sg-remnant-cta">View remnants in the marketplace</span>
          </div>
          <svg class="sg-remnant-arrow" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </div>
      `;

      // Make it a link
      widget.style.cursor = 'pointer';
      widget.onclick = () => {
        window.location.href = `/remnants/?stone=${encodeURIComponent(slug)}`;
      };

      // Insert after the target element
      insertAfter.parentNode.insertBefore(widget, insertAfter.nextSibling);

      // Inject styles
      if (!document.getElementById('sg-remnant-styles')) {
        const style = document.createElement('style');
        style.id = 'sg-remnant-styles';
        style.textContent = `
          .sg-remnant-widget {
            background: linear-gradient(135deg, #1a1a2e 0%, #2d2d44 100%);
            border: 1px solid rgba(249, 203, 0, 0.3);
            border-radius: 12px;
            padding: 16px 20px;
            margin: 20px 0;
            transition: all 0.3s ease;
          }

          .sg-remnant-widget:hover {
            border-color: rgba(249, 203, 0, 0.6);
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
          }

          .sg-remnant-content {
            display: flex;
            align-items: center;
            gap: 14px;
          }

          .sg-remnant-content > svg:first-child {
            color: #f9cb00;
            flex-shrink: 0;
          }

          .sg-remnant-text {
            flex: 1;
          }

          .sg-remnant-count {
            display: block;
            color: #ffffff;
            font-size: 14px;
            font-weight: 600;
          }

          .sg-remnant-cta {
            display: block;
            color: #f9cb00;
            font-size: 12px;
            margin-top: 2px;
          }

          .sg-remnant-arrow {
            color: #f9cb00;
            opacity: 0.7;
            transition: all 0.2s ease;
            flex-shrink: 0;
          }

          .sg-remnant-widget:hover .sg-remnant-arrow {
            opacity: 1;
            transform: translateX(4px);
          }

          @media (max-width: 600px) {
            .sg-remnant-widget {
              padding: 14px 16px;
            }

            .sg-remnant-content > svg:first-child {
              width: 18px;
              height: 18px;
            }

            .sg-remnant-count {
              font-size: 13px;
            }
          }
        `;
        document.head.appendChild(style);
      }

    } catch (err) {
      console.error('Remnant count error:', err);
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRemnantCount);
  } else {
    initRemnantCount();
  }
})();
