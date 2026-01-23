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
  const DEFAULT_CONFIG = {
    theme: 'dark', // 'dark' or 'light'
    addressMode: 'none', // 'none', 'simple', 'billing-service'
    defaultState: 'AZ',
    showProjectFields: true,
    showImageUpload: false,
    submitEndpoints: {
      supabase: true,
      renderApi: true
    },
    supabaseUrl: (window.SG_CONFIG || {}).SUPABASE_URL || 'https://ypeypgwsycxcagncgdur.supabase.co',
    supabaseKey: (window.SG_CONFIG || {}).SUPABASE_ANON_KEY || '',
    renderApiUrl: (window.SG_CONFIG || {}).API_URL ? (window.SG_CONFIG.API_URL + '/api/leads') : 'https://surprise-granite-email-api.onrender.com/api/leads',
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

      // Form submission
      const form = this.container.querySelector('form');
      if (form) {
        form.addEventListener('submit', (e) => this.handleSubmit(e));
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
     * Submit to configured endpoints
     */
    async submitToEndpoints(data) {
      const results = [];

      // Supabase
      if (this.config.submitEndpoints.supabase) {
        try {
          const response = await fetch(`${this.config.supabaseUrl}/rest/v1/leads`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': this.config.supabaseKey,
              'Authorization': `Bearer ${this.config.supabaseKey}`,
              'Prefer': 'return=representation'
            },
            body: JSON.stringify(data)
          });
          results.push({ endpoint: 'supabase', success: response.ok, status: response.status });
        } catch (err) {
          results.push({ endpoint: 'supabase', success: false, error: err.message });
        }
      }

      // Render API
      if (this.config.submitEndpoints.renderApi) {
        try {
          const response = await fetch(this.config.renderApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          results.push({ endpoint: 'renderApi', success: response.ok, status: response.status });
        } catch (err) {
          results.push({ endpoint: 'renderApi', success: false, error: err.message });
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
