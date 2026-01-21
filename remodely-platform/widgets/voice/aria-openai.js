/**
 * ARIA VOICE WIDGET - OpenAI TTS Powered
 * Uses VoiceNow CRM backend for AI + OpenAI TTS (tts-1-hd, nova voice)
 * Natural-sounding voice assistant
 * Version: 1.0
 */

(function() {
  'use strict';

  const DEFAULT_CONFIG = {
    // API Configuration - VoiceNow CRM backend
    apiEndpoint: 'https://voiceflow-crm.onrender.com',

    // Branding
    businessName: 'Surprise Granite',
    assistantName: 'Aria',
    primaryColor: '#f9cb00',
    secondaryColor: '#1a1a2e',
    theme: 'dark',
    position: 'right',

    // Greeting
    greeting: "Hey! I'm Aria from Surprise Granite. How can I help you today?",

    // Business context for AI
    businessContext: {
      industry: 'countertops',
      services: ['Countertops', 'Tile & Backsplash', 'Cabinets', 'Flooring', 'Full Remodel'],
      serviceArea: 'Phoenix Metro Area',
      businessHours: 'Monday-Saturday 8am-6pm',
      phone: '(602) 833-7194',
      address: '15084 W Bell Rd, Surprise, AZ 85374'
    },

    // System instructions for AI
    systemInstructions: `You are Aria, a friendly and helpful AI voice assistant for Surprise Granite, a premier countertop and remodeling company in the Phoenix metro area.

PERSONALITY:
- Warm, helpful, and professional but conversational
- Keep responses SHORT - 1-2 sentences max for voice
- Use natural language with contractions
- Sound like a real person, not a robot

BUSINESS INFO:
- Company: Surprise Granite
- Location: 15084 W Bell Rd, Surprise, AZ 85374
- Phone: (602) 833-7194
- Hours: Monday-Saturday 8am-6pm
- Service Areas: Surprise, Peoria, Sun City, Glendale, Phoenix, Scottsdale, Goodyear, Buckeye

SERVICES & PRICING:
- Countertops: Granite ($40-75/sqft), Quartz ($45-85/sqft), Marble ($60-150/sqft), Quartzite ($70-120/sqft)
- Tile & Backsplash installation
- Cabinet installation
- Flooring (Hardwood, LVP, Tile)
- Full kitchen & bathroom remodels

GOALS:
1. Answer questions helpfully and accurately
2. Guide users toward scheduling a FREE estimate
3. Keep responses brief for voice
4. Be genuinely helpful`
  };

  class AriaOpenAI {
    constructor(config = {}) {
      this.config = { ...DEFAULT_CONFIG, ...config };
      this.state = {
        isOpen: false,
        isListening: false,
        isSpeaking: false,
        isProcessing: false,
        conversationHistory: [],
        transcript: '',
        voiceChatActive: false // True when in continuous voice chat mode
      };

      // Audio
      this.audioContext = null;
      this.recognition = null;

      // UI
      this.container = null;
      this.floatingBtn = null;
      this.modalOverlay = null;

      // Check browser support
      this.hasRecognition = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    }

    // Initialize
    init(containerId = null) {
      if (containerId) {
        this.container = document.getElementById(containerId);
        if (this.container) {
          this.renderInline();
        }
      } else if (this.config.triggerType !== 'none') {
        // Only create floating button if not controlled by another UI (like Tool Hub)
        this.createFloatingButton();
      }

      this.injectStyles();
      this.initSpeechRecognition();
      console.log('Aria OpenAI Voice Widget initialized');
    }

    // Initialize speech recognition
    initSpeechRecognition() {
      if (!this.hasRecognition) return;

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onresult = (event) => {
        const current = event.resultIndex;
        const transcript = event.results[current][0].transcript;
        this.updateTranscript(transcript);

        if (event.results[current].isFinal) {
          this.handleUserMessage(transcript);
        }
      };

      this.recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        this.state.isListening = false;
        this.updateUI();
      };

      this.recognition.onend = () => {
        this.state.isListening = false;
        this.updateUI();

        // Auto-restart if in voice chat mode and not speaking/processing
        if (this.state.voiceChatActive && this.state.isOpen && !this.state.isSpeaking && !this.state.isProcessing) {
          setTimeout(() => {
            if (this.state.voiceChatActive && this.state.isOpen && !this.state.isSpeaking && !this.state.isProcessing) {
              this.startListening();
            }
          }, 500);
        }
      };
    }

    // Inject CSS
    injectStyles() {
      if (document.getElementById('aria-openai-styles')) return;

      const primary = this.config.primaryColor;
      const secondary = this.config.secondaryColor;
      const isDark = this.config.theme === 'dark';

      const styles = document.createElement('style');
      styles.id = 'aria-openai-styles';
      styles.textContent = `
        .aria-el * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }

        .aria-el-btn {
          position: fixed;
          bottom: 24px;
          ${this.config.position === 'left' ? 'left: 24px;' : 'right: 24px;'}
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: linear-gradient(135deg, ${primary}, ${this.adjustColor(primary, -20)});
          border: none;
          cursor: pointer;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          z-index: 99998;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
        }
        .aria-el-btn:hover { transform: scale(1.1); }
        .aria-el-btn svg { width: 28px; height: 28px; color: ${secondary}; }
        .aria-el-btn.speaking { animation: ariaPulse 1.5s infinite; }

        @keyframes ariaPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(249, 203, 0, 0.7); }
          50% { box-shadow: 0 0 0 15px rgba(249, 203, 0, 0); }
        }

        .aria-el-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.9);
          backdrop-filter: blur(8px);
          z-index: 99999;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          opacity: 0;
          visibility: hidden;
          transition: all 0.3s;
        }
        .aria-el-overlay.open { opacity: 1; visibility: visible; }

        .aria-el-modal {
          background: ${isDark ? secondary : '#ffffff'};
          border-radius: 20px 20px 0 0;
          width: 100%;
          max-width: 500px;
          height: 90vh;
          max-height: 700px;
          display: flex;
          flex-direction: column;
          transform: translateY(100%);
          transition: all 0.3s ease-out;
        }
        .aria-el-overlay.open .aria-el-modal { transform: translateY(0); }

        .aria-el-header {
          padding: 16px 20px;
          background: linear-gradient(135deg, ${secondary}, ${this.adjustColor(secondary, 15)});
          color: #fff;
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }

        .aria-el-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: linear-gradient(135deg, ${primary}, ${this.adjustColor(primary, -30)});
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .aria-el-avatar svg { width: 24px; height: 24px; color: ${secondary}; }
        .aria-el-avatar.speaking { animation: speakingPulse 0.8s infinite; }
        .aria-el-avatar.listening { background: #ef4444; }

        @keyframes speakingPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }

        .aria-el-header-info { flex: 1; }
        .aria-el-name { font-size: 18px; font-weight: 600; }
        .aria-el-status { font-size: 12px; opacity: 0.8; }

        .aria-el-close {
          background: rgba(255,255,255,0.2);
          border: none;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          color: #fff;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: background 0.2s;
        }
        .aria-el-close:hover { background: rgba(255,255,255,0.3); }
        .aria-el-close svg { width: 24px; height: 24px; }

        .aria-el-body {
          flex: 1;
          padding: 16px;
          color: ${isDark ? '#fff' : '#1a1a2e'};
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }

        .aria-el-messages {
          display: flex;
          flex-direction: column;
          gap: 12px;
          flex: 1;
        }

        .aria-el-msg {
          padding: 12px 16px;
          border-radius: 18px;
          font-size: 15px;
          line-height: 1.4;
          max-width: 85%;
        }
        .aria-el-msg.assistant {
          background: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'};
          align-self: flex-start;
        }
        .aria-el-msg.user {
          background: ${primary};
          color: ${secondary};
          align-self: flex-end;
        }

        .aria-el-transcript {
          background: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'};
          border-radius: 12px;
          padding: 12px;
          font-size: 14px;
          color: ${isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)'};
          font-style: italic;
          min-height: 40px;
        }

        .aria-el-input {
          padding: 16px 20px;
          border-top: 1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .aria-el-text-input {
          flex: 1;
          padding: 12px 16px;
          border-radius: 24px;
          border: 1px solid ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'};
          background: ${isDark ? 'rgba(255,255,255,0.05)' : '#fff'};
          color: ${isDark ? '#fff' : '#1a1a2e'};
          font-size: 14px;
          outline: none;
        }

        .aria-el-mic-btn, .aria-el-send-btn {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .aria-el-mic-btn {
          background: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'};
        }
        .aria-el-mic-btn:hover { background: ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}; }
        .aria-el-mic-btn.listening { background: #ef4444; }
        .aria-el-mic-btn svg { width: 24px; height: 24px; color: ${isDark ? '#fff' : '#1a1a2e'}; }
        .aria-el-mic-btn.listening svg { color: #fff; }

        .aria-el-send-btn {
          background: ${primary};
        }
        .aria-el-send-btn:hover { transform: scale(1.05); }
        .aria-el-send-btn svg { width: 20px; height: 20px; color: ${secondary}; }

        /* Voice Chat Button */
        .aria-el-voice-chat {
          padding: 16px 20px;
          border-top: 1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};
        }

        .aria-el-voice-btn {
          width: 100%;
          padding: 16px 24px;
          border-radius: 30px;
          border: none;
          background: linear-gradient(135deg, ${primary}, ${this.adjustColor(primary, -20)});
          color: ${secondary};
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(249, 203, 0, 0.3);
        }
        .aria-el-voice-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(249, 203, 0, 0.4);
        }
        .aria-el-voice-btn svg { width: 24px; height: 24px; }
        .aria-el-voice-btn.active {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: #fff;
          animation: voicePulse 2s infinite;
          box-shadow: 0 4px 15px rgba(239, 68, 68, 0.4);
        }
        .aria-el-voice-btn.active svg { color: #fff; }

        @keyframes voicePulse {
          0%, 100% { box-shadow: 0 4px 15px rgba(239, 68, 68, 0.4); }
          50% { box-shadow: 0 4px 25px rgba(239, 68, 68, 0.6); }
        }

        .aria-el-footer {
          padding: 12px;
          text-align: center;
          font-size: 11px;
          color: ${isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'};
          border-top: 1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'};
        }
        .aria-el-footer a { color: ${primary}; text-decoration: none; }

        @media (max-width: 480px) {
          .aria-el-modal {
            max-width: 100%;
            height: 100vh;
            max-height: 100vh;
            border-radius: 0;
          }
          .aria-el-header { padding: 12px 16px; }
          .aria-el-body { padding: 12px; }
          .aria-el-voice-chat { padding: 12px 16px; }
          .aria-el-input { padding: 12px 16px; }
        }
      `;
      document.head.appendChild(styles);
    }

    // Create floating button
    createFloatingButton() {
      const btn = document.createElement('button');
      btn.className = 'aria-el-btn';
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

    // Open modal
    open() {
      if (!this.modalOverlay) {
        this.createModal();
      }
      this.modalOverlay.classList.add('open');
      this.state.isOpen = true;

      // Show greeting if first time
      if (this.state.conversationHistory.length === 0) {
        this.addMessage('assistant', this.config.greeting);
      }
    }

    // Close modal
    close() {
      if (this.modalOverlay) {
        this.modalOverlay.classList.remove('open');
      }
      this.state.isOpen = false;
      this.state.voiceChatActive = false;
      this.stopListening();
      this.updateVoiceButton();
    }

    // Create modal
    createModal() {
      const overlay = document.createElement('div');
      overlay.className = 'aria-el-overlay aria-el';
      overlay.innerHTML = `
        <div class="aria-el-modal">
          <div class="aria-el-header">
            <div class="aria-el-avatar" id="ariaElAvatar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              </svg>
            </div>
            <div class="aria-el-header-info">
              <div class="aria-el-name">${this.config.assistantName}</div>
              <div class="aria-el-status" id="ariaElStatus">Ready to help</div>
            </div>
            <button class="aria-el-close" id="ariaElClose">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div class="aria-el-body">
            <div class="aria-el-messages" id="ariaElMessages"></div>
            <div class="aria-el-transcript" id="ariaElTranscript"></div>
          </div>

          <!-- Voice Chat Button - Main CTA -->
          <div class="aria-el-voice-chat">
            <button class="aria-el-voice-btn" id="ariaElVoiceBtn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
              <span id="ariaElVoiceBtnText">Start Voice Chat</span>
            </button>
          </div>

          <div class="aria-el-input">
            <input type="text" class="aria-el-text-input" id="ariaElTextInput" placeholder="Or type a message..." />
            <button class="aria-el-send-btn" id="ariaElSendBtn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>

          <div class="aria-el-footer">
            Powered by <a href="https://remodely.ai" target="_blank">Remodely.ai</a>
          </div>
        </div>
      `;

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.close();
      });

      document.body.appendChild(overlay);
      this.modalOverlay = overlay;
      this.attachEvents();
    }

    // Attach events
    attachEvents() {
      const closeBtn = document.getElementById('ariaElClose');
      const voiceBtn = document.getElementById('ariaElVoiceBtn');
      const sendBtn = document.getElementById('ariaElSendBtn');
      const textInput = document.getElementById('ariaElTextInput');

      if (closeBtn) closeBtn.onclick = () => this.close();
      if (voiceBtn) voiceBtn.onclick = () => this.toggleVoiceChat();
      if (sendBtn) sendBtn.onclick = () => this.sendTextMessage();
      if (textInput) {
        textInput.onkeypress = (e) => {
          if (e.key === 'Enter') this.sendTextMessage();
        };
      }
    }

    // Toggle voice chat mode
    toggleVoiceChat() {
      if (this.state.voiceChatActive) {
        this.endVoiceChat();
      } else {
        this.startVoiceChat();
      }
    }

    // Start continuous voice chat
    startVoiceChat() {
      if (!this.recognition) {
        this.addMessage('assistant', "Sorry, voice chat isn't supported in your browser. Please type your message instead.");
        return;
      }

      this.state.voiceChatActive = true;
      this.updateVoiceButton();
      this.updateStatus('Listening...');
      this.startListening();
    }

    // End voice chat
    endVoiceChat() {
      this.state.voiceChatActive = false;
      this.stopListening();
      this.updateVoiceButton();
      this.updateStatus('Ready to help');
    }

    // Update voice button appearance
    updateVoiceButton() {
      const btn = document.getElementById('ariaElVoiceBtn');
      const btnText = document.getElementById('ariaElVoiceBtnText');

      if (btn && btnText) {
        if (this.state.voiceChatActive) {
          btn.classList.add('active');
          btnText.textContent = 'End Voice Chat';
        } else {
          btn.classList.remove('active');
          btnText.textContent = 'Start Voice Chat';
        }
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
        this.addMessage('assistant', "Sorry, voice input isn't supported in your browser. Please type your message.");
        return;
      }

      try {
        this.recognition.start();
        this.state.isListening = true;
        this.updateUI();
        this.updateStatus('Listening...');
      } catch (e) {
        console.error('Failed to start recognition:', e);
      }
    }

    // Stop listening
    stopListening() {
      if (this.recognition) {
        this.recognition.stop();
      }
      this.state.isListening = false;
      this.updateUI();
    }

    // Update transcript display
    updateTranscript(text) {
      const el = document.getElementById('ariaElTranscript');
      if (el) el.textContent = text;
    }

    // Send text message
    sendTextMessage() {
      const input = document.getElementById('ariaElTextInput');
      if (!input || !input.value.trim()) return;

      const message = input.value.trim();
      input.value = '';
      this.handleUserMessage(message);
    }

    // Handle user message
    async handleUserMessage(message) {
      this.addMessage('user', message);
      this.updateTranscript('');
      this.state.isProcessing = true;
      this.updateStatus('Thinking...');

      try {
        const response = await this.callVoiceNowAPI(message);

        if (response.data?.message) {
          this.addMessage('assistant', response.data.message);

          // Play audio if available (ElevenLabs TTS), otherwise use browser TTS
          if (response.data.audio) {
            await this.playAudio(response.data.audio);
          } else {
            // Use browser speech synthesis as fallback
            this.speakWithBrowserTTS(response.data.message);
          }
        } else {
          const fallbackMsg = "I'm sorry, I couldn't process that. Please try again.";
          this.addMessage('assistant', fallbackMsg);
          this.speakWithBrowserTTS(fallbackMsg);
        }
      } catch (error) {
        console.error('API error:', error);
        const errorMsg = "Sorry, I'm having trouble connecting. Please try again in a moment.";
        this.addMessage('assistant', errorMsg);
        this.speakWithBrowserTTS(errorMsg);
      }

      this.state.isProcessing = false;
      this.updateStatus('Ready to help');
    }

    // Browser TTS fallback
    speakWithBrowserTTS(text) {
      if (!('speechSynthesis' in window)) return;

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.lang = 'en-US';

      // Try to find a good American English voice
      const voices = window.speechSynthesis.getVoices();
      const americanVoices = voices.filter(v =>
        (v.lang === 'en-US' || v.lang === 'en_US') &&
        !v.name.includes('Daniel') && !v.name.includes('British')
      );

      const preferredVoice = americanVoices.find(v =>
        ['Samantha', 'Ava', 'Allison', 'Zira', 'Jenny'].some(n => v.name.includes(n))
      ) || americanVoices[0] || voices.find(v => v.lang.startsWith('en'));

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onstart = () => {
        this.state.isSpeaking = true;
        this.updateUI();
        this.updateStatus('Speaking...');
      };

      utterance.onend = () => {
        this.state.isSpeaking = false;
        this.updateUI();

        // Auto-restart listening after speaking if in voice chat mode
        if (this.state.voiceChatActive && this.state.isOpen) {
          this.updateStatus('Listening...');
          setTimeout(() => {
            if (this.state.voiceChatActive && this.state.isOpen && !this.state.isSpeaking) {
              this.startListening();
            }
          }, 300);
        } else {
          this.updateStatus('Ready to help');
        }
      };

      window.speechSynthesis.speak(utterance);
    }

    // Call VoiceNow CRM API - Surprise Granite specific endpoint with OpenAI TTS
    async callVoiceNowAPI(message) {
      const response = await fetch(`${this.config.apiEndpoint}/api/surprise-granite/aria-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: message,
          conversationHistory: this.state.conversationHistory.slice(-6).map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', response.status, errorText);
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();

      // Return response with OpenAI TTS audio
      return {
        data: {
          message: data.response,
          audio: data.audio // OpenAI TTS audio as base64 MP3
        }
      };
    }

    // Play audio (base64) - uses HTML5 Audio for better mobile compatibility
    async playAudio(base64Audio) {
      return new Promise((resolve) => {
        try {
          this.state.isSpeaking = true;
          this.updateUI();
          this.updateStatus('Speaking...');

          // Use HTML5 Audio element - more reliable on mobile
          const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);

          audio.onended = () => {
            this.state.isSpeaking = false;
            this.updateUI();

            // Auto-restart listening after speaking if in voice chat mode
            if (this.state.voiceChatActive && this.state.isOpen) {
              this.updateStatus('Listening...');
              setTimeout(() => {
                if (this.state.voiceChatActive && this.state.isOpen && !this.state.isSpeaking) {
                  this.startListening();
                }
              }, 300);
            } else {
              this.updateStatus('Ready to help');
            }
            resolve();
          };

          audio.onerror = (e) => {
            console.error('Audio playback error:', e);
            this.state.isSpeaking = false;
            this.updateUI();
            this.updateStatus('Ready to help');
            resolve();
          };

          // Play the audio
          audio.play().catch(err => {
            console.error('Audio play failed:', err);
            this.state.isSpeaking = false;
            this.updateUI();
            this.updateStatus('Ready to help');
            resolve();
          });

        } catch (error) {
          console.error('Audio setup error:', error);
          this.state.isSpeaking = false;
          this.updateUI();
          resolve();
        }
      });
    }

    // Add message to conversation
    addMessage(role, content) {
      this.state.conversationHistory.push({ role, content });

      const messagesEl = document.getElementById('ariaElMessages');
      if (messagesEl) {
        const msgEl = document.createElement('div');
        msgEl.className = `aria-el-msg ${role}`;
        msgEl.textContent = content;
        messagesEl.appendChild(msgEl);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }

    // Update UI
    updateUI() {
      const avatar = document.getElementById('ariaElAvatar');
      const micBtn = document.getElementById('ariaElMicBtn');

      if (avatar) {
        avatar.classList.toggle('speaking', this.state.isSpeaking);
        avatar.classList.toggle('listening', this.state.isListening);
      }

      if (micBtn) {
        micBtn.classList.toggle('listening', this.state.isListening);
      }

      if (this.floatingBtn) {
        this.floatingBtn.classList.toggle('speaking', this.state.isSpeaking);
      }
    }

    // Update status
    updateStatus(text) {
      const el = document.getElementById('ariaElStatus');
      if (el) el.textContent = text;
    }

    // Utility
    adjustColor(hex, amount) {
      const num = parseInt(hex.replace('#', ''), 16);
      const r = Math.min(255, Math.max(0, (num >> 16) + amount));
      const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
      const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
      return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
    }

    // Destroy
    destroy() {
      this.stopListening();
      if (this.floatingBtn) this.floatingBtn.remove();
      if (this.modalOverlay) this.modalOverlay.remove();
      const styles = document.getElementById('aria-openai-styles');
      if (styles) styles.remove();
    }
  }

  // Export
  window.AriaOpenAI = AriaOpenAI;
})();
