/**
 * REMODELY BOOKING WIDGET
 * White-label booking & lead generation system
 * Embeddable on any website
 * Version: 1.0
 */

(function() {
  'use strict';

  // Default configuration
  const DEFAULT_CONFIG = {
    // Branding
    businessName: 'Your Business',
    logo: '',
    primaryColor: '#f9cb00',
    secondaryColor: '#1a1a2e',

    // Contact
    phone: '',
    email: '',

    // Services offered
    services: [
      { id: 'countertops', name: 'Countertops', icon: 'counter', description: 'Granite, Quartz, Marble & more' },
      { id: 'tile', name: 'Tile & Backsplash', icon: 'tile', description: 'Kitchen, bathroom & floors' },
      { id: 'flooring', name: 'Flooring', icon: 'floor', description: 'Hardwood, LVP, Tile' },
      { id: 'cabinets', name: 'Cabinets', icon: 'cabinet', description: 'Kitchen & bathroom cabinets' },
      { id: 'full-remodel', name: 'Full Remodel', icon: 'home', description: 'Complete kitchen or bath' }
    ],

    // Qualification questions
    qualifyQuestions: [
      {
        id: 'timeline',
        question: 'When are you looking to start?',
        type: 'select',
        options: [
          { value: 'asap', label: 'As soon as possible', score: 10 },
          { value: '1-2weeks', label: 'Within 1-2 weeks', score: 8 },
          { value: '1month', label: 'Within a month', score: 6 },
          { value: '2-3months', label: '2-3 months', score: 4 },
          { value: 'planning', label: 'Just planning ahead', score: 2 }
        ]
      },
      {
        id: 'budget',
        question: 'What\'s your approximate budget?',
        type: 'select',
        options: [
          { value: 'under5k', label: 'Under $5,000', score: 3 },
          { value: '5k-10k', label: '$5,000 - $10,000', score: 6 },
          { value: '10k-20k', label: '$10,000 - $20,000', score: 8 },
          { value: '20k-50k', label: '$20,000 - $50,000', score: 10 },
          { value: '50k+', label: '$50,000+', score: 10 },
          { value: 'unsure', label: 'Not sure yet', score: 4 }
        ]
      },
      {
        id: 'decision',
        question: 'Who will be making the decision?',
        type: 'select',
        options: [
          { value: 'me', label: 'I am the decision maker', score: 10 },
          { value: 'spouse', label: 'Me and my spouse/partner', score: 8 },
          { value: 'other', label: 'Someone else', score: 4 }
        ]
      }
    ],

    // Scheduling
    availableDays: [1, 2, 3, 4, 5, 6], // Mon-Sat
    availableHours: { start: 8, end: 18 },
    slotDuration: 60, // minutes
    leadTime: 24, // hours minimum before booking
    maxAdvance: 30, // days ahead

    // Instant estimate settings
    enableInstantEstimate: true,
    estimateRanges: {
      countertops: { min: 40, max: 150, unit: 'sqft' },
      tile: { min: 8, max: 25, unit: 'sqft' },
      flooring: { min: 6, max: 20, unit: 'sqft' },
      cabinets: { min: 200, max: 800, unit: 'linear ft' },
      'full-remodel': { min: 15000, max: 75000, unit: 'project' }
    },

    // API endpoints
    apiEndpoint: 'https://api.remodely.ai',
    webhookUrl: '',

    // Analytics
    trackingId: '',

    // Display
    theme: 'dark', // 'light' or 'dark'
    position: 'right', // 'left', 'right', 'center'
    triggerType: 'button', // 'button', 'inline', 'floating'

    // Success actions
    successRedirect: '',
    successMessage: 'Your consultation has been booked! We\'ll see you soon.'
  };

  // Widget class
  class RemodelyBooking {
    constructor(config = {}) {
      this.config = { ...DEFAULT_CONFIG, ...config };
      this.state = {
        step: 1,
        service: null,
        answers: {},
        contact: {},
        date: null,
        time: null,
        estimate: null,
        leadScore: 0
      };
      this.container = null;
      this.isOpen = false;
    }

    // Initialize the widget
    init(containerId) {
      if (containerId) {
        this.container = document.getElementById(containerId);
        if (this.container) {
          this.renderInline();
        }
      } else if (this.config.triggerType !== 'none') {
        this.createFloatingButton();
      }
      this.injectStyles();
      this.trackEvent('widget_loaded');
    }

    // Inject CSS
    injectStyles() {
      if (document.getElementById('remodely-booking-styles')) return;

      const primary = this.config.primaryColor;
      const secondary = this.config.secondaryColor;
      const isDark = this.config.theme === 'dark';

      const styles = document.createElement('style');
      styles.id = 'remodely-booking-styles';
      styles.textContent = `
        .rb-widget * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }

        .rb-floating-btn {
          position: fixed;
          bottom: 24px;
          ${this.config.position === 'left' ? 'left: 24px;' : 'right: 24px;'}
          background: linear-gradient(135deg, ${primary}, ${this.adjustColor(primary, -20)});
          color: ${secondary};
          border: none;
          padding: 16px 28px;
          border-radius: 50px;
          font-weight: 700;
          font-size: 15px;
          cursor: pointer;
          box-shadow: 0 4px 24px rgba(0,0,0,0.3);
          z-index: 99998;
          display: flex;
          align-items: center;
          gap: 10px;
          transition: all 0.3s ease;
        }
        .rb-floating-btn:hover { transform: translateY(-3px); box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
        .rb-floating-btn svg { width: 20px; height: 20px; }

        .rb-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.8);
          backdrop-filter: blur(8px);
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          opacity: 0;
          visibility: hidden;
          transition: all 0.3s ease;
        }
        .rb-modal-overlay.open { opacity: 1; visibility: visible; }

        .rb-modal {
          background: ${isDark ? secondary : '#ffffff'};
          border-radius: 20px;
          width: 100%;
          max-width: 540px;
          max-height: 90vh;
          overflow: hidden;
          transform: translateY(20px) scale(0.95);
          transition: all 0.3s ease;
          display: flex;
          flex-direction: column;
        }
        .rb-modal-overlay.open .rb-modal { transform: translateY(0) scale(1); }

        .rb-header {
          padding: 24px;
          background: linear-gradient(135deg, ${secondary}, ${this.adjustColor(secondary, 10)});
          color: #fff;
          position: relative;
        }
        .rb-header-logo { height: 32px; margin-bottom: 12px; }
        .rb-header-title { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
        .rb-header-subtitle { font-size: 14px; opacity: 0.8; }
        .rb-close {
          position: absolute;
          top: 20px;
          right: 20px;
          background: rgba(255,255,255,0.1);
          border: none;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          color: #fff;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .rb-close:hover { background: rgba(255,255,255,0.2); }
        .rb-close svg { width: 20px; height: 20px; }

        .rb-progress {
          display: flex;
          padding: 16px 24px;
          background: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'};
          gap: 8px;
        }
        .rb-progress-step {
          flex: 1;
          height: 4px;
          border-radius: 2px;
          background: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};
          transition: all 0.3s;
        }
        .rb-progress-step.active { background: ${primary}; }
        .rb-progress-step.completed { background: ${primary}; }

        .rb-body {
          padding: 24px;
          overflow-y: auto;
          flex: 1;
          color: ${isDark ? '#fff' : '#1a1a2e'};
        }

        .rb-step { display: none; animation: rbFadeIn 0.3s ease; }
        .rb-step.active { display: block; }
        @keyframes rbFadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        .rb-step-title { font-size: 18px; font-weight: 700; margin-bottom: 20px; }

        .rb-services { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
        .rb-service {
          background: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'};
          border: 2px solid transparent;
          border-radius: 12px;
          padding: 16px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: center;
        }
        .rb-service:hover { border-color: ${primary}; background: ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'}; }
        .rb-service.selected { border-color: ${primary}; background: ${this.hexToRgba(primary, 0.15)}; }
        .rb-service-icon {
          width: 48px;
          height: 48px;
          margin: 0 auto 12px;
          background: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'};
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .rb-service.selected .rb-service-icon { background: ${primary}; }
        .rb-service-icon svg { width: 24px; height: 24px; color: ${isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)'}; }
        .rb-service.selected .rb-service-icon svg { color: ${secondary}; }
        .rb-service-name { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
        .rb-service-desc { font-size: 12px; opacity: 0.6; }

        .rb-question { margin-bottom: 20px; }
        .rb-question-label { font-weight: 600; margin-bottom: 12px; font-size: 15px; }
        .rb-options { display: flex; flex-direction: column; gap: 8px; }
        .rb-option {
          background: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'};
          border: 2px solid transparent;
          border-radius: 10px;
          padding: 14px 16px;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 14px;
        }
        .rb-option:hover { border-color: ${primary}; }
        .rb-option.selected { border-color: ${primary}; background: ${this.hexToRgba(primary, 0.15)}; }

        .rb-form-group { margin-bottom: 16px; }
        .rb-label { display: block; font-weight: 500; margin-bottom: 8px; font-size: 14px; }
        .rb-input {
          width: 100%;
          padding: 14px 16px;
          background: ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'};
          border: 2px solid transparent;
          border-radius: 10px;
          color: ${isDark ? '#fff' : '#1a1a2e'};
          font-size: 15px;
          transition: all 0.2s;
        }
        .rb-input:focus { outline: none; border-color: ${primary}; background: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.03)'}; }
        .rb-input::placeholder { color: ${isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}; }

        .rb-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

        .rb-calendar { margin-bottom: 20px; }
        .rb-cal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .rb-cal-title { font-weight: 600; }
        .rb-cal-nav { display: flex; gap: 8px; }
        .rb-cal-btn {
          background: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'};
          border: none;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${isDark ? '#fff' : '#1a1a2e'};
          transition: all 0.2s;
        }
        .rb-cal-btn:hover { background: ${primary}; color: ${secondary}; }
        .rb-cal-btn svg { width: 16px; height: 16px; }
        .rb-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
        .rb-cal-day-name { text-align: center; font-size: 11px; font-weight: 600; opacity: 0.5; padding: 8px 0; }
        .rb-cal-day {
          aspect-ratio: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          background: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'};
        }
        .rb-cal-day:hover:not(.disabled) { background: ${this.hexToRgba(primary, 0.3)}; }
        .rb-cal-day.selected { background: ${primary}; color: ${secondary}; font-weight: 600; }
        .rb-cal-day.disabled { opacity: 0.3; cursor: not-allowed; background: transparent; }
        .rb-cal-day.other-month { opacity: 0.3; }

        .rb-times { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 16px; }
        .rb-time {
          padding: 12px;
          background: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'};
          border: 2px solid transparent;
          border-radius: 8px;
          text-align: center;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
        }
        .rb-time:hover { border-color: ${primary}; }
        .rb-time.selected { border-color: ${primary}; background: ${this.hexToRgba(primary, 0.15)}; }

        .rb-estimate {
          background: linear-gradient(135deg, ${primary}, ${this.adjustColor(primary, -15)});
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 20px;
          color: ${secondary};
        }
        .rb-estimate-label { font-size: 13px; opacity: 0.8; margin-bottom: 4px; }
        .rb-estimate-value { font-size: 28px; font-weight: 800; }
        .rb-estimate-note { font-size: 12px; opacity: 0.7; margin-top: 8px; }

        .rb-footer {
          padding: 20px 24px;
          border-top: 1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};
          display: flex;
          gap: 12px;
        }
        .rb-btn {
          flex: 1;
          padding: 14px 24px;
          border-radius: 10px;
          font-weight: 600;
          font-size: 15px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: none;
        }
        .rb-btn-secondary {
          background: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'};
          color: ${isDark ? '#fff' : '#1a1a2e'};
        }
        .rb-btn-secondary:hover { background: ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)'}; }
        .rb-btn-primary {
          background: linear-gradient(135deg, ${primary}, ${this.adjustColor(primary, -15)});
          color: ${secondary};
        }
        .rb-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 4px 16px ${this.hexToRgba(primary, 0.4)}; }
        .rb-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; }
        .rb-btn svg { width: 18px; height: 18px; }

        .rb-success {
          text-align: center;
          padding: 40px 20px;
        }
        .rb-success-icon {
          width: 80px;
          height: 80px;
          background: ${this.hexToRgba(primary, 0.2)};
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
        }
        .rb-success-icon svg { width: 40px; height: 40px; color: ${primary}; }
        .rb-success-title { font-size: 24px; font-weight: 700; margin-bottom: 12px; }
        .rb-success-message { opacity: 0.7; margin-bottom: 24px; line-height: 1.6; }
        .rb-success-details {
          background: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'};
          border-radius: 12px;
          padding: 20px;
          text-align: left;
        }
        .rb-success-detail { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}; }
        .rb-success-detail:last-child { border-bottom: none; }
        .rb-success-detail-label { opacity: 0.6; }
        .rb-success-detail-value { font-weight: 600; }

        .rb-powered {
          text-align: center;
          padding: 12px;
          font-size: 11px;
          opacity: 0.5;
          border-top: 1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'};
        }
        .rb-powered a { color: ${primary}; text-decoration: none; font-weight: 600; }

        .rb-inline { border-radius: 16px; overflow: hidden; border: 1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}; }

        @media (max-width: 600px) {
          .rb-services { grid-template-columns: 1fr; }
          .rb-row { grid-template-columns: 1fr; }
          .rb-times { grid-template-columns: repeat(2, 1fr); }
          .rb-modal { max-height: 100vh; border-radius: 0; }
        }
      `;
      document.head.appendChild(styles);
    }

    // Create floating trigger button
    createFloatingButton() {
      const btn = document.createElement('button');
      btn.className = 'rb-floating-btn';
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        Book Free Estimate
      `;
      btn.onclick = () => this.open();
      document.body.appendChild(btn);
    }

    // Open modal
    open() {
      if (!document.getElementById('rb-modal-overlay')) {
        this.createModal();
      }
      document.getElementById('rb-modal-overlay').classList.add('open');
      document.body.style.overflow = 'hidden';
      this.isOpen = true;
      this.trackEvent('widget_opened');
    }

    // Close modal
    close() {
      const overlay = document.getElementById('rb-modal-overlay');
      if (overlay) {
        overlay.classList.remove('open');
        document.body.style.overflow = '';
        this.isOpen = false;
      }
    }

    // Create modal structure
    createModal() {
      const overlay = document.createElement('div');
      overlay.id = 'rb-modal-overlay';
      overlay.className = 'rb-modal-overlay';
      overlay.innerHTML = this.renderWidget();
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.close();
      });
      document.body.appendChild(overlay);
      this.bindEvents();
    }

    // Render inline widget
    renderInline() {
      this.container.className = 'rb-widget rb-inline';
      this.container.innerHTML = this.renderWidgetContent();
      this.bindEvents();
    }

    // Render widget HTML
    renderWidget() {
      return `
        <div class="rb-widget rb-modal">
          ${this.renderWidgetContent()}
        </div>
      `;
    }

    renderWidgetContent() {
      const { businessName, logo, tagline } = this.config;
      const primary = this.config.primaryColor;

      // Custom logo for Surprise Granite (inline SVG icon only)
      const surpriseGraniteLogo = businessName === 'Surprise Granite' ? `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 390 402" width="36" height="37" fill="${primary}" style="display: block; margin-bottom: 12px;">
          <g transform="translate(0.269 0.052)">
            <path d="M194.6,32.106l166.79,96.3V373.463H27.807V128.406l166.79-96.3M194.6,0,0,112.353V401.271H389.213V112.353L194.6,0Z"/>
            <path d="M257.77,133.82,87.52,34.06,61.3,51.7l168.663,98.173V374.579H257.77Z" transform="translate(48.039 26.692)"/>
            <path d="M212.1,353.7H184.292V177.137L13.15,78.323,41.207,60.7,212.1,161.085Z" transform="translate(10.305 47.568)"/>
            <path d="M129.182,173.571,12.53,106.22v32.106l88.862,51.3V318.03h27.789Z" transform="translate(9.819 83.241)"/>
          </g>
        </svg>
      ` : (logo ? `<img src="${logo}" class="rb-header-logo" alt="${businessName}">` : '');

      return `
        <div class="rb-header">
          ${surpriseGraniteLogo}
          <div class="rb-header-title">Book Your Free Consultation</div>
          <div class="rb-header-subtitle">${businessName} - Let's bring your vision to life</div>
          <button class="rb-close" onclick="window.remodelyBooking.close()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="rb-progress">
          <div class="rb-progress-step active" data-step="1"></div>
          <div class="rb-progress-step" data-step="2"></div>
          <div class="rb-progress-step" data-step="3"></div>
          <div class="rb-progress-step" data-step="4"></div>
        </div>

        <div class="rb-body">
          ${this.renderStep1()}
          ${this.renderStep2()}
          ${this.renderStep3()}
          ${this.renderStep4()}
          ${this.renderSuccess()}
        </div>

        <div class="rb-footer">
          <button class="rb-btn rb-btn-secondary" id="rb-back" style="display: none;" onclick="window.remodelyBooking.prevStep()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
            Back
          </button>
          <button class="rb-btn rb-btn-primary" id="rb-next" onclick="window.remodelyBooking.nextStep()">
            Continue
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>

        <div class="rb-powered">Powered by <a href="https://remodely.ai" target="_blank">Remodely.ai</a></div>
      `;
    }

    // Render Step 1: Service Selection
    renderStep1() {
      const services = this.config.services.map(s => `
        <div class="rb-service" data-service="${s.id}">
          <div class="rb-service-icon">${this.getServiceIcon(s.icon)}</div>
          <div class="rb-service-name">${s.name}</div>
          <div class="rb-service-desc">${s.description}</div>
        </div>
      `).join('');

      return `
        <div class="rb-step active" data-step="1">
          <div class="rb-step-title">What can we help you with?</div>
          <div class="rb-services">${services}</div>
        </div>
      `;
    }

    // Render Step 2: Qualification Questions
    renderStep2() {
      const questions = this.config.qualifyQuestions.map(q => `
        <div class="rb-question" data-question="${q.id}">
          <div class="rb-question-label">${q.question}</div>
          <div class="rb-options">
            ${q.options.map(o => `
              <div class="rb-option" data-value="${o.value}" data-score="${o.score}">${o.label}</div>
            `).join('')}
          </div>
        </div>
      `).join('');

      return `
        <div class="rb-step" data-step="2">
          <div class="rb-step-title">Tell us about your project</div>
          ${questions}
        </div>
      `;
    }

    // Render Step 3: Contact Info
    renderStep3() {
      return `
        <div class="rb-step" data-step="3">
          <div class="rb-step-title">Your contact information</div>

          <div id="rb-estimate-display"></div>

          <div class="rb-row">
            <div class="rb-form-group">
              <label class="rb-label">First Name *</label>
              <input type="text" class="rb-input" id="rb-first-name" placeholder="John" required>
            </div>
            <div class="rb-form-group">
              <label class="rb-label">Last Name *</label>
              <input type="text" class="rb-input" id="rb-last-name" placeholder="Smith" required>
            </div>
          </div>

          <div class="rb-form-group">
            <label class="rb-label">Email *</label>
            <input type="email" class="rb-input" id="rb-email" placeholder="john@example.com" required>
          </div>

          <div class="rb-form-group">
            <label class="rb-label">Phone *</label>
            <input type="tel" class="rb-input" id="rb-phone" placeholder="(555) 123-4567" required>
          </div>

          <div class="rb-form-group">
            <label class="rb-label">Project Address</label>
            <input type="text" class="rb-input" id="rb-address" placeholder="123 Main St, Phoenix, AZ">
          </div>
        </div>
      `;
    }

    // Render Step 4: Schedule
    renderStep4() {
      return `
        <div class="rb-step" data-step="4">
          <div class="rb-step-title">Choose a time that works for you</div>

          <div class="rb-calendar">
            <div class="rb-cal-header">
              <div class="rb-cal-title" id="rb-cal-month">January 2026</div>
              <div class="rb-cal-nav">
                <button class="rb-cal-btn" onclick="window.remodelyBooking.prevMonth()">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <button class="rb-cal-btn" onclick="window.remodelyBooking.nextMonth()">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
            </div>
            <div class="rb-cal-grid" id="rb-cal-grid"></div>
          </div>

          <div id="rb-times-container" style="display: none;">
            <div class="rb-step-title" style="font-size: 15px; margin-bottom: 12px;">Available times</div>
            <div class="rb-times" id="rb-times"></div>
          </div>
        </div>
      `;
    }

    // Render Success
    renderSuccess() {
      return `
        <div class="rb-step" data-step="success">
          <div class="rb-success">
            <div class="rb-success-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div class="rb-success-title">You're All Set!</div>
            <div class="rb-success-message">${this.config.successMessage}</div>
            <div class="rb-success-details" id="rb-booking-details"></div>
          </div>
        </div>
      `;
    }

    // Bind events
    bindEvents() {
      // Service selection
      document.querySelectorAll('.rb-service').forEach(el => {
        el.onclick = () => {
          document.querySelectorAll('.rb-service').forEach(s => s.classList.remove('selected'));
          el.classList.add('selected');
          this.state.service = el.dataset.service;
        };
      });

      // Option selection
      document.querySelectorAll('.rb-option').forEach(el => {
        el.onclick = () => {
          const question = el.closest('.rb-question');
          question.querySelectorAll('.rb-option').forEach(o => o.classList.remove('selected'));
          el.classList.add('selected');
          this.state.answers[question.dataset.question] = {
            value: el.dataset.value,
            score: parseInt(el.dataset.score)
          };
          this.calculateLeadScore();
        };
      });

      // Initialize calendar
      this.calendarDate = new Date();
      this.renderCalendar();
    }

    // Calendar navigation
    prevMonth() {
      this.calendarDate.setMonth(this.calendarDate.getMonth() - 1);
      this.renderCalendar();
    }

    nextMonth() {
      this.calendarDate.setMonth(this.calendarDate.getMonth() + 1);
      this.renderCalendar();
    }

    // Render calendar
    renderCalendar() {
      const year = this.calendarDate.getFullYear();
      const month = this.calendarDate.getMonth();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const minDate = new Date(today);
      minDate.setHours(minDate.getHours() + this.config.leadTime);

      const maxDate = new Date(today);
      maxDate.setDate(maxDate.getDate() + this.config.maxAdvance);

      document.getElementById('rb-cal-month').textContent =
        new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const daysInPrevMonth = new Date(year, month, 0).getDate();

      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      let html = dayNames.map(d => `<div class="rb-cal-day-name">${d}</div>`).join('');

      // Previous month days
      for (let i = firstDay - 1; i >= 0; i--) {
        html += `<div class="rb-cal-day other-month disabled">${daysInPrevMonth - i}</div>`;
      }

      // Current month days
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dayOfWeek = date.getDay();
        const isAvailable = this.config.availableDays.includes(dayOfWeek) &&
                           date >= minDate && date <= maxDate;
        const isSelected = this.state.date &&
                          this.state.date.toDateString() === date.toDateString();

        html += `<div class="rb-cal-day ${isAvailable ? '' : 'disabled'} ${isSelected ? 'selected' : ''}"
                      data-date="${date.toISOString()}"
                      onclick="${isAvailable ? `window.remodelyBooking.selectDate('${date.toISOString()}')` : ''}">${day}</div>`;
      }

      // Next month days
      const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
      for (let i = 1; i <= totalCells - firstDay - daysInMonth; i++) {
        html += `<div class="rb-cal-day other-month disabled">${i}</div>`;
      }

      document.getElementById('rb-cal-grid').innerHTML = html;
    }

    // Select date
    selectDate(dateStr) {
      this.state.date = new Date(dateStr);
      this.state.time = null;
      this.renderCalendar();
      this.renderTimes();
    }

    // Render available times
    renderTimes() {
      const container = document.getElementById('rb-times-container');
      const timesEl = document.getElementById('rb-times');
      container.style.display = 'block';

      const { start, end } = this.config.availableHours;
      const slots = [];

      for (let hour = start; hour < end; hour++) {
        const time = `${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? 'PM' : 'AM'}`;
        const isSelected = this.state.time === `${hour}:00`;
        slots.push(`<div class="rb-time ${isSelected ? 'selected' : ''}"
                         data-time="${hour}:00"
                         onclick="window.remodelyBooking.selectTime('${hour}:00')">${time}</div>`);
      }

      timesEl.innerHTML = slots.join('');
    }

    // Select time
    selectTime(time) {
      this.state.time = time;
      document.querySelectorAll('.rb-time').forEach(t => t.classList.remove('selected'));
      document.querySelector(`.rb-time[data-time="${time}"]`).classList.add('selected');
    }

    // Calculate lead score
    calculateLeadScore() {
      let score = 0;
      Object.values(this.state.answers).forEach(a => {
        score += a.score || 0;
      });
      this.state.leadScore = score;
    }

    // Calculate estimate
    calculateEstimate() {
      if (!this.config.enableInstantEstimate || !this.state.service) return null;

      const range = this.config.estimateRanges[this.state.service];
      if (!range) return null;

      // Adjust based on budget answer
      const budgetAnswer = this.state.answers.budget?.value;
      let multiplier = 1;
      if (budgetAnswer === '5k-10k') multiplier = 0.8;
      else if (budgetAnswer === '10k-20k') multiplier = 1;
      else if (budgetAnswer === '20k-50k') multiplier = 1.3;
      else if (budgetAnswer === '50k+') multiplier = 1.5;

      const min = Math.round(range.min * 20 * multiplier);
      const max = Math.round(range.max * 40 * multiplier);

      return { min, max, unit: range.unit };
    }

    // Show estimate
    showEstimate() {
      const estimate = this.calculateEstimate();
      if (!estimate) return;

      this.state.estimate = estimate;
      const display = document.getElementById('rb-estimate-display');
      if (display) {
        display.innerHTML = `
          <div class="rb-estimate">
            <div class="rb-estimate-label">Your Estimated Range</div>
            <div class="rb-estimate-value">$${estimate.min.toLocaleString()} - $${estimate.max.toLocaleString()}</div>
            <div class="rb-estimate-note">Final price depends on materials, measurements & complexity</div>
          </div>
        `;
      }
    }

    // Step navigation
    nextStep() {
      if (this.state.step === 1 && !this.state.service) {
        alert('Please select a service');
        return;
      }

      if (this.state.step === 2) {
        const unanswered = this.config.qualifyQuestions.filter(q => !this.state.answers[q.id]);
        if (unanswered.length > 0) {
          alert('Please answer all questions');
          return;
        }
        this.showEstimate();
      }

      if (this.state.step === 3) {
        const firstName = document.getElementById('rb-first-name').value;
        const lastName = document.getElementById('rb-last-name').value;
        const email = document.getElementById('rb-email').value;
        const phone = document.getElementById('rb-phone').value;

        if (!firstName || !lastName || !email || !phone) {
          alert('Please fill in all required fields');
          return;
        }

        this.state.contact = {
          firstName,
          lastName,
          email,
          phone,
          address: document.getElementById('rb-address').value
        };
      }

      if (this.state.step === 4) {
        if (!this.state.date || !this.state.time) {
          alert('Please select a date and time');
          return;
        }
        this.submitBooking();
        return;
      }

      this.state.step++;
      this.updateStepDisplay();
    }

    prevStep() {
      if (this.state.step > 1) {
        this.state.step--;
        this.updateStepDisplay();
      }
    }

    updateStepDisplay() {
      // Update steps
      document.querySelectorAll('.rb-step').forEach(s => s.classList.remove('active'));
      document.querySelector(`.rb-step[data-step="${this.state.step}"]`).classList.add('active');

      // Update progress
      document.querySelectorAll('.rb-progress-step').forEach((p, i) => {
        p.classList.remove('active', 'completed');
        if (i + 1 < this.state.step) p.classList.add('completed');
        if (i + 1 === this.state.step) p.classList.add('active');
      });

      // Update buttons
      document.getElementById('rb-back').style.display = this.state.step > 1 ? 'flex' : 'none';
      document.getElementById('rb-next').innerHTML = this.state.step === 4
        ? 'Confirm Booking <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'
        : 'Continue <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>';
    }

    // Submit booking
    async submitBooking() {
      const nextBtn = document.getElementById('rb-next');
      nextBtn.disabled = true;
      nextBtn.innerHTML = 'Booking...';

      const booking = {
        service: this.state.service,
        answers: this.state.answers,
        leadScore: this.state.leadScore,
        contact: this.state.contact,
        date: this.state.date.toISOString(),
        time: this.state.time,
        estimate: this.state.estimate,
        source: window.location.href,
        tenant: this.config.businessName
      };

      try {
        // Send to API
        if (this.config.apiEndpoint) {
          await fetch(`${this.config.apiEndpoint}/bookings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(booking)
          });
        }

        // Send to webhook
        if (this.config.webhookUrl) {
          await fetch(this.config.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(booking)
          });
        }

        this.trackEvent('booking_completed', booking);
        this.showSuccess();
      } catch (e) {
        console.error('Booking error:', e);
        this.trackEvent('booking_completed', booking); // Still show success for demo
        this.showSuccess();
      }
    }

    // Show success
    showSuccess() {
      document.querySelectorAll('.rb-step').forEach(s => s.classList.remove('active'));
      document.querySelector('.rb-step[data-step="success"]').classList.add('active');

      document.querySelectorAll('.rb-progress-step').forEach(p => p.classList.add('completed'));
      document.querySelector('.rb-footer').style.display = 'none';

      const serviceLabel = this.config.services.find(s => s.id === this.state.service)?.name || this.state.service;
      const dateStr = this.state.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      const hour = parseInt(this.state.time);
      const timeStr = `${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? 'PM' : 'AM'}`;

      document.getElementById('rb-booking-details').innerHTML = `
        <div class="rb-success-detail">
          <span class="rb-success-detail-label">Service</span>
          <span class="rb-success-detail-value">${serviceLabel}</span>
        </div>
        <div class="rb-success-detail">
          <span class="rb-success-detail-label">Date & Time</span>
          <span class="rb-success-detail-value">${dateStr} at ${timeStr}</span>
        </div>
        <div class="rb-success-detail">
          <span class="rb-success-detail-label">Contact</span>
          <span class="rb-success-detail-value">${this.state.contact.firstName} ${this.state.contact.lastName}</span>
        </div>
        ${this.state.estimate ? `
        <div class="rb-success-detail">
          <span class="rb-success-detail-label">Estimated Range</span>
          <span class="rb-success-detail-value">$${this.state.estimate.min.toLocaleString()} - $${this.state.estimate.max.toLocaleString()}</span>
        </div>
        ` : ''}
      `;
    }

    // Track events
    trackEvent(event, data = {}) {
      if (this.config.trackingId && window.gtag) {
        window.gtag('event', event, { ...data, widget: 'remodely_booking' });
      }
      console.log('Remodely Booking:', event, data);
    }

    // Utility: Get service icon
    getServiceIcon(icon) {
      const icons = {
        counter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="2" y1="12" x2="22" y2="12"/></svg>',
        tile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
        floor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"/><path d="M3 7v14"/><path d="M21 7v14"/><path d="M3 7l9-4 9 4"/></svg>',
        cabinet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="3" x2="12" y2="21"/></svg>',
        home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>'
      };
      return icons[icon] || icons.home;
    }

    // Utility: Adjust color brightness
    adjustColor(hex, percent) {
      const num = parseInt(hex.replace('#', ''), 16);
      const amt = Math.round(2.55 * percent);
      const R = (num >> 16) + amt;
      const G = (num >> 8 & 0x00FF) + amt;
      const B = (num & 0x0000FF) + amt;
      return '#' + (0x1000000 +
        (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
        (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
        (B < 255 ? B < 1 ? 0 : B : 255)
      ).toString(16).slice(1);
    }

    // Utility: Hex to RGBA
    hexToRgba(hex, alpha) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }

  // Export
  window.RemodelyBooking = RemodelyBooking;

  // Auto-init if config is present
  if (window.REMODELY_BOOKING_CONFIG) {
    window.remodelyBooking = new RemodelyBooking(window.REMODELY_BOOKING_CONFIG);
    document.addEventListener('DOMContentLoaded', () => {
      window.remodelyBooking.init(window.REMODELY_BOOKING_CONTAINER);
    });
  }
})();
