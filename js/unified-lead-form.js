/**
 * Unified Lead Form Module
 * Surprise Granite - Configurable form component
 *
 * Usage:
 *   const form = new UnifiedLeadForm({
 *     container: '#form-container',
 *     addressMode: 'billing-service',
 *     onSubmit: (data) => console.log(data)
 *   });
 *   form.init();
 */

(function() {
  'use strict';

  // Aborting fetch — never let a slow network freeze the form.
  function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, Object.assign({}, options, { signal: controller.signal }))
      .finally(() => clearTimeout(t));
  }

  // US States list
  const US_STATES = [
    { code: 'AZ', name: 'Arizona' },
    { code: 'CA', name: 'California' },
    { code: 'CO', name: 'Colorado' },
    { code: 'NV', name: 'Nevada' },
    { code: 'NM', name: 'New Mexico' },
    { code: 'TX', name: 'Texas' },
    { code: 'UT', name: 'Utah' },
    // Add more as needed
    { code: 'AL', name: 'Alabama' },
    { code: 'AK', name: 'Alaska' },
    { code: 'AR', name: 'Arkansas' },
    { code: 'CT', name: 'Connecticut' },
    { code: 'DE', name: 'Delaware' },
    { code: 'FL', name: 'Florida' },
    { code: 'GA', name: 'Georgia' },
    { code: 'HI', name: 'Hawaii' },
    { code: 'ID', name: 'Idaho' },
    { code: 'IL', name: 'Illinois' },
    { code: 'IN', name: 'Indiana' },
    { code: 'IA', name: 'Iowa' },
    { code: 'KS', name: 'Kansas' },
    { code: 'KY', name: 'Kentucky' },
    { code: 'LA', name: 'Louisiana' },
    { code: 'ME', name: 'Maine' },
    { code: 'MD', name: 'Maryland' },
    { code: 'MA', name: 'Massachusetts' },
    { code: 'MI', name: 'Michigan' },
    { code: 'MN', name: 'Minnesota' },
    { code: 'MS', name: 'Mississippi' },
    { code: 'MO', name: 'Missouri' },
    { code: 'MT', name: 'Montana' },
    { code: 'NE', name: 'Nebraska' },
    { code: 'NH', name: 'New Hampshire' },
    { code: 'NJ', name: 'New Jersey' },
    { code: 'NY', name: 'New York' },
    { code: 'NC', name: 'North Carolina' },
    { code: 'ND', name: 'North Dakota' },
    { code: 'OH', name: 'Ohio' },
    { code: 'OK', name: 'Oklahoma' },
    { code: 'OR', name: 'Oregon' },
    { code: 'PA', name: 'Pennsylvania' },
    { code: 'RI', name: 'Rhode Island' },
    { code: 'SC', name: 'South Carolina' },
    { code: 'SD', name: 'South Dakota' },
    { code: 'TN', name: 'Tennessee' },
    { code: 'VT', name: 'Vermont' },
    { code: 'VA', name: 'Virginia' },
    { code: 'WA', name: 'Washington' },
    { code: 'WV', name: 'West Virginia' },
    { code: 'WI', name: 'Wisconsin' },
    { code: 'WY', name: 'Wyoming' },
    { code: 'DC', name: 'Washington DC' }
  ];

  // Default configuration
  // ALL leads go ONLY to Supabase leads table (powers /account page leads tab)
  const DEFAULT_CONFIG = {
    theme: 'dark', // 'dark' or 'light'
    addressMode: 'none', // 'none', 'simple', 'billing-service'
    defaultState: 'AZ',
    showProjectFields: true,
    showImageUpload: true,
    source: 'unified-lead-form',
    formName: 'unified',
    onSubmit: null,
    onSuccess: null,
    onError: null
  };

  // Validation rules
  const VALIDATION = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    phone: /^\d{10,}$/,
    zip: /^\d{5}$/
  };

  class UnifiedLeadForm {
    constructor(options = {}) {
      this.config = { ...DEFAULT_CONFIG, ...options };
      this.container = null;
      this.formData = {};
      this.addressSame = true;
      this.isSubmitting = false;
    }

    /**
     * Initialize the form
     */
    init() {
      if (typeof this.config.container === 'string') {
        this.container = document.querySelector(this.config.container);
      } else {
        this.container = this.config.container;
      }

      if (!this.container) {
        console.error('UnifiedLeadForm: Container not found');
        return;
      }

      this.bindEvents();
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
      // Phone formatting
      this.container.querySelectorAll('[data-format="phone"]').forEach(input => {
        input.addEventListener('input', (e) => this.formatPhone(e.target));
      });

      // ZIP formatting
      this.container.querySelectorAll('[data-format="zip"]').forEach(input => {
        input.addEventListener('input', (e) => this.formatZip(e.target));
      });

      // Address toggle
      const addressToggle = this.container.querySelector('[data-address-toggle]');
      if (addressToggle) {
        addressToggle.addEventListener('change', (e) => this.handleAddressToggle(e.target.checked));
      }

      // Image upload — inject UI if enabled
      if (this.config.showImageUpload) {
        this.uploadedImageUrls = [];
        const form = this.container.querySelector('form');
        const submitBtn = form?.querySelector('[type="submit"], [data-submit]');
        if (form && submitBtn) {
          const uploadSection = document.createElement('div');
          uploadSection.className = 'ulf-input-group ulf-image-upload';
          uploadSection.innerHTML = `
            <label class="ulf-label">Project Photos (optional)</label>
            <div class="ulf-dropzone" style="border:2px dashed rgba(255,255,255,0.2);border-radius:12px;padding:24px;text-align:center;cursor:pointer;transition:border-color 0.2s">
              <input type="file" multiple accept="image/*" style="display:none" data-image-input>
              <p style="margin:0;color:rgba(255,255,255,0.6);font-size:14px">
                <span style="font-size:24px">📷</span><br>
                Tap to add photos of your project<br>
                <small>Up to 5 images, 10MB each</small>
              </p>
            </div>
            <div class="ulf-image-previews" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px" data-image-previews></div>
            <div class="ulf-upload-status" style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:4px" data-upload-status></div>
          `;
          submitBtn.parentNode.insertBefore(uploadSection, submitBtn);

          const dropzone = uploadSection.querySelector('.ulf-dropzone');
          const fileInput = uploadSection.querySelector('[data-image-input]');
          const previews = uploadSection.querySelector('[data-image-previews]');
          const status = uploadSection.querySelector('[data-upload-status]');

          dropzone.addEventListener('click', () => fileInput.click());
          dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.style.borderColor = 'rgba(255,255,255,0.5)'; });
          dropzone.addEventListener('dragleave', () => { dropzone.style.borderColor = 'rgba(255,255,255,0.2)'; });
          dropzone.addEventListener('drop', (e) => { e.preventDefault(); dropzone.style.borderColor = 'rgba(255,255,255,0.2)'; this.handleImageFiles(e.dataTransfer.files, previews, status); });
          fileInput.addEventListener('change', (e) => this.handleImageFiles(e.target.files, previews, status));
        }
      }

      // Form submission
      const form = this.container.querySelector('form');
      if (form) {
        form.addEventListener('submit', (e) => this.handleSubmit(e));
      }
    }

    /**
     * Handle image file selection — upload to Supabase and show previews
     */
    async handleImageFiles(files, previewsEl, statusEl) {
      if (!files?.length) return;
      const remaining = 5 - (this.uploadedImageUrls?.length || 0);
      if (remaining <= 0) { statusEl.textContent = 'Maximum 5 photos reached'; return; }

      const toUpload = Array.from(files).slice(0, remaining);
      statusEl.textContent = `Uploading ${toUpload.length} photo(s)...`;

      const formData = new FormData();
      toUpload.forEach(f => formData.append('images', f));

      try {
        const apiBase = (window.SG_CONFIG?.API_URL || '') + '/api/leads/upload-images';
        const resp = await fetchWithTimeout(apiBase, { method: 'POST', body: formData }, 60000);
        const result = await resp.json();

        if (result.success && result.urls?.length) {
          this.uploadedImageUrls.push(...result.urls);
          result.urls.forEach(url => {
            const img = document.createElement('img');
            img.src = url;
            img.style.cssText = 'width:60px;height:60px;object-fit:cover;border-radius:8px;border:1px solid rgba(255,255,255,0.1)';
            previewsEl.appendChild(img);
          });
          statusEl.textContent = `${this.uploadedImageUrls.length} photo(s) attached`;
        } else {
          statusEl.textContent = 'Upload failed — try again';
        }
      } catch (err) {
        console.error('Image upload error:', err);
        statusEl.textContent = 'Upload failed — try again';
      }
    }

    /**
     * Format phone number as (XXX) XXX-XXXX
     */
    formatPhone(input) {
      let value = input.value.replace(/\D/g, '');
      if (value.length > 10) value = value.slice(0, 10);

      if (value.length >= 6) {
        input.value = `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6)}`;
      } else if (value.length >= 3) {
        input.value = `(${value.slice(0, 3)}) ${value.slice(3)}`;
      } else if (value.length > 0) {
        input.value = `(${value}`;
      }
    }

    /**
     * Format ZIP code (5 digits only)
     */
    formatZip(input) {
      input.value = input.value.replace(/\D/g, '').slice(0, 5);
    }

    /**
     * Handle address toggle checkbox
     */
    handleAddressToggle(isSame) {
      this.addressSame = isSame;
      const serviceSection = this.container.querySelector('[data-service-address]');

      if (serviceSection) {
        if (isSame) {
          serviceSection.classList.remove('ulf-visible');
          // Clear service address fields
          serviceSection.querySelectorAll('input, select').forEach(input => {
            input.value = '';
            input.removeAttribute('required');
          });
        } else {
          serviceSection.classList.add('ulf-visible');
          // Make service address fields required
          serviceSection.querySelectorAll('[data-required]').forEach(input => {
            input.setAttribute('required', '');
          });
        }
      }
    }

    /**
     * Validate a single field
     */
    validateField(input) {
      const value = input.value.trim();
      const type = input.dataset.validate || input.type;
      const group = input.closest('.ulf-input-group');

      let isValid = true;
      let message = '';

      // Required check
      if (input.hasAttribute('required') && !value) {
        isValid = false;
        message = 'This field is required';
      }

      // Type-specific validation
      if (isValid && value) {
        switch (type) {
          case 'email':
            if (!VALIDATION.email.test(value)) {
              isValid = false;
              message = 'Please enter a valid email';
            }
            break;
          case 'phone':
          case 'tel':
            const digits = value.replace(/\D/g, '');
            if (digits.length < 10) {
              isValid = false;
              message = 'Please enter a valid 10-digit phone';
            }
            break;
          case 'zip':
            if (!VALIDATION.zip.test(value.replace(/\D/g, ''))) {
              isValid = false;
              message = 'Please enter a valid 5-digit ZIP';
            }
            break;
        }
      }

      // Update UI
      if (group) {
        group.classList.toggle('ulf-error', !isValid);
        group.classList.toggle('ulf-success', isValid && value);

        const errorEl = group.querySelector('.ulf-error-message');
        if (errorEl) {
          errorEl.textContent = message;
        }
      }

      return isValid;
    }

    /**
     * Validate entire form
     */
    validateForm() {
      const inputs = this.container.querySelectorAll('[required], [data-validate]');
      let isValid = true;

      inputs.forEach(input => {
        if (!this.validateField(input)) {
          isValid = false;
        }
      });

      return isValid;
    }

    /**
     * Collect form data
     */
    collectFormData() {
      const data = {
        first_name: '',
        last_name: '',
        full_name: '',
        email: '',
        phone: '',
        zip_code: '',
        project_type: '',
        message: '',
        timeline: '',
        budget: '',
        billing_address: null,
        service_address: null,
        address_same: this.addressSame,
        source: this.config.source,
        form_name: this.config.formName,
        page_url: window.location.href
      };

      // Collect standard fields
      const fieldMap = {
        'first-name': 'first_name',
        'last-name': 'last_name',
        'email': 'email',
        'phone': 'phone',
        'zip': 'zip_code',
        'project-type': 'project_type',
        'message': 'message',
        'timeline': 'timeline',
        'budget': 'budget'
      };

      Object.entries(fieldMap).forEach(([fieldId, dataKey]) => {
        const input = this.container.querySelector(`[data-field="${fieldId}"]`) ||
                      this.container.querySelector(`#${fieldId}`) ||
                      this.container.querySelector(`[name="${fieldId}"]`);
        if (input) {
          data[dataKey] = input.value.trim();
        }
      });

      // Set full name
      data.full_name = `${data.first_name} ${data.last_name}`.trim();

      // Collect billing address
      if (this.config.addressMode !== 'none') {
        data.billing_address = this.collectAddress('billing');
      }

      // Collect service address (if different)
      if (this.config.addressMode === 'billing-service' && !this.addressSame) {
        data.service_address = this.collectAddress('service');
      }

      // Attach uploaded image URLs
      if (this.uploadedImageUrls?.length) {
        data.image_urls = this.uploadedImageUrls;
      }

      return data;
    }

    /**
     * Collect address fields
     */
    collectAddress(prefix) {
      const address = {
        street: '',
        street2: '',
        city: '',
        state: '',
        zip: ''
      };

      const fields = ['street', 'street2', 'city', 'state', 'zip'];
      fields.forEach(field => {
        const input = this.container.querySelector(`[data-field="${prefix}-${field}"]`) ||
                      this.container.querySelector(`#${prefix}-${field}`);
        if (input) {
          address[field] = input.value.trim();
        }
      });

      // Only return if at least street is filled
      return address.street ? address : null;
    }

    /**
     * Handle form submission
     */
    async handleSubmit(e) {
      if (e) e.preventDefault();

      if (this.isSubmitting) return;

      // Validate
      if (!this.validateForm()) {
        const firstError = this.container.querySelector('.ulf-error input, .ulf-error select');
        if (firstError) firstError.focus();
        return;
      }

      this.isSubmitting = true;
      this.setLoading(true);

      const data = this.collectFormData();

      // Custom onSubmit handler
      if (typeof this.config.onSubmit === 'function') {
        try {
          await this.config.onSubmit(data);
        } catch (err) {
          console.error('Custom onSubmit error:', err);
        }
      }

      // Submit to endpoints
      const results = await this.submitToEndpoints(data);
      const success = results.some(r => r.success);

      this.isSubmitting = false;
      this.setLoading(false);

      if (success) {
        if (typeof this.config.onSuccess === 'function') {
          this.config.onSuccess(data, results);
        }
      } else {
        if (typeof this.config.onError === 'function') {
          this.config.onError(results);
        }
      }

      return { success, data, results };
    }

    /**
     * Submit to Supabase ONLY via centralized lead service
     * ALL leads go to /account page leads tab
     */
    async submitToEndpoints(data) {
      const results = [];

      // Use centralized lead service if available
      if (window.SG_LeadService) {
        const result = await window.SG_LeadService.submitLead({
          name: data.full_name,
          email: data.email,
          phone: data.phone,
          projectType: data.project_type,
          timeline: data.timeline,
          budget: data.budget,
          message: data.message,
          address: data.billing_address?.street,
          city: data.billing_address?.city,
          state: data.billing_address?.state,
          zip: data.billing_address?.zip || data.zip_code,
          formName: this.config.formName,
          source: this.config.source,
          image_urls: data.image_urls || []
        });
        results.push({ endpoint: 'supabase', success: result.success, data: result.data });
      } else {
        // Fallback: Direct Supabase submission
        const sgConfig = window.SG_CONFIG || {};
        const supabaseUrl = sgConfig.SUPABASE_URL || 'https://ypeypgwsycxcagncgdur.supabase.co';
        const supabaseKey = sgConfig.SUPABASE_ANON_KEY || '';

        try {
          const response = await fetchWithTimeout(`${supabaseUrl}/rest/v1/leads`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseKey,
              'Prefer': 'return=representation'
            },
            body: JSON.stringify({
              full_name: data.full_name,
              // Lowercase email so server-side dedup matches — prevents Josh@x.com and josh@x.com becoming two leads.
              email: (data.email || '').toLowerCase().trim(),
              phone: data.phone,
              project_type: data.project_type,
              message: data.message,
              source: 'website',
              form_name: this.config.formName,
              page_url: window.location.href,
              image_urls: data.image_urls || []
            })
          }, 15000);
          results.push({ endpoint: 'supabase', success: response.ok, status: response.status });
        } catch (err) {
          results.push({ endpoint: 'supabase', success: false, error: err.message });
        }
      }

      return results;
    }

    /**
     * Set loading state
     */
    setLoading(loading) {
      const submitBtn = this.container.querySelector('[type="submit"], [data-submit]');
      if (submitBtn) {
        submitBtn.disabled = loading;

        if (loading) {
          submitBtn.dataset.originalText = submitBtn.innerHTML;
          submitBtn.innerHTML = `
            <span class="ulf-loading">
              <span class="ulf-spinner"></span>
              Submitting...
            </span>
          `;
        } else if (submitBtn.dataset.originalText) {
          submitBtn.innerHTML = submitBtn.dataset.originalText;
        }
      }
    }

    /**
     * Reset form
     */
    reset() {
      const form = this.container.querySelector('form');
      if (form) form.reset();

      this.addressSame = true;
      const serviceSection = this.container.querySelector('[data-service-address]');
      if (serviceSection) {
        serviceSection.classList.remove('ulf-visible');
      }

      this.container.querySelectorAll('.ulf-error, .ulf-success').forEach(el => {
        el.classList.remove('ulf-error', 'ulf-success');
      });
    }

    /**
     * Generate state options HTML
     */
    static getStateOptions(selected = 'AZ') {
      return US_STATES.map(state =>
        `<option value="${state.code}" ${state.code === selected ? 'selected' : ''}>${state.code}</option>`
      ).join('');
    }

    /**
     * Generate address section HTML
     */
    static generateAddressHTML(prefix, title, config = {}) {
      const stateOptions = UnifiedLeadForm.getStateOptions(config.defaultState || 'AZ');
      const isService = prefix === 'service';

      return `
        <div class="ulf-address-section ${isService ? 'ulf-service-address' : ''}" ${isService ? 'data-service-address' : ''}>
          <div class="ulf-section-header">
            <svg class="ulf-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            <h4 class="ulf-section-title">${title}</h4>
          </div>

          <div class="ulf-row">
            <div class="ulf-input-group ulf-flex-3">
              <label class="ulf-label">Street Address ${!isService ? '<span class="ulf-required">*</span>' : ''}</label>
              <input type="text" class="ulf-input" data-field="${prefix}-street" ${!isService ? 'required' : 'data-required'}
                     placeholder="123 Main St" autocomplete="${prefix === 'billing' ? 'street-address' : 'off'}">
              <span class="ulf-error-message"></span>
            </div>
            <div class="ulf-input-group">
              <label class="ulf-label">Unit/Apt</label>
              <input type="text" class="ulf-input" data-field="${prefix}-street2" placeholder="Apt 4B">
            </div>
          </div>

          <div class="ulf-row">
            <div class="ulf-input-group ulf-flex-2">
              <label class="ulf-label">City ${!isService ? '<span class="ulf-required">*</span>' : ''}</label>
              <input type="text" class="ulf-input" data-field="${prefix}-city" ${!isService ? 'required' : 'data-required'}
                     placeholder="Surprise" autocomplete="${prefix === 'billing' ? 'address-level2' : 'off'}">
              <span class="ulf-error-message"></span>
            </div>
            <div class="ulf-input-group">
              <label class="ulf-label">State ${!isService ? '<span class="ulf-required">*</span>' : ''}</label>
              <select class="ulf-select ulf-state-select" data-field="${prefix}-state" ${!isService ? 'required' : 'data-required'}>
                ${stateOptions}
              </select>
            </div>
            <div class="ulf-input-group">
              <label class="ulf-label">ZIP ${!isService ? '<span class="ulf-required">*</span>' : ''}</label>
              <input type="text" class="ulf-input" data-field="${prefix}-zip" data-format="zip" data-validate="zip"
                     ${!isService ? 'required' : 'data-required'} placeholder="85374" maxlength="5"
                     autocomplete="${prefix === 'billing' ? 'postal-code' : 'off'}">
              <span class="ulf-error-message"></span>
            </div>
          </div>
        </div>
      `;
    }

    /**
     * Generate address toggle HTML
     */
    static generateAddressToggleHTML() {
      return `
        <div class="ulf-address-toggle">
          <label class="ulf-checkbox-label">
            <input type="checkbox" class="ulf-checkbox" data-address-toggle checked>
            <span>Service address is the same as billing address</span>
          </label>
        </div>
      `;
    }
  }

  // Export to global scope
  window.UnifiedLeadForm = UnifiedLeadForm;

})();
