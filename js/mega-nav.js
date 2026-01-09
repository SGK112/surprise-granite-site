/**
 * Mega Navigation Component
 * Image-rich, functional navigation for Surprise Granite
 */

(function() {
  'use strict';

  // Product data for mega menus - using category-appropriate images
  const products = {
    countertops: [
      { name: 'Quartz', desc: 'Premium engineered stone', href: '/materials/countertops/quartz-countertops', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb21a6cfbc44d_Msi-surfaces-surprise-quartz-calacatta-abezzo-quartz-slab.avif' },
      { name: 'Granite', desc: 'Natural stone beauty', href: '/materials/countertops/granite-countertops', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4476abb22cfafbb7e4_msi-surfaces-surprise-granite-new-river-close-up.avif' },
      { name: 'Marble', desc: 'Timeless elegance', href: '/materials/countertops/marble-countertops', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4476abb25831fbb345_Cambria_Surprise_Granite_Oakleigh_Slab.avif' },
      { name: 'Porcelain', desc: 'Ultra-compact surfaces', href: '/materials/countertops/porcelain-countertops', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb294bffbc2da_dekton-surprise-granite-laurent-quartz-close-up.avif' }
    ],
    tile: [
      { name: 'Porcelain Tile', desc: 'Durable & versatile', href: '/materials/all-tile', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6531e4b87153315974bccb0a_tub-to-shower-conversions-az_thumb.avif' },
      { name: 'Ceramic Tile', desc: 'Classic & affordable', href: '/materials/all-tile', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2a6cdfbc46c_Radianz-quartz-surprise-granite-calacatta-victory-close-up.avif' },
      { name: 'Mosaic Tile', desc: 'Decorative accents', href: '/materials/all-tile', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2af91fbc4ad_Radianz-quartz-surprise-granite-alluring-close-up.avif' },
      { name: 'Backsplash', desc: 'Kitchen & bath', href: '/materials/all-tile', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2d8c0fbc6fb_msi-surfaces-quartz-surprise-granite-calacatta-miraggio-gold-close-up.avif' }
    ],
    flooring: [
      { name: 'Luxury Vinyl', desc: 'Waterproof & stylish', href: '/materials/flooring', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb27db9fbccd8_msi-surfaces-surprise-granite-xl-trecento-white-ocean-luxury-vinyl-tile-close-up.avif' },
      { name: 'Hardwood Look', desc: 'Natural wood aesthetic', href: '/materials/flooring', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb26667fbcb95_msi-surfaces-surprise-granite-quarzo-taj-luxury-vinyl-planks-close-up.avif' },
      { name: 'Stone Look', desc: 'Elegant stone patterns', href: '/materials/flooring', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb201fafbccd6_msi-surfaces-surprise-granite-xl-trecento-mountains-gray-luxury-vinyl-planks-close-up.avif' },
      { name: 'Marble Look', desc: 'Premium vinyl tile', href: '/materials/flooring', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2ebb6fbccd4_msi-surfaces-surprise-granite-xl-trecento-carrara-avell-luxury-vinyl-tile-close-up.avif' }
    ],
    services: [
      { name: 'Kitchen Remodeling', desc: 'Complete kitchen renovations', href: '/services/home/kitchen-remodeling-arizona', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/65dfb7f28b5c4c03249bf4db_69647337_157661692014463_2667270912306059733_n-96da2b9c2f6e427a8fc021d5a5382031.jpg' },
      { name: 'Bathroom Remodeling', desc: 'Modern bathroom upgrades', href: '/services/home/bathroom-remodeling-arizona', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6531e4b87153315974bccb0a_tub-to-shower-conversions-az_thumb.avif' },
      { name: 'Countertop Install', desc: 'Professional installation', href: '/services/home/kitchen-remodeling-arizona', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/651c69d8e6c77c995d99b4d7_arizona-countertop-installation-service_thumbnail.avif' },
      { name: 'Financing', desc: 'Easy payment options', href: '/services/home-remodeling-financing-options-in-arizona', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/652324e7840a341086726be1_sink-installation-service-arizona-2.avif' }
    ]
  };

  // Create mega menu HTML for a category
  function createMegaMenu(category, title, allLink) {
    const items = products[category];
    if (!items) return '';

    let itemsHtml = items.map(item => `
      <a href="${item.href}" class="mega-menu-item">
        <img src="${item.img}" alt="${item.name}" loading="lazy">
        <div class="mega-menu-item-content">
          <h4>${item.name}</h4>
          <p>${item.desc}</p>
        </div>
      </a>
    `).join('');

    return `
      <div class="mega-menu">
        <div class="mega-menu-inner">
          <div class="mega-menu-header">
            <h3>Browse ${title}</h3>
            <a href="${allLink}">View All ${title} &rarr;</a>
          </div>
          <div class="mega-menu-grid">
            ${itemsHtml}
          </div>
          <div class="mega-menu-featured">
            <img src="https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/651c69d8e6c77c995d99b4d7_arizona-countertop-installation-service_thumbnail.avif" alt="Free Estimate">
            <div class="mega-menu-featured-content">
              <h4>Free In-Home Estimate</h4>
              <p>Get a personalized quote with our expert design consultation. No obligation!</p>
              <a href="/get-a-free-estimate" class="btn">Schedule Now</a>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Create the navigation HTML
  function createNavHTML() {
    return `
    <div class="mega-nav">
      <!-- Top Bar -->
      <div class="mega-nav-top">
        <div class="container">
          <a href="/get-a-free-estimate" class="promo">
            <strong>Free In-Home Estimates</strong> - Book your consultation today!
          </a>
          <div class="mega-nav-top-right">
            <a href="tel:+16028333189" class="phone">
              <svg viewBox="0 0 24 24"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H5.03C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>
              (602) 833-3189
            </a>
            <a href="/account">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
              Account
            </a>
          </div>
        </div>
      </div>

      <!-- Main Navigation -->
      <div class="mega-nav-main">
        <div class="container">
          <a href="/" class="mega-nav-logo">
            <img src="https://cdn.prod.website-files.com/6456ce4476abb25581fbad0c/6456ce4476abb27beffbb16a_Surprise%20Granite%20Transparent%20Dark%20Wide.svg" alt="Surprise Granite">
            <span>Marble & Quartz</span>
          </a>

          <div class="mega-nav-search">
            <input type="text" placeholder="Search countertops, tile, flooring..." id="megaNavSearch">
            <button type="button" onclick="handleSearch()">
              <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            </button>
          </div>

          <div class="mega-nav-actions">
            <a href="/shop">
              <svg viewBox="0 0 24 24"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>
              Shop
            </a>
            <a href="/get-a-free-estimate" class="btn-estimate">Free Estimate</a>
          </div>

          <button class="mega-nav-mobile-toggle" onclick="toggleMobileNav()">
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </div>

      <!-- Bottom Navigation with Mega Menus -->
      <div class="mega-nav-bottom" id="megaNavBottom">
        <div class="container">
          <ul class="mega-nav-links">
            <li>
              <a href="/materials/all-countertops">Countertops</a>
              ${createMegaMenu('countertops', 'Countertops', '/materials/all-countertops')}
            </li>
            <li>
              <a href="/materials/all-tile">Tile</a>
              ${createMegaMenu('tile', 'Tile', '/materials/all-tile')}
            </li>
            <li>
              <a href="/materials/flooring">Flooring</a>
              ${createMegaMenu('flooring', 'Flooring', '/materials/flooring')}
            </li>
            <li>
              <a href="/services/home/kitchen-remodeling-arizona">Services</a>
              ${createMegaMenu('services', 'Services', '/services/home/kitchen-remodeling-arizona')}
            </li>
            <li><a href="/shop">Shop</a></li>
            <li><a href="/tools">Tools</a></li>
            <li><a href="/company/project-gallery">Gallery</a></li>
            <li><a href="/contact-us">Contact</a></li>
          </ul>
        </div>
      </div>
    </div>
    `;
  }

  // Search handler
  window.handleSearch = function() {
    const searchInput = document.getElementById('megaNavSearch');
    const query = searchInput ? searchInput.value.trim() : '';
    if (query) {
      window.location.href = '/materials/all-countertops?search=' + encodeURIComponent(query);
    }
  };

  // Mobile nav toggle
  window.toggleMobileNav = function() {
    const navBottom = document.getElementById('megaNavBottom');
    if (navBottom) {
      navBottom.classList.toggle('mobile-open');
    }
  };

  // Initialize navigation
  function init() {
    // Add class to body for padding
    document.body.classList.add('mega-nav-active');

    // Insert new navigation at the very beginning of body
    const navHTML = createNavHTML();
    document.body.insertAdjacentHTML('afterbegin', navHTML);

    // Handle search on Enter key
    const searchInput = document.getElementById('megaNavSearch');
    if (searchInput) {
      searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          handleSearch();
        }
      });
    }

    // Check auth state and update button
    if (typeof supabase !== 'undefined') {
      supabase.auth.getSession().then(({ data: { session } }) => {
        const authLink = document.getElementById('authLink');
        if (authLink && session) {
          authLink.innerHTML = `
            <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
            My Account
          `;
        }
      });
    }

    // Mobile menu - handle dropdowns
    document.querySelectorAll('.mega-nav-links > li').forEach(li => {
      li.addEventListener('click', function(e) {
        if (window.innerWidth <= 768) {
          const megaMenu = this.querySelector('.mega-menu');
          if (megaMenu) {
            e.preventDefault();
            this.classList.toggle('active');
          }
        }
      });
    });
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
