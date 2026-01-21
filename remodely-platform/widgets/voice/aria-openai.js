/**
 * ARIA CHAT v7 - Glassmorphic Edition
 * Matches Remodely Hub styling
 */
(function() {
  'use strict';

  if (window.AriaOpenAI) return;

  class AriaOpenAI {
    constructor(config = {}) {
      this.config = {
        apiEndpoint: config.apiEndpoint || 'https://voiceflow-crm.onrender.com',
        assistantName: config.assistantName || 'Aria',
        businessName: config.businessName || 'Surprise Granite',
        greeting: config.greeting || "Hi! I'm Aria from Surprise Granite. How can I help you today?",
        phone: config.phone || '(602) 833-3189',
        ...config
      };
      this.messages = [];
      this.isProcessing = false;
      this.isPlaying = false;
      this.isListening = false;
      this.voiceModeActive = false;
      this.currentAudio = null;
      this.recognition = null;
      this.widget = null;
      this.silenceTimer = null;
      this.initSpeechRecognition();
    }

    initSpeechRecognition() {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return;
      this.recognition = new SR();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onresult = (e) => {
        let final = '', interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          e.results[i].isFinal ? final += t : interim += t;
        }
        const input = this.widget?.querySelector('.aria-input');
        if (input) input.value = final || interim;
        this.resetSilenceTimer();
      };

      this.recognition.onerror = (e) => {
        if (e.error === 'not-allowed') this.stopVoiceMode();
      };

      this.recognition.onend = () => {
        if (this.voiceModeActive && !this.isProcessing && !this.isPlaying) {
          try { this.recognition.start(); } catch (e) {}
        }
      };
    }

    resetSilenceTimer() {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = setTimeout(() => {
        const input = this.widget?.querySelector('.aria-input');
        if (input?.value.trim() && !this.isProcessing) {
          this.send(input.value.trim());
          input.value = '';
        }
      }, 1500);
    }

    init() { console.log('[Aria] v7 Glassmorphic Ready'); }

    open() {
      if (this.widget) {
        this.widget.classList.add('open');
        return;
      }
      this.createWidget();
    }

    close() {
      this.stopVoiceMode();
      this.stopAudio();
      this.widget?.classList.remove('open');
    }

    createWidget() {
      this.widget = document.createElement('div');
      this.widget.className = 'aria-widget open';

      this.widget.innerHTML = `
        <style>
          @keyframes ariaFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes ariaPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
          @keyframes ariaTyping { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }

          .aria-widget {
            position: fixed;
            inset: 0;
            z-index: 2147483647;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.25s, visibility 0.25s;
          }
          .aria-widget.open { opacity: 1; visibility: visible; }
          .aria-widget * { box-sizing: border-box; margin: 0; padding: 0; }

          .aria-backdrop {
            position: absolute;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
          }

          .aria-panel {
            position: absolute;
            bottom: 90px;
            right: 24px;
            width: 380px;
            max-width: calc(100vw - 48px);
            max-height: calc(100vh - 140px);
            background: rgba(20, 20, 35, 0.85);
            backdrop-filter: blur(20px) saturate(180%);
            -webkit-backdrop-filter: blur(20px) saturate(180%);
            border-radius: 20px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            transform: translateY(20px) scale(0.95);
            opacity: 0;
            transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.3s;
          }
          .aria-widget.open .aria-panel {
            transform: translateY(0) scale(1);
            opacity: 1;
          }

          @media (max-width: 480px) {
            .aria-panel {
              bottom: 0;
              right: 0;
              left: 0;
              width: 100%;
              max-width: 100%;
              max-height: 85vh;
              border-radius: 20px 20px 0 0;
            }
          }

          /* Header */
          .aria-header {
            padding: 18px 20px;
            display: flex;
            align-items: center;
            gap: 14px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            background: linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 100%);
          }

          .aria-avatar {
            width: 42px;
            height: 42px;
            background: linear-gradient(135deg, #f9cb00 0%, #e6b800 100%);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }
          .aria-avatar svg { width: 22px; height: 22px; color: #1a1a2e; }

          .aria-header-info { flex: 1; }
          .aria-name {
            font-size: 15px;
            font-weight: 600;
            color: #fff;
            letter-spacing: -0.2px;
          }
          .aria-status {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-top: 3px;
            font-size: 12px;
            color: rgba(255, 255, 255, 0.6);
          }
          .aria-dot {
            width: 7px;
            height: 7px;
            background: #22c55e;
            border-radius: 50%;
          }
          .aria-dot.listening { background: #f9cb00; animation: ariaPulse 1.2s infinite; }
          .aria-dot.thinking { background: #3b82f6; animation: ariaPulse 0.6s infinite; }

          .aria-close {
            width: 32px;
            height: 32px;
            border: none;
            background: rgba(255, 255, 255, 0.08);
            border-radius: 8px;
            color: rgba(255, 255, 255, 0.7);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.15s;
          }
          .aria-close:hover { background: rgba(255, 255, 255, 0.15); }
          .aria-close svg { width: 16px; height: 16px; }

          /* Messages */
          .aria-messages {
            flex: 1;
            overflow-y: auto;
            padding: 16px 20px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            min-height: 180px;
            max-height: 320px;
          }
          .aria-messages::-webkit-scrollbar { width: 5px; }
          .aria-messages::-webkit-scrollbar-track { background: transparent; }
          .aria-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 5px; }

          .aria-msg {
            max-width: 88%;
            animation: ariaFadeIn 0.25s ease-out;
          }
          .aria-msg.user { align-self: flex-end; }
          .aria-msg.assistant { align-self: flex-start; }

          .aria-bubble {
            padding: 11px 15px;
            border-radius: 16px;
            font-size: 14px;
            line-height: 1.45;
          }
          .aria-msg.user .aria-bubble {
            background: linear-gradient(135deg, #f9cb00, #e6b800);
            color: #1a1a2e;
            border-bottom-right-radius: 4px;
          }
          .aria-msg.assistant .aria-bubble {
            background: rgba(255, 255, 255, 0.1);
            color: rgba(255, 255, 255, 0.95);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-bottom-left-radius: 4px;
          }

          .aria-typing {
            display: flex;
            gap: 5px;
            padding: 12px 16px;
            align-self: flex-start;
          }
          .aria-typing span {
            width: 7px;
            height: 7px;
            background: rgba(255, 255, 255, 0.4);
            border-radius: 50%;
            animation: ariaTyping 1.2s infinite;
          }
          .aria-typing span:nth-child(2) { animation-delay: 0.15s; }
          .aria-typing span:nth-child(3) { animation-delay: 0.3s; }

          /* Input */
          .aria-input-area {
            padding: 16px 20px 20px;
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(0, 0, 0, 0.15);
          }

          .aria-input-row {
            display: flex;
            align-items: center;
            gap: 8px;
            background: rgba(255, 255, 255, 0.07);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 14px;
            padding: 5px;
            transition: border-color 0.2s, box-shadow 0.2s;
          }
          .aria-input-row:focus-within {
            border-color: rgba(249, 203, 0, 0.5);
            box-shadow: 0 0 0 3px rgba(249, 203, 0, 0.1);
          }

          .aria-input {
            flex: 1;
            background: transparent;
            border: none;
            padding: 10px 12px;
            font-size: 14px;
            color: #fff;
            outline: none;
          }
          .aria-input::placeholder { color: rgba(255, 255, 255, 0.4); }

          .aria-btn {
            width: 38px;
            height: 38px;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.15s;
            flex-shrink: 0;
          }
          .aria-btn svg { width: 18px; height: 18px; }

          .aria-btn-mic {
            background: rgba(255, 255, 255, 0.08);
            color: rgba(255, 255, 255, 0.6);
          }
          .aria-btn-mic:hover { background: rgba(255, 255, 255, 0.15); color: #fff; }
          .aria-btn-mic.active { background: rgba(239, 68, 68, 0.2); color: #ef4444; }

          .aria-btn-send {
            background: linear-gradient(135deg, #f9cb00, #e6b800);
            color: #1a1a2e;
          }
          .aria-btn-send:hover { transform: scale(1.05); }
          .aria-btn-send:active { transform: scale(0.95); }

          /* Quick Actions */
          .aria-actions {
            display: flex;
            gap: 8px;
            margin-top: 12px;
            overflow-x: auto;
            padding-bottom: 2px;
            -webkit-overflow-scrolling: touch;
          }
          .aria-actions::-webkit-scrollbar { display: none; }

          .aria-chip {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 8px 12px;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 20px;
            font-size: 12px;
            color: rgba(255, 255, 255, 0.7);
            white-space: nowrap;
            cursor: pointer;
            transition: all 0.15s;
            text-decoration: none;
          }
          .aria-chip:hover {
            background: rgba(249, 203, 0, 0.15);
            border-color: rgba(249, 203, 0, 0.3);
            color: #f9cb00;
          }
          .aria-chip svg { width: 13px; height: 13px; }

          /* Footer */
          .aria-footer {
            padding: 10px 20px;
            text-align: center;
            font-size: 10px;
            color: rgba(255, 255, 255, 0.35);
            border-top: 1px solid rgba(255, 255, 255, 0.05);
          }
          .aria-footer a { color: rgba(249, 203, 0, 0.7); text-decoration: none; }
          .aria-footer a:hover { color: #f9cb00; }
        </style>

        <div class="aria-backdrop"></div>

        <div class="aria-panel">
          <div class="aria-header">
            <div class="aria-avatar">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
              </svg>
            </div>
            <div class="aria-header-info">
              <div class="aria-name">${this.config.assistantName}</div>
              <div class="aria-status">
                <span class="aria-dot"></span>
                <span class="aria-status-text">Online</span>
              </div>
            </div>
            <button class="aria-close" type="button">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div class="aria-messages"></div>

          <div class="aria-input-area">
            <div class="aria-input-row">
              <input type="text" class="aria-input" placeholder="Type a message..." autocomplete="off" />
              <button class="aria-btn aria-btn-mic" type="button" title="Voice">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
                </svg>
              </button>
              <button class="aria-btn aria-btn-send" type="button" title="Send">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                </svg>
              </button>
            </div>
            <div class="aria-actions">
              <a class="aria-chip" href="tel:${this.config.phone}">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                </svg>
                Call
              </a>
              <button class="aria-chip" data-action="estimate" type="button">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
                Free Estimate
              </button>
              <a class="aria-chip" href="/company/vendors-list/" target="_blank">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                Stone Yards
              </a>
              <button class="aria-chip" data-action="pricing" type="button">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                Pricing
              </button>
            </div>
          </div>

          <div class="aria-footer">
            Powered by <a href="https://remodely.ai" target="_blank">Remodely AI</a>
          </div>
        </div>
      `;

      document.body.appendChild(this.widget);

      // Events
      this.widget.querySelector('.aria-backdrop').onclick = () => this.close();
      this.widget.querySelector('.aria-close').onclick = () => this.close();
      this.widget.querySelector('.aria-btn-mic').onclick = () => this.toggleVoiceMode();
      this.widget.querySelector('.aria-btn-send').onclick = () => this.sendFromInput();
      this.widget.querySelector('.aria-input').onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendFromInput(); }
      };

      // Quick actions
      this.widget.querySelectorAll('.aria-chip[data-action]').forEach(chip => {
        chip.onclick = () => {
          const actions = {
            estimate: "I'd like to schedule a free estimate",
            pricing: "What are your countertop prices?"
          };
          if (actions[chip.dataset.action]) this.send(actions[chip.dataset.action]);
        };
      });

      // Greeting
      if (this.messages.length === 0) {
        this.addMessage('assistant', this.config.greeting);
        this.speakGreeting();
      }
    }

    sendFromInput() {
      const input = this.widget.querySelector('.aria-input');
      if (input.value.trim()) {
        this.send(input.value.trim());
        input.value = '';
      }
    }

    async speakGreeting() {
      try {
        const res = await fetch(this.config.apiEndpoint + '/api/surprise-granite/aria-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Say hello', conversationHistory: [] })
        });
        const data = await res.json();
        if (data.audio) await this.playAudio(data.audio);
      } catch (e) {}
    }

    toggleVoiceMode() {
      this.voiceModeActive ? this.stopVoiceMode() : this.startVoiceMode();
    }

    startVoiceMode() {
      if (!this.recognition) return;
      try {
        this.recognition.start();
        this.voiceModeActive = true;
        this.isListening = true;
        this.widget.querySelector('.aria-btn-mic').classList.add('active');
        this.setStatus('Listening...', 'listening');
      } catch (e) {}
    }

    stopVoiceMode() {
      clearTimeout(this.silenceTimer);
      this.voiceModeActive = false;
      this.isListening = false;
      if (this.recognition) try { this.recognition.stop(); } catch (e) {}
      this.widget?.querySelector('.aria-btn-mic')?.classList.remove('active');
      this.setStatus('Online', '');
    }

    setStatus(text, state = '') {
      const dot = this.widget?.querySelector('.aria-dot');
      const label = this.widget?.querySelector('.aria-status-text');
      if (label) label.textContent = text;
      if (dot) {
        dot.classList.remove('listening', 'thinking');
        if (state) dot.classList.add(state);
      }
    }

    addMessage(role, text) {
      this.messages.push({ role, content: text });
      const container = this.widget?.querySelector('.aria-messages');
      if (!container) return;
      container.querySelector('.aria-typing')?.remove();
      const msg = document.createElement('div');
      msg.className = `aria-msg ${role}`;
      msg.innerHTML = `<div class="aria-bubble">${this.escapeHtml(text)}</div>`;
      container.appendChild(msg);
      container.scrollTop = container.scrollHeight;
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    showTyping() {
      const container = this.widget?.querySelector('.aria-messages');
      if (!container || container.querySelector('.aria-typing')) return;
      const typing = document.createElement('div');
      typing.className = 'aria-typing';
      typing.innerHTML = '<span></span><span></span><span></span>';
      container.appendChild(typing);
      container.scrollTop = container.scrollHeight;
    }

    async send(text) {
      if (!text || this.isProcessing) return;
      if (this.recognition && this.isListening) try { this.recognition.stop(); } catch (e) {}

      this.isProcessing = true;
      this.addMessage('user', text);
      this.showTyping();
      this.setStatus('Thinking...', 'thinking');

      try {
        const history = this.messages.slice(0, -1).slice(-6).map(m => ({ role: m.role, content: m.content }));
        const res = await fetch(this.config.apiEndpoint + '/api/surprise-granite/aria-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, conversationHistory: history })
        });
        const data = await res.json();

        if (data.success && data.response) {
          this.addMessage('assistant', data.response);
          if (data.audio) {
            this.setStatus('Speaking...', '');
            await this.playAudio(data.audio);
          }
        } else {
          this.addMessage('assistant', 'Sorry, I had trouble with that. Please try again.');
        }
      } catch (err) {
        this.widget?.querySelector('.aria-typing')?.remove();
        this.addMessage('assistant', 'Connection error. Please try again or call us.');
      }

      this.isProcessing = false;
      if (this.voiceModeActive) {
        this.setStatus('Listening...', 'listening');
        try { this.recognition.start(); } catch (e) {}
      } else {
        this.setStatus('Online', '');
      }
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
