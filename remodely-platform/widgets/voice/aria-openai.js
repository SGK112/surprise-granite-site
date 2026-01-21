/**
 * ARIA VOICE WIDGET - OpenAI TTS
 * Uses VoiceNow CRM backend for AI + OpenAI TTS
 */
(function() {
  'use strict';

  // Unique ID prefix to avoid conflicts
  const ID = 'aria-oai-' + Math.random().toString(36).substr(2, 9);

  class AriaOpenAI {
    constructor(config = {}) {
      this.config = {
        apiEndpoint: config.apiEndpoint || 'https://voiceflow-crm.onrender.com',
        assistantName: config.assistantName || 'Aria',
        greeting: config.greeting || "Hey! I'm Aria. How can I help you today?",
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

      this.ids = {
        overlay: ID + '-overlay',
        close: ID + '-close',
        avatar: ID + '-avatar',
        status: ID + '-status',
        messages: ID + '-messages',
        transcript: ID + '-transcript',
        voiceBtn: ID + '-voice-btn',
        voiceBtnText: ID + '-voice-btn-text',
        textInput: ID + '-text-input',
        sendBtn: ID + '-send-btn'
      };

      this.recognition = null;
      this.overlay = null;
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
        if (this.state.voiceChatActive && this.state.isOpen && !this.state.isSpeaking && !this.state.isProcessing) {
          setTimeout(() => this.startListening(), 500);
        }
      };
    }

    injectStyles() {
      if (document.getElementById(ID + '-styles')) return;

      const styles = document.createElement('style');
      styles.id = ID + '-styles';
      styles.textContent = `
        #${this.ids.overlay} {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          background: rgba(0,0,0,0.85) !important;
          z-index: 2147483647 !important;
          display: flex !important;
          align-items: flex-end !important;
          justify-content: center !important;
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.3s, visibility 0.3s;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        }
        #${this.ids.overlay}.open {
          opacity: 1 !important;
          visibility: visible !important;
        }
        #${this.ids.overlay} * {
          box-sizing: border-box !important;
        }

        .${ID}-modal {
          background: #1a1a2e !important;
          width: 100% !important;
          max-width: 400px !important;
          height: 80vh !important;
          max-height: 550px !important;
          border-radius: 16px 16px 0 0 !important;
          display: flex !important;
          flex-direction: column !important;
          overflow: hidden !important;
          transform: translateY(100%);
          transition: transform 0.3s ease-out;
        }
        #${this.ids.overlay}.open .${ID}-modal {
          transform: translateY(0) !important;
        }

        .${ID}-header {
          padding: 12px 16px !important;
          background: #252542 !important;
          display: flex !important;
          align-items: center !important;
          gap: 12px !important;
          border-bottom: 1px solid rgba(255,255,255,0.1) !important;
        }

        .${ID}-avatar {
          width: 40px !important;
          height: 40px !important;
          border-radius: 50% !important;
          background: linear-gradient(135deg, #f9cb00, #e5b800) !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          flex-shrink: 0 !important;
        }
        .${ID}-avatar svg {
          width: 20px !important;
          height: 20px !important;
          color: #1a1a2e !important;
        }
        .${ID}-avatar.listening {
          background: #ef4444 !important;
        }
        .${ID}-avatar.listening svg {
          color: #fff !important;
        }

        .${ID}-info {
          flex: 1 !important;
          min-width: 0 !important;
        }
        .${ID}-name {
          font-weight: 600 !important;
          font-size: 15px !important;
          color: #fff !important;
          margin: 0 !important;
        }
        .${ID}-status {
          font-size: 12px !important;
          color: rgba(255,255,255,0.6) !important;
          margin: 0 !important;
        }

        .${ID}-close {
          width: 36px !important;
          height: 36px !important;
          border-radius: 50% !important;
          background: rgba(255,255,255,0.1) !important;
          border: none !important;
          color: #fff !important;
          cursor: pointer !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          flex-shrink: 0 !important;
          padding: 0 !important;
        }
        .${ID}-close:hover {
          background: rgba(255,255,255,0.2) !important;
        }
        .${ID}-close svg {
          width: 18px !important;
          height: 18px !important;
        }

        .${ID}-body {
          flex: 1 !important;
          overflow-y: auto !important;
          padding: 12px !important;
          display: flex !important;
          flex-direction: column !important;
        }

        .${ID}-messages {
          flex: 1 !important;
          display: flex !important;
          flex-direction: column !important;
          gap: 8px !important;
        }

        .${ID}-msg {
          max-width: 85% !important;
          padding: 10px 14px !important;
          border-radius: 14px !important;
          font-size: 14px !important;
          line-height: 1.4 !important;
          color: #fff !important;
          margin: 0 !important;
        }
        .${ID}-msg.assistant {
          background: rgba(255,255,255,0.1) !important;
          align-self: flex-start !important;
          border-bottom-left-radius: 4px !important;
        }
        .${ID}-msg.user {
          background: #f9cb00 !important;
          color: #1a1a2e !important;
          align-self: flex-end !important;
          border-bottom-right-radius: 4px !important;
        }

        .${ID}-transcript {
          background: rgba(255,255,255,0.05) !important;
          padding: 8px 12px !important;
          border-radius: 8px !important;
          font-size: 13px !important;
          color: rgba(255,255,255,0.5) !important;
          font-style: italic !important;
          min-height: 32px !important;
          margin-top: 8px !important;
        }

        .${ID}-controls {
          padding: 12px !important;
          border-top: 1px solid rgba(255,255,255,0.1) !important;
          background: #1a1a2e !important;
        }

        .${ID}-voice-btn {
          width: 100% !important;
          padding: 12px 16px !important;
          border-radius: 24px !important;
          border: none !important;
          background: linear-gradient(135deg, #f9cb00, #e5b800) !important;
          color: #1a1a2e !important;
          font-size: 14px !important;
          font-weight: 600 !important;
          cursor: pointer !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 8px !important;
          margin-bottom: 10px !important;
        }
        .${ID}-voice-btn:hover {
          filter: brightness(1.05) !important;
        }
        .${ID}-voice-btn.active {
          background: linear-gradient(135deg, #ef4444, #dc2626) !important;
          color: #fff !important;
        }
        .${ID}-voice-btn svg {
          width: 18px !important;
          height: 18px !important;
        }

        .${ID}-text-row {
          display: flex !important;
          gap: 8px !important;
        }
        .${ID}-text-input {
          flex: 1 !important;
          padding: 10px 14px !important;
          border-radius: 20px !important;
          border: 1px solid rgba(255,255,255,0.2) !important;
          background: rgba(255,255,255,0.05) !important;
          color: #fff !important;
          font-size: 14px !important;
          outline: none !important;
        }
        .${ID}-text-input::placeholder {
          color: rgba(255,255,255,0.4) !important;
        }
        .${ID}-send-btn {
          width: 40px !important;
          height: 40px !important;
          border-radius: 50% !important;
          border: none !important;
          background: #f9cb00 !important;
          color: #1a1a2e !important;
          cursor: pointer !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 0 !important;
          flex-shrink: 0 !important;
        }
        .${ID}-send-btn svg {
          width: 16px !important;
          height: 16px !important;
        }

        @media (max-width: 480px) {
          .${ID}-modal {
            height: 100vh !important;
            max-height: 100vh !important;
            border-radius: 0 !important;
          }
        }
      `;
      document.head.appendChild(styles);
    }

    open() {
      if (!this.overlay) {
        this.createModal();
      }
      this.overlay.classList.add('open');
      this.state.isOpen = true;

      if (this.state.conversationHistory.length === 0) {
        this.addMessage('assistant', this.config.greeting);
      }
    }

    close() {
      if (this.overlay) {
        this.overlay.classList.remove('open');
      }
      this.state.isOpen = false;
      this.endVoiceChat();
    }

    createModal() {
      const overlay = document.createElement('div');
      overlay.id = this.ids.overlay;
      overlay.innerHTML = `
        <div class="${ID}-modal">
          <div class="${ID}-header">
            <div class="${ID}-avatar" id="${this.ids.avatar}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              </svg>
            </div>
            <div class="${ID}-info">
              <div class="${ID}-name">${this.config.assistantName}</div>
              <div class="${ID}-status" id="${this.ids.status}">Ready to help</div>
            </div>
            <button class="${ID}-close" id="${this.ids.close}" type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="${ID}-body">
            <div class="${ID}-messages" id="${this.ids.messages}"></div>
            <div class="${ID}-transcript" id="${this.ids.transcript}"></div>
          </div>
          <div class="${ID}-controls">
            <button class="${ID}-voice-btn" id="${this.ids.voiceBtn}" type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              </svg>
              <span id="${this.ids.voiceBtnText}">Start Voice Chat</span>
            </button>
            <div class="${ID}-text-row">
              <input type="text" class="${ID}-text-input" id="${this.ids.textInput}" placeholder="Or type a message..." />
              <button class="${ID}-send-btn" id="${this.ids.sendBtn}" type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      this.overlay = overlay;

      // Event listeners
      const self = this;

      // Close on overlay click
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
          self.close();
        }
      });

      // Close button
      document.getElementById(this.ids.close).addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        self.close();
      });

      // Voice button
      document.getElementById(this.ids.voiceBtn).addEventListener('click', function(e) {
        e.preventDefault();
        self.toggleVoiceChat();
      });

      // Send button
      document.getElementById(this.ids.sendBtn).addEventListener('click', function(e) {
        e.preventDefault();
        self.sendTextMessage();
      });

      // Text input enter key
      document.getElementById(this.ids.textInput).addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          self.sendTextMessage();
        }
      });
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
        this.addMessage('assistant', "Voice isn't supported in your browser. Please type instead.");
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
      const input = document.getElementById(this.ids.textInput);
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

        const audio = new Audio('data:audio/mp3;base64,' + base64Audio);

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
      const container = document.getElementById(this.ids.messages);
      if (container) {
        const msg = document.createElement('div');
        msg.className = `${ID}-msg ${role}`;
        msg.textContent = content;
        container.appendChild(msg);
        const body = container.parentElement;
        if (body) body.scrollTop = body.scrollHeight;
      }
    }

    updateTranscript(text) {
      const el = document.getElementById(this.ids.transcript);
      if (el) el.textContent = text || '';
    }

    updateStatus(text) {
      const el = document.getElementById(this.ids.status);
      if (el) el.textContent = text;
    }

    updateUI() {
      const avatar = document.getElementById(this.ids.avatar);
      if (avatar) {
        avatar.classList.toggle('listening', this.state.isListening);
        avatar.classList.toggle('speaking', this.state.isSpeaking);
      }
    }

    updateVoiceButton() {
      const btn = document.getElementById(this.ids.voiceBtn);
      const text = document.getElementById(this.ids.voiceBtnText);
      if (btn && text) {
        btn.classList.toggle('active', this.state.voiceChatActive);
        text.textContent = this.state.voiceChatActive ? 'End Voice Chat' : 'Start Voice Chat';
      }
    }
  }

  window.AriaOpenAI = AriaOpenAI;
})();
