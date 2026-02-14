/**
 * Universal Scheduling CTA Widget
 * Adds "Schedule Consultation" functionality to any page
 *
 * Usage: Include this script and call ScheduleCTA.init() or add data-schedule-cta to a container
 */

(function() {
  'use strict';

  const API_BASE = window.SG_CONFIG?.API_BASE || 'https://surprise-granite-email-api.onrender.com';

  // Default available times
  const DEFAULT_TIMES = [
    '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
    '15:00', '15:30', '16:00', '16:30', '17:00'
  ];

  const ScheduleCTA = {
    modalId: 'schedule-cta-modal',
    isInitialized: false,

    /**
     * Initialize the widget
     */
    init(options = {}) {
      if (this.isInitialized) return;

      this.options = {
        buttonText: 'Schedule Free Consultation',
        buttonClass: 'schedule-cta-btn',
        source: options.source || window.location.pathname,
        projectType: options.projectType || 'consultation',
        ...options
      };

      this.createModal();
      this.bindEvents();
      this.isInitialized = true;

      // Auto-attach to elements with data-schedule-cta
      document.querySelectorAll('[data-schedule-cta]').forEach(el => {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          this.open();
        });
      });
    },

    /**
     * Create the modal HTML
     */
    createModal() {
      if (document.getElementById(this.modalId)) return;

      const modal = document.createElement('div');
      modal.id = this.modalId;
      modal.className = 'schedule-modal-overlay';
      modal.innerHTML = `
        <div class="schedule-modal">
          <button class="schedule-modal-close" aria-label="Close">&times;</button>

          <div class="schedule-modal-header">
            <h2>Schedule Your Free Consultation</h2>
            <p>Pick a date and time that works for you</p>
          </div>

          <form id="schedule-cta-form" class="schedule-form">
            <div class="schedule-form-row">
              <div class="schedule-form-group">
                <label>Your Name *</label>
                <input type="text" id="schedule-name" required placeholder="John Smith" />
              </div>
            </div>

            <div class="schedule-form-row schedule-form-row-2col">
              <div class="schedule-form-group">
                <label>Email *</label>
                <input type="email" id="schedule-email" required placeholder="you@email.com" />
              </div>
              <div class="schedule-form-group">
                <label>Phone</label>
                <input type="tel" id="schedule-phone" placeholder="(555) 123-4567" />
              </div>
            </div>

            <div class="schedule-form-row schedule-form-row-2col">
              <div class="schedule-form-group">
                <label>Preferred Date *</label>
                <input type="date" id="schedule-date" required />
              </div>
              <div class="schedule-form-group">
                <label>Preferred Time *</label>
                <select id="schedule-time" required>
                  <option value="">Select a time</option>
                  ${DEFAULT_TIMES.map(t => `<option value="${t}">${this.formatTime(t)}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="schedule-form-group">
              <label>Project Address</label>
              <input type="text" id="schedule-address" placeholder="123 Main St, City, AZ 85000" />
            </div>

            <div class="schedule-form-group">
              <label>Tell us about your project</label>
              <textarea id="schedule-notes" rows="3" placeholder="Kitchen countertops, bathroom vanity, etc..."></textarea>
            </div>

            <button type="submit" class="schedule-submit-btn">
              <span class="schedule-submit-text">Request Appointment</span>
              <span class="schedule-submit-loading" style="display:none;">
                <svg class="schedule-spinner" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="31.4" stroke-dashoffset="10"/></svg>
                Scheduling...
              </span>
            </button>
          </form>

          <div id="schedule-success" class="schedule-success" style="display:none;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="schedule-success-icon">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <h3>Appointment Requested!</h3>
            <p>We'll confirm your appointment shortly via email.</p>
            <button type="button" class="schedule-done-btn" onclick="ScheduleCTA.close()">Done</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      this.injectStyles();
    },

    /**
     * Format 24h time to 12h
     */
    formatTime(time24) {
      const [hours, minutes] = time24.split(':');
      const h = parseInt(hours);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${h12}:${minutes} ${ampm}`;
    },

    /**
     * Inject CSS styles
     */
    injectStyles() {
      if (document.getElementById('schedule-cta-styles')) return;

      const styles = document.createElement('style');
      styles.id = 'schedule-cta-styles';
      styles.textContent = `
        .schedule-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.2s, visibility 0.2s;
          padding: 20px;
        }
        .schedule-modal-overlay.active {
          opacity: 1;
          visibility: visible;
        }
        .schedule-modal {
          background: #1a1a2e;
          border-radius: 16px;
          max-width: 480px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          position: relative;
          box-shadow: 0 25px 50px rgba(0,0,0,0.5);
        }
        .schedule-modal-close {
          position: absolute;
          top: 16px;
          right: 16px;
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.2);
          color: rgba(255,255,255,0.7);
          font-size: 24px;
          cursor: pointer;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          transition: all 0.2s;
          line-height: 1;
        }
        .schedule-modal-close:hover {
          background: rgba(255,255,255,0.15);
          border-color: rgba(255,255,255,0.3);
          color: #fff;
        }
        .schedule-modal-header {
          padding: 24px 24px 0;
          text-align: center;
        }
        .schedule-modal-header h2 {
          margin: 0 0 8px;
          font-size: 22px;
          color: #fff;
        }
        .schedule-modal-header p {
          margin: 0;
          color: rgba(255,255,255,0.6);
          font-size: 14px;
        }
        .schedule-form {
          padding: 20px 24px 24px;
        }
        .schedule-form-row {
          margin-bottom: 16px;
        }
        .schedule-form-row-2col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .schedule-form-group label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: rgba(255,255,255,0.8);
          margin-bottom: 6px;
        }
        .schedule-form-group input,
        .schedule-form-group select,
        .schedule-form-group textarea {
          width: 100%;
          padding: 12px 14px;
          background: #16161f;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          color: #fff;
          font-size: 15px;
          transition: border-color 0.2s;
        }
        .schedule-form-group input:focus,
        .schedule-form-group select:focus,
        .schedule-form-group textarea:focus {
          outline: none;
          border-color: #f9cb00;
        }
        .schedule-form-group input::placeholder,
        .schedule-form-group textarea::placeholder {
          color: rgba(255,255,255,0.3);
        }
        .schedule-submit-btn {
          width: 100%;
          padding: 14px 24px;
          background: linear-gradient(135deg, #f9cb00, #cca600);
          color: #000;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 8px;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .schedule-submit-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(249,203,0,0.3);
        }
        .schedule-submit-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          transform: none;
        }
        .schedule-spinner {
          width: 18px;
          height: 18px;
          animation: schedule-spin 1s linear infinite;
          vertical-align: middle;
          margin-right: 8px;
        }
        @keyframes schedule-spin {
          to { transform: rotate(360deg); }
        }
        .schedule-success {
          padding: 40px 24px;
          text-align: center;
        }
        .schedule-success-icon {
          width: 64px;
          height: 64px;
          color: #22c55e;
          margin-bottom: 16px;
        }
        .schedule-success h3 {
          margin: 0 0 8px;
          color: #fff;
          font-size: 20px;
        }
        .schedule-success p {
          margin: 0 0 20px;
          color: rgba(255,255,255,0.6);
        }
        .schedule-done-btn {
          padding: 12px 32px;
          background: rgba(255,255,255,0.1);
          color: #fff;
          border: none;
          border-radius: 8px;
          font-size: 15px;
          cursor: pointer;
        }
        .schedule-done-btn:hover {
          background: rgba(255,255,255,0.15);
        }
        /* CTA Button styles */
        .schedule-cta-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 14px 28px;
          background: linear-gradient(135deg, #f9cb00, #cca600);
          color: #000;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .schedule-cta-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(249,203,0,0.4);
        }
        @media (max-width: 500px) {
          .schedule-form-row-2col {
            grid-template-columns: 1fr;
          }
        }
      `;
      document.head.appendChild(styles);
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
      const modal = document.getElementById(this.modalId);
      const form = document.getElementById('schedule-cta-form');

      // Close on overlay click
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.close();
      });

      // Close button
      modal.querySelector('.schedule-modal-close').addEventListener('click', () => this.close());

      // Form submit
      form.addEventListener('submit', (e) => this.handleSubmit(e));

      // Set min date to today
      const dateInput = document.getElementById('schedule-date');
      const today = new Date().toISOString().split('T')[0];
      dateInput.min = today;
      dateInput.value = '';

      // ESC to close
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
          this.close();
        }
      });
    },

    /**
     * Open the modal
     */
    open() {
      const modal = document.getElementById(this.modalId);
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';

      // Reset form
      document.getElementById('schedule-cta-form').reset();
      document.getElementById('schedule-cta-form').style.display = 'block';
      document.getElementById('schedule-success').style.display = 'none';

      // Focus first input
      setTimeout(() => {
        document.getElementById('schedule-name').focus();
      }, 100);
    },

    /**
     * Close the modal
     */
    close() {
      const modal = document.getElementById(this.modalId);
      modal.classList.remove('active');
      document.body.style.overflow = '';
    },

    /**
     * Handle form submission
     */
    async handleSubmit(e) {
      e.preventDefault();

      const btn = e.target.querySelector('.schedule-submit-btn');
      const btnText = btn.querySelector('.schedule-submit-text');
      const btnLoading = btn.querySelector('.schedule-submit-loading');

      btn.disabled = true;
      btnText.style.display = 'none';
      btnLoading.style.display = 'inline-flex';

      const data = {
        name: document.getElementById('schedule-name').value.trim(),
        email: document.getElementById('schedule-email').value.trim(),
        phone: document.getElementById('schedule-phone').value.trim(),
        date: document.getElementById('schedule-date').value,
        time: document.getElementById('schedule-time').value,
        address: document.getElementById('schedule-address').value.trim(),
        notes: document.getElementById('schedule-notes').value.trim(),
        event_type: 'consultation',
        project_type: this.options.projectType,
        source: this.options.source
      };

      try {
        const leadData = {
          homeowner_name: data.name,
          homeowner_email: data.email,
          homeowner_phone: data.phone,
          project_type: data.project_type,
          project_address: data.address,
          project_details: data.notes,
          appointment_date: data.date,
          appointment_time: data.time,
          source: data.source
        };

        // Try the calendar booking API first
        const response = await fetch(`${API_BASE}/api/calendar/book`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        // Always save as lead (for CRM tracking + notifications)
        const leadsResponse = await fetch(`${API_BASE}/api/leads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(leadData)
        });

        // If both failed, throw
        if (!response.ok && (!leadsResponse || !leadsResponse.ok)) {
          throw new Error('Booking failed');
        }

        // Show success
        document.getElementById('schedule-cta-form').style.display = 'none';
        document.getElementById('schedule-success').style.display = 'block';

      } catch (err) {
        console.error('Scheduling error:', err);
        alert('Sorry, there was an error scheduling your appointment. Please call us directly.');
      } finally {
        btn.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
      }
    },

    /**
     * Create a CTA button element
     */
    createButton(text = 'Schedule Free Consultation') {
      const btn = document.createElement('button');
      btn.className = 'schedule-cta-btn';
      btn.setAttribute('data-schedule-cta', '');
      btn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        ${text}
      `;
      btn.addEventListener('click', () => this.open());
      return btn;
    }
  };

  // Auto-initialize when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ScheduleCTA.init());
  } else {
    ScheduleCTA.init();
  }

  // Export to global
  window.ScheduleCTA = ScheduleCTA;

})();
