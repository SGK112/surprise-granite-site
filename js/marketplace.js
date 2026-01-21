/**
 * SURPRISE GRANITE - MARKETPLACE
 * Supabase-powered Slab & Remnant Marketplace with Location Features
 * Version: 2.0
 */

(function() {
  'use strict';

  // Supabase configuration
  const SUPABASE_URL = 'https://ypeypgwsycxcagncgdur.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwZXlwZ3dzeWN4Y2FnbmNnZHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTQ4MjMsImV4cCI6MjA4MzMzMDgyM30.R13pNv2FDtGhfeu7gUcttYNrQAbNYitqR4FIq3O2-ME';

  // Arizona city coordinates for distance calculation
  const CITY_COORDINATES = {
    'Surprise, AZ': { lat: 33.6292, lng: -112.3679 },
    'Phoenix, AZ': { lat: 33.4484, lng: -112.0740 },
    'Scottsdale, AZ': { lat: 33.4942, lng: -111.9261 },
    'Glendale, AZ': { lat: 33.5387, lng: -112.1860 },
    'Peoria, AZ': { lat: 33.5806, lng: -112.2374 },
    'Mesa, AZ': { lat: 33.4152, lng: -111.8315 },
    'Tempe, AZ': { lat: 33.4255, lng: -111.9400 },
    'Chandler, AZ': { lat: 33.3062, lng: -111.8413 },
    'Gilbert, AZ': { lat: 33.3528, lng: -111.7890 },
    'Goodyear, AZ': { lat: 33.4353, lng: -112.3577 },
    'Buckeye, AZ': { lat: 33.3703, lng: -112.5838 },
    'Avondale, AZ': { lat: 33.4356, lng: -112.3496 },
    'Queen Creek, AZ': { lat: 33.2487, lng: -111.6343 },
    'Fountain Hills, AZ': { lat: 33.6117, lng: -111.7174 },
    'Cave Creek, AZ': { lat: 33.8331, lng: -111.9507 }
  };

  // State
  let listings = [];
  let filteredListings = [];
  let currentView = 'grid';
  let selectedListing = null;
  let userLocation = null;
  let selectedStone = null;
  let stoneFilter = null;

  // DOM Elements
  let gridContainer;
  let searchInput;
  let locationFilter;
  let materialFilter;
  let typeFilter;
  let sortFilter;
  let resultsCount;
  let loadingEl;
  let emptyEl;
  let quoteModal;
  let locationBtn;

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    // Cache DOM elements
    gridContainer = document.getElementById('marketplace-grid');
    searchInput = document.getElementById('marketplace-search');
    locationFilter = document.getElementById('filter-location');
    materialFilter = document.getElementById('filter-material');
    typeFilter = document.getElementById('filter-type');
    sortFilter = document.getElementById('filter-sort');
    resultsCount = document.getElementById('results-count');
    loadingEl = document.getElementById('marketplace-loading');
    emptyEl = document.getElementById('marketplace-empty');
    quoteModal = document.getElementById('quote-modal');
    locationBtn = document.getElementById('use-location-btn');

    // Set up event listeners
    setupEventListeners();

    // Initialize stone filter
    initStoneFilter();

    // Load listings
    loadListings();

    // Check for saved location preference
    checkSavedLocation();
  }

  function initStoneFilter() {
    const container = document.getElementById('stone-filter-container');
    if (!container || typeof StoneFilter === 'undefined') return;

    stoneFilter = new StoneFilter(container, {
      placeholder: 'Filter by stone...',
      onChange: function(stoneSlug) {
        selectedStone = stoneSlug;
        filterListings();
      }
    });
  }

  function setupEventListeners() {
    // Search
    if (searchInput) {
      searchInput.addEventListener('input', debounce(filterListings, 300));
    }

    // Filters
    if (locationFilter) {
      locationFilter.addEventListener('change', filterListings);
    }
    if (materialFilter) {
      materialFilter.addEventListener('change', filterListings);
    }
    if (typeFilter) {
      typeFilter.addEventListener('change', filterListings);
    }
    if (sortFilter) {
      sortFilter.addEventListener('change', filterListings);
    }

    // Location button
    if (locationBtn) {
      locationBtn.addEventListener('click', handleLocationClick);
    }

    // View toggle
    const gridViewBtn = document.getElementById('view-grid');
    const listViewBtn = document.getElementById('view-list');

    if (gridViewBtn) {
      gridViewBtn.addEventListener('click', () => setView('grid'));
    }
    if (listViewBtn) {
      listViewBtn.addEventListener('click', () => setView('list'));
    }

    // Quote modal
    if (quoteModal) {
      quoteModal.addEventListener('click', (e) => {
        if (e.target === quoteModal) {
          closeQuoteModal();
        }
      });

      const closeBtn = quoteModal.querySelector('.quote-modal-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', closeQuoteModal);
      }

      const quoteForm = document.getElementById('quote-form');
      if (quoteForm) {
        quoteForm.addEventListener('submit', handleQuoteSubmit);
      }
    }

    // Escape key to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && quoteModal?.classList.contains('active')) {
        closeQuoteModal();
      }
    });
  }

  // ===== GEOLOCATION =====
  function handleLocationClick() {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    // Toggle off if already active
    if (locationBtn.classList.contains('active')) {
      userLocation = null;
      locationBtn.classList.remove('active');
      locationBtn.querySelector('span').textContent = 'Near Me';
      localStorage.removeItem('marketplace_location');
      filterListings();
      return;
    }

    // Request location
    locationBtn.classList.add('loading');
    locationBtn.disabled = true;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        userLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };

        // Find nearest city
        const nearestCity = findNearestCity(userLocation);

        locationBtn.classList.remove('loading');
        locationBtn.classList.add('active');
        locationBtn.disabled = false;
        locationBtn.querySelector('span').textContent = nearestCity ? nearestCity.split(',')[0] : 'Located';

        // Save to localStorage
        localStorage.setItem('marketplace_location', JSON.stringify(userLocation));

        // Set sort to nearest and filter
        if (sortFilter) {
          sortFilter.value = 'nearest';
        }
        filterListings();
      },
      (error) => {
        locationBtn.classList.remove('loading');
        locationBtn.disabled = false;

        let message = 'Unable to get your location. ';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message += 'Please enable location access in your browser settings.';
            break;
          case error.POSITION_UNAVAILABLE:
            message += 'Location information is unavailable.';
            break;
          case error.TIMEOUT:
            message += 'The request timed out.';
            break;
        }
        alert(message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000 // 5 minutes cache
      }
    );
  }

  function checkSavedLocation() {
    const saved = localStorage.getItem('marketplace_location');
    if (saved) {
      try {
        userLocation = JSON.parse(saved);
        const nearestCity = findNearestCity(userLocation);
        if (locationBtn) {
          locationBtn.classList.add('active');
          locationBtn.querySelector('span').textContent = nearestCity ? nearestCity.split(',')[0] : 'Located';
        }
      } catch (e) {
        localStorage.removeItem('marketplace_location');
      }
    }
  }

  function findNearestCity(coords) {
    let nearest = null;
    let minDistance = Infinity;

    for (const [city, cityCoords] of Object.entries(CITY_COORDINATES)) {
      const distance = calculateDistance(coords.lat, coords.lng, cityCoords.lat, cityCoords.lng);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = city;
      }
    }

    return nearest;
  }

  function calculateDistance(lat1, lon1, lat2, lon2) {
    // Haversine formula for distance in miles
    const R = 3959; // Earth's radius in miles
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  function toRad(deg) {
    return deg * (Math.PI / 180);
  }

  function getListingDistance(listing) {
    if (!userLocation || !listing.location) return null;

    const cityCoords = CITY_COORDINATES[listing.location];
    if (!cityCoords) return null;

    return calculateDistance(userLocation.lat, userLocation.lng, cityCoords.lat, cityCoords.lng);
  }

  // ===== DATA LOADING =====
  async function loadListings() {
    showLoading(true);

    try {
      // Fetch from stone_listings table with seller info from sg_users
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/stone_listings?status=eq.active&select=*,seller:sg_users(id,full_name,company_name,phone,email)&order=created_at.desc`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch listings');
      }

      const rawListings = await response.json();

      // Transform to consistent format
      listings = rawListings.map(listing => ({
        id: listing.id,
        title: listing.title,
        description: listing.description,
        material_type: listing.material_type,
        category: 'remnants', // stone_listings are remnants
        price: listing.price,
        dimensions: {
          length: listing.dimensions ? parseInt(listing.dimensions.split('x')[0]) : null,
          width: listing.dimensions ? parseInt(listing.dimensions.split('x')[1]) : null,
          thickness: listing.thickness
        },
        images: [listing.image_url, listing.image_url_2, listing.image_url_3, listing.image_url_4].filter(Boolean),
        location: listing.city && listing.state ? `${listing.city}, ${listing.state}` : null,
        quantity: listing.quantity,
        created_at: listing.created_at,
        views: listing.views,
        // Stone/Color info
        stone_slug: listing.stone_slug,
        color: listing.color,
        color_tags: listing.color_tags || [],
        primary_color: listing.primary_color || listing.stone_slug,
        // Seller info
        seller: listing.seller,
        show_phone: listing.show_phone,
        show_email: listing.show_email,
        contact_form_only: listing.contact_form_only,
        user_id: listing.user_id
      }));

      filteredListings = [...listings];

      populateFilters();
      filterListings(); // This will calculate distances and render
      updateStats();
    } catch (error) {
      console.error('Error loading listings:', error);
      showError('Unable to load listings. Please try again later.');
    } finally {
      showLoading(false);
    }
  }

  function populateFilters() {
    // Materials
    if (materialFilter) {
      const materials = [...new Set(listings.map(l => l.material_type).filter(Boolean))];
      materialFilter.innerHTML = '<option value="">All Materials</option>';
      materials.sort().forEach(material => {
        const option = document.createElement('option');
        option.value = material;
        option.textContent = formatMaterial(material);
        materialFilter.appendChild(option);
      });
    }

    // Locations - dynamically add from listings
    if (locationFilter) {
      const locations = [...new Set(listings.map(l => l.location).filter(Boolean))];
      locationFilter.innerHTML = '<option value="">All Locations</option>';
      locations.sort().forEach(location => {
        const option = document.createElement('option');
        option.value = location;
        option.textContent = location.replace(', AZ', '');
        locationFilter.appendChild(option);
      });
    }
  }

  function filterListings() {
    const searchTerm = searchInput?.value.toLowerCase() || '';
    const location = locationFilter?.value || '';
    const material = materialFilter?.value || '';
    const type = typeFilter?.value || '';
    const sort = sortFilter?.value || 'newest';

    filteredListings = listings.filter(listing => {
      // Search filter
      const matchesSearch = !searchTerm ||
        listing.title?.toLowerCase().includes(searchTerm) ||
        listing.description?.toLowerCase().includes(searchTerm) ||
        listing.material_type?.toLowerCase().includes(searchTerm) ||
        listing.location?.toLowerCase().includes(searchTerm);

      // Location filter
      const matchesLocation = !location || listing.location === location;

      // Material filter
      const matchesMaterial = !material || listing.material_type === material;

      // Type filter (uses category column)
      const matchesType = !type || listing.category === type;

      // Stone filter
      let matchesStone = true;
      if (selectedStone) {
        const listingStones = listing.color_tags || [];
        // Match if selected stone is in listing's stone tags or matches the listing's stone_slug
        matchesStone = listingStones.includes(selectedStone) ||
                       listing.stone_slug === selectedStone ||
                       listing.primary_color === selectedStone;
      }

      return matchesSearch && matchesLocation && matchesMaterial && matchesType && matchesStone;
    });

    // Calculate distances for all listings
    filteredListings.forEach(listing => {
      listing._distance = getListingDistance(listing);
    });

    // Sort
    filteredListings.sort((a, b) => {
      switch (sort) {
        case 'newest':
          return new Date(b.created_at) - new Date(a.created_at);
        case 'oldest':
          return new Date(a.created_at) - new Date(b.created_at);
        case 'price-low':
          return (a.price || 0) - (b.price || 0);
        case 'price-high':
          return (b.price || 0) - (a.price || 0);
        case 'nearest':
          // Sort by distance if we have user location
          if (a._distance === null && b._distance === null) return 0;
          if (a._distance === null) return 1;
          if (b._distance === null) return -1;
          return a._distance - b._distance;
        default:
          return 0;
      }
    });

    renderListings();
    updateResultsCount();
  }

  function renderListings() {
    if (!gridContainer) return;

    if (filteredListings.length === 0) {
      gridContainer.innerHTML = '';
      showEmpty(true);
      return;
    }

    showEmpty(false);

    gridContainer.innerHTML = filteredListings.map(listing => createListingCard(listing)).join('');

    // Add click handlers to quote buttons
    gridContainer.querySelectorAll('.listing-card-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const listingId = e.target.dataset.listingId;
        const listing = filteredListings.find(l => l.id === listingId);
        if (listing) {
          openQuoteModal(listing);
        }
      });
    });

    // Add favorite button handlers
    gridContainer.querySelectorAll('.listing-card-favorite').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        btn.classList.toggle('active');
      });
    });
  }

  function createListingCard(listing) {
    // Handle images array - use first image or placeholder
    const imageUrl = (listing.images && listing.images.length > 0 && listing.images[0])
      ? listing.images[0]
      : getPlaceholderImage(listing.material_type);
    const placeholderUrl = getPlaceholderImage(listing.material_type);
    const dimensions = listing.dimensions || {};
    const isNew = isNewListing(listing.created_at);
    const distanceHtml = (listing._distance !== null && listing._distance !== undefined)
      ? `<div class="listing-distance">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
             <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
             <circle cx="12" cy="10" r="3"/>
           </svg>
           ${listing._distance.toFixed(1)} mi away
         </div>`
      : '';

    return `
      <div class="listing-card" data-listing-id="${listing.id}">
        <div class="listing-card-image">
          <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(listing.title)}" loading="lazy" onerror="handleImageError(this, '${escapeHtml(placeholderUrl)}')">
          <div class="listing-card-badges">
            <span class="listing-badge listing-badge-type">${escapeHtml(formatListingType(listing.category))}</span>
            ${isNew ? '<span class="listing-badge listing-badge-new">New</span>' : ''}
          </div>
          <button class="listing-card-favorite" aria-label="Add to favorites">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </button>
        </div>
        <div class="listing-card-body">
          <div class="listing-card-material">${escapeHtml(formatMaterial(listing.material_type))}</div>
          <h3 class="listing-card-title">${escapeHtml(listing.title)}</h3>
          <p class="listing-card-desc">${escapeHtml(listing.description || 'No description available')}</p>
          <div class="listing-card-details">
            ${dimensions.length && dimensions.width ? `
              <div class="listing-detail">
                <svg class="listing-detail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                </svg>
                <span class="listing-detail-text">${dimensions.length}" x ${dimensions.width}"</span>
              </div>
            ` : ''}
            ${dimensions.thickness ? `
              <div class="listing-detail">
                <svg class="listing-detail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                </svg>
                <span class="listing-detail-text">${dimensions.thickness} cm</span>
              </div>
            ` : ''}
            ${listing.location ? `
              <div class="listing-detail">
                <svg class="listing-detail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                <span class="listing-detail-text">${escapeHtml(listing.location.replace(', AZ', ''))}</span>
              </div>
            ` : ''}
            ${listing.quantity && listing.quantity > 1 ? `
              <div class="listing-detail">
                <svg class="listing-detail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="2" y="7" width="20" height="14" rx="2"/>
                  <path d="M16 3h-4l-2 4h8l-2-4z"/>
                </svg>
                <span class="listing-detail-text">${listing.quantity} available</span>
              </div>
            ` : ''}
          </div>
          ${distanceHtml}
          ${renderStoneTags(listing)}
          ${listing.seller ? `
            <div class="listing-seller">
              <svg class="listing-seller-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <span class="listing-seller-name">${escapeHtml(listing.seller.company_name || listing.seller.full_name || 'Local Seller')}</span>
            </div>
          ` : ''}
          <div class="listing-card-footer">
            <div class="listing-card-price">
              ${formatPrice(listing.price)}
            </div>
            <div class="listing-card-actions">
              ${listing.show_phone && listing.seller?.phone ? `
                <a href="tel:${listing.seller.phone}" class="listing-action-btn listing-action-call" title="Call seller">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                </a>
              ` : ''}
              ${listing.show_email && listing.seller?.email ? `
                <a href="mailto:${listing.seller.email}?subject=Inquiry about ${encodeURIComponent(listing.title)}" class="listing-action-btn listing-action-email" title="Email seller">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="2" y="4" width="20" height="16" rx="2"/>
                    <path d="m22 6-10 7L2 6"/>
                  </svg>
                </a>
              ` : ''}
              <button class="listing-card-btn" data-listing-id="${listing.id}">Contact Seller</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ===== QUOTE MODAL =====
  function openQuoteModal(listing) {
    selectedListing = listing;

    if (!quoteModal) return;

    // Update modal content
    const listingImage = quoteModal.querySelector('.quote-modal-listing-image');
    const listingTitle = quoteModal.querySelector('.quote-modal-listing-title');
    const listingPrice = quoteModal.querySelector('.quote-modal-listing-price');
    const listingSeller = quoteModal.querySelector('.quote-modal-listing-seller');

    if (listingImage) {
      listingImage.src = (listing.images && listing.images.length > 0)
        ? listing.images[0]
        : getPlaceholderImage(listing.material_type);
      listingImage.alt = listing.title;
    }
    if (listingTitle) {
      listingTitle.textContent = listing.title;
    }
    if (listingPrice) {
      listingPrice.textContent = formatPrice(listing.price) + (listing.location ? ` - ${listing.location}` : '');
    }
    if (listingSeller && listing.seller) {
      const sellerName = listing.seller.company_name || listing.seller.full_name || 'Local Seller';
      listingSeller.textContent = `Sold by: ${sellerName}`;
      listingSeller.style.display = 'block';
    } else if (listingSeller) {
      listingSeller.style.display = 'none';
    }

    // Reset form
    const form = document.getElementById('quote-form');
    if (form) {
      form.reset();
      form.style.display = 'flex';
    }

    // Hide success message
    const successEl = quoteModal.querySelector('.quote-form-success');
    if (successEl) {
      successEl.style.display = 'none';
    }

    // Show modal
    quoteModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeQuoteModal() {
    if (!quoteModal) return;

    quoteModal.classList.remove('active');
    document.body.style.overflow = '';
    selectedListing = null;
  }

  async function handleQuoteSubmit(e) {
    e.preventDefault();

    if (!selectedListing) return;

    const form = e.target;
    const submitBtn = form.querySelector('.quote-form-submit');
    const originalText = submitBtn.textContent;

    // Get form data - uses listing_inquiries table schema
    const formData = {
      listing_id: selectedListing.id,
      sender_name: form.querySelector('[name="name"]').value.trim(),
      sender_email: form.querySelector('[name="email"]').value.trim(),
      sender_phone: form.querySelector('[name="phone"]')?.value.trim() || null,
      message: form.querySelector('[name="message"]')?.value.trim() || 'Interested in this listing'
    };

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.sender_email)) {
      alert('Please enter a valid email address.');
      return;
    }

    // Disable button
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    try {
      // Submit to listing_inquiries table
      const response = await fetch(`${SUPABASE_URL}/rest/v1/listing_inquiries`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send message');
      }

      // Increment inquiry count on the listing
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_listing_inquiries`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ listing_id: selectedListing.id })
        });
      } catch (e) {
        // Non-critical, ignore
      }

      // Show success
      form.style.display = 'none';
      const successEl = quoteModal.querySelector('.quote-form-success');
      if (successEl) {
        successEl.style.display = 'block';
      }

      // Close modal after delay
      setTimeout(() => {
        closeQuoteModal();
      }, 3000);

    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  }

  // ===== UI HELPERS =====
  function setView(view) {
    currentView = view;

    const gridBtn = document.getElementById('view-grid');
    const listBtn = document.getElementById('view-list');

    if (gridBtn && listBtn) {
      gridBtn.classList.toggle('active', view === 'grid');
      listBtn.classList.toggle('active', view === 'list');
    }

    if (gridContainer) {
      gridContainer.classList.toggle('list-view', view === 'list');
    }
  }

  function updateResultsCount() {
    if (resultsCount) {
      const locationText = userLocation ? ' near you' : '';
      resultsCount.innerHTML = `Showing <strong>${filteredListings.length}</strong> of <strong>${listings.length}</strong> listings${locationText}`;
    }
  }

  function updateStats() {
    const totalListingsEl = document.getElementById('stat-listings');
    const totalMaterialsEl = document.getElementById('stat-materials');

    if (totalListingsEl) {
      totalListingsEl.textContent = listings.length || '0';
    }

    if (totalMaterialsEl) {
      const materials = new Set(listings.map(l => l.material_type).filter(Boolean));
      totalMaterialsEl.textContent = materials.size || '0';
    }
  }

  function showLoading(show) {
    if (loadingEl) {
      loadingEl.style.display = show ? 'block' : 'none';
    }
    if (gridContainer && show) {
      gridContainer.innerHTML = '';
    }
  }

  function showEmpty(show) {
    if (emptyEl) {
      emptyEl.style.display = show ? 'block' : 'none';
    }
  }

  function showError(message) {
    if (gridContainer) {
      gridContainer.innerHTML = `
        <div class="marketplace-error" style="text-align: center; padding: 60px 20px; grid-column: 1 / -1;">
          <p style="color: var(--sg-text-muted); margin-bottom: 20px;">${escapeHtml(message)}</p>
          <button class="sg-btn sg-btn-primary" onclick="location.reload()">Try Again</button>
        </div>
      `;
    }
  }

  // ===== UTILITY FUNCTIONS =====

  // Format stone slug to readable name
  function formatStoneSlug(slug) {
    if (!slug) return '';
    return slug
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
      .replace(/Quartz$/, '')
      .replace(/Granite$/, '')
      .trim();
  }

  function renderStoneTags(listing) {
    const stones = listing.color_tags || [];
    if (stones.length === 0) {
      // Show the primary stone_slug if available
      if (listing.stone_slug) {
        return `
          <div class="listing-card-stones">
            <span class="listing-stone-tag">
              <span class="listing-stone-tag-name">${escapeHtml(formatStoneSlug(listing.stone_slug))}</span>
            </span>
          </div>
        `;
      }
      return '';
    }

    const tags = stones.slice(0, 2).map(slug => `
      <span class="listing-stone-tag">
        <span class="listing-stone-tag-name">${escapeHtml(formatStoneSlug(slug))}</span>
      </span>
    `).join('');

    const moreCount = stones.length > 2 ? `<span class="listing-stone-tag">+${stones.length - 2}</span>` : '';

    return `<div class="listing-card-stones">${tags}${moreCount}</div>`;
  }

  function formatPrice(price) {
    if (!price && price !== 0) return 'Contact for Price';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(price);
  }

  function formatMaterial(material) {
    if (!material) return 'Unknown';
    return material
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  function formatListingType(category) {
    switch (category) {
      case 'slabs': return 'Full Slab';
      case 'remnants': return 'Remnant';
      case 'bundles': return 'Bundle';
      default: return category || 'Slab';
    }
  }

  function isNewListing(createdAt) {
    if (!createdAt) return false;
    const created = new Date(createdAt);
    const now = new Date();
    const diffDays = (now - created) / (1000 * 60 * 60 * 24);
    return diffDays <= 7;
  }

  function getPlaceholderImage(material) {
    // Use actual product images from the site as placeholders
    const placeholders = {
      granite: 'https://uploads-ssl.webflow.com/6456ce4476abb2d4f9fbad10/6456ce4476abb22cfafbb7e4_msi-surfaces-surprise-granite-new-river-close-up.jpg',
      marble: 'https://uploads-ssl.webflow.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2c5e9fbc6d9_silestone-surprise-granite-bianco-calacatta-quartz-close-up.jpeg',
      quartz: 'https://uploads-ssl.webflow.com/6456ce4476abb2d4f9fbad10/6456ce4576abb21a6cfbc44d_Msi-surfaces-surprise-quartz-calacatta-abezzo-quartz-slab.jpg',
      quartzite: 'https://uploads-ssl.webflow.com/6456ce4476abb2d4f9fbad10/6456ce4576abb21a6cfbc44d_Msi-surfaces-surprise-quartz-calacatta-abezzo-quartz-slab.jpg',
      dekton: 'https://uploads-ssl.webflow.com/6456ce4476abb2d4f9fbad10/6456ce4576abb294bffbc2da_dekton-surprise-granite-laurent-quartz-close-up.jpeg',
      default: 'https://uploads-ssl.webflow.com/6456ce4476abb2d4f9fbad10/6456ce4576abb21a6cfbc44d_Msi-surfaces-surprise-quartz-calacatta-abezzo-quartz-slab.jpg'
    };
    return placeholders[material?.toLowerCase()] || placeholders.default;
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Expose functions for external use
  window.SurpriseMarketplace = {
    refresh: loadListings,
    filter: filterListings,
    setView: setView,
    getUserLocation: () => userLocation,
    clearLocation: () => {
      userLocation = null;
      localStorage.removeItem('marketplace_location');
      if (locationBtn) {
        locationBtn.classList.remove('active');
        locationBtn.querySelector('span').textContent = 'Near Me';
      }
      filterListings();
    },
    clearStone: () => {
      selectedStone = null;
      if (stoneFilter) {
        stoneFilter.reset();
      }
      filterListings();
    },
    getSelectedStone: () => selectedStone
  };

})();

// Global image error handler (outside IIFE so it's accessible from HTML onerror)
function handleImageError(img, placeholderUrl) {
  // Prevent infinite loop - only try placeholder once
  if (img.dataset.errorHandled) {
    // Both original and placeholder failed, show nice fallback
    img.style.display = 'none';
    const parent = img.parentElement;
    parent.classList.add('image-error');

    // Add fallback icon and text
    if (!parent.querySelector('.image-fallback')) {
      const fallback = document.createElement('div');
      fallback.className = 'image-fallback';
      fallback.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <path d="m21 15-5-5L5 21"/>
        </svg>
        <span>Photo Coming Soon</span>
      `;
      parent.appendChild(fallback);
    }
    return;
  }

  img.dataset.errorHandled = 'true';
  img.src = placeholderUrl;
}
