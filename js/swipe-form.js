/**
 * Swipe Form - Popup Modal Lead Capture
 * Smart algorithm that adapts questions based on previous answers
 */

(function() {
  'use strict';

  // Configuration - use centralized config
  const config = window.SG_CONFIG || {};
  const API_URL = config.API_URL || 'https://surprise-granite-email-api.onrender.com';
  const SUPABASE_URL = config.SUPABASE_URL || 'https://ypeypgwsycxcagncgdur.supabase.co';
  const SUPABASE_KEY = config.SUPABASE_ANON_KEY || '';

  // State
  let currentStep = 0;
  let formData = {
    category: '',
    details: {},
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    zip: '',
    images: [],
    message: '',
    source: 'swipe-form',
    sourcePage: window.location.href
  };

  // Categories with SVG icons
  const categories = [
    {
      id: 'countertops',
      name: 'Countertops',
      desc: 'Granite, quartz, marble & quartzite',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="6" width="20" height="4" rx="1"/><path d="M4 10v8h16v-8"/><path d="M8 14h8"/></svg>'
    },
    {
      id: 'kitchen',
      name: 'Kitchen Remodel',
      desc: 'Full kitchen renovation',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><circle cx="7" cy="7" r="1"/><circle cx="12" cy="7" r="1"/></svg>'
    },
    {
      id: 'bathroom',
      name: 'Bathroom Remodel',
      desc: 'Vanities, showers & fixtures',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12h16a1 1 0 011 1v3a4 4 0 01-4 4H7a4 4 0 01-4-4v-3a1 1 0 011-1z"/><path d="M6 12V5a2 2 0 012-2h1"/><circle cx="8" cy="8" r="1"/></svg>'
    },
    {
      id: 'flooring',
      name: 'Flooring',
      desc: 'Tile, LVP & hardwood',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>'
    },
    {
      id: 'tile',
      name: 'Tile & Backsplash',
      desc: 'Walls, showers & backsplashes',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>'
    },
    {
      id: 'cabinets',
      name: 'Cabinets',
      desc: 'Kitchen & bathroom cabinets',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18"/><path d="M12 3v18"/><circle cx="8" cy="7.5" r="1"/><circle cx="16" cy="7.5" r="1"/><circle cx="8" cy="16.5" r="1"/><circle cx="16" cy="16.5" r="1"/></svg>'
    }
  ];

  // ============================================
  // SMART QUESTION ALGORITHM
  // Questions adapt based on category selection
  // ============================================
  const categoryQuestions = {
    kitchen: {
      title: "Tell us about your kitchen project",
      subtitle: "Select all that apply",
      questions: [
        {
          id: 'scope',
          label: 'What do you need?',
          type: 'multi',
          options: [
            { id: 'countertops', label: 'Countertops', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="8" width="20" height="4" rx="1"/><path d="M4 12v6h16v-6"/></svg>' },
            { id: 'cabinets', label: 'Cabinets', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 12h18M12 4v16"/><circle cx="8" cy="8" r="1"/><circle cx="16" cy="8" r="1"/></svg>' },
            { id: 'backsplash', label: 'Backsplash', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="12" rx="1"/><path d="M3 9h18M9 3v12M15 3v12"/></svg>' },
            { id: 'flooring', label: 'Flooring', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>' },
            { id: 'full-remodel', label: 'Full Remodel', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg>' }
          ]
        },
        {
          id: 'material',
          label: 'Preferred countertop material?',
          type: 'single',
          options: [
            { id: 'quartz', label: 'Quartz' },
            { id: 'granite', label: 'Granite' },
            { id: 'marble', label: 'Marble' },
            { id: 'quartzite', label: 'Quartzite' },
            { id: 'not-sure', label: 'Not sure yet' }
          ]
        },
        {
          id: 'timeline',
          label: 'When do you want to start?',
          type: 'single',
          options: [
            { id: 'asap', label: 'As soon as possible' },
            { id: '1-month', label: 'Within 1 month' },
            { id: '1-3-months', label: '1-3 months' },
            { id: '3-6-months', label: '3-6 months' },
            { id: 'planning', label: 'Just planning' }
          ]
        }
      ]
    },
    bathroom: {
      title: "Tell us about your bathroom project",
      subtitle: "Select all that apply",
      questions: [
        {
          id: 'scope',
          label: 'What do you need?',
          type: 'multi',
          options: [
            { id: 'vanity', label: 'Vanity/Countertop', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="8" width="18" height="10" rx="2"/><path d="M8 8V6a4 4 0 018 0v2"/><circle cx="12" cy="13" r="2"/></svg>' },
            { id: 'shower', label: 'Shower/Tub', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4v16h16"/><path d="M4 10h12v10"/><circle cx="8" cy="6" r="2"/></svg>' },
            { id: 'tile', label: 'Tile & Flooring', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>' },
            { id: 'fixtures', label: 'Fixtures', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M12 12v8M8 20h8"/></svg>' },
            { id: 'full-remodel', label: 'Full Remodel', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>' }
          ]
        },
        {
          id: 'bathroom-type',
          label: 'Which bathroom?',
          type: 'single',
          options: [
            { id: 'master', label: 'Master Bath' },
            { id: 'guest', label: 'Guest Bath' },
            { id: 'half', label: 'Half Bath' },
            { id: 'multiple', label: 'Multiple' }
          ]
        },
        {
          id: 'timeline',
          label: 'When do you want to start?',
          type: 'single',
          options: [
            { id: 'asap', label: 'As soon as possible' },
            { id: '1-month', label: 'Within 1 month' },
            { id: '1-3-months', label: '1-3 months' },
            { id: 'planning', label: 'Just planning' }
          ]
        }
      ]
    },
    countertops: {
      title: "Tell us about your countertops",
      subtitle: "Help us understand your project",
      questions: [
        {
          id: 'location',
          label: 'Where are the countertops?',
          type: 'multi',
          options: [
            { id: 'kitchen', label: 'Kitchen', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/></svg>' },
            { id: 'bathroom', label: 'Bathroom', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12h16a1 1 0 011 1v3a4 4 0 01-4 4H7a4 4 0 01-4-4v-3a1 1 0 011-1z"/></svg>' },
            { id: 'island', label: 'Island', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="8" width="16" height="8" rx="1"/><path d="M8 16v4M16 16v4"/></svg>' },
            { id: 'outdoor', label: 'Outdoor', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>' },
            { id: 'bar', label: 'Bar/Entertainment', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2l4 6 4-6"/><path d="M12 8v8"/><path d="M8 22h8"/><path d="M10 16h4"/></svg>' }
          ]
        },
        {
          id: 'material',
          label: 'Preferred material?',
          type: 'single',
          options: [
            { id: 'quartz', label: 'Quartz' },
            { id: 'granite', label: 'Granite' },
            { id: 'marble', label: 'Marble' },
            { id: 'quartzite', label: 'Quartzite' },
            { id: 'not-sure', label: 'Not sure yet' }
          ]
        },
        {
          id: 'service',
          label: 'What service do you need?',
          type: 'single',
          options: [
            { id: 'replace', label: 'Replace existing' },
            { id: 'new-construction', label: 'New construction' },
            { id: 'repair', label: 'Repair/Refinish' }
          ]
        }
      ]
    },
    flooring: {
      title: "Tell us about your flooring project",
      subtitle: "Select all that apply",
      questions: [
        {
          id: 'rooms',
          label: 'Which rooms?',
          type: 'multi',
          options: [
            { id: 'kitchen', label: 'Kitchen', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/></svg>' },
            { id: 'bathroom', label: 'Bathroom', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12h16a1 1 0 011 1v3a4 4 0 01-4 4H7a4 4 0 01-4-4v-3a1 1 0 011-1z"/></svg>' },
            { id: 'living', label: 'Living Areas', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12h16a1 1 0 011 1v6H3v-6a1 1 0 011-1z"/><path d="M6 12V8a2 2 0 012-2h8a2 2 0 012 2v4"/></svg>' },
            { id: 'bedroom', label: 'Bedrooms', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 10v10h18V10"/><path d="M3 10l9-6 9 6"/><rect x="7" y="14" width="10" height="6"/></svg>' },
            { id: 'whole-house', label: 'Whole House', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>' }
          ]
        },
        {
          id: 'material',
          label: 'Preferred material?',
          type: 'single',
          options: [
            { id: 'tile', label: 'Tile' },
            { id: 'lvp', label: 'Luxury Vinyl (LVP)' },
            { id: 'hardwood', label: 'Hardwood' },
            { id: 'laminate', label: 'Laminate' },
            { id: 'not-sure', label: 'Not sure yet' }
          ]
        },
        {
          id: 'sqft',
          label: 'Approximate square footage?',
          type: 'single',
          options: [
            { id: 'under-500', label: 'Under 500 sq ft' },
            { id: '500-1000', label: '500-1,000 sq ft' },
            { id: '1000-2000', label: '1,000-2,000 sq ft' },
            { id: 'over-2000', label: 'Over 2,000 sq ft' },
            { id: 'not-sure', label: 'Not sure' }
          ]
        }
      ]
    },
    tile: {
      title: "Tell us about your tile project",
      subtitle: "Select all that apply",
      questions: [
        {
          id: 'location',
          label: 'Where is the tile going?',
          type: 'multi',
          options: [
            { id: 'backsplash', label: 'Kitchen Backsplash', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="12" rx="1"/><path d="M3 9h18M9 3v12M15 3v12"/></svg>' },
            { id: 'shower', label: 'Shower Walls', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4v16h16"/><path d="M4 10h12v10"/></svg>' },
            { id: 'floor', label: 'Floor Tile', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>' },
            { id: 'accent', label: 'Accent Wall', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 3v18M16 3v18"/></svg>' },
            { id: 'fireplace', label: 'Fireplace', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 21h18V8l-9-5-9 5v13z"/><path d="M9 21v-6a3 3 0 016 0v6"/></svg>' }
          ]
        },
        {
          id: 'style',
          label: 'Preferred tile style?',
          type: 'single',
          options: [
            { id: 'subway', label: 'Subway/Metro' },
            { id: 'mosaic', label: 'Mosaic' },
            { id: 'large-format', label: 'Large Format' },
            { id: 'natural-stone', label: 'Natural Stone' },
            { id: 'not-sure', label: 'Not sure yet' }
          ]
        },
        {
          id: 'timeline',
          label: 'When do you want to start?',
          type: 'single',
          options: [
            { id: 'asap', label: 'As soon as possible' },
            { id: '1-month', label: 'Within 1 month' },
            { id: '1-3-months', label: '1-3 months' },
            { id: 'planning', label: 'Just planning' }
          ]
        }
      ]
    },
    cabinets: {
      title: "Tell us about your cabinet project",
      subtitle: "Help us understand your needs",
      questions: [
        {
          id: 'location',
          label: 'Which cabinets?',
          type: 'multi',
          options: [
            { id: 'kitchen', label: 'Kitchen Cabinets', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><circle cx="7" cy="7" r="1"/></svg>' },
            { id: 'bathroom', label: 'Bathroom Vanity', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="10" width="16" height="10" rx="2"/><circle cx="12" cy="6" r="3"/></svg>' },
            { id: 'laundry', label: 'Laundry Room', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="13" r="5"/></svg>' },
            { id: 'garage', label: 'Garage Storage', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 21h18V9l-9-7-9 7v12z"/><rect x="7" y="13" width="10" height="8"/></svg>' }
          ]
        },
        {
          id: 'service',
          label: 'What do you need?',
          type: 'single',
          options: [
            { id: 'full-replace', label: 'Full cabinet replacement' },
            { id: 'reface', label: 'Cabinet refacing' },
            { id: 'doors-only', label: 'Replace doors only' },
            { id: 'add-cabinets', label: 'Add new cabinets' }
          ]
        },
        {
          id: 'timeline',
          label: 'When do you want to start?',
          type: 'single',
          options: [
            { id: 'asap', label: 'As soon as possible' },
            { id: '1-month', label: 'Within 1 month' },
            { id: '1-3-months', label: '1-3 months' },
            { id: 'planning', label: 'Just planning' }
          ]
        }
      ]
    }
  };

  // Initialize
  function init() {
    if (!document.querySelector('.swipe-form-container')) {
      createFormHTML();
    }
    bindEvents();
    updateProgress();
  }

  // Create form HTML
  function createFormHTML() {
    const container = document.createElement('div');
    container.className = 'swipe-form-container hidden';
    container.innerHTML = `
      <div class="swipe-form-card-wrapper">
        <div class="swipe-form-modal">
          <!-- Close Button -->
          <button class="swipe-form-close" onclick="SwipeForm.close()">&times;</button>

          <!-- Branded Logo -->
          <div class="swipe-form-logo">
            <div class="swipe-logo-icon">
              <svg viewBox="0 0 121 125" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M60.534,9.987l51.884,29.956v76.23H8.65V39.943L60.534,9.987m0-9.987L0,34.95v89.874H121.073V34.95L60.534,0Z" fill="#ffdb00"/>
                <path d="M122.416,65.093,69.456,34.06,61.3,39.547l52.466,30.539v69.9h8.65Z" transform="translate(-27.288 -15.162)" fill="#ffdb00"/>
                <path d="M75.038,151.845h-8.65V96.92L13.15,66.182,21.878,60.7l53.16,31.227Z" transform="translate(-5.854 -27.021)" fill="#ffdb00"/>
                <path d="M48.817,127.171,12.53,106.22v9.987l27.642,15.957v39.943h8.645Z" transform="translate(-5.578 -47.284)" fill="#ffdb00"/>
              </svg>
            </div>
            <div class="swipe-logo-text">
              <span class="swipe-logo-name">Surprise Granite</span>
              <span class="swipe-logo-tagline">Marble & Quartz</span>
            </div>
          </div>

          <!-- Header -->
          <div class="swipe-form-header">
            <span class="swipe-form-title">Get Your Free Estimate</span>
            <span class="swipe-form-step-indicator">Step <span id="swipe-current-step">1</span> of <span id="swipe-total-steps">5</span></span>
          </div>

          <!-- Progress Bar -->
          <div class="swipe-progress-bar">
            <div class="swipe-progress-fill" id="swipe-progress-fill"></div>
          </div>

          <!-- Step 1: Category Selection -->
          <div class="swipe-step active" data-step="0">
            <h2 class="swipe-step-title">What's your project?</h2>
            <p class="swipe-step-subtitle">Choose the option that best describes your project</p>

            <div class="swipe-category-list" id="swipe-category-list">
              ${categories.map(cat => `
                <button class="swipe-category-btn" data-category="${cat.id}" type="button">
                  <div class="swipe-category-icon">${cat.icon}</div>
                  <div class="swipe-category-text">
                    <div class="swipe-category-name">${cat.name}</div>
                    <div class="swipe-category-desc">${cat.desc}</div>
                  </div>
                </button>
              `).join('')}
            </div>

            <div class="swipe-nav-buttons">
              <button class="swipe-btn swipe-btn-next" id="swipe-btn-next-0" disabled onclick="SwipeForm.next()">Continue</button>
            </div>
          </div>

          <!-- Step 2: Dynamic Questions (populated based on category) -->
          <div class="swipe-step" data-step="1">
            <div id="swipe-dynamic-questions"></div>
            <div class="swipe-nav-buttons">
              <button class="swipe-btn swipe-btn-back" onclick="SwipeForm.prev()">Back</button>
              <button class="swipe-btn swipe-btn-next" id="swipe-btn-next-1" onclick="SwipeForm.next()">Continue</button>
            </div>
          </div>

          <!-- Step 3: Contact Info -->
          <div class="swipe-step" data-step="2">
            <h2 class="swipe-step-title">Your contact info</h2>
            <p class="swipe-step-subtitle">We'll reach out within 24 hours</p>

            <div class="swipe-input-group swipe-input-row">
              <div>
                <label class="swipe-input-label">First Name *</label>
                <input type="text" class="swipe-input" id="swipe-firstName" placeholder="John" autocomplete="given-name">
              </div>
              <div>
                <label class="swipe-input-label">Last Name *</label>
                <input type="text" class="swipe-input" id="swipe-lastName" placeholder="Smith" autocomplete="family-name">
              </div>
            </div>

            <div class="swipe-input-group">
              <label class="swipe-input-label">Email *</label>
              <input type="email" class="swipe-input" id="swipe-email" placeholder="john@example.com" autocomplete="email">
            </div>

            <div class="swipe-input-group swipe-input-row">
              <div>
                <label class="swipe-input-label">Phone *</label>
                <input type="tel" class="swipe-input" id="swipe-phone" placeholder="(480) 555-1234" autocomplete="tel">
              </div>
              <div>
                <label class="swipe-input-label">ZIP Code *</label>
                <input type="text" class="swipe-input" id="swipe-zip" placeholder="85374" maxlength="5" autocomplete="postal-code">
              </div>
            </div>

            <div class="swipe-nav-buttons">
              <button class="swipe-btn swipe-btn-back" onclick="SwipeForm.prev()">Back</button>
              <button class="swipe-btn swipe-btn-next" id="swipe-btn-next-2" disabled onclick="SwipeForm.next()">Continue</button>
            </div>
          </div>

          <!-- Step 4: Photo Upload -->
          <div class="swipe-step" data-step="3">
            <h2 class="swipe-step-title">Add project photos</h2>
            <p class="swipe-step-subtitle">Helps us give accurate estimates (optional)</p>

            <div class="swipe-upload-zone" id="swipe-upload-zone">
              <div class="swipe-upload-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <div class="swipe-upload-text">Tap to upload photos</div>
              <div class="swipe-upload-hint">JPG, PNG up to 10MB each</div>
              <input type="file" class="swipe-upload-input" id="swipe-upload-input" multiple accept="image/*">
            </div>

            <div class="swipe-preview-grid" id="swipe-preview-grid"></div>

            <div class="swipe-nav-buttons">
              <button class="swipe-btn swipe-btn-back" onclick="SwipeForm.prev()">Back</button>
              <button class="swipe-btn swipe-btn-next" onclick="SwipeForm.next()">Continue</button>
            </div>
          </div>

          <!-- Step 5: Message -->
          <div class="swipe-step" data-step="4">
            <h2 class="swipe-step-title">Project details</h2>
            <p class="swipe-step-subtitle">Any additional info helps</p>

            <div class="swipe-input-group">
              <label class="swipe-input-label">Tell us about your project</label>
              <textarea class="swipe-input swipe-textarea" id="swipe-message" placeholder="Dimensions, materials, timeline, budget..."></textarea>
            </div>

            <div class="swipe-nav-buttons">
              <button class="swipe-btn swipe-btn-back" onclick="SwipeForm.prev()">Back</button>
              <button class="swipe-btn swipe-btn-submit" id="swipe-btn-submit" onclick="SwipeForm.submit()">Submit Request</button>
            </div>
          </div>

          <!-- Success -->
          <div class="swipe-step" data-step="5">
            <div class="swipe-success-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <h2 class="swipe-success-title">Request Sent!</h2>
            <p class="swipe-success-message">Thank you! One of our experts will contact you within 24 hours.</p>
            <div class="swipe-success-actions">
              <a href="tel:+16028333189" class="swipe-btn swipe-btn-phone">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                </svg>
                Call (602) 833-3189
              </a>
              <button class="swipe-btn swipe-btn-close" onclick="SwipeForm.close()">Done</button>
            </div>
          </div>

        </div>
      </div>
    `;

    document.body.appendChild(container);
  }

  // ============================================
  // RENDER DYNAMIC QUESTIONS
  // Based on selected category
  // ============================================
  function renderDynamicQuestions() {
    const category = formData.category;
    const config = categoryQuestions[category];
    const container = document.getElementById('swipe-dynamic-questions');

    if (!config) {
      container.innerHTML = '<p>Please go back and select a category.</p>';
      return;
    }

    let html = `
      <h2 class="swipe-step-title">${config.title}</h2>
      <p class="swipe-step-subtitle">${config.subtitle}</p>
    `;

    config.questions.forEach((question, qIndex) => {
      html += `
        <div class="swipe-question-block" data-question="${question.id}">
          <label class="swipe-question-label">${question.label}</label>
          <div class="swipe-options-grid ${question.type === 'multi' ? 'multi-select' : 'single-select'} ${question.options[0].icon ? 'has-icons' : ''}">
      `;

      question.options.forEach(option => {
        const hasIcon = option.icon ? true : false;
        html += `
          <button type="button"
                  class="swipe-option-btn ${hasIcon ? 'with-icon' : ''}"
                  data-question="${question.id}"
                  data-option="${option.id}"
                  data-type="${question.type}">
            ${hasIcon ? `<div class="swipe-option-icon">${option.icon}</div>` : ''}
            <span class="swipe-option-label">${option.label}</span>
          </button>
        `;
      });

      html += `
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    // Bind option click events
    container.querySelectorAll('.swipe-option-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const questionId = this.dataset.question;
        const optionId = this.dataset.option;
        const type = this.dataset.type;

        if (type === 'single') {
          // Deselect other options in this question
          container.querySelectorAll(`[data-question="${questionId}"]`).forEach(b => {
            if (b.classList.contains('swipe-option-btn')) {
              b.classList.remove('selected');
            }
          });
          this.classList.add('selected');
          formData.details[questionId] = optionId;
        } else {
          // Multi-select toggle
          this.classList.toggle('selected');
          if (!formData.details[questionId]) {
            formData.details[questionId] = [];
          }
          if (this.classList.contains('selected')) {
            if (!formData.details[questionId].includes(optionId)) {
              formData.details[questionId].push(optionId);
            }
          } else {
            formData.details[questionId] = formData.details[questionId].filter(id => id !== optionId);
          }
        }
      });
    });
  }

  // Bind events
  function bindEvents() {
    // Category selection
    document.querySelectorAll('.swipe-category-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.swipe-category-btn').forEach(b => b.classList.remove('selected'));
        this.classList.add('selected');
        formData.category = this.dataset.category;
        formData.details = {}; // Reset details when category changes
        document.getElementById('swipe-btn-next-0').disabled = false;
      });
    });

    // Contact form validation
    const contactInputs = ['swipe-firstName', 'swipe-lastName', 'swipe-email', 'swipe-phone', 'swipe-zip'];
    contactInputs.forEach(id => {
      const input = document.getElementById(id);
      if (input) {
        input.addEventListener('input', validateContactForm);
      }
    });

    // Phone formatting
    const phoneInput = document.getElementById('swipe-phone');
    if (phoneInput) {
      phoneInput.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length >= 6) {
          value = '(' + value.substring(0,3) + ') ' + value.substring(3,6) + '-' + value.substring(6,10);
        } else if (value.length >= 3) {
          value = '(' + value.substring(0,3) + ') ' + value.substring(3);
        }
        e.target.value = value;
      });
    }

    // File upload
    const uploadZone = document.getElementById('swipe-upload-zone');
    const uploadInput = document.getElementById('swipe-upload-input');

    if (uploadZone && uploadInput) {
      uploadZone.addEventListener('click', () => uploadInput.click());
      uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
      uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
      uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
      });
      uploadInput.addEventListener('change', (e) => handleFiles(e.target.files));
    }

    // Close on overlay click
    const container = document.querySelector('.swipe-form-container');
    if (container) {
      container.addEventListener('click', (e) => {
        if (e.target === container || e.target.classList.contains('swipe-form-card-wrapper')) {
          SwipeForm.close();
        }
      });
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !container.classList.contains('hidden')) {
        SwipeForm.close();
      }
    });
  }

  // Validate contact form
  function validateContactForm() {
    const firstName = document.getElementById('swipe-firstName').value.trim();
    const lastName = document.getElementById('swipe-lastName').value.trim();
    const email = document.getElementById('swipe-email').value.trim();
    const phone = document.getElementById('swipe-phone').value.trim();
    const zip = document.getElementById('swipe-zip').value.trim();

    // Proper email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValidEmail = emailRegex.test(email);

    // Phone should have 10 digits after removing formatting
    const phoneDigits = phone.replace(/\D/g, '');
    const isValidPhone = phoneDigits.length >= 10;

    // ZIP should be exactly 5 digits
    const zipDigits = zip.replace(/\D/g, '');
    const isValidZip = zipDigits.length === 5;

    const isValid = firstName && lastName && isValidEmail && isValidPhone && isValidZip;
    document.getElementById('swipe-btn-next-2').disabled = !isValid;
  }

  // Handle file uploads
  function handleFiles(files) {
    const uploadZone = document.getElementById('swipe-upload-zone');

    Array.from(files).forEach(file => {
      if (file.type.startsWith('image/') && formData.images.length < 6) {
        const reader = new FileReader();
        reader.onload = (e) => {
          formData.images.push({ file, dataUrl: e.target.result });
          renderPreviews();
        };
        reader.readAsDataURL(file);
      }
    });

    if (formData.images.length > 0) {
      uploadZone.classList.add('has-files');
    }
  }

  // Render image previews
  function renderPreviews() {
    const previewGrid = document.getElementById('swipe-preview-grid');
    previewGrid.innerHTML = formData.images.map((img, i) => `
      <div class="swipe-preview-item">
        <img src="${img.dataUrl}" alt="Preview ${i + 1}">
        <button class="swipe-preview-remove" onclick="SwipeForm.removeImage(${i})">&times;</button>
      </div>
    `).join('');
  }

  // Remove image
  function removeImage(index) {
    formData.images.splice(index, 1);
    renderPreviews();

    const uploadZone = document.getElementById('swipe-upload-zone');
    if (formData.images.length === 0) {
      uploadZone.classList.remove('has-files');
    }
  }

  // Resize image before upload (max 2000px)
  async function resizeImage(file, maxDimension = 2000) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        // Only resize if needed
        if (width <= maxDimension && height <= maxDimension) {
          resolve(file);
          return;
        }

        // Calculate new dimensions
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }

        // Create canvas and resize
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  }

  // Upload single image to Supabase Storage
  async function uploadImageToStorage(imageData) {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substr(2, 9);
    const extension = imageData.file.name.split('.').pop() || 'jpg';
    const fileName = `lead_${timestamp}_${randomId}.${extension}`;
    const filePath = `uploads/${new Date().toISOString().split('T')[0]}/${fileName}`;

    try {
      const resizedBlob = await resizeImage(imageData.file, 2000);

      const response = await fetch(
        `${SUPABASE_URL}/storage/v1/object/lead-images/${filePath}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'apikey': SUPABASE_KEY,
            'Content-Type': resizedBlob.type || 'image/jpeg',
            'x-upsert': 'true'
          },
          body: resizedBlob
        }
      );

      if (response.ok) {
        return `${SUPABASE_URL}/storage/v1/object/public/lead-images/${filePath}`;
      }
      return null;
    } catch (error) {
      console.log('Image upload error:', error);
      return null;
    }
  }

  // Upload all images and return URLs
  async function uploadAllImages() {
    if (formData.images.length === 0) return [];

    const uploadPromises = formData.images.map(img => uploadImageToStorage(img));
    const results = await Promise.all(uploadPromises);
    return results.filter(url => url !== null);
  }

  // Update progress bar
  function updateProgress() {
    const totalSteps = 5;
    const progress = (currentStep / totalSteps) * 100;
    const progressFill = document.getElementById('swipe-progress-fill');
    const stepIndicator = document.getElementById('swipe-current-step');

    if (progressFill) progressFill.style.width = `${Math.min(progress, 100)}%`;
    if (stepIndicator) stepIndicator.textContent = Math.min(currentStep + 1, totalSteps);
  }

  // Show step
  function showStep(step) {
    document.querySelectorAll('.swipe-step').forEach(s => s.classList.remove('active'));
    const stepEl = document.querySelector(`.swipe-step[data-step="${step}"]`);
    if (stepEl) stepEl.classList.add('active');
    updateProgress();

    // Scroll modal to top
    const modal = document.querySelector('.swipe-form-modal');
    if (modal) modal.scrollTop = 0;
  }

  // Navigation
  function next() {
    // If moving from step 0 to step 1, render dynamic questions
    if (currentStep === 0) {
      renderDynamicQuestions();
    }

    if (currentStep < 5) {
      currentStep++;
      showStep(currentStep);
    }
  }

  function prev() {
    if (currentStep > 0) {
      currentStep--;
      showStep(currentStep);
    }
  }

  // Open form
  function open() {
    const container = document.querySelector('.swipe-form-container');
    if (container) {
      container.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }
  }

  // Close form and reset
  function close() {
    const container = document.querySelector('.swipe-form-container');
    if (container) {
      container.classList.add('hidden');
      document.body.style.overflow = '';
    }
    // Reset form after closing
    resetForm();
  }

  // Reset form to initial state
  function resetForm() {
    currentStep = 0;
    formData = {
      category: '',
      details: {},
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      zip: '',
      images: [],
      message: '',
      source: 'swipe-form',
      sourcePage: window.location.href
    };

    // Reset UI
    document.querySelectorAll('.swipe-category-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('swipe-btn-next-0').disabled = true;
    document.getElementById('swipe-firstName').value = '';
    document.getElementById('swipe-lastName').value = '';
    document.getElementById('swipe-email').value = '';
    document.getElementById('swipe-phone').value = '';
    document.getElementById('swipe-zip').value = '';
    document.getElementById('swipe-message').value = '';
    document.getElementById('swipe-preview-grid').innerHTML = '';
    document.getElementById('swipe-upload-zone').classList.remove('has-files');

    showStep(0);
  }

  // Submit form
  async function submit() {
    const submitBtn = document.getElementById('swipe-btn-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading...';

    // Collect form data
    formData.firstName = document.getElementById('swipe-firstName').value.trim();
    formData.lastName = document.getElementById('swipe-lastName').value.trim();
    formData.email = document.getElementById('swipe-email').value.trim();
    formData.phone = document.getElementById('swipe-phone').value.trim();
    formData.zip = document.getElementById('swipe-zip').value.trim();
    formData.message = document.getElementById('swipe-message').value.trim();

    // Upload images first
    let imageUrls = [];
    if (formData.images.length > 0) {
      submitBtn.textContent = 'Uploading photos...';
      imageUrls = await uploadAllImages();
    }

    submitBtn.textContent = 'Sending...';

    // Build details string from dynamic questions
    const detailsString = Object.entries(formData.details)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
      .join('; ');

    const leadData = {
      first_name: formData.firstName,
      last_name: formData.lastName,
      full_name: `${formData.firstName} ${formData.lastName}`,
      email: formData.email,
      phone: formData.phone,
      zip_code: formData.zip,
      project_type: formData.category,
      project_details: detailsString,
      message: formData.message,
      source: formData.source,
      source_page: formData.sourcePage,
      image_count: formData.images.length,
      image_urls: imageUrls
    };

    // Submit to API
    try {
      await fetch(`${API_URL}/api/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leadData)
      });
    } catch (error) {
      console.log('API error:', error);
    }

    // Submit to Supabase
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          first_name: formData.firstName,
          last_name: formData.lastName,
          full_name: `${formData.firstName} ${formData.lastName}`,
          email: formData.email,
          phone: formData.phone,
          zip_code: formData.zip,
          project_type: formData.category,
          project_details: detailsString,
          image_urls: imageUrls,
          message: formData.message,
          source: formData.source,
          form_name: 'swipe-form',
          page_url: window.location.href
        })
      });
    } catch (error) {
      console.log('Supabase error:', error);
    }

    // Show success
    currentStep = 5;
    showStep(currentStep);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Request';
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API
  window.SwipeForm = {
    open,
    close,
    next,
    prev,
    submit,
    removeImage
  };

})();
