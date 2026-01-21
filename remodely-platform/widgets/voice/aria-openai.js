/**
 * ARIA CHAT WIDGET v3
 * Text + Voice chat with OpenAI TTS
 */
(function() {
  'use strict';

  if (window.AriaOpenAI) return;

  class AriaOpenAI {
    constructor(config = {}) {
      this.config = {
        apiEndpoint: config.apiEndpoint || 'https://voiceflow-crm.onrender.com',
        assistantName: config.assistantName || 'Aria',
        greeting: config.greeting || "Hi! I'm Aria. How can I help you today?",
        phone: config.phone || '(602) 833-7194',
        ...config
      };
      this.messages = [];
      this.isProcessing = false;
      this.isPlaying = false;
      this.isListening = false;
      this.currentAudio = null;
      this.recognition = null;
      this.widget = null;
      this.initSpeechRecognition();
    }

    initSpeechRecognition() {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        this.recognition = new SR();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onresult = (e) => {
          const result = e.results[e.results.length - 1];
          const transcript = result[0].transcript;
          const input = this.widget?.querySelector('.aw-input');
          if (input) input.value = transcript;
          if (result.isFinal) {
            this.stopListening();
            setTimeout(() => this.send(), 100);
          }
        };

        this.recognition.onerror = () => this.stopListening();
        this.recognition.onend = () => this.stopListening();
      }
    }

    init() {
      console.log('[Aria] v3 Ready');
    }

    open() {
      if (this.widget) {
        this.widget.style.display = 'block';
        document.body.style.overflow = 'hidden';
        return;
      }
      this.createWidget();
    }

    close() {
      if (this.widget) {
        this.widget.style.display = 'none';
        document.body.style.overflow = '';
      }
      this.stopAudio();
      this.stopListening();
    }

    createWidget() {
      this.widget = document.createElement('div');
      this.widget.className = 'aw-root';

      this.widget.innerHTML = `
        <style>
          .aw-root {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            z-index: 2147483647 !important;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
          }
          .aw-root * {
            box-sizing: border-box !important;
            font-family: inherit !important;
          }
          .aw-overlay {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            background: rgba(0,0,0,0.8) !important;
          }
          .aw-panel {
            position: absolute !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            background: #1a1a2e !important;
            border-radius: 24px 24px 0 0 !important;
            display: flex !important;
            flex-direction: column !important;
            max-height: 85vh !important;
            overflow: hidden !important;
          }
          @media (min-width: 500px) {
            .aw-panel {
              width: 420px !important;
              max-height: 620px !important;
              bottom: 24px !important;
              left: 50% !important;
              right: auto !important;
              transform: translateX(-50%) !important;
              border-radius: 24px !important;
            }
          }
          .aw-header {
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
            padding: 16px 20px !important;
            background: #252542 !important;
            border-radius: 24px 24px 0 0 !important;
          }
          .aw-avatar {
            width: 48px !important;
            height: 48px !important;
            border-radius: 50% !important;
            background: linear-gradient(135deg, #f9cb00, #ff9500) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-size: 24px !important;
            flex-shrink: 0 !important;
          }
          .aw-info {
            flex: 1 !important;
          }
          .aw-name {
            color: #fff !important;
            font-size: 18px !important;
            font-weight: 600 !important;
            margin: 0 !important;
          }
          .aw-status {
            color: rgba(255,255,255,0.5) !important;
            font-size: 13px !important;
            margin: 2px 0 0 !important;
          }
          .aw-status.thinking { color: #f9cb00 !important; }
          .aw-status.speaking { color: #22c55e !important; }
          .aw-status.listening { color: #ef4444 !important; }
          .aw-close {
            width: 44px !important;
            height: 44px !important;
            border-radius: 50% !important;
            background: rgba(255,255,255,0.2) !important;
            border: none !important;
            color: #fff !important;
            font-size: 28px !important;
            font-weight: 300 !important;
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            line-height: 1 !important;
            padding: 0 !important;
            padding-bottom: 3px !important;
          }
          .aw-close:active {
            background: rgba(255,255,255,0.3) !important;
            transform: scale(0.95) !important;
          }
          .aw-messages {
            flex: 1 !important;
            overflow-y: auto !important;
            padding: 16px 20px !important;
            min-height: 150px !important;
            max-height: 40vh !important;
            -webkit-overflow-scrolling: touch !important;
          }
          .aw-msg {
            max-width: 85% !important;
            padding: 12px 16px !important;
            border-radius: 18px !important;
            margin-bottom: 10px !important;
            font-size: 16px !important;
            line-height: 1.4 !important;
            word-wrap: break-word !important;
          }
          .aw-msg.assistant {
            background: rgba(255,255,255,0.1) !important;
            color: #fff !important;
            margin-right: auto !important;
            border-bottom-left-radius: 4px !important;
          }
          .aw-msg.user {
            background: linear-gradient(135deg, #f9cb00, #ff9500) !important;
            color: #1a1a2e !important;
            margin-left: auto !important;
            border-bottom-right-radius: 4px !important;
            font-weight: 500 !important;
          }
          .aw-call {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 10px !important;
            margin: 8px 20px 16px !important;
            padding: 14px !important;
            background: linear-gradient(135deg, #22c55e, #16a34a) !important;
            color: #fff !important;
            text-decoration: none !important;
            border-radius: 14px !important;
            font-size: 16px !important;
            font-weight: 600 !important;
          }
          .aw-call:active {
            transform: scale(0.98) !important;
            opacity: 0.9 !important;
          }
          .aw-inputbar {
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
            padding: 12px 16px 24px !important;
            background: rgba(0,0,0,0.25) !important;
          }
          @supports (padding-bottom: env(safe-area-inset-bottom)) {
            .aw-inputbar {
              padding-bottom: calc(24px + env(safe-area-inset-bottom)) !important;
            }
          }
          .aw-mic {
            width: 50px !important;
            height: 50px !important;
            border-radius: 50% !important;
            border: 2px solid rgba(255,255,255,0.3) !important;
            background: transparent !important;
            color: #fff !important;
            font-size: 22px !important;
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex-shrink: 0 !important;
            padding: 0 !important;
          }
          .aw-mic:active {
            transform: scale(0.95) !important;
          }
          .aw-mic.listening {
            background: #ef4444 !important;
            border-color: #ef4444 !important;
            animation: awpulse 1s infinite !important;
          }
          @keyframes awpulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
            50% { box-shadow: 0 0 0 10px rgba(239,68,68,0); }
          }
          .aw-input {
            flex: 1 !important;
            padding: 14px 18px !important;
            border-radius: 25px !important;
            border: 1px solid rgba(255,255,255,0.2) !important;
            background: rgba(255,255,255,0.1) !important;
            color: #fff !important;
            font-size: 16px !important;
            outline: none !important;
            -webkit-appearance: none !important;
            min-width: 0 !important;
          }
          .aw-input::placeholder {
            color: rgba(255,255,255,0.4) !important;
          }
          .aw-input:focus {
            border-color: #f9cb00 !important;
            background: rgba(255,255,255,0.15) !important;
          }
          .aw-send {
            width: 50px !important;
            height: 50px !important;
            border-radius: 50% !important;
            border: none !important;
            background: linear-gradient(135deg, #f9cb00, #ff9500) !important;
            color: #1a1a2e !important;
            font-size: 22px !important;
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex-shrink: 0 !important;
            padding: 0 !important;
            padding-left: 3px !important;
          }
          .aw-send:active {
            transform: scale(0.95) !important;
          }
          .aw-send:disabled {
            opacity: 0.5 !important;
          }
        </style>
        <div class="aw-overlay"></div>
        <div class="aw-panel">
          <div class="aw-header">
            <div class="aw-avatar">🎤</div>
            <div class="aw-info">
              <div class="aw-name">${this.config.assistantName}</div>
              <div class="aw-status">Online</div>
            </div>
            <button class="aw-close" type="button">×</button>
          </div>
          <div class="aw-messages"></div>
          <a class="aw-call" href="tel:${this.config.phone}">📞 Call ${this.config.phone}</a>
          <div class="aw-inputbar">
            <button class="aw-mic" type="button">🎙️</button>
            <input type="text" class="aw-input" placeholder="Type a message..." autocomplete="off" />
            <button class="aw-send" type="button">➤</button>
          </div>
        </div>
      `;

      document.body.appendChild(this.widget);
      document.body.style.overflow = 'hidden';

      // Events
      this.widget.querySelector('.aw-overlay').onclick = () => this.close();
      this.widget.querySelector('.aw-close').onclick = () => this.close();
      this.widget.querySelector('.aw-mic').onclick = () => this.toggleListening();
      this.widget.querySelector('.aw-send').onclick = () => this.send();
      this.widget.querySelector('.aw-input').onkeypress = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.send(); }
      };

      // Greeting
      if (this.messages.length === 0) {
        this.addMessage('assistant', this.config.greeting);
      }
    }

    toggleListening() {
      if (this.isListening) {
        this.stopListening();
      } else {
        this.startListening();
      }
    }

    startListening() {
      if (!this.recognition) {
        alert('Voice input not available. Please type your message.');
        return;
      }
      try {
        this.recognition.start();
        this.isListening = true;
        this.widget.querySelector('.aw-mic').classList.add('listening');
        this.setStatus('Listening...', 'listening');
      } catch (e) {
        console.log('[Aria] Mic error:', e);
      }
    }

    stopListening() {
      if (this.recognition && this.isListening) {
        try { this.recognition.stop(); } catch (e) {}
      }
      this.isListening = false;
      const mic = this.widget?.querySelector('.aw-mic');
      if (mic) mic.classList.remove('listening');
      if (!this.isProcessing && !this.isPlaying) {
        this.setStatus('Online', '');
      }
    }

    addMessage(role, text) {
      this.messages.push({ role, content: text });
      const container = this.widget?.querySelector('.aw-messages');
      if (!container) return;
      const div = document.createElement('div');
      div.className = 'aw-msg ' + role;
      div.textContent = text;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }

    setStatus(text, cls = '') {
      const el = this.widget?.querySelector('.aw-status');
      if (el) {
        el.textContent = text;
        el.className = 'aw-status' + (cls ? ' ' + cls : '');
      }
    }

    async send() {
      const input = this.widget?.querySelector('.aw-input');
      const sendBtn = this.widget?.querySelector('.aw-send');
      if (!input || !sendBtn) return;

      const text = input.value.trim();
      if (!text || this.isProcessing) return;

      input.value = '';
      sendBtn.disabled = true;
      this.isProcessing = true;

      this.addMessage('user', text);
      this.setStatus('Thinking...', 'thinking');

      try {
        const history = this.messages.slice(0, -1).slice(-6).map(m => ({
          role: m.role, content: m.content
        }));

        const res = await fetch(this.config.apiEndpoint + '/api/surprise-granite/aria-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, conversationHistory: history })
        });

        const data = await res.json();

        if (data.success && data.response) {
          this.addMessage('assistant', data.response);
          if (data.audio) {
            this.setStatus('Speaking...', 'speaking');
            await this.playAudio(data.audio);
          }
        } else {
          this.addMessage('assistant', 'Sorry, something went wrong. Please try again.');
        }
      } catch (err) {
        console.error('[Aria] Error:', err);
        this.addMessage('assistant', 'Connection error. Please try again or call us.');
      }

      this.setStatus('Online', '');
      this.isProcessing = false;
      sendBtn.disabled = false;
      input.focus();
    }

    playAudio(base64) {
      return new Promise((resolve) => {
        this.stopAudio();
        try {
          this.currentAudio = new Audio('data:audio/mp3;base64,' + base64);
          this.isPlaying = true;
          this.currentAudio.onended = () => { this.isPlaying = false; this.currentAudio = null; resolve(); };
          this.currentAudio.onerror = () => { this.isPlaying = false; this.currentAudio = null; resolve(); };
          this.currentAudio.play().catch(() => { this.isPlaying = false; this.currentAudio = null; resolve(); });
        } catch (e) { resolve(); }
      });
    }

    stopAudio() {
      if (this.currentAudio) {
        this.currentAudio.pause();
        this.currentAudio = null;
        this.isPlaying = false;
      }
    }
  }

  window.AriaOpenAI = AriaOpenAI;
})();
