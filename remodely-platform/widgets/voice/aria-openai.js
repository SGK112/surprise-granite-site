/**
 * ARIA CHAT v8 - Premium Edition
 * Modern, polished chat interface with optional voice
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

    init() { console.log('[Aria] v8 Premium Ready'); }

    open() {
      if (this.widget) {
        this.widget.classList.add('open');
        setTimeout(() => this.widget.querySelector('.aria-input')?.focus(), 300);
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
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

          @keyframes ariaSlideUp {
            from { opacity: 0; transform: translateY(24px) scale(0.96); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes ariaFadeIn {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes ariaPulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.1); opacity: 0.7; }
          }
          @keyframes ariaGlow {
            0%, 100% { box-shadow: 0 0 0 0 rgba(249, 203, 0, 0.4); }
            50% { box-shadow: 0 0 0 8px rgba(249, 203, 0, 0); }
          }
          @keyframes ariaBounce {
            0%, 60%, 100% { transform: translateY(0); }
            30% { transform: translateY(-4px); }
          }
          @keyframes ariaShimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }

          .aria-widget {
            position: fixed;
            inset: 0;
            z-index: 2147483647;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s ease, visibility 0.3s ease;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }
          .aria-widget.open { opacity: 1; visibility: visible; }
          .aria-widget * { box-sizing: border-box; margin: 0; padding: 0; }

          .aria-overlay {
            position: absolute;
            inset: 0;
            background: linear-gradient(135deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.75) 100%);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
          }

          .aria-container {
            position: absolute;
            bottom: 100px;
            right: 24px;
            width: 400px;
            max-width: calc(100vw - 32px);
            max-height: calc(100vh - 160px);
            display: flex;
            flex-direction: column;
            animation: ariaSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }

          .aria-card {
            background: linear-gradient(165deg, rgba(28, 28, 42, 0.95) 0%, rgba(18, 18, 28, 0.98) 100%);
            backdrop-filter: blur(40px) saturate(180%);
            -webkit-backdrop-filter: blur(40px) saturate(180%);
            border-radius: 24px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow:
              0 0 0 1px rgba(255,255,255,0.05) inset,
              0 32px 64px -12px rgba(0, 0, 0, 0.6),
              0 0 1px 0 rgba(0,0,0,0.5);
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }

          @media (max-width: 480px) {
            .aria-container {
              bottom: 0;
              right: 0;
              left: 0;
              width: 100%;
              max-width: 100%;
              max-height: 90vh;
            }
            .aria-card {
              border-radius: 24px 24px 0 0;
            }
          }

          /* Header */
          .aria-header {
            padding: 20px 24px;
            display: flex;
            align-items: center;
            gap: 16px;
            background: linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%);
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          }

          .aria-avatar-wrap {
            position: relative;
          }

          .aria-avatar {
            width: 52px;
            height: 52px;
            background: linear-gradient(145deg, #f9cb00 0%, #d4a800 100%);
            border-radius: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow:
              0 8px 24px -4px rgba(249, 203, 0, 0.4),
              0 0 0 1px rgba(255,255,255,0.1) inset;
          }
          .aria-avatar svg {
            width: 26px;
            height: 26px;
            color: #1a1a2e;
            stroke-width: 2.5;
          }

          .aria-badge {
            position: absolute;
            bottom: -2px;
            right: -2px;
            width: 16px;
            height: 16px;
            background: #22c55e;
            border-radius: 50%;
            border: 3px solid #1c1c2a;
            transition: all 0.3s ease;
          }
          .aria-badge.listening {
            background: #f9cb00;
            animation: ariaGlow 1.5s infinite;
          }
          .aria-badge.thinking {
            background: #6366f1;
            animation: ariaPulse 1s infinite;
          }

          .aria-info { flex: 1; }
          .aria-title {
            font-size: 17px;
            font-weight: 700;
            color: #ffffff;
            letter-spacing: -0.3px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .aria-verified {
            width: 18px;
            height: 18px;
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .aria-verified svg { width: 10px; height: 10px; color: white; }

          .aria-subtitle {
            margin-top: 4px;
            font-size: 13px;
            color: rgba(255, 255, 255, 0.5);
            font-weight: 500;
          }
          .aria-subtitle span {
            color: #22c55e;
            font-weight: 600;
          }
          .aria-subtitle.listening span { color: #f9cb00; }
          .aria-subtitle.thinking span { color: #6366f1; }

          .aria-close-btn {
            width: 36px;
            height: 36px;
            border: none;
            background: rgba(255, 255, 255, 0.06);
            border-radius: 12px;
            color: rgba(255, 255, 255, 0.5);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
          }
          .aria-close-btn:hover {
            background: rgba(255, 255, 255, 0.12);
            color: #fff;
            transform: scale(1.05);
          }
          .aria-close-btn svg { width: 18px; height: 18px; stroke-width: 2.5; }

          /* Messages */
          .aria-messages {
            flex: 1;
            overflow-y: auto;
            padding: 20px 24px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            min-height: 200px;
            max-height: 360px;
            scroll-behavior: smooth;
          }
          .aria-messages::-webkit-scrollbar { width: 6px; }
          .aria-messages::-webkit-scrollbar-track { background: transparent; }
          .aria-messages::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,0.1);
            border-radius: 6px;
          }
          .aria-messages::-webkit-scrollbar-thumb:hover {
            background: rgba(255,255,255,0.2);
          }

          .aria-msg {
            max-width: 85%;
            animation: ariaFadeIn 0.3s ease-out;
          }
          .aria-msg.user { align-self: flex-end; }
          .aria-msg.assistant { align-self: flex-start; }

          .aria-bubble {
            padding: 14px 18px;
            font-size: 14.5px;
            line-height: 1.55;
            font-weight: 450;
            letter-spacing: -0.1px;
          }
          .aria-msg.user .aria-bubble {
            background: linear-gradient(135deg, #f9cb00 0%, #e6b800 100%);
            color: #1a1a2e;
            border-radius: 20px 20px 6px 20px;
            box-shadow: 0 4px 16px -2px rgba(249, 203, 0, 0.3);
          }
          .aria-msg.assistant .aria-bubble {
            background: rgba(255, 255, 255, 0.08);
            color: rgba(255, 255, 255, 0.92);
            border-radius: 20px 20px 20px 6px;
            border: 1px solid rgba(255, 255, 255, 0.08);
          }

          .aria-typing {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 16px 20px;
            background: rgba(255, 255, 255, 0.08);
            border-radius: 20px 20px 20px 6px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            align-self: flex-start;
            animation: ariaFadeIn 0.3s ease-out;
          }
          .aria-typing span {
            width: 8px;
            height: 8px;
            background: rgba(255, 255, 255, 0.5);
            border-radius: 50%;
            animation: ariaBounce 1.4s infinite;
          }
          .aria-typing span:nth-child(2) { animation-delay: 0.15s; }
          .aria-typing span:nth-child(3) { animation-delay: 0.3s; }

          /* Input Area */
          .aria-input-section {
            padding: 20px 24px 24px;
            background: linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.2) 100%);
            border-top: 1px solid rgba(255, 255, 255, 0.06);
          }

          .aria-input-box {
            display: flex;
            align-items: center;
            gap: 10px;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 16px;
            padding: 6px;
            transition: all 0.25s ease;
          }
          .aria-input-box:focus-within {
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(249, 203, 0, 0.4);
            box-shadow: 0 0 0 4px rgba(249, 203, 0, 0.08);
          }

          .aria-input {
            flex: 1;
            background: transparent;
            border: none;
            padding: 12px 14px;
            font-family: inherit;
            font-size: 15px;
            font-weight: 450;
            color: #fff;
            outline: none;
          }
          .aria-input::placeholder {
            color: rgba(255, 255, 255, 0.35);
            font-weight: 400;
          }

          .aria-icon-btn {
            width: 42px;
            height: 42px;
            border: none;
            border-radius: 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            flex-shrink: 0;
          }
          .aria-icon-btn svg { width: 20px; height: 20px; stroke-width: 2; }

          .aria-mic-btn {
            background: rgba(255, 255, 255, 0.06);
            color: rgba(255, 255, 255, 0.5);
          }
          .aria-mic-btn:hover {
            background: rgba(255, 255, 255, 0.12);
            color: #fff;
            transform: scale(1.05);
          }
          .aria-mic-btn.active {
            background: linear-gradient(135deg, #ef4444, #dc2626);
            color: #fff;
            animation: ariaPulse 1.5s infinite;
          }

          .aria-send-btn {
            background: linear-gradient(135deg, #f9cb00 0%, #e6b800 100%);
            color: #1a1a2e;
            box-shadow: 0 4px 12px -2px rgba(249, 203, 0, 0.3);
          }
          .aria-send-btn:hover {
            transform: scale(1.05) translateY(-1px);
            box-shadow: 0 6px 20px -2px rgba(249, 203, 0, 0.4);
          }
          .aria-send-btn:active { transform: scale(0.95); }

          /* Quick Actions */
          .aria-quick-actions {
            display: flex;
            gap: 8px;
            margin-top: 14px;
            overflow-x: auto;
            padding-bottom: 4px;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
          }
          .aria-quick-actions::-webkit-scrollbar { display: none; }

          .aria-action {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 16px;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            font-family: inherit;
            font-size: 13px;
            font-weight: 500;
            color: rgba(255, 255, 255, 0.7);
            white-space: nowrap;
            cursor: pointer;
            text-decoration: none;
            transition: all 0.2s ease;
          }
          .aria-action:hover {
            background: rgba(249, 203, 0, 0.12);
            border-color: rgba(249, 203, 0, 0.3);
            color: #f9cb00;
            transform: translateY(-1px);
          }
          .aria-action svg {
            width: 15px;
            height: 15px;
            stroke-width: 2;
            opacity: 0.8;
          }
          .aria-action:hover svg { opacity: 1; }

          /* Footer */
          .aria-footer {
            padding: 14px 24px;
            text-align: center;
            font-size: 11px;
            font-weight: 500;
            color: rgba(255, 255, 255, 0.3);
            border-top: 1px solid rgba(255, 255, 255, 0.04);
            background: rgba(0,0,0,0.1);
          }
          .aria-footer a {
            color: rgba(249, 203, 0, 0.6);
            text-decoration: none;
            transition: color 0.2s;
          }
          .aria-footer a:hover { color: #f9cb00; }
        </style>

        <div class="aria-overlay"></div>

        <div class="aria-container">
          <div class="aria-card">
            <div class="aria-header">
              <div class="aria-avatar-wrap">
                <div class="aria-avatar">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                  </svg>
                </div>
                <div class="aria-badge"></div>
              </div>
              <div class="aria-info">
                <div class="aria-title">
                  ${this.config.assistantName}
                  <span class="aria-verified">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                    </svg>
                  </span>
                </div>
                <div class="aria-subtitle"><span>Online</span> • ${this.config.businessName}</div>
              </div>
              <button class="aria-close-btn" type="button" aria-label="Close">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div class="aria-messages"></div>

            <div class="aria-input-section">
              <div class="aria-input-box">
                <input type="text" class="aria-input" placeholder="Type your message..." autocomplete="off" />
                <button class="aria-icon-btn aria-mic-btn" type="button" title="Voice input" aria-label="Voice input">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
                  </svg>
                </button>
                <button class="aria-icon-btn aria-send-btn" type="button" title="Send" aria-label="Send message">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                  </svg>
                </button>
              </div>

              <div class="aria-quick-actions">
                <a class="aria-action" href="tel:${this.config.phone}">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                  </svg>
                  Call Us
                </a>
                <button class="aria-action" data-action="estimate" type="button">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                  </svg>
                  Free Estimate
                </button>
                <a class="aria-action" href="/company/vendors-list/" target="_blank">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                  </svg>
                  Stone Yards
                </a>
                <button class="aria-action" data-action="pricing" type="button">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  Pricing
                </button>
              </div>
            </div>

            <div class="aria-footer">
              Powered by <a href="https://remodely.ai" target="_blank" rel="noopener">Remodely AI</a>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(this.widget);

      // Events
      this.widget.querySelector('.aria-overlay').onclick = () => this.close();
      this.widget.querySelector('.aria-close-btn').onclick = () => this.close();
      this.widget.querySelector('.aria-mic-btn').onclick = () => this.toggleVoiceMode();
      this.widget.querySelector('.aria-send-btn').onclick = () => this.sendFromInput();

      const input = this.widget.querySelector('.aria-input');
      input.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendFromInput();
        }
      };
      setTimeout(() => input.focus(), 300);

      // Quick actions
      this.widget.querySelectorAll('.aria-action[data-action]').forEach(btn => {
        btn.onclick = () => {
          const actions = {
            estimate: "I'd like to schedule a free estimate",
            pricing: "What are your countertop prices?"
          };
          if (actions[btn.dataset.action]) this.send(actions[btn.dataset.action]);
        };
      });

      // Greeting
      if (this.messages.length === 0) {
        this.addMessage('assistant', this.config.greeting);
      }
    }

    sendFromInput() {
      const input = this.widget.querySelector('.aria-input');
      if (input.value.trim()) {
        this.send(input.value.trim());
        input.value = '';
      }
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
        this.widget.querySelector('.aria-mic-btn').classList.add('active');
        this.setStatus('Listening', 'listening');
      } catch (e) {}
    }

    stopVoiceMode() {
      clearTimeout(this.silenceTimer);
      this.voiceModeActive = false;
      this.isListening = false;
      if (this.recognition) try { this.recognition.stop(); } catch (e) {}
      this.widget?.querySelector('.aria-mic-btn')?.classList.remove('active');
      this.setStatus('Online', '');
    }

    setStatus(text, state = '') {
      const badge = this.widget?.querySelector('.aria-badge');
      const subtitle = this.widget?.querySelector('.aria-subtitle');

      if (subtitle) {
        subtitle.innerHTML = `<span>${text}</span> • ${this.config.businessName}`;
        subtitle.className = 'aria-subtitle' + (state ? ' ' + state : '');
      }
      if (badge) {
        badge.classList.remove('listening', 'thinking');
        if (state) badge.classList.add(state);
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
      this.setStatus('Thinking', 'thinking');

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
          if (data.audio && this.voiceModeActive) {
            this.setStatus('Speaking', '');
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
        this.setStatus('Listening', 'listening');
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
