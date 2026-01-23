/**
 * Lead Capture Modal - Premium Centered Popup
 * C++ Level Minimal Branded Card Interaction
 * Supports Swipe (Card) and Form (Traditional) layouts
 * v2.0.0
 */

(function() {
  'use strict';

  // Configuration - use centralized config
  const sgConfig = window.SG_CONFIG || {};
  const CONFIG = {
    apiUrl: sgConfig.API_URL || 'https://surprise-granite-email-api.onrender.com',
    supabaseUrl: sgConfig.SUPABASE_URL || 'https://ypeypgwsycxcagncgdur.supabase.co',
    supabaseKey: sgConfig.SUPABASE_ANON_KEY || '',
    maxImages: 6,
    phone: '(602) 833-3189'
  };

  // Categories with SVG icons
  const CATEGORIES = [
    { id: 'countertops', name: 'Countertops', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="6" width="20" height="4" rx="1"/><path d="M4 10v8h16v-8"/><path d="M8 14h8"/></svg>' },
    { id: 'kitchen', name: 'Kitchen', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><circle cx="7" cy="7" r="1"/><circle cx="12" cy="7" r="1"/></svg>' },
    { id: 'bathroom', name: 'Bathroom', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12h16a1 1 0 011 1v3a4 4 0 01-4 4H7a4 4 0 01-4-4v-3a1 1 0 011-1z"/><path d="M6 12V5a2 2 0 012-2h1"/><circle cx="8" cy="8" r="1"/></svg>' },
    { id: 'flooring', name: 'Flooring', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>' },
    { id: 'tile', name: 'Tile', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>' },
    { id: 'repair', name: 'Repair', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>' }
  ];

  // Steps
  const STEPS = [
    { id: 'project', label: 'Project' },
    { id: 'contact', label: 'Contact' },
    { id: 'photos', label: 'Photos' },
    { id: 'details', label: 'Details' }
  ];

  // State
  let state = {
    isOpen: false,
    currentStep: 0,
    layout: 'cards', // 'cards' or 'form'
    formData: {
      category: '',
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      zip: '',
      message: '',
      images: [],
      imageUrls: []
    },
    isSubmitting: false
  };

  // Create modal HTML
  function createModal() {
    const modal = document.createElement('div');
    modal.id = 'lcm-overlay';
    modal.className = 'lcm-overlay';
    modal.innerHTML = `
      <div class="lcm-modal" role="dialog" aria-modal="true" aria-labelledby="lcm-title">
        <!-- Header -->
        <div class="lcm-header">
          <div class="lcm-header-left">
            <div class="lcm-logo">SG</div>
            <span class="lcm-title" id="lcm-title">Get Free Estimate</span>
          </div>
          <button class="lcm-close" aria-label="Close" onclick="LeadCaptureModal.close()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <!-- Progress Steps -->
        <div class="lcm-progress-container">
          <div class="lcm-steps" id="lcm-steps">
            ${STEPS.map((step, i) => `
              <div class="lcm-step ${i === 0 ? 'active' : ''}" data-step="${i}">
                <div class="lcm-step-dot">${i + 1}</div>
                <span class="lcm-step-label">${step.label}</span>
              </div>
            `).join('')}
          </div>
          <div class="lcm-progress-bar">
            <div class="lcm-progress-fill" id="lcm-progress-fill"></div>
          </div>
        </div>

        <!-- Layout Toggle -->
        <div class="lcm-layout-toggle">
          <button class="lcm-layout-btn active" data-layout="cards" onclick="LeadCaptureModal.setLayout('cards')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            Cards
          </button>
          <button class="lcm-layout-btn" data-layout="form" onclick="LeadCaptureModal.setLayout('form')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 6h16M4 12h16M4 18h10"/>
            </svg>
            Form
          </button>
        </div>

        <!-- Content -->
        <div class="lcm-content" id="lcm-content">

          <!-- CARDS VIEW -->
          <div class="lcm-cards-wrapper" id="lcm-cards-wrapper">

            <!-- Card 1: Project Type -->
            <div class="lcm-card active" data-card="0">
              <div class="lcm-card-header">
                <div class="lcm-card-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
                    <rect x="9" y="3" width="6" height="4" rx="1"/>
                    <path d="M9 12h6M9 16h6"/>
                  </svg>
                </div>
                <h2 class="lcm-card-title">What's your project?</h2>
                <p class="lcm-card-subtitle">Select your project type</p>
              </div>

              <div class="lcm-category-grid" id="lcm-category-grid">
                ${CATEGORIES.map(cat => `
                  <button class="lcm-category-btn" data-category="${cat.id}" type="button">
                    <div class="lcm-category-icon">${cat.icon}</div>
                    <div class="lcm-category-name">${cat.name}</div>
                  </button>
                `).join('')}
              </div>

              <div class="lcm-nav">
                <button class="lcm-btn lcm-btn-next" id="lcm-btn-0" disabled onclick="LeadCaptureModal.next()">
                  Continue
                </button>
              </div>
            </div>

            <!-- Card 2: Contact Info -->
            <div class="lcm-card" data-card="1">
              <div class="lcm-card-header">
                <div class="lcm-card-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                <h2 class="lcm-card-title">Your contact info</h2>
                <p class="lcm-card-subtitle">We'll reach out within 24 hours</p>
              </div>

              <div class="lcm-input-group lcm-input-row">
                <div>
                  <label class="lcm-label">First Name<span class="required">*</span></label>
                  <input type="text" class="lcm-input" id="lcm-firstName" placeholder="John" autocomplete="given-name">
                </div>
                <div>
                  <label class="lcm-label">Last Name<span class="required">*</span></label>
                  <input type="text" class="lcm-input" id="lcm-lastName" placeholder="Smith" autocomplete="family-name">
                </div>
              </div>

              <div class="lcm-input-group">
                <label class="lcm-label">Email<span class="required">*</span></label>
                <input type="email" class="lcm-input" id="lcm-email" placeholder="john@example.com" autocomplete="email">
              </div>

              <div class="lcm-input-group lcm-input-row">
                <div>
                  <label class="lcm-label">Phone<span class="required">*</span></label>
                  <input type="tel" class="lcm-input" id="lcm-phone" placeholder="(480) 555-1234" autocomplete="tel">
                </div>
                <div>
                  <label class="lcm-label">ZIP Code<span class="required">*</span></label>
                  <input type="text" class="lcm-input" id="lcm-zip" placeholder="85374" maxlength="5" autocomplete="postal-code">
                </div>
              </div>

              <div class="lcm-nav">
                <button class="lcm-btn lcm-btn-back" onclick="LeadCaptureModal.prev()">Back</button>
                <button class="lcm-btn lcm-btn-next" id="lcm-btn-1" disabled onclick="LeadCaptureModal.next()">Continue</button>
              </div>
            </div>

            <!-- Card 3: Photo Upload -->
            <div class="lcm-card" data-card="2">
              <div class="lcm-card-header">
                <div class="lcm-card-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <path d="M21 15l-5-5L5 21"/>
                  </svg>
                </div>
                <h2 class="lcm-card-title">Add project photos</h2>
                <p class="lcm-card-subtitle">Helps us give accurate estimates</p>
              </div>

              <div class="lcm-upload-zone" id="lcm-upload-zone">
                <div class="lcm-upload-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                </div>
                <div class="lcm-upload-text">Tap to upload photos</div>
                <div class="lcm-upload-hint">JPG, PNG up to 10MB each</div>
                <input type="file" class="lcm-upload-input" id="lcm-upload-input" multiple accept="image/*" capture="environment">
              </div>

              <div class="lcm-preview-grid" id="lcm-preview-grid"></div>

              <div class="lcm-nav">
                <button class="lcm-btn lcm-btn-back" onclick="LeadCaptureModal.prev()">Back</button>
                <button class="lcm-btn lcm-btn-next" onclick="LeadCaptureModal.next()">Continue</button>
              </div>
            </div>

            <!-- Card 4: Details & Submit -->
            <div class="lcm-card" data-card="3">
              <div class="lcm-card-header">
                <div class="lcm-card-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </div>
                <h2 class="lcm-card-title">Project details</h2>
                <p class="lcm-card-subtitle">Any additional info helps</p>
              </div>

              <div class="lcm-input-group">
                <label class="lcm-label">Tell us about your project</label>
                <textarea class="lcm-input lcm-textarea" id="lcm-message" placeholder="Dimensions, materials, timeline..."></textarea>
              </div>

              <div class="lcm-nav">
                <button class="lcm-btn lcm-btn-back" onclick="LeadCaptureModal.prev()">Back</button>
                <button class="lcm-btn lcm-btn-submit" id="lcm-btn-submit" onclick="LeadCaptureModal.submit()">
                  Submit Request
                </button>
              </div>
            </div>

            <!-- Success Card -->
            <div class="lcm-card" data-card="success">
              <div class="lcm-success-content">
                <div class="lcm-success-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
                <h2 class="lcm-success-title">Request Sent!</h2>
                <p class="lcm-success-message">Thank you! One of our experts will contact you within 24 hours.</p>
                <div class="lcm-success-actions">
                  <a href="tel:+16028333189" class="lcm-btn lcm-btn-phone">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                    </svg>
                    Call ${CONFIG.phone}
                  </a>
                  <button class="lcm-btn lcm-btn-close" onclick="LeadCaptureModal.close()">Done</button>
                </div>
              </div>
            </div>

          </div>

          <!-- FORM VIEW -->
          <div class="lcm-form-wrapper" id="lcm-form-wrapper">
            <form id="lcm-form" onsubmit="return LeadCaptureModal.submitForm(event)">

              <!-- Project Type -->
              <div class="lcm-form-section">
                <div class="lcm-form-section-title">Project Type</div>
                <div class="lcm-category-grid" id="lcm-form-category-grid">
                  ${CATEGORIES.map(cat => `
                    <button class="lcm-category-btn" data-category="${cat.id}" type="button">
                      <div class="lcm-category-icon">${cat.icon}</div>
                      <div class="lcm-category-name">${cat.name}</div>
                    </button>
                  `).join('')}
                </div>
              </div>

              <!-- Contact Info -->
              <div class="lcm-form-section">
                <div class="lcm-form-section-title">Contact Information</div>
                <div class="lcm-input-group lcm-input-row">
                  <div>
                    <label class="lcm-label">First Name<span class="required">*</span></label>
                    <input type="text" class="lcm-input" id="lcm-form-firstName" placeholder="John" required>
                  </div>
                  <div>
                    <label class="lcm-label">Last Name<span class="required">*</span></label>
                    <input type="text" class="lcm-input" id="lcm-form-lastName" placeholder="Smith" required>
                  </div>
                </div>
                <div class="lcm-input-group">
                  <label class="lcm-label">Email<span class="required">*</span></label>
                  <input type="email" class="lcm-input" id="lcm-form-email" placeholder="john@example.com" required>
                </div>
                <div class="lcm-input-group lcm-input-row">
                  <div>
                    <label class="lcm-label">Phone<span class="required">*</span></label>
                    <input type="tel" class="lcm-input" id="lcm-form-phone" placeholder="(480) 555-1234" required>
                  </div>
                  <div>
                    <label class="lcm-label">ZIP Code<span class="required">*</span></label>
                    <input type="text" class="lcm-input" id="lcm-form-zip" placeholder="85374" maxlength="5" required>
                  </div>
                </div>
              </div>

              <!-- Photos -->
              <div class="lcm-form-section">
                <div class="lcm-form-section-title">Project Photos (Optional)</div>
                <div class="lcm-upload-zone" id="lcm-form-upload-zone">
                  <div class="lcm-upload-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                  </div>
                  <div class="lcm-upload-text">Tap to upload photos</div>
                  <div class="lcm-upload-hint">JPG, PNG up to 10MB each</div>
                  <input type="file" class="lcm-upload-input" id="lcm-form-upload-input" multiple accept="image/*">
                </div>
                <div class="lcm-preview-grid" id="lcm-form-preview-grid"></div>
              </div>

              <!-- Message -->
              <div class="lcm-form-section">
                <div class="lcm-form-section-title">Project Details</div>
                <div class="lcm-input-group">
                  <textarea class="lcm-input lcm-textarea" id="lcm-form-message" placeholder="Dimensions, materials, timeline..."></textarea>
                </div>
              </div>

              <!-- Submit -->
              <div class="lcm-nav">
                <button type="submit" class="lcm-btn lcm-btn-submit" id="lcm-form-submit" style="flex: 1;">
                  Submit Request
                </button>
              </div>
            </form>
          </div>

        </div>

        <!-- Quick Links -->
        <div class="lcm-quick-links">
          <a href="tel:+16028333189" class="lcm-quick-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
            </svg>
            Call Us
          </a>
          <a href="/shop" class="lcm-quick-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>
            </svg>
            Shop
          </a>
          <a href="/all-countertops" class="lcm-quick-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M3 9h18"/>
            </svg>
            Materials
          </a>
        </div>

        <!-- Footer -->
        <div class="lcm-footer">
          <a href="/legal/privacy-policy" class="lcm-footer-link">Privacy</a>
          <a href="/legal/terms" class="lcm-footer-link">Terms</a>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Create trigger button
    const trigger = document.createElement('button');
    trigger.className = 'lcm-trigger';
    trigger.id = 'lcm-trigger';
    trigger.onclick = () => window.LeadCaptureModal.open();
    trigger.innerHTML = `
      <svg class="lcm-trigger-icon" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
      <span class="lcm-trigger-text">Get Free Estimate</span>
    `;
    document.body.appendChild(trigger);

    return modal;
  }

  // Initialize
  function init() {
    if (document.getElementById('lcm-overlay')) return;

    createModal();
    bindEvents();
    updateProgress();
  }

  // Bind events
  function bindEvents() {
    // Category selection (cards view)
    document.querySelectorAll('#lcm-category-grid .lcm-category-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#lcm-category-grid .lcm-category-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        state.formData.category = btn.dataset.category;
        document.getElementById('lcm-btn-0').disabled = false;
      });
    });

    // Category selection (form view)
    document.querySelectorAll('#lcm-form-category-grid .lcm-category-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#lcm-form-category-grid .lcm-category-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        state.formData.category = btn.dataset.category;
      });
    });

    // Input bindings (cards)
    ['firstName', 'lastName', 'email', 'phone', 'zip', 'message'].forEach(field => {
      const input = document.getElementById(`lcm-${field}`);
      if (input) {
        input.addEventListener('input', (e) => {
          state.formData[field] = e.target.value;
          if (field !== 'message') validateContactStep();
        });
      }
    });

    // Input bindings (form)
    ['firstName', 'lastName', 'email', 'phone', 'zip', 'message'].forEach(field => {
      const input = document.getElementById(`lcm-form-${field}`);
      if (input) {
        input.addEventListener('input', (e) => {
          state.formData[field] = e.target.value;
        });
      }
    });

    // Phone formatting
    ['lcm-phone', 'lcm-form-phone'].forEach(id => {
      const input = document.getElementById(id);
      if (input) {
        input.addEventListener('input', (e) => {
          let value = e.target.value.replace(/\D/g, '');
          if (value.length > 0) {
            if (value.length <= 3) {
              value = `(${value}`;
            } else if (value.length <= 6) {
              value = `(${value.slice(0,3)}) ${value.slice(3)}`;
            } else {
              value = `(${value.slice(0,3)}) ${value.slice(3,6)}-${value.slice(6,10)}`;
            }
          }
          e.target.value = value;
          state.formData.phone = value;
          validateContactStep();
        });
      }
    });

    // Image upload (cards)
    const uploadZone = document.getElementById('lcm-upload-zone');
    const uploadInput = document.getElementById('lcm-upload-input');
    if (uploadZone && uploadInput) {
      uploadZone.addEventListener('click', () => uploadInput.click());
      uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
      uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
      uploadZone.addEventListener('drop', (e) => { e.preventDefault(); uploadZone.classList.remove('dragover'); handleFiles(e.dataTransfer.files, 'lcm'); });
      uploadInput.addEventListener('change', (e) => handleFiles(e.target.files, 'lcm'));
    }

    // Image upload (form)
    const formUploadZone = document.getElementById('lcm-form-upload-zone');
    const formUploadInput = document.getElementById('lcm-form-upload-input');
    if (formUploadZone && formUploadInput) {
      formUploadZone.addEventListener('click', () => formUploadInput.click());
      formUploadZone.addEventListener('dragover', (e) => { e.preventDefault(); formUploadZone.classList.add('dragover'); });
      formUploadZone.addEventListener('dragleave', () => formUploadZone.classList.remove('dragover'));
      formUploadZone.addEventListener('drop', (e) => { e.preventDefault(); formUploadZone.classList.remove('dragover'); handleFiles(e.dataTransfer.files, 'lcm-form'); });
      formUploadInput.addEventListener('change', (e) => handleFiles(e.target.files, 'lcm-form'));
    }

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (state.isOpen && e.key === 'Escape') close();
    });

    // Click outside
    document.getElementById('lcm-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) close();
    });
  }

  // Handle file uploads
  function handleFiles(files, prefix) {
    Array.from(files).forEach(file => {
      if (file.type.startsWith('image/') && state.formData.images.length < CONFIG.maxImages) {
        const reader = new FileReader();
        reader.onload = (e) => {
          state.formData.images.push({
            name: file.name,
            data: e.target.result,
            file: file
          });
          renderPreviews(prefix);
        };
        reader.readAsDataURL(file);
      }
    });

    const zone = document.getElementById(`${prefix}-upload-zone`);
    if (zone && state.formData.images.length > 0) {
      zone.classList.add('has-files');
    }
  }

  // Render image previews
  function renderPreviews(prefix) {
    const grid = document.getElementById(`${prefix}-preview-grid`);
    if (!grid) return;

    grid.innerHTML = state.formData.images.map((img, index) => `
      <div class="lcm-preview-item">
        <img src="${img.data}" alt="Preview ${index + 1}">
        <button class="lcm-preview-remove" onclick="LeadCaptureModal.removeImage(${index}, '${prefix}')" type="button">×</button>
      </div>
    `).join('');
  }

  // Remove image
  function removeImage(index, prefix) {
    state.formData.images.splice(index, 1);
    renderPreviews(prefix);

    if (state.formData.images.length === 0) {
      document.getElementById(`${prefix}-upload-zone`)?.classList.remove('has-files');
    }
  }

  // Validate contact step
  function validateContactStep() {
    const { firstName, lastName, email, phone, zip } = state.formData;

    // Proper email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValidEmail = emailRegex.test(email);

    const isValid = firstName.trim().length > 0 &&
                    lastName.trim().length > 0 &&
                    isValidEmail &&
                    phone.replace(/\D/g, '').length >= 10 &&
                    zip.replace(/\D/g, '').length === 5;

    const btn = document.getElementById('lcm-btn-1');
    if (btn) btn.disabled = !isValid;
    return isValid;
  }

  // Update progress
  function updateProgress() {
    const progress = (state.currentStep / (STEPS.length - 1)) * 100;
    const fill = document.getElementById('lcm-progress-fill');
    if (fill) fill.style.width = `${Math.min(progress, 100)}%`;

    document.querySelectorAll('.lcm-step').forEach((step, i) => {
      step.classList.remove('active', 'completed');
      if (i < state.currentStep) step.classList.add('completed');
      if (i === state.currentStep) step.classList.add('active');
    });
  }

  // Navigate next
  function next() {
    if (state.currentStep >= STEPS.length) return;

    const cards = document.querySelectorAll('.lcm-card[data-card]');
    cards[state.currentStep].classList.remove('active');
    cards[state.currentStep].classList.add('prev');

    state.currentStep++;

    const nextCard = document.querySelector(`.lcm-card[data-card="${state.currentStep}"]`);
    if (nextCard) {
      nextCard.classList.remove('prev');
      nextCard.classList.add('active');
    }

    updateProgress();
  }

  // Navigate prev
  function prev() {
    if (state.currentStep <= 0) return;

    const cards = document.querySelectorAll('.lcm-card[data-card]');
    const currentCard = document.querySelector(`.lcm-card[data-card="${state.currentStep}"]`);
    if (currentCard) {
      currentCard.classList.remove('active');
    }

    state.currentStep--;

    cards[state.currentStep].classList.remove('prev');
    cards[state.currentStep].classList.add('active');

    updateProgress();
  }

  // Set layout
  function setLayout(layout) {
    state.layout = layout;

    document.querySelectorAll('.lcm-layout-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.layout === layout);
    });

    const cardsWrapper = document.getElementById('lcm-cards-wrapper');
    const formWrapper = document.getElementById('lcm-form-wrapper');
    const progressContainer = document.querySelector('.lcm-progress-container');

    if (layout === 'form') {
      cardsWrapper.classList.add('hidden');
      formWrapper.classList.add('active');
      progressContainer.style.display = 'none';
    } else {
      cardsWrapper.classList.remove('hidden');
      formWrapper.classList.remove('active');
      progressContainer.style.display = 'block';
    }
  }

  // Submit (cards view)
  async function submit() {
    if (state.isSubmitting) return;
    state.isSubmitting = true;

    const submitBtn = document.getElementById('lcm-btn-submit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add('lcm-btn-loading');
      submitBtn.textContent = '';
    }

    try {
      await submitLead();
      showSuccess();
    } catch (error) {
      console.error('Submit error:', error);
      alert('Something went wrong. Please try again.');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('lcm-btn-loading');
        submitBtn.textContent = 'Submit Request';
      }
    }

    state.isSubmitting = false;
  }

  // Submit (form view)
  async function submitForm(e) {
    e.preventDefault();
    if (state.isSubmitting) return false;
    state.isSubmitting = true;

    // Collect form data
    state.formData.firstName = document.getElementById('lcm-form-firstName').value;
    state.formData.lastName = document.getElementById('lcm-form-lastName').value;
    state.formData.email = document.getElementById('lcm-form-email').value;
    state.formData.phone = document.getElementById('lcm-form-phone').value;
    state.formData.zip = document.getElementById('lcm-form-zip').value;
    state.formData.message = document.getElementById('lcm-form-message').value;

    const submitBtn = document.getElementById('lcm-form-submit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add('lcm-btn-loading');
      submitBtn.textContent = '';
    }

    try {
      await submitLead();
      // Show success in form view
      document.getElementById('lcm-form-wrapper').innerHTML = `
        <div class="lcm-success-content">
          <div class="lcm-success-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <h2 class="lcm-success-title">Request Sent!</h2>
          <p class="lcm-success-message">Thank you! One of our experts will contact you within 24 hours.</p>
          <div class="lcm-success-actions">
            <a href="tel:+16028333189" class="lcm-btn lcm-btn-phone">Call ${CONFIG.phone}</a>
            <button class="lcm-btn lcm-btn-close" onclick="LeadCaptureModal.close()">Done</button>
          </div>
        </div>
      `;
    } catch (error) {
      console.error('Submit error:', error);
      alert('Something went wrong. Please try again.');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('lcm-btn-loading');
        submitBtn.textContent = 'Submit Request';
      }
    }

    state.isSubmitting = false;
    return false;
  }

  // Submit lead to APIs
  async function submitLead() {
    const leadData = {
      homeowner_name: `${state.formData.firstName} ${state.formData.lastName}`,
      homeowner_email: state.formData.email,
      homeowner_phone: state.formData.phone,
      project_type: state.formData.category,
      project_zip: state.formData.zip,
      project_details: state.formData.message,
      image_urls: state.formData.imageUrls,
      source: 'lead-capture-modal-v2'
    };

    // Submit to API
    await fetch(`${CONFIG.apiUrl}/api/leads/with-images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(leadData)
    });

    // Submit to Supabase
    if (window.supabase) {
      try {
        const { createClient } = window.supabase;
        // Use global client if available
        const supabaseClient = window._sgSupabaseClient || createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: 'sb-ypeypgwsycxcagncgdur-auth-token',
            flowType: 'implicit',
            lock: false
          }
        });
        if (!window._sgSupabaseClient) window._sgSupabaseClient = supabaseClient;
        await supabaseClient.from('leads').insert([{
          full_name: leadData.homeowner_name,
          first_name: state.formData.firstName,
          last_name: state.formData.lastName,
          email: leadData.homeowner_email,
          phone: leadData.homeowner_phone,
          zip_code: leadData.project_zip,
          project_type: leadData.project_type,
          message: leadData.project_details,
          image_urls: leadData.image_urls,
          source: 'lead-capture-modal',
          form_name: 'lcm-popup',
          page_url: window.location.href
        }]);
      } catch (e) {
        console.warn('Supabase save failed:', e);
      }
    }
  }

  // Show success card
  function showSuccess() {
    const cards = document.querySelectorAll('.lcm-card');
    cards.forEach(c => c.classList.remove('active', 'prev'));

    const successCard = document.querySelector('.lcm-card[data-card="success"]');
    if (successCard) successCard.classList.add('active');
  }

  // Open modal
  function open() {
    state.isOpen = true;
    document.getElementById('lcm-overlay').classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  // Close modal
  function close() {
    state.isOpen = false;
    document.getElementById('lcm-overlay').classList.remove('active');
    document.body.style.overflow = '';

    setTimeout(() => reset(), 300);
  }

  // Reset state
  function reset() {
    state.currentStep = 0;
    state.formData = {
      category: '',
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      zip: '',
      message: '',
      images: [],
      imageUrls: []
    };

    // Reset UI
    document.querySelectorAll('.lcm-category-btn').forEach(b => b.classList.remove('selected'));
    document.querySelectorAll('.lcm-input').forEach(i => i.value = '');
    document.querySelectorAll('.lcm-preview-grid').forEach(g => g.innerHTML = '');
    document.querySelectorAll('.lcm-upload-zone').forEach(z => z.classList.remove('has-files'));

    const btn0 = document.getElementById('lcm-btn-0');
    const btn1 = document.getElementById('lcm-btn-1');
    if (btn0) btn0.disabled = true;
    if (btn1) btn1.disabled = true;

    const submitBtn = document.getElementById('lcm-btn-submit');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('lcm-btn-loading');
      submitBtn.textContent = 'Submit Request';
    }

    // Reset cards
    document.querySelectorAll('.lcm-card').forEach((card, i) => {
      card.classList.remove('active', 'prev');
      if (card.dataset.card === '0') card.classList.add('active');
    });

    updateProgress();
    setLayout('cards');
  }

  // Public API
  window.LeadCaptureModal = {
    init,
    open,
    close,
    next,
    prev,
    submit,
    submitForm,
    setLayout,
    removeImage
  };

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
