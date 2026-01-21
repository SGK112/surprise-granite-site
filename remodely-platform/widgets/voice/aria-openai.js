/**
 * ARIA VOICE WIDGET - OpenAI TTS
 * Uses VoiceNow CRM backend for AI + OpenAI TTS
 */
(function() {
  'use strict';

  class AriaOpenAI {
    constructor(config = {}) {
      this.config = {
        apiEndpoint: config.apiEndpoint || 'https://voiceflow-crm.onrender.com',
        businessName: config.businessName || 'Surprise Granite',
        assistantName: config.assistantName || 'Aria',
        primaryColor: config.primaryColor || '#f9cb00',
        secondaryColor: config.secondaryColor || '#1a1a2e',
        greeting: config.greeting || "Hey! I'm Aria. How can I help you today?",
        triggerType: config.triggerType || 'floating',
        ...config
      };

      this.state = {
        isOpen: false,
        isListening: false,
        isSpeaking: false,
        isProcessing: false,
        voiceChatActive: false,
        conversationHistory: []
      };

      this.recognition = null;
      this.modalOverlay = null;
      this.hasRecognition = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    }

    init() {
      this.injectStyles();
      this.initSpeechRecognition();
      console.log('Aria OpenAI Widget initialized');
    }

    initSpeechRecognition() {
      if (!this.hasRecognition) return;

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onresult = (event) => {
        const transcript = event.results[event.resultIndex][0].transcript;
        this.updateTranscript(transcript);
        if (event.results[event.resultIndex].isFinal) {
          this.handleUserMessage(transcript);
        }
      };

      this.recognition.onerror = (event) => {
        console.error('Speech error:', event.error);
        this.state.isListening = false;
        this.updateUI();
      };

      this.recognition.onend = () => {
        this.state.isListening = false;
        this.updateUI();
        // Auto-restart if in voice chat mode
        if (this.state.voiceChatActive && this.state.isOpen && !this.state.isSpeaking && !this.state.isProcessing) {
          setTimeout(() => this.startListening(), 500);
        }
      };
    }

    injectStyles() {
      if (document.getElementById('aria-openai-styles')) return;

      const styles = document.createElement('style');
      styles.id = 'aria-openai-styles';
      styles.textContent = `
        .aria-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.9);
          z-index: 999999;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          opacity: 0;
          visibility: hidden;
          transition: all 0.3s;
        }
        .aria-overlay.open { opacity: 1; visibility: visible; }

        .aria-modal {
          background: #1a1a2e;
          width: 100%;
          max-width: 420px;
          height: 85vh;
          max-height: 600px;
          border-radius: 20px 20px 0 0;
          display: flex;
          flex-direction: column;
          transform: translateY(100%);
          transition: transform 0.3s;
        }
        .aria-overlay.open .aria-modal { transform: translateY(0); }

        .aria-header {
          padding: 16px;
          background: linear-gradient(135deg, #1a1a2e, #2a2a4e);
          border-radius: 20px 20px 0 0;
          display: flex;
          align-items: center;
          gap: 12px;
          color: #fff;
        }

        .aria-avatar {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: linear-gradient(135deg, #f9cb00, #e5b800);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .aria-avatar svg { width: 22px; height: 22px; color: #1a1a2e; }
        .aria-avatar.listening { background: #ef4444; }
        .aria-avatar.listening svg { color: #fff; }
        .aria-avatar.speaking { animation: pulse 1s infinite; }

        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }

        .aria-info { flex: 1; }
        .aria-name { font-weight: 600; font-size: 16px; }
        .aria-status { font-size: 12px; opacity: 0.7; }

        .aria-close {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: rgba(255,255,255,0.1);
          border: none;
          color: #fff;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .aria-close:hover { background: rgba(255,255,255,0.2); }
        .aria-close svg { width: 20px; height: 20px; }

        .aria-body {
          flex: 1;
          padding: 16px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .aria-msg {
          max-width: 85%;
          padding: 12px 16px;
          border-radius: 16px;
          font-size: 14px;
          line-height: 1.4;
          color: #fff;
        }
        .aria-msg.assistant {
          background: rgba(255,255,255,0.1);
          align-self: flex-start;
        }
        .aria-msg.user {
          background: #f9cb00;
          color: #1a1a2e;
          align-self: flex-end;
        }

        .aria-transcript {
          background: rgba(255,255,255,0.05);
          padding: 10px;
          border-radius: 10px;
          font-size: 13px;
          color: rgba(255,255,255,0.5);
          font-style: italic;
          min-height: 36px;
        }

        .aria-controls {
          padding: 16px;
          border-top: 1px solid rgba(255,255,255,0.1);
        }

        .aria-voice-btn {
          width: 100%;
          padding: 14px 20px;
          border-radius: 25px;
          border: none;
          background: linear-gradient(135deg, #f9cb00, #e5b800);
          color: #1a1a2e;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin-bottom: 12px;
        }
        .aria-voice-btn:hover { filter: brightness(1.1); }
        .aria-voice-btn.active {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: #fff;
        }
        .aria-voice-btn svg { width: 20px; height: 20px; }

        .aria-text-input {
          display: flex;
          gap: 8px;
        }
        .aria-text-input input {
          flex: 1;
          padding: 12px 16px;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.2);
          background: rgba(255,255,255,0.05);
          color: #fff;
          font-size: 14px;
          outline: none;
        }
        .aria-text-input button {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: none;
          background: #f9cb00;
          color: #1a1a2e;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .aria-text-input button svg { width: 18px; height: 18px; }

        @media (max-width: 480px) {
          .aria-modal {
            height: 100vh;
            max-height: 100vh;
            border-radius: 0;
          }
          .aria-header { border-radius: 0; }
        }
      `;
      document.head.appendChild(styles);
    }

    open() {
      if (!this.modalOverlay) {
        this.createModal();
      }
      this.modalOverlay.classList.add('open');
      this.state.isOpen = true;

      if (this.state.conversationHistory.length === 0) {
        this.addMessage('assistant', this.config.greeting);
      }
    }

    close() {
      if (this.modalOverlay) {
        this.modalOverlay.classList.remove('open');
      }
      this.state.isOpen = false;
      this.endVoiceChat();
    }

    createModal() {
      const overlay = document.createElement('div');
      overlay.className = 'aria-overlay';
      overlay.innerHTML = `
        <div class="aria-modal">
          <div class="aria-header">
            <div class="aria-avatar" id="ariaAvatar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              </svg>
            </div>
            <div class="aria-info">
              <div class="aria-name">${this.config.assistantName}</div>
              <div class="aria-status" id="ariaStatus">Ready to help</div>
            </div>
            <button class="aria-close" id="ariaClose">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="aria-body" id="ariaBody">
            <div id="ariaMessages"></div>
            <div class="aria-transcript" id="ariaTranscript"></div>
          </div>
          <div class="aria-controls">
            <button class="aria-voice-btn" id="ariaVoiceBtn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              </svg>
              <span id="ariaVoiceBtnText">Start Voice Chat</span>
            </button>
            <div class="aria-text-input">
              <input type="text" id="ariaTextInput" placeholder="Or type a message..." />
              <button id="ariaSendBtn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      `;

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.close();
      });

      document.body.appendChild(overlay);
      this.modalOverlay = overlay;

      // Attach events
      document.getElementById('ariaClose').onclick = () => this.close();
      document.getElementById('ariaVoiceBtn').onclick = () => this.toggleVoiceChat();
      document.getElementById('ariaSendBtn').onclick = () => this.sendTextMessage();
      document.getElementById('ariaTextInput').onkeypress = (e) => {
        if (e.key === 'Enter') this.sendTextMessage();
      };
    }

    toggleVoiceChat() {
      if (this.state.voiceChatActive) {
        this.endVoiceChat();
      } else {
        this.startVoiceChat();
      }
    }

    startVoiceChat() {
      if (!this.recognition) {
        this.addMessage('assistant', "Voice input isn't supported in your browser. Please type instead.");
        return;
      }
      this.state.voiceChatActive = true;
      this.updateVoiceButton();
      this.updateStatus('Listening...');
      this.startListening();
    }

    endVoiceChat() {
      this.state.voiceChatActive = false;
      this.stopListening();
      this.updateVoiceButton();
      this.updateStatus('Ready to help');
    }

    startListening() {
      if (!this.recognition || this.state.isListening) return;
      try {
        this.recognition.start();
        this.state.isListening = true;
        this.updateUI();
      } catch (e) {
        console.error('Start listening error:', e);
      }
    }

    stopListening() {
      if (this.recognition) {
        try { this.recognition.stop(); } catch (e) {}
      }
      this.state.isListening = false;
      this.updateUI();
    }

    sendTextMessage() {
      const input = document.getElementById('ariaTextInput');
      if (!input || !input.value.trim()) return;
      this.handleUserMessage(input.value.trim());
      input.value = '';
    }

    async handleUserMessage(message) {
      this.addMessage('user', message);
      this.updateTranscript('');
      this.state.isProcessing = true;
      this.updateStatus('Thinking...');

      try {
        const response = await fetch(`${this.config.apiEndpoint}/api/surprise-granite/aria-chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            conversationHistory: this.state.conversationHistory.slice(-6)
          })
        });

        const data = await response.json();

        if (data.response) {
          this.addMessage('assistant', data.response);

          // Play OpenAI TTS audio
          if (data.audio) {
            await this.playAudio(data.audio);
          }
        }
      } catch (error) {
        console.error('API error:', error);
        this.addMessage('assistant', "Sorry, I'm having trouble connecting. Please try again.");
      }

      this.state.isProcessing = false;
      if (!this.state.voiceChatActive) {
        this.updateStatus('Ready to help');
      }
    }

    playAudio(base64Audio) {
      return new Promise((resolve) => {
        this.state.isSpeaking = true;
        this.updateUI();
        this.updateStatus('Speaking...');

        const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);

        audio.onended = () => {
          this.state.isSpeaking = false;
          this.updateUI();
          if (this.state.voiceChatActive && this.state.isOpen) {
            this.updateStatus('Listening...');
            setTimeout(() => this.startListening(), 300);
          } else {
            this.updateStatus('Ready to help');
          }
          resolve();
        };

        audio.onerror = () => {
          this.state.isSpeaking = false;
          this.updateUI();
          this.updateStatus('Ready to help');
          resolve();
        };

        audio.play().catch(() => {
          this.state.isSpeaking = false;
          this.updateUI();
          resolve();
        });
      });
    }

    addMessage(role, content) {
      this.state.conversationHistory.push({ role, content });
      const container = document.getElementById('ariaMessages');
      if (container) {
        const msg = document.createElement('div');
        msg.className = `aria-msg ${role}`;
        msg.textContent = content;
        container.appendChild(msg);
        container.parentElement.scrollTop = container.parentElement.scrollHeight;
      }
    }

    updateTranscript(text) {
      const el = document.getElementById('ariaTranscript');
      if (el) el.textContent = text || '';
    }

    updateStatus(text) {
      const el = document.getElementById('ariaStatus');
      if (el) el.textContent = text;
    }

    updateUI() {
      const avatar = document.getElementById('ariaAvatar');
      if (avatar) {
        avatar.classList.toggle('listening', this.state.isListening);
        avatar.classList.toggle('speaking', this.state.isSpeaking);
      }
    }

    updateVoiceButton() {
      const btn = document.getElementById('ariaVoiceBtn');
      const text = document.getElementById('ariaVoiceBtnText');
      if (btn && text) {
        btn.classList.toggle('active', this.state.voiceChatActive);
        text.textContent = this.state.voiceChatActive ? 'End Voice Chat' : 'Start Voice Chat';
      }
    }
  }

  window.AriaOpenAI = AriaOpenAI;
})();
