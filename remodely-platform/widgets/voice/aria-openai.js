/**
 * ARIA VOICE WIDGET - OpenAI TTS
 */
(function() {
  'use strict';

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
        messages: []
      };

      this.recognition = null;
      this.overlay = null;
    }

    init() {
      this.setupRecognition();
      console.log('Aria initialized');
    }

    setupRecognition() {
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.log('Speech recognition not supported');
        return;
      }

      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SR();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      const self = this;

      this.recognition.onstart = function() {
        console.log('Listening started');
        self.state.isListening = true;
        self.updateListeningUI();
      };

      this.recognition.onresult = function(event) {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        self.showTranscript(transcript);

        if (event.results[event.resultIndex].isFinal) {
          console.log('Final transcript:', transcript);
          self.sendMessage(transcript);
        }
      };

      this.recognition.onerror = function(event) {
        console.error('Recognition error:', event.error);
        self.state.isListening = false;
        self.updateListeningUI();
      };

      this.recognition.onend = function() {
        console.log('Listening ended');
        self.state.isListening = false;
        self.updateListeningUI();

        // Auto-restart if voice chat is active
        if (self.state.voiceChatActive && self.state.isOpen && !self.state.isSpeaking && !self.state.isProcessing) {
          setTimeout(function() {
            if (self.state.voiceChatActive && self.state.isOpen) {
              self.startListening();
            }
          }, 500);
        }
      };
    }

    open() {
      if (!this.overlay) {
        this.createUI();
      }
      this.overlay.style.display = 'flex';
      this.state.isOpen = true;

      if (this.state.messages.length === 0) {
        this.addMessage('assistant', this.config.greeting);
      }
    }

    close() {
      if (this.overlay) {
        this.overlay.style.display = 'none';
      }
      this.state.isOpen = false;
      this.stopVoiceChat();
    }

    createUI() {
      // Create overlay
      this.overlay = document.createElement('div');
      this.overlay.id = 'aria-widget-overlay';

      this.overlay.innerHTML = `
        <style>
          #aria-widget-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.8);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          }
          #aria-widget-box {
            background: #1e1e2e;
            width: 340px;
            max-width: 95vw;
            max-height: 70vh;
            border-radius: 16px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
          }
          #aria-widget-header {
            background: #2a2a3e;
            padding: 12px 16px;
            display: flex;
            align-items: center;
            gap: 10px;
          }
          #aria-widget-avatar {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: #f9cb00;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          #aria-widget-avatar.listening {
            background: #ef4444;
            animation: pulse 1s infinite;
          }
          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
          }
          #aria-widget-avatar svg {
            width: 18px;
            height: 18px;
            stroke: #1e1e2e;
          }
          #aria-widget-avatar.listening svg {
            stroke: white;
          }
          #aria-widget-title {
            flex: 1;
            color: white;
            font-weight: 600;
            font-size: 15px;
          }
          #aria-widget-status {
            color: rgba(255,255,255,0.6);
            font-size: 11px;
          }
          #aria-widget-close {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: rgba(255,255,255,0.1);
            border: none;
            color: white;
            cursor: pointer;
            font-size: 20px;
            line-height: 1;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          #aria-widget-close:hover {
            background: rgba(255,255,255,0.2);
          }
          #aria-widget-messages {
            flex: 1;
            overflow-y: auto;
            padding: 12px;
            min-height: 150px;
            max-height: 250px;
          }
          .aria-msg {
            margin-bottom: 8px;
            padding: 10px 12px;
            border-radius: 12px;
            font-size: 13px;
            line-height: 1.4;
            max-width: 85%;
          }
          .aria-msg.assistant {
            background: rgba(255,255,255,0.1);
            color: white;
          }
          .aria-msg.user {
            background: #f9cb00;
            color: #1e1e2e;
            margin-left: auto;
          }
          #aria-widget-transcript {
            padding: 8px 12px;
            margin: 0 12px;
            background: rgba(255,255,255,0.05);
            border-radius: 8px;
            font-size: 12px;
            color: rgba(255,255,255,0.5);
            font-style: italic;
            min-height: 28px;
          }
          #aria-widget-controls {
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          #aria-widget-voice-btn {
            width: 100%;
            padding: 12px;
            border-radius: 24px;
            border: none;
            background: linear-gradient(135deg, #f9cb00, #e5b800);
            color: #1e1e2e;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
          }
          #aria-widget-voice-btn.active {
            background: linear-gradient(135deg, #ef4444, #dc2626);
            color: white;
          }
          #aria-widget-voice-btn svg {
            width: 18px;
            height: 18px;
          }
          #aria-widget-input-row {
            display: flex;
            gap: 8px;
          }
          #aria-widget-input {
            flex: 1;
            padding: 10px 14px;
            border-radius: 20px;
            border: 1px solid rgba(255,255,255,0.2);
            background: rgba(255,255,255,0.05);
            color: white;
            font-size: 13px;
            outline: none;
          }
          #aria-widget-send {
            width: 38px;
            height: 38px;
            border-radius: 50%;
            border: none;
            background: #f9cb00;
            color: #1e1e2e;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          #aria-widget-send svg {
            width: 16px;
            height: 16px;
          }
        </style>
        <div id="aria-widget-box">
          <div id="aria-widget-header">
            <div id="aria-widget-avatar">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              </svg>
            </div>
            <div>
              <div id="aria-widget-title">${this.config.assistantName}</div>
              <div id="aria-widget-status">Ready</div>
            </div>
            <button id="aria-widget-close" type="button">&times;</button>
          </div>
          <div id="aria-widget-messages"></div>
          <div id="aria-widget-transcript"></div>
          <div id="aria-widget-controls">
            <button id="aria-widget-voice-btn" type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              </svg>
              <span>Start Voice Chat</span>
            </button>
            <div id="aria-widget-input-row">
              <input type="text" id="aria-widget-input" placeholder="Type a message..." />
              <button id="aria-widget-send" type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(this.overlay);

      // Event listeners
      const self = this;

      // Close on overlay click
      this.overlay.addEventListener('click', function(e) {
        if (e.target === self.overlay) {
          self.close();
        }
      });

      // Close button
      document.getElementById('aria-widget-close').addEventListener('click', function() {
        self.close();
      });

      // Voice button
      document.getElementById('aria-widget-voice-btn').addEventListener('click', function() {
        self.toggleVoiceChat();
      });

      // Send button
      document.getElementById('aria-widget-send').addEventListener('click', function() {
        self.sendTextInput();
      });

      // Enter key
      document.getElementById('aria-widget-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          self.sendTextInput();
        }
      });
    }

    toggleVoiceChat() {
      if (this.state.voiceChatActive) {
        this.stopVoiceChat();
      } else {
        this.startVoiceChat();
      }
    }

    startVoiceChat() {
      if (!this.recognition) {
        this.addMessage('assistant', "Voice not supported. Please type instead.");
        return;
      }
      this.state.voiceChatActive = true;
      this.updateVoiceButton();
      this.startListening();
    }

    stopVoiceChat() {
      this.state.voiceChatActive = false;
      this.stopListening();
      this.updateVoiceButton();
      this.setStatus('Ready');
    }

    startListening() {
      if (!this.recognition || this.state.isListening) return;
      try {
        this.recognition.start();
        this.setStatus('Listening...');
      } catch (e) {
        console.error('Start error:', e);
      }
    }

    stopListening() {
      if (this.recognition && this.state.isListening) {
        try {
          this.recognition.stop();
        } catch (e) {}
      }
      this.state.isListening = false;
      this.updateListeningUI();
    }

    updateListeningUI() {
      const avatar = document.getElementById('aria-widget-avatar');
      if (avatar) {
        if (this.state.isListening) {
          avatar.classList.add('listening');
        } else {
          avatar.classList.remove('listening');
        }
      }
    }

    updateVoiceButton() {
      const btn = document.getElementById('aria-widget-voice-btn');
      if (btn) {
        if (this.state.voiceChatActive) {
          btn.classList.add('active');
          btn.querySelector('span').textContent = 'End Voice Chat';
        } else {
          btn.classList.remove('active');
          btn.querySelector('span').textContent = 'Start Voice Chat';
        }
      }
    }

    setStatus(text) {
      const el = document.getElementById('aria-widget-status');
      if (el) el.textContent = text;
    }

    showTranscript(text) {
      const el = document.getElementById('aria-widget-transcript');
      if (el) el.textContent = text;
    }

    sendTextInput() {
      const input = document.getElementById('aria-widget-input');
      if (input && input.value.trim()) {
        this.sendMessage(input.value.trim());
        input.value = '';
      }
    }

    addMessage(role, content) {
      this.state.messages.push({ role, content });

      const container = document.getElementById('aria-widget-messages');
      if (container) {
        const div = document.createElement('div');
        div.className = 'aria-msg ' + role;
        div.textContent = content;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
      }
    }

    async sendMessage(text) {
      this.addMessage('user', text);
      this.showTranscript('');
      this.state.isProcessing = true;
      this.setStatus('Thinking...');

      try {
        const res = await fetch(this.config.apiEndpoint + '/api/surprise-granite/aria-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            conversationHistory: this.state.messages.slice(-6)
          })
        });

        const data = await res.json();

        if (data.response) {
          this.addMessage('assistant', data.response);

          if (data.audio) {
            await this.playAudio(data.audio);
          } else {
            this.setStatus('Ready');
          }
        }
      } catch (err) {
        console.error('API error:', err);
        this.addMessage('assistant', 'Sorry, connection error. Try again.');
        this.setStatus('Ready');
      }

      this.state.isProcessing = false;
    }

    playAudio(base64) {
      const self = this;
      return new Promise(function(resolve) {
        self.state.isSpeaking = true;
        self.setStatus('Speaking...');

        const audio = new Audio('data:audio/mp3;base64,' + base64);

        audio.onended = function() {
          self.state.isSpeaking = false;
          if (self.state.voiceChatActive && self.state.isOpen) {
            self.setStatus('Listening...');
            setTimeout(function() {
              self.startListening();
            }, 300);
          } else {
            self.setStatus('Ready');
          }
          resolve();
        };

        audio.onerror = function() {
          self.state.isSpeaking = false;
          self.setStatus('Ready');
          resolve();
        };

        audio.play().catch(function() {
          self.state.isSpeaking = false;
          self.setStatus('Ready');
          resolve();
        });
      });
    }
  }

  window.AriaOpenAI = AriaOpenAI;
})();
