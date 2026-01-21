/**
 * ARIA VOICE CHAT v4
 * Continuous voice conversation with OpenAI TTS
 */
(function() {
  'use strict';

  if (window.AriaOpenAI) return;

  class AriaOpenAI {
    constructor(config = {}) {
      this.config = {
        apiEndpoint: config.apiEndpoint || 'https://voiceflow-crm.onrender.com',
        assistantName: config.assistantName || 'Aria',
        greeting: config.greeting || "Hi! I'm Aria from Surprise Granite. How can I help you today?",
        phone: config.phone || '(602) 833-7194',
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
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = e.resultIndex; i < e.results.length; i++) {
          const transcript = e.results[i][0].transcript;
          if (e.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        // Show in input
        const input = this.widget?.querySelector('#avInput');
        if (input) {
          input.value = finalTranscript || interimTranscript;
        }

        // Update visual indicator
        this.updateWaveform(true);

        // Reset silence timer on any speech
        this.resetSilenceTimer();
      };

      this.recognition.onerror = (e) => {
        console.log('[Aria] Speech error:', e.error);
        if (e.error === 'not-allowed') {
          alert('Microphone access denied. Please allow microphone access to use voice chat.');
          this.stopVoiceMode();
        }
      };

      this.recognition.onend = () => {
        // Auto-restart if voice mode is still active
        if (this.voiceModeActive && !this.isProcessing && !this.isPlaying) {
          try {
            this.recognition.start();
          } catch (e) {}
        }
      };
    }

    resetSilenceTimer() {
      clearTimeout(this.silenceTimer);
      // After 1.5 seconds of silence with text, send it
      this.silenceTimer = setTimeout(() => {
        const input = this.widget?.querySelector('#avInput');
        if (input && input.value.trim() && !this.isProcessing) {
          const text = input.value.trim();
          input.value = '';
          this.send(text);
        }
      }, 1500);
    }

    init() {
      console.log('[Aria] v4 Voice Chat Ready');
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
      this.stopVoiceMode();
      if (this.widget) {
        this.widget.style.display = 'none';
        document.body.style.overflow = '';
      }
      this.stopAudio();
    }

    createWidget() {
      this.widget = document.createElement('div');
      this.widget.className = 'av-root';

      this.widget.innerHTML = `
        <style>
          .av-root {
            position: fixed !important;
            inset: 0 !important;
            z-index: 2147483647 !important;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
            background: rgba(10, 10, 20, 0.85) !important;
            backdrop-filter: blur(20px) saturate(180%) !important;
            -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
          }
          .av-root * { box-sizing: border-box !important; }

          .av-header {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            padding: 16px 20px !important;
            padding-top: max(16px, env(safe-area-inset-top)) !important;
          }
          .av-title {
            color: #fff !important;
            font-size: 18px !important;
            font-weight: 600 !important;
          }
          .av-close {
            width: 40px !important;
            height: 40px !important;
            border-radius: 50% !important;
            background: rgba(255,255,255,0.1) !important;
            border: none !important;
            color: #fff !important;
            font-size: 24px !important;
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
          }
          .av-close:active { background: rgba(255,255,255,0.2) !important; }

          .av-main {
            flex: 1 !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 20px !important;
            min-height: 50vh !important;
          }

          .av-orb {
            width: 180px !important;
            height: 180px !important;
            border-radius: 50% !important;
            background: linear-gradient(135deg, #f9cb00 0%, #ff9500 50%, #f9cb00 100%) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-size: 64px !important;
            cursor: pointer !important;
            transition: all 0.3s ease !important;
            box-shadow: 0 0 60px rgba(249,203,0,0.3) !important;
          }
          .av-orb.listening {
            animation: orbPulse 1.5s ease-in-out infinite !important;
            box-shadow: 0 0 80px rgba(249,203,0,0.5) !important;
          }
          .av-orb.speaking {
            background: linear-gradient(135deg, #22c55e 0%, #16a34a 50%, #22c55e 100%) !important;
            box-shadow: 0 0 80px rgba(34,197,94,0.5) !important;
            animation: orbPulse 0.8s ease-in-out infinite !important;
          }
          .av-orb.thinking {
            animation: orbSpin 2s linear infinite !important;
          }
          @keyframes orbPulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.08); }
          }
          @keyframes orbSpin {
            0% { filter: hue-rotate(0deg); }
            100% { filter: hue-rotate(360deg); }
          }

          .av-status {
            color: rgba(255,255,255,0.7) !important;
            font-size: 18px !important;
            margin-top: 24px !important;
            text-align: center !important;
          }
          .av-status.listening { color: #f9cb00 !important; }
          .av-status.speaking { color: #22c55e !important; }
          .av-status.thinking { color: #f9cb00 !important; }

          .av-transcript {
            color: rgba(255,255,255,0.5) !important;
            font-size: 14px !important;
            margin-top: 12px !important;
            text-align: center !important;
            min-height: 20px !important;
            max-width: 300px !important;
          }

          .av-messages {
            max-height: 30vh !important;
            overflow-y: auto !important;
            padding: 0 20px !important;
            width: 100% !important;
            -webkit-overflow-scrolling: touch !important;
          }
          .av-msg {
            max-width: 85% !important;
            padding: 12px 16px !important;
            border-radius: 16px !important;
            margin-bottom: 8px !important;
            font-size: 15px !important;
            line-height: 1.4 !important;
          }
          .av-msg.assistant {
            background: rgba(255,255,255,0.1) !important;
            color: #fff !important;
            margin-right: auto !important;
          }
          .av-msg.user {
            background: linear-gradient(135deg, #f9cb00, #ff9500) !important;
            color: #1a1a2e !important;
            margin-left: auto !important;
            font-weight: 500 !important;
          }

          .av-bottom {
            padding: 16px 20px !important;
            padding-bottom: max(20px, env(safe-area-inset-bottom)) !important;
          }
          .av-input-row {
            display: flex !important;
            gap: 10px !important;
            margin-bottom: 12px !important;
          }
          .av-input {
            flex: 1 !important;
            padding: 14px 18px !important;
            border-radius: 25px !important;
            border: 1px solid rgba(255,255,255,0.2) !important;
            background: rgba(255,255,255,0.08) !important;
            color: #fff !important;
            font-size: 16px !important;
            outline: none !important;
            -webkit-appearance: none !important;
          }
          .av-input::placeholder { color: rgba(255,255,255,0.4) !important; }
          .av-send {
            width: 50px !important;
            height: 50px !important;
            border-radius: 50% !important;
            border: none !important;
            background: linear-gradient(135deg, #f9cb00, #ff9500) !important;
            color: #1a1a2e !important;
            font-size: 20px !important;
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
          }
          .av-send:active { transform: scale(0.95) !important; }

          .av-actions {
            display: flex !important;
            gap: 12px !important;
          }
          .av-btn {
            flex: 1 !important;
            padding: 14px !important;
            border-radius: 14px !important;
            border: none !important;
            font-size: 15px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 8px !important;
          }
          .av-btn:active { transform: scale(0.98) !important; }
          .av-btn-voice {
            background: linear-gradient(135deg, #f9cb00, #ff9500) !important;
            color: #1a1a2e !important;
          }
          .av-btn-voice.active {
            background: #ef4444 !important;
            color: #fff !important;
          }
          .av-btn-call {
            background: linear-gradient(135deg, #22c55e, #16a34a) !important;
            color: #fff !important;
            text-decoration: none !important;
          }
        </style>

        <div class="av-header">
          <div class="av-title">${this.config.assistantName}</div>
          <button class="av-close" type="button">×</button>
        </div>

        <div class="av-main">
          <div class="av-orb" id="avOrb">🎤</div>
          <div class="av-status" id="avStatus">Tap to start voice chat</div>
          <div class="av-transcript" id="avTranscript"></div>
        </div>

        <div class="av-messages" id="avMessages"></div>

        <div class="av-bottom">
          <div class="av-input-row">
            <input type="text" class="av-input" id="avInput" placeholder="Or type a message..." autocomplete="off" />
            <button class="av-send" id="avSend" type="button">➤</button>
          </div>
          <div class="av-actions">
            <button class="av-btn av-btn-voice" id="avVoice" type="button">🎙️ Start Voice Chat</button>
            <a class="av-btn av-btn-call" href="tel:${this.config.phone}">📞 Call Us</a>
          </div>
        </div>
      `;

      document.body.appendChild(this.widget);
      document.body.style.overflow = 'hidden';

      // Events
      this.widget.querySelector('.av-close').onclick = () => this.close();
      this.widget.querySelector('#avOrb').onclick = () => this.toggleVoiceMode();
      this.widget.querySelector('#avVoice').onclick = () => this.toggleVoiceMode();
      this.widget.querySelector('#avSend').onclick = () => {
        const input = this.widget.querySelector('#avInput');
        if (input.value.trim()) {
          this.send(input.value.trim());
          input.value = '';
        }
      };
      this.widget.querySelector('#avInput').onkeypress = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const input = this.widget.querySelector('#avInput');
          if (input.value.trim()) {
            this.send(input.value.trim());
            input.value = '';
          }
        }
      };

      // Greeting
      if (this.messages.length === 0) {
        this.addMessage('assistant', this.config.greeting);
        // Play greeting audio
        this.speakGreeting();
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
        if (data.audio) {
          this.setStatus('Speaking...', 'speaking');
          await this.playAudio(data.audio);
          this.setStatus('Tap to start voice chat', '');
        }
      } catch (e) {}
    }

    toggleVoiceMode() {
      if (this.voiceModeActive) {
        this.stopVoiceMode();
      } else {
        this.startVoiceMode();
      }
    }

    startVoiceMode() {
      if (!this.recognition) {
        alert('Voice chat not supported on this device. Please type your message or call us.');
        return;
      }

      try {
        this.recognition.start();
        this.voiceModeActive = true;
        this.isListening = true;

        const orb = this.widget.querySelector('#avOrb');
        const btn = this.widget.querySelector('#avVoice');
        orb.classList.add('listening');
        btn.classList.add('active');
        btn.innerHTML = '⏹️ Stop Voice Chat';

        this.setStatus('Listening...', 'listening');
      } catch (e) {
        console.log('[Aria] Could not start voice:', e);
      }
    }

    stopVoiceMode() {
      clearTimeout(this.silenceTimer);
      this.voiceModeActive = false;
      this.isListening = false;

      if (this.recognition) {
        try { this.recognition.stop(); } catch (e) {}
      }

      const orb = this.widget?.querySelector('#avOrb');
      const btn = this.widget?.querySelector('#avVoice');
      if (orb) orb.classList.remove('listening', 'speaking', 'thinking');
      if (btn) {
        btn.classList.remove('active');
        btn.innerHTML = '🎙️ Start Voice Chat';
      }

      this.setStatus('Tap to start voice chat', '');
    }

    updateWaveform(active) {
      const orb = this.widget?.querySelector('#avOrb');
      if (orb && this.voiceModeActive) {
        if (active) {
          orb.classList.add('listening');
        }
      }
    }

    setStatus(text, cls = '') {
      const el = this.widget?.querySelector('#avStatus');
      if (el) {
        el.textContent = text;
        el.className = 'av-status' + (cls ? ' ' + cls : '');
      }

      const orb = this.widget?.querySelector('#avOrb');
      if (orb) {
        orb.classList.remove('listening', 'speaking', 'thinking');
        if (cls) orb.classList.add(cls);
      }
    }

    addMessage(role, text) {
      this.messages.push({ role, content: text });
      const container = this.widget?.querySelector('#avMessages');
      if (!container) return;
      const div = document.createElement('div');
      div.className = 'av-msg ' + role;
      div.textContent = text;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;

      // Update transcript display
      const transcript = this.widget?.querySelector('#avTranscript');
      if (transcript) {
        transcript.textContent = role === 'user' ? `You: "${text}"` : '';
      }
    }

    async send(text) {
      if (!text || this.isProcessing) return;

      // Stop listening while processing
      if (this.recognition && this.isListening) {
        try { this.recognition.stop(); } catch (e) {}
      }

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
          this.addMessage('assistant', 'Sorry, I had trouble with that. Please try again.');
        }
      } catch (err) {
        console.error('[Aria] Error:', err);
        this.addMessage('assistant', 'Connection error. Please try again or call us.');
      }

      this.isProcessing = false;

      // Resume listening if voice mode is active
      if (this.voiceModeActive) {
        this.setStatus('Listening...', 'listening');
        try { this.recognition.start(); } catch (e) {}
      } else {
        this.setStatus('Tap to start voice chat', '');
      }
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
