/**
 * ARIA VOICE - AI Voice Interaction System
 * Powered by Remodely AI
 * White-label voice assistant for contractor websites
 * Version: 1.0
 */

(function() {
  'use strict';

  // Default configuration
  const DEFAULT_CONFIG = {
    // Branding
    businessName: 'Your Business',
    assistantName: 'Aria',
    logo: '',
    primaryColor: '#f9cb00',
    secondaryColor: '#1a1a2e',

    // Voice settings
    voice: 'alloy', // OpenAI voices: alloy, echo, fable, onyx, nova, shimmer
    language: 'en-US',
    speed: 1.0,

    // Greeting & personality
    greeting: "Hi! I'm Aria, your virtual assistant. How can I help you today?",
    personality: 'professional', // professional, friendly, casual

    // Capabilities
    capabilities: [
      'schedule_appointment',
      'get_quote',
      'answer_faq',
      'transfer_human',
      'collect_info'
    ],

    // Business context for AI
    businessContext: {
      industry: 'home_remodeling',
      services: ['countertops', 'tile', 'flooring', 'cabinets'],
      serviceArea: '',
      businessHours: 'Monday-Saturday 8am-6pm'
    },

    // FAQ responses
    faqs: [
      { question: 'hours', answer: 'We are open Monday through Saturday, 8am to 6pm.' },
      { question: 'location', answer: 'We serve the greater Phoenix area.' },
      { question: 'estimate', answer: 'I can help you get a free estimate! Would you like to schedule a consultation?' }
    ],

    // API Configuration
    apiEndpoint: 'https://api.remodely.ai',
    openaiKey: '', // Set via environment
    webhookUrl: '',

    // Recording
    enableRecording: false,
    maxRecordingDuration: 60, // seconds

    // UI Settings
    theme: 'dark',
    position: 'right',
    triggerType: 'floating', // floating, inline, tab

    // Analytics
    trackingId: ''
  };

  // Voice recognition and synthesis handler
  class AriaVoice {
    constructor(config = {}) {
      this.config = { ...DEFAULT_CONFIG, ...config };
      this.state = {
        isListening: false,
        isSpeaking: false,
        isProcessing: false,
        conversationHistory: [],
        transcript: '',
        isOpen: false
      };

      this.recognition = null;
      this.synthesis = window.speechSynthesis;
      this.container = null;
      this.mediaRecorder = null;
      this.audioChunks = [];

      // Check browser support
      this.hasRecognition = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
      this.hasSynthesis = 'speechSynthesis' in window;
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
      this.setupRecognition();
      this.trackEvent('aria_loaded');
    }

    // Setup speech recognition
    setupRecognition() {
      if (!this.hasRecognition) {
        console.warn('Speech recognition not supported');
        return;
      }

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.lang = this.config.language;

      this.recognition.onstart = () => {
        this.state.isListening = true;
        this.updateUI();
        this.trackEvent('listening_started');
      };

      this.recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        this.state.transcript = transcript;
        this.updateTranscript(transcript);

        if (event.results[event.results.length - 1].isFinal) {
          this.processUserInput(transcript);
        }
      };

      this.recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        this.state.isListening = false;
        this.updateUI();

        if (event.error === 'no-speech') {
          this.speak("I didn't catch that. Please try again.");
        }
      };

      this.recognition.onend = () => {
        this.state.isListening = false;
        this.updateUI();
      };
    }

    // Inject CSS styles
    injectStyles() {
      if (document.getElementById('aria-voice-styles')) return;

      const primary = this.config.primaryColor;
      const secondary = this.config.secondaryColor;
      const isDark = this.config.theme === 'dark';

      const styles = document.createElement('style');
      styles.id = 'aria-voice-styles';
      styles.textContent = `
        .aria-widget * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }

        .aria-floating-btn {
          position: fixed;
          bottom: 24px;
          ${this.config.position === 'left' ? 'left: 24px;' : 'right: 24px;'}
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: linear-gradient(135deg, ${primary}, ${this.adjustColor(primary, -20)});
          border: none;
          cursor: pointer;
          box-shadow: 0 4px 24px rgba(0,0,0,0.3);
          z-index: 99998;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
        }
        .aria-floating-btn:hover { transform: scale(1.1); box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
        .aria-floating-btn svg { width: 28px; height: 28px; color: ${secondary}; }
        .aria-floating-btn.listening { animation: ariaPulse 1.5s infinite; }

        @keyframes ariaPulse {
          0%, 100% { box-shadow: 0 0 0 0 ${this.hexToRgba(primary, 0.7)}; }
          50% { box-shadow: 0 0 0 20px ${this.hexToRgba(primary, 0)}; }
        }

        .aria-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.85);
          backdrop-filter: blur(10px);
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          opacity: 0;
          visibility: hidden;
          transition: all 0.3s ease;
        }
        .aria-modal-overlay.open { opacity: 1; visibility: visible; }

        .aria-modal {
          background: ${isDark ? secondary : '#ffffff'};
          border-radius: 24px;
          width: 100%;
          max-width: 420px;
          overflow: hidden;
          transform: translateY(30px) scale(0.9);
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          display: flex;
          flex-direction: column;
        }
        .aria-modal-overlay.open .aria-modal { transform: translateY(0) scale(1); }

        .aria-header {
          padding: 32px 24px;
          background: linear-gradient(135deg, ${secondary}, ${this.adjustColor(secondary, 15)});
          color: #fff;
          text-align: center;
          position: relative;
        }

        .aria-avatar {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: linear-gradient(135deg, ${primary}, ${this.adjustColor(primary, -30)});
          margin: 0 auto 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          position: relative;
        }
        .aria-avatar svg { width: 40px; height: 40px; color: ${secondary}; }
        .aria-avatar.speaking::after,
        .aria-avatar.listening::after {
          content: '';
          position: absolute;
          inset: -4px;
          border-radius: 50%;
          border: 3px solid ${primary};
          animation: ariaRing 1.5s infinite;
        }

        @keyframes ariaRing {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.5; }
        }

        .aria-name { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
        .aria-status { font-size: 14px; opacity: 0.8; }

        .aria-close {
          position: absolute;
          top: 16px;
          right: 16px;
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
        .aria-close:hover { background: rgba(255,255,255,0.2); }
        .aria-close svg { width: 20px; height: 20px; }

        .aria-body {
          padding: 24px;
          flex: 1;
          color: ${isDark ? '#fff' : '#1a1a2e'};
        }

        .aria-conversation {
          max-height: 200px;
          overflow-y: auto;
          margin-bottom: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .aria-message {
          padding: 12px 16px;
          border-radius: 16px;
          font-size: 14px;
          line-height: 1.5;
          max-width: 85%;
        }
        .aria-message.assistant {
          background: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'};
          align-self: flex-start;
          border-bottom-left-radius: 4px;
        }
        .aria-message.user {
          background: ${primary};
          color: ${secondary};
          align-self: flex-end;
          border-bottom-right-radius: 4px;
        }

        .aria-transcript {
          background: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'};
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 20px;
          font-size: 14px;
          min-height: 50px;
          color: ${isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)'};
        }
        .aria-transcript.active { border: 2px solid ${primary}; }

        .aria-controls {
          display: flex;
          gap: 12px;
          justify-content: center;
        }

        .aria-mic-btn {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: linear-gradient(135deg, ${primary}, ${this.adjustColor(primary, -20)});
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s;
          box-shadow: 0 4px 20px ${this.hexToRgba(primary, 0.4)};
        }
        .aria-mic-btn:hover { transform: scale(1.05); }
        .aria-mic-btn:active { transform: scale(0.95); }
        .aria-mic-btn svg { width: 32px; height: 32px; color: ${secondary}; }
        .aria-mic-btn.listening {
          animation: ariaPulse 1.5s infinite;
          background: #ef4444;
        }
        .aria-mic-btn.listening svg { color: #fff; }

        .aria-text-btn {
          padding: 12px 24px;
          border-radius: 12px;
          background: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'};
          border: none;
          cursor: pointer;
          font-size: 14px;
          color: ${isDark ? '#fff' : '#1a1a2e'};
          transition: all 0.2s;
        }
        .aria-text-btn:hover { background: ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)'}; }

        .aria-quick-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 20px;
          justify-content: center;
        }
        .aria-quick-action {
          padding: 8px 16px;
          border-radius: 20px;
          background: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'};
          border: 1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};
          cursor: pointer;
          font-size: 13px;
          color: ${isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.7)'};
          transition: all 0.2s;
        }
        .aria-quick-action:hover {
          background: ${this.hexToRgba(primary, 0.15)};
          border-color: ${primary};
          color: ${primary};
        }

        .aria-input-container {
          display: none;
          margin-top: 16px;
        }
        .aria-input-container.active { display: flex; gap: 12px; }
        .aria-text-input {
          flex: 1;
          padding: 14px 18px;
          border-radius: 12px;
          border: 2px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};
          background: ${isDark ? 'rgba(255,255,255,0.05)' : '#fff'};
          font-size: 14px;
          color: ${isDark ? '#fff' : '#1a1a2e'};
          outline: none;
          transition: border-color 0.2s;
        }
        .aria-text-input:focus { border-color: ${primary}; }
        .aria-text-input::placeholder { color: ${isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}; }
        .aria-send-btn {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: ${primary};
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .aria-send-btn svg { width: 20px; height: 20px; color: ${secondary}; }

        .aria-footer {
          padding: 16px 24px;
          border-top: 1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'};
          text-align: center;
        }
        .aria-powered {
          font-size: 11px;
          color: ${isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'};
        }
        .aria-powered a {
          color: ${primary};
          text-decoration: none;
        }

        .aria-processing {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 12px;
        }
        .aria-processing-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: ${primary};
          animation: ariaBounce 1.4s infinite ease-in-out both;
        }
        .aria-processing-dot:nth-child(1) { animation-delay: -0.32s; }
        .aria-processing-dot:nth-child(2) { animation-delay: -0.16s; }

        @keyframes ariaBounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }

        @media (max-width: 480px) {
          .aria-modal { max-width: 100%; border-radius: 20px 20px 0 0; }
          .aria-modal-overlay { align-items: flex-end; padding: 0; }
        }
      `;

      document.head.appendChild(styles);
    }

    // Create floating button
    createFloatingButton() {
      const btn = document.createElement('button');
      btn.className = 'aria-floating-btn';
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
      `;
      btn.onclick = () => this.open();
      document.body.appendChild(btn);
      this.floatingBtn = btn;
    }

    // Render inline widget
    renderInline() {
      this.container.innerHTML = this.getWidgetHTML(false);
      this.attachEvents();
    }

    // Open modal
    open() {
      if (!this.modalOverlay) {
        this.createModal();
      }
      this.modalOverlay.classList.add('open');
      this.state.isOpen = true;
      this.trackEvent('aria_opened');

      // Auto-greet
      if (this.state.conversationHistory.length === 0) {
        setTimeout(() => this.speak(this.config.greeting), 500);
      }
    }

    // Close modal
    close() {
      if (this.modalOverlay) {
        this.modalOverlay.classList.remove('open');
      }
      this.state.isOpen = false;
      this.stopListening();
      this.stopSpeaking();
    }

    // Create modal
    createModal() {
      const overlay = document.createElement('div');
      overlay.className = 'aria-modal-overlay';
      overlay.innerHTML = this.getWidgetHTML(true);
      overlay.onclick = (e) => {
        if (e.target === overlay) this.close();
      };
      document.body.appendChild(overlay);
      this.modalOverlay = overlay;
      this.attachEvents();
    }

    // Get widget HTML
    getWidgetHTML(isModal) {
      const assistantName = this.config.assistantName;
      const businessName = this.config.businessName;

      return `
        <div class="aria-modal aria-widget">
          <div class="aria-header">
            ${isModal ? `
              <button class="aria-close" onclick="window.ariaVoice.close()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            ` : ''}
            <div class="aria-avatar" id="ariaAvatar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              </svg>
            </div>
            <div class="aria-name">${assistantName}</div>
            <div class="aria-status" id="ariaStatus">AI Voice Assistant for ${businessName}</div>
          </div>

          <div class="aria-body">
            <div class="aria-conversation" id="ariaConversation"></div>

            <div class="aria-transcript" id="ariaTranscript">
              ${this.hasRecognition ? 'Tap the microphone and start speaking...' : 'Voice input not supported. Use text instead.'}
            </div>

            <div class="aria-controls">
              ${this.hasRecognition ? `
                <button class="aria-mic-btn" id="ariaMicBtn" onclick="window.ariaVoice.toggleListening()">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                </button>
              ` : ''}
              <button class="aria-text-btn" onclick="window.ariaVoice.toggleTextInput()">
                Type instead
              </button>
            </div>

            <div class="aria-input-container" id="ariaInputContainer">
              <input type="text" class="aria-text-input" id="ariaTextInput" placeholder="Type your message...">
              <button class="aria-send-btn" onclick="window.ariaVoice.sendTextMessage()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22,2 15,22 11,13 2,9"/>
                </svg>
              </button>
            </div>

            <div class="aria-quick-actions">
              <button class="aria-quick-action" onclick="window.ariaVoice.quickAction('schedule')">Schedule Visit</button>
              <button class="aria-quick-action" onclick="window.ariaVoice.quickAction('quote')">Get Quote</button>
              <button class="aria-quick-action" onclick="window.ariaVoice.quickAction('hours')">Business Hours</button>
            </div>
          </div>

          <div class="aria-footer">
            <div class="aria-powered">Voice AI by <a href="https://remodely.ai" target="_blank">Remodely.ai</a></div>
          </div>
        </div>
      `;
    }

    // Attach event handlers
    attachEvents() {
      const textInput = document.getElementById('ariaTextInput');
      if (textInput) {
        textInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') this.sendTextMessage();
        });
      }
    }

    // Toggle listening
    toggleListening() {
      if (this.state.isListening) {
        this.stopListening();
      } else {
        this.startListening();
      }
    }

    // Start listening
    startListening() {
      if (!this.recognition) {
        this.speak("Voice recognition is not available in your browser. Please type your message instead.");
        return;
      }

      this.stopSpeaking();
      this.state.transcript = '';
      this.updateTranscript('Listening...');

      try {
        this.recognition.start();
      } catch (e) {
        console.error('Failed to start recognition:', e);
      }
    }

    // Stop listening
    stopListening() {
      if (this.recognition && this.state.isListening) {
        this.recognition.stop();
      }
      this.state.isListening = false;
      this.updateUI();
    }

    // Speak text
    speak(text) {
      if (!this.hasSynthesis) {
        this.addMessage('assistant', text);
        return;
      }

      // Cancel any ongoing speech
      this.stopSpeaking();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = this.config.speed;
      utterance.lang = this.config.language;

      // Try to find a good voice
      const voices = this.synthesis.getVoices();
      const preferredVoice = voices.find(v =>
        v.lang.startsWith(this.config.language.split('-')[0]) && v.name.includes('Female')
      ) || voices.find(v => v.lang.startsWith(this.config.language.split('-')[0]));

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onstart = () => {
        this.state.isSpeaking = true;
        this.updateUI();
      };

      utterance.onend = () => {
        this.state.isSpeaking = false;
        this.updateUI();
      };

      this.synthesis.speak(utterance);
      this.addMessage('assistant', text);
      this.state.conversationHistory.push({ role: 'assistant', content: text });
    }

    // Stop speaking
    stopSpeaking() {
      if (this.synthesis) {
        this.synthesis.cancel();
      }
      this.state.isSpeaking = false;
    }

    // Process user input
    async processUserInput(text) {
      if (!text.trim()) return;

      this.addMessage('user', text);
      this.state.conversationHistory.push({ role: 'user', content: text });
      this.state.isProcessing = true;
      this.updateUI();
      this.trackEvent('user_message', { text });

      try {
        const response = await this.getAIResponse(text);
        this.speak(response);
      } catch (error) {
        console.error('AI response error:', error);
        this.speak("I'm having trouble connecting right now. Please try again or call us directly.");
      }

      this.state.isProcessing = false;
      this.updateUI();
    }

    // Get AI response
    async getAIResponse(userMessage) {
      // Check FAQs first
      const faqMatch = this.checkFAQs(userMessage);
      if (faqMatch) return faqMatch;

      // Check for intent
      const intent = this.detectIntent(userMessage);

      switch (intent) {
        case 'schedule':
          this.trackEvent('intent_schedule');
          return `I'd love to help you schedule an appointment! Let me connect you with our booking system. You can also call us at ${this.config.phone || 'our office'} to speak with someone directly.`;

        case 'quote':
          this.trackEvent('intent_quote');
          return `Great! I can help you get an estimate. To give you an accurate quote, I'll need some details about your project. What type of work are you looking to have done?`;

        case 'hours':
          return `We're open ${this.config.businessContext.businessHours}. Would you like to schedule a visit during our business hours?`;

        case 'services':
          const services = this.config.businessContext.services.join(', ');
          return `We specialize in ${services}. Which of these are you interested in learning more about?`;

        case 'transfer':
          this.trackEvent('intent_transfer');
          return `I'll connect you with one of our team members. Please hold on, or you can call us directly at ${this.config.phone || 'our office number'}.`;

        default:
          // Call external AI API if configured
          if (this.config.apiEndpoint) {
            return await this.callExternalAI(userMessage);
          }

          return this.getDefaultResponse();
      }
    }

    // Check FAQs
    checkFAQs(message) {
      const lowerMessage = message.toLowerCase();
      for (const faq of this.config.faqs) {
        if (lowerMessage.includes(faq.question.toLowerCase())) {
          return faq.answer;
        }
      }
      return null;
    }

    // Detect user intent
    detectIntent(message) {
      const lowerMessage = message.toLowerCase();

      const intents = {
        schedule: ['schedule', 'appointment', 'book', 'visit', 'come out', 'available', 'meeting'],
        quote: ['quote', 'estimate', 'price', 'cost', 'how much', 'pricing', 'bid'],
        hours: ['hours', 'open', 'close', 'when are you', 'business hours', 'availability'],
        services: ['services', 'what do you', 'offer', 'specialize', 'work on'],
        transfer: ['speak to someone', 'human', 'real person', 'representative', 'talk to']
      };

      for (const [intent, keywords] of Object.entries(intents)) {
        if (keywords.some(kw => lowerMessage.includes(kw))) {
          return intent;
        }
      }

      return 'general';
    }

    // Call external AI
    async callExternalAI(message) {
      try {
        const response = await fetch(`${this.config.apiEndpoint}/voice/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message,
            history: this.state.conversationHistory.slice(-10),
            businessContext: this.config.businessContext,
            businessName: this.config.businessName
          })
        });

        if (response.ok) {
          const data = await response.json();
          return data.response;
        }
      } catch (e) {
        console.error('External AI call failed:', e);
      }

      return this.getDefaultResponse();
    }

    // Get default response
    getDefaultResponse() {
      const responses = [
        `I'd be happy to help with that! Could you tell me more about what you're looking for?`,
        `That's a great question. Let me help you with that. What specific information do you need?`,
        `I understand. Would you like me to connect you with one of our specialists who can help further?`
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }

    // Quick action handlers
    quickAction(action) {
      const messages = {
        schedule: "I'd like to schedule an appointment",
        quote: "I need a quote for my project",
        hours: "What are your business hours?"
      };
      this.processUserInput(messages[action]);
    }

    // Toggle text input
    toggleTextInput() {
      const container = document.getElementById('ariaInputContainer');
      if (container) {
        container.classList.toggle('active');
        if (container.classList.contains('active')) {
          document.getElementById('ariaTextInput')?.focus();
        }
      }
    }

    // Send text message
    sendTextMessage() {
      const input = document.getElementById('ariaTextInput');
      if (input && input.value.trim()) {
        this.processUserInput(input.value.trim());
        input.value = '';
      }
    }

    // Add message to conversation
    addMessage(role, text) {
      const conversation = document.getElementById('ariaConversation');
      if (conversation) {
        const msg = document.createElement('div');
        msg.className = `aria-message ${role}`;
        msg.textContent = text;
        conversation.appendChild(msg);
        conversation.scrollTop = conversation.scrollHeight;
      }
    }

    // Update transcript display
    updateTranscript(text) {
      const transcript = document.getElementById('ariaTranscript');
      if (transcript) {
        transcript.textContent = text || 'Tap the microphone and start speaking...';
        transcript.classList.toggle('active', this.state.isListening);
      }
    }

    // Update UI state
    updateUI() {
      const avatar = document.getElementById('ariaAvatar');
      const micBtn = document.getElementById('ariaMicBtn');
      const status = document.getElementById('ariaStatus');

      if (avatar) {
        avatar.classList.toggle('listening', this.state.isListening);
        avatar.classList.toggle('speaking', this.state.isSpeaking);
      }

      if (micBtn) {
        micBtn.classList.toggle('listening', this.state.isListening);
      }

      if (this.floatingBtn) {
        this.floatingBtn.classList.toggle('listening', this.state.isListening);
      }

      if (status) {
        if (this.state.isListening) {
          status.textContent = 'Listening...';
        } else if (this.state.isSpeaking) {
          status.textContent = 'Speaking...';
        } else if (this.state.isProcessing) {
          status.textContent = 'Thinking...';
        } else {
          status.textContent = `AI Voice Assistant for ${this.config.businessName}`;
        }
      }
    }

    // Track analytics events
    trackEvent(event, data = {}) {
      if (this.config.trackingId) {
        // Send to analytics endpoint
        fetch(`${this.config.apiEndpoint}/analytics/event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trackingId: this.config.trackingId,
            event,
            data,
            timestamp: new Date().toISOString()
          })
        }).catch(() => {});
      }

      // Also dispatch custom event
      window.dispatchEvent(new CustomEvent('ariaEvent', { detail: { event, data } }));
    }

    // Helper: Adjust color brightness
    adjustColor(hex, amount) {
      const num = parseInt(hex.replace('#', ''), 16);
      const r = Math.min(255, Math.max(0, (num >> 16) + amount));
      const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
      const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
      return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
    }

    // Helper: Hex to RGBA
    hexToRgba(hex, alpha) {
      const num = parseInt(hex.replace('#', ''), 16);
      const r = (num >> 16) & 255;
      const g = (num >> 8) & 255;
      const b = num & 255;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // Destroy widget
    destroy() {
      this.stopListening();
      this.stopSpeaking();

      if (this.floatingBtn) {
        this.floatingBtn.remove();
      }
      if (this.modalOverlay) {
        this.modalOverlay.remove();
      }

      const styles = document.getElementById('aria-voice-styles');
      if (styles) {
        styles.remove();
      }
    }
  }

  // Export globally
  window.AriaVoice = AriaVoice;

  // Auto-initialize if data attribute present
  document.addEventListener('DOMContentLoaded', () => {
    const autoInit = document.querySelector('[data-aria-voice]');
    if (autoInit) {
      const config = JSON.parse(autoInit.dataset.ariaVoice || '{}');
      window.ariaVoice = new AriaVoice(config);
      window.ariaVoice.init(autoInit.id || null);
    }
  });
})();
