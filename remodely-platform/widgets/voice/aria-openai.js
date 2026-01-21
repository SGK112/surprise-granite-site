/**
 * ARIA CHAT WIDGET v2
 * Text + Voice chat with OpenAI TTS responses
 * Mobile-first design
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
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onresult = (e) => {
          const result = e.results[e.results.length - 1];
          const transcript = result[0].transcript;
          const input = this.widget?.querySelector('#ariaInput');
          if (input) input.value = transcript;

          if (result.isFinal) {
            this.stopListening();
            setTimeout(() => this.send(), 100);
          }
        };

        this.recognition.onerror = (e) => {
          console.log('[Aria] Speech error:', e.error);
          this.stopListening();
        };

        this.recognition.onend = () => {
          this.stopListening();
        };
      }
    }

    init() {
      console.log('[Aria] v2 Ready');
    }

    open() {
      if (this.widget) {
        this.widget.style.display = 'block';
        document.body.style.overflow = 'hidden';
        this.focusInput();
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
      this.widget.id = 'aria-widget-v2';

      this.widget.innerHTML = `
        <div class="aria-overlay"></div>
        <div class="aria-panel">
          <div class="aria-head">
            <div class="aria-avatar">
              <svg viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" stroke-width="2.5">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              </svg>
            </div>
            <div class="aria-info">
              <div class="aria-name">${this.config.assistantName}</div>
              <div class="aria-status" id="ariaStatus">Online</div>
            </div>
            <button class="aria-close" id="ariaClose" type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div class="aria-msgs" id="ariaMsgs"></div>

          <a class="aria-call" href="tel:${this.config.phone}">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            Call ${this.config.phone}
          </a>

          <div class="aria-bar">
            <button class="aria-mic" id="ariaMic" type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </button>
            <input type="text" class="aria-input" id="ariaInput" placeholder="Type a message..." autocomplete="off" />
            <button class="aria-send" id="ariaSend" type="button">
              <svg viewBox="0 0 24 24" fill="#1a1a2e" stroke="none">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>
        </div>
      `;

      const style = document.createElement('style');
      style.textContent = `
        #aria-widget-v2 {
          position: fixed;
          inset: 0;
          z-index: 2147483647;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        #aria-widget-v2 * { box-sizing: border-box; }

        .aria-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.75);
        }

        .aria-panel {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: #1a1a2e;
          border-radius: 24px 24px 0 0;
          display: flex;
          flex-direction: column;
          max-height: 90vh;
        }

        @media (min-width: 500px) {
          .aria-panel {
            width: 420px;
            max-height: 650px;
            bottom: 20px;
            left: 50%;
            right: auto;
            transform: translateX(-50%);
            border-radius: 24px;
          }
        }

        .aria-head {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 18px 20px;
          background: #252540;
          border-radius: 24px 24px 0 0;
        }

        @media (min-width: 500px) {
          .aria-head { border-radius: 24px 24px 0 0; }
        }

        .aria-avatar {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          background: linear-gradient(135deg, #f9cb00, #ff9500);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .aria-avatar svg {
          width: 26px;
          height: 26px;
        }

        .aria-info { flex: 1; }
        .aria-name {
          color: #fff;
          font-size: 18px;
          font-weight: 600;
        }
        .aria-status {
          color: rgba(255,255,255,0.5);
          font-size: 14px;
        }
        .aria-status.thinking { color: #f9cb00; }
        .aria-status.speaking { color: #22c55e; }
        .aria-status.listening { color: #ef4444; }

        .aria-close {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: rgba(255,255,255,0.15);
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .aria-close svg {
          width: 24px;
          height: 24px;
        }
        .aria-close:active {
          background: rgba(255,255,255,0.25);
          transform: scale(0.95);
        }

        .aria-msgs {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          min-height: 180px;
          max-height: 45vh;
          -webkit-overflow-scrolling: touch;
        }

        .aria-msg {
          max-width: 85%;
          padding: 14px 18px;
          border-radius: 20px;
          margin-bottom: 12px;
          font-size: 16px;
          line-height: 1.45;
          word-wrap: break-word;
        }
        .aria-msg.assistant {
          background: rgba(255,255,255,0.12);
          color: #fff;
          margin-right: auto;
          border-bottom-left-radius: 6px;
        }
        .aria-msg.user {
          background: linear-gradient(135deg, #f9cb00, #ff9500);
          color: #1a1a2e;
          margin-left: auto;
          border-bottom-right-radius: 6px;
          font-weight: 500;
        }
        .aria-msg.typing {
          color: rgba(255,255,255,0.6);
        }

        .aria-call {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin: 0 20px 16px;
          padding: 16px;
          background: linear-gradient(135deg, #22c55e, #16a34a);
          color: #fff;
          text-decoration: none;
          border-radius: 16px;
          font-size: 17px;
          font-weight: 600;
        }
        .aria-call svg {
          width: 22px;
          height: 22px;
        }
        .aria-call:active {
          transform: scale(0.98);
          opacity: 0.9;
        }

        .aria-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 16px 20px 24px;
          background: rgba(0,0,0,0.3);
        }

        @supports (padding-bottom: env(safe-area-inset-bottom)) {
          .aria-bar {
            padding-bottom: calc(24px + env(safe-area-inset-bottom));
          }
        }

        .aria-mic {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.2);
          background: transparent;
          color: rgba(255,255,255,0.7);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: all 0.2s;
        }
        .aria-mic svg {
          width: 24px;
          height: 24px;
        }
        .aria-mic:active {
          transform: scale(0.95);
        }
        .aria-mic.listening {
          background: #ef4444;
          border-color: #ef4444;
          color: #fff;
          animation: pulse 1s infinite;
        }
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
          50% { box-shadow: 0 0 0 12px rgba(239,68,68,0); }
        }

        .aria-input {
          flex: 1;
          padding: 16px 20px;
          border-radius: 26px;
          border: 1px solid rgba(255,255,255,0.15);
          background: rgba(255,255,255,0.08);
          color: #fff;
          font-size: 16px;
          outline: none;
          -webkit-appearance: none;
          min-width: 0;
        }
        .aria-input::placeholder {
          color: rgba(255,255,255,0.4);
        }
        .aria-input:focus {
          border-color: rgba(249,203,0,0.5);
          background: rgba(255,255,255,0.12);
        }

        .aria-send {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          border: none;
          background: linear-gradient(135deg, #f9cb00, #ff9500);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .aria-send svg {
          width: 24px;
          height: 24px;
          margin-left: 3px;
        }
        .aria-send:active {
          transform: scale(0.95);
        }
        .aria-send:disabled {
          opacity: 0.5;
        }
      `;

      this.widget.appendChild(style);
      document.body.appendChild(this.widget);
      document.body.style.overflow = 'hidden';

      this.setupEvents();

      if (this.messages.length === 0) {
        this.addMessage('assistant', this.config.greeting);
      }

      this.focusInput();
    }

    setupEvents() {
      const overlay = this.widget.querySelector('.aria-overlay');
      const closeBtn = this.widget.querySelector('#ariaClose');
      const micBtn = this.widget.querySelector('#ariaMic');
      const sendBtn = this.widget.querySelector('#ariaSend');
      const input = this.widget.querySelector('#ariaInput');

      overlay.addEventListener('click', () => this.close());
      closeBtn.addEventListener('click', () => this.close());

      micBtn.addEventListener('click', () => this.toggleListening());

      sendBtn.addEventListener('click', () => this.send());
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.send();
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.widget?.style.display !== 'none') {
          this.close();
        }
      });
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
        alert('Voice input not supported on this device. Please type your message.');
        return;
      }

      try {
        this.recognition.start();
        this.isListening = true;
        const micBtn = this.widget.querySelector('#ariaMic');
        if (micBtn) micBtn.classList.add('listening');
        this.setStatus('Listening...', 'listening');
      } catch (e) {
        console.log('[Aria] Could not start listening:', e);
      }
    }

    stopListening() {
      if (this.recognition && this.isListening) {
        try {
          this.recognition.stop();
        } catch (e) {}
      }
      this.isListening = false;
      const micBtn = this.widget?.querySelector('#ariaMic');
      if (micBtn) micBtn.classList.remove('listening');
      if (!this.isProcessing && !this.isPlaying) {
        this.setStatus('Online', '');
      }
    }

    focusInput() {
      setTimeout(() => {
        const input = this.widget?.querySelector('#ariaInput');
        if (input) input.focus();
      }, 100);
    }

    addMessage(role, text) {
      this.messages.push({ role, content: text });

      const msgs = this.widget?.querySelector('#ariaMsgs');
      if (!msgs) return;

      const div = document.createElement('div');
      div.className = 'aria-msg ' + role;
      div.textContent = text;
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;

      return div;
    }

    setStatus(text, cls = '') {
      const el = this.widget?.querySelector('#ariaStatus');
      if (el) {
        el.textContent = text;
        el.className = 'aria-status' + (cls ? ' ' + cls : '');
      }
    }

    showTyping() {
      const msgs = this.widget?.querySelector('#ariaMsgs');
      if (!msgs) return;

      const div = document.createElement('div');
      div.className = 'aria-msg assistant typing';
      div.id = 'ariaTyping';
      div.textContent = 'Typing...';
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
    }

    hideTyping() {
      const el = this.widget?.querySelector('#ariaTyping');
      if (el) el.remove();
    }

    async send() {
      const input = this.widget?.querySelector('#ariaInput');
      const sendBtn = this.widget?.querySelector('#ariaSend');
      if (!input || !sendBtn) return;

      const text = input.value.trim();
      if (!text || this.isProcessing) return;

      input.value = '';
      sendBtn.disabled = true;
      this.isProcessing = true;

      this.addMessage('user', text);
      this.showTyping();
      this.setStatus('Thinking...', 'thinking');

      try {
        const history = this.messages.slice(0, -1).slice(-6).map(m => ({
          role: m.role,
          content: m.content
        }));

        const res = await fetch(this.config.apiEndpoint + '/api/surprise-granite/aria-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            conversationHistory: history
          })
        });

        const data = await res.json();
        this.hideTyping();

        if (data.success && data.response) {
          this.addMessage('assistant', data.response);

          if (data.audio) {
            this.setStatus('Speaking...', 'speaking');
            await this.playAudio(data.audio);
          }
        } else {
          this.addMessage('assistant', 'Sorry, something went wrong. Please try again or call us.');
        }
      } catch (err) {
        console.error('[Aria] Error:', err);
        this.hideTyping();
        this.addMessage('assistant', 'Connection error. Please try again or call us directly.');
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

          this.currentAudio.onended = () => {
            this.isPlaying = false;
            this.currentAudio = null;
            resolve();
          };

          this.currentAudio.onerror = () => {
            this.isPlaying = false;
            this.currentAudio = null;
            resolve();
          };

          this.currentAudio.play().catch(() => {
            this.isPlaying = false;
            this.currentAudio = null;
            resolve();
          });
        } catch (e) {
          console.error('[Aria] Audio error:', e);
          resolve();
        }
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
