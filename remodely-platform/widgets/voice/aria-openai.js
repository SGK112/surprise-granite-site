/**
 * ARIA CHAT WIDGET
 * Simple, reliable text chat with OpenAI voice responses
 * Mobile-first design that actually works
 */
(function() {
  'use strict';

  // Prevent double initialization
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
      this.currentAudio = null;
      this.widget = null;
    }

    init() {
      console.log('[Aria] Ready');
    }

    open() {
      if (this.widget) {
        this.widget.style.display = 'block';
        this.focusInput();
        return;
      }
      this.createWidget();
    }

    close() {
      if (this.widget) {
        this.widget.style.display = 'none';
      }
      this.stopAudio();
    }

    createWidget() {
      // Create container
      this.widget = document.createElement('div');
      this.widget.id = 'aria-widget-container';

      // Build HTML
      this.widget.innerHTML = `
        <div id="aria-backdrop"></div>
        <div id="aria-panel">
          <div id="aria-header">
            <div id="aria-avatar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              </svg>
            </div>
            <div id="aria-title">
              <span id="aria-name">${this.config.assistantName}</span>
              <span id="aria-status">Online</span>
            </div>
            <button id="aria-close" type="button" aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div id="aria-chat"></div>

          <a id="aria-phone" href="tel:${this.config.phone}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            <span>Call ${this.config.phone}</span>
          </a>

          <form id="aria-form">
            <input type="text" id="aria-input" placeholder="Type a message..." autocomplete="off" />
            <button type="submit" id="aria-send" aria-label="Send">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
              </svg>
            </button>
          </form>
        </div>
      `;

      // Add styles
      const style = document.createElement('style');
      style.textContent = this.getStyles();
      this.widget.appendChild(style);

      // Add to page
      document.body.appendChild(this.widget);

      // Setup events
      this.setupEvents();

      // Show greeting
      if (this.messages.length === 0) {
        this.addMessage('assistant', this.config.greeting);
      }

      // Focus input
      this.focusInput();
    }

    getStyles() {
      return `
        #aria-widget-container {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 2147483647;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        #aria-backdrop {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
        }

        #aria-panel {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: #1a1a2e;
          border-radius: 20px 20px 0 0;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 -10px 40px rgba(0,0,0,0.5);
        }

        @media (min-width: 500px) {
          #aria-panel {
            bottom: 20px;
            left: 50%;
            right: auto;
            transform: translateX(-50%);
            width: 400px;
            max-height: 600px;
            border-radius: 20px;
          }
        }

        #aria-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
          background: linear-gradient(135deg, #252538 0%, #1f1f30 100%);
          border-radius: 20px 20px 0 0;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        @media (min-width: 500px) {
          #aria-header {
            border-radius: 20px 20px 0 0;
          }
        }

        #aria-avatar {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: linear-gradient(135deg, #f9cb00, #ff9500);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        #aria-avatar svg {
          width: 22px;
          height: 22px;
          stroke: #1a1a2e;
        }

        #aria-title {
          flex: 1;
          min-width: 0;
        }

        #aria-name {
          display: block;
          color: #fff;
          font-size: 17px;
          font-weight: 600;
        }

        #aria-status {
          display: block;
          color: rgba(255,255,255,0.5);
          font-size: 13px;
        }

        #aria-status.thinking {
          color: #f9cb00;
        }

        #aria-status.speaking {
          color: #22c55e;
        }

        #aria-close {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: rgba(255,255,255,0.1);
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          -webkit-tap-highlight-color: transparent;
        }

        #aria-close svg {
          width: 22px;
          height: 22px;
          stroke: #fff;
        }

        #aria-close:active {
          background: rgba(255,255,255,0.2);
          transform: scale(0.95);
        }

        #aria-chat {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          min-height: 200px;
          max-height: 50vh;
          -webkit-overflow-scrolling: touch;
        }

        .aria-msg {
          max-width: 85%;
          padding: 12px 16px;
          border-radius: 18px;
          margin-bottom: 10px;
          font-size: 15px;
          line-height: 1.4;
          word-wrap: break-word;
        }

        .aria-msg.assistant {
          background: rgba(255,255,255,0.1);
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

        .aria-msg.typing::after {
          content: '';
          animation: dots 1.5s infinite;
        }

        @keyframes dots {
          0%, 20% { content: '.'; }
          40% { content: '..'; }
          60%, 100% { content: '...'; }
        }

        #aria-phone {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin: 0 16px 12px;
          padding: 14px;
          background: linear-gradient(135deg, #22c55e, #16a34a);
          color: #fff;
          text-decoration: none;
          border-radius: 14px;
          font-size: 15px;
          font-weight: 600;
          -webkit-tap-highlight-color: transparent;
        }

        #aria-phone svg {
          width: 20px;
          height: 20px;
        }

        #aria-phone:active {
          transform: scale(0.98);
          opacity: 0.9;
        }

        #aria-form {
          display: flex;
          gap: 10px;
          padding: 16px 16px 20px;
          background: rgba(0,0,0,0.2);
        }

        @supports (padding: env(safe-area-inset-bottom)) {
          #aria-form {
            padding-bottom: calc(20px + env(safe-area-inset-bottom));
          }
        }

        #aria-input {
          flex: 1;
          padding: 14px 18px;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,0.15);
          background: rgba(255,255,255,0.08);
          color: #fff;
          font-size: 16px;
          outline: none;
          -webkit-appearance: none;
        }

        #aria-input::placeholder {
          color: rgba(255,255,255,0.4);
        }

        #aria-input:focus {
          border-color: rgba(249,203,0,0.5);
          background: rgba(255,255,255,0.12);
        }

        #aria-send {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          border: none;
          background: linear-gradient(135deg, #f9cb00, #ff9500);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          -webkit-tap-highlight-color: transparent;
        }

        #aria-send svg {
          width: 22px;
          height: 22px;
          stroke: #1a1a2e;
        }

        #aria-send:active {
          transform: scale(0.95);
        }

        #aria-send:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `;
    }

    setupEvents() {
      const backdrop = this.widget.querySelector('#aria-backdrop');
      const closeBtn = this.widget.querySelector('#aria-close');
      const form = this.widget.querySelector('#aria-form');

      // Close events
      backdrop.addEventListener('click', () => this.close());
      closeBtn.addEventListener('click', () => this.close());

      // Form submit
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.send();
      });

      // ESC key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.widget.style.display !== 'none') {
          this.close();
        }
      });
    }

    focusInput() {
      setTimeout(() => {
        const input = this.widget.querySelector('#aria-input');
        if (input) input.focus();
      }, 100);
    }

    addMessage(role, text) {
      this.messages.push({ role, content: text });

      const chat = this.widget.querySelector('#aria-chat');
      const msg = document.createElement('div');
      msg.className = 'aria-msg ' + role;
      msg.textContent = text;
      chat.appendChild(msg);
      chat.scrollTop = chat.scrollHeight;

      return msg;
    }

    setStatus(text, className = '') {
      const status = this.widget.querySelector('#aria-status');
      if (status) {
        status.textContent = text;
        status.className = className;
      }
    }

    showTyping() {
      const chat = this.widget.querySelector('#aria-chat');
      const typing = document.createElement('div');
      typing.className = 'aria-msg assistant typing';
      typing.id = 'aria-typing';
      typing.textContent = 'Typing';
      chat.appendChild(typing);
      chat.scrollTop = chat.scrollHeight;
    }

    hideTyping() {
      const typing = this.widget.querySelector('#aria-typing');
      if (typing) typing.remove();
    }

    async send() {
      const input = this.widget.querySelector('#aria-input');
      const sendBtn = this.widget.querySelector('#aria-send');
      const text = input.value.trim();

      if (!text || this.isProcessing) return;

      // Clear input and disable
      input.value = '';
      sendBtn.disabled = true;
      this.isProcessing = true;

      // Add user message
      this.addMessage('user', text);

      // Show typing
      this.showTyping();
      this.setStatus('Thinking...', 'thinking');

      try {
        const res = await fetch(this.config.apiEndpoint + '/api/surprise-granite/aria-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            conversationHistory: this.messages.slice(-6)
          })
        });

        const data = await res.json();
        this.hideTyping();

        if (data.success && data.response) {
          this.addMessage('assistant', data.response);

          // Play audio
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

  // Export
  window.AriaOpenAI = AriaOpenAI;
})();
