/**
 * ARIA REALTIME - OpenAI Realtime Voice Chat
 * Natural AI voice using OpenAI's Realtime API
 * Powered by Remodely AI
 * Version: 2.1 - Fixed audio playback
 */

(function() {
  'use strict';

  const DEFAULT_CONFIG = {
    // Branding
    businessName: 'Your Business',
    assistantName: 'Aria',
    primaryColor: '#f9cb00',
    secondaryColor: '#1a1a2e',
    theme: 'dark',
    position: 'right',

    // Voice settings - OpenAI Realtime voices
    voice: 'coral', // alloy, coral, echo, fable, onyx, nova, shimmer

    // WebSocket relay endpoint (required - proxies to OpenAI)
    relayEndpoint: '/api/aria-realtime',

    // Greeting
    greeting: "Hi! I'm Aria, your virtual assistant. How can I help you today?",

    // Business context for AI
    businessContext: {
      industry: 'home_remodeling',
      services: [],
      serviceArea: '',
      businessHours: ''
    },

    // System instructions for Aria
    systemInstructions: '',

    // UI
    triggerType: 'floating',

    // Callbacks
    onConnect: null,
    onDisconnect: null,
    onTranscript: null,
    onError: null
  };

  class AriaRealtime {
    constructor(config = {}) {
      this.config = { ...DEFAULT_CONFIG, ...config };
      this.state = {
        isOpen: false,
        isConnected: false,
        isListening: false,
        isSpeaking: false,
        conversationHistory: [],
        transcript: ''
      };

      // WebSocket
      this.ws = null;

      // Audio capture
      this.audioContext = null;
      this.mediaStream = null;
      this.workletNode = null;
      this.sourceNode = null;

      // Audio playback - queue-based for smooth playback
      this.playbackContext = null;
      this.audioQueue = [];
      this.isPlaying = false;
      this.nextPlayTime = 0;

      // UI elements
      this.floatingBtn = null;
      this.modalOverlay = null;
    }

    // Initialize
    init(containerId = null) {
      if (containerId) {
        this.container = document.getElementById(containerId);
        if (this.container) {
          this.renderInline();
        }
      } else if (this.config.triggerType === 'floating') {
        this.createFloatingButton();
      }

      this.injectStyles();
      console.log('Aria Realtime initialized');
    }

    // Inject CSS
    injectStyles() {
      if (document.getElementById('aria-realtime-styles')) return;

      const primary = this.config.primaryColor;
      const secondary = this.config.secondaryColor;
      const isDark = this.config.theme === 'dark';

      const styles = document.createElement('style');
      styles.id = 'aria-realtime-styles';
      styles.textContent = `
        .aria-rt * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }

        .aria-rt-btn {
          position: fixed;
          bottom: 24px;
          ${this.config.position === 'left' ? 'left: 24px;' : 'right: 24px;'}
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: linear-gradient(135deg, ${primary}, ${this.adjustColor(primary, -20)});
          border: none;
          cursor: pointer;
          box-shadow: 0 4px 24px rgba(0,0,0,0.3);
          z-index: 99998;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
        }
        .aria-rt-btn:hover { transform: scale(1.1); box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
        .aria-rt-btn svg { width: 28px !important; height: 28px !important; min-width: 28px !important; min-height: 28px !important; max-width: 28px !important; max-height: 28px !important; color: ${secondary} !important; flex-shrink: 0 !important; }
        .aria-rt-btn.active { animation: ariaPulse 1.5s infinite; background: #22c55e; }
        .aria-rt-btn.listening { animation: ariaPulse 1.5s infinite; background: #ef4444; }

        @keyframes ariaPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(249, 203, 0, 0.7); }
          50% { box-shadow: 0 0 0 20px rgba(249, 203, 0, 0); }
        }

        .aria-rt-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.85);
          backdrop-filter: blur(10px);
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          opacity: 0;
          visibility: hidden;
          transition: all 0.3s ease;
        }
        .aria-rt-overlay.open { opacity: 1; visibility: visible; }

        .aria-rt-modal {
          background: ${isDark ? secondary : '#ffffff'};
          border-radius: 24px;
          width: 100%;
          max-width: 440px;
          overflow: hidden;
          transform: translateY(30px) scale(0.9);
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          position: relative;
        }
        .aria-rt-overlay.open .aria-rt-modal { transform: translateY(0) scale(1); }

        .aria-rt-header {
          padding: 32px 24px;
          background: linear-gradient(135deg, ${secondary}, ${this.adjustColor(secondary, 15)});
          color: #fff;
          text-align: center;
          position: relative;
        }

        .aria-rt-avatar {
          width: 100px;
          height: 100px;
          border-radius: 50%;
          background: linear-gradient(135deg, ${primary}, ${this.adjustColor(primary, -30)});
          margin: 0 auto 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          position: relative;
          transition: all 0.3s;
        }
        .aria-rt-avatar svg { width: 48px !important; height: 48px !important; min-width: 48px !important; min-height: 48px !important; max-width: 48px !important; max-height: 48px !important; color: ${secondary} !important; flex-shrink: 0 !important; }
        .aria-rt-avatar.listening { background: #ef4444; }
        .aria-rt-avatar.listening svg { color: #fff !important; }
        .aria-rt-avatar.speaking { animation: speakingPulse 0.8s infinite; }
        .aria-rt-avatar.connected::after {
          content: '';
          position: absolute;
          bottom: 4px;
          right: 4px;
          width: 20px;
          height: 20px;
          background: #22c55e;
          border-radius: 50%;
          border: 3px solid ${secondary};
        }

        @keyframes speakingPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }

        .aria-rt-close {
          position: absolute;
          top: 12px;
          right: 12px;
          background: rgba(255,255,255,0.2);
          border: none;
          width: 44px;
          height: 44px;
          min-width: 44px;
          min-height: 44px;
          border-radius: 50%;
          color: #fff;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          z-index: 10;
        }
        .aria-rt-close:hover { background: rgba(255,255,255,0.35); transform: scale(1.1); }
        .aria-rt-close svg { width: 24px !important; height: 24px !important; pointer-events: none; }

        .aria-rt-name { font-size: 28px; font-weight: 700; margin-bottom: 4px; }
        .aria-rt-status { font-size: 14px; opacity: 0.8; }
        .aria-rt-status.connected { color: #22c55e; opacity: 1; }

        .aria-rt-body {
          padding: 24px;
          color: ${isDark ? '#fff' : '#1a1a2e'};
        }

        .aria-rt-conversation {
          max-height: 180px;
          overflow-y: auto;
          margin-bottom: 20px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .aria-rt-msg {
          padding: 12px 16px;
          border-radius: 16px;
          font-size: 14px;
          line-height: 1.5;
          max-width: 85%;
        }
        .aria-rt-msg.assistant {
          background: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'};
          align-self: flex-start;
          border-bottom-left-radius: 4px;
        }
        .aria-rt-msg.user {
          background: ${primary};
          color: ${secondary};
          align-self: flex-end;
          border-bottom-right-radius: 4px;
        }

        .aria-rt-live {
          background: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'};
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 20px;
          min-height: 60px;
          font-size: 14px;
          color: ${isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)'};
        }
        .aria-rt-live.active { border: 2px solid ${primary}; }

        .aria-rt-controls { display: flex; gap: 12px; justify-content: center; }

        .aria-rt-talk-btn {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: linear-gradient(135deg, ${primary}, ${this.adjustColor(primary, -20)});
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s;
          box-shadow: 0 4px 20px ${this.hexToRgba(primary, 0.4)};
        }
        .aria-rt-talk-btn:hover { transform: scale(1.05); }
        .aria-rt-talk-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .aria-rt-talk-btn svg { width: 36px !important; height: 36px !important; min-width: 36px !important; min-height: 36px !important; max-width: 36px !important; max-height: 36px !important; color: ${secondary} !important; flex-shrink: 0 !important; }
        .aria-rt-talk-btn.listening { background: #ef4444; animation: ariaPulse 1.5s infinite; }
        .aria-rt-talk-btn.listening svg { color: #fff !important; }

        .aria-rt-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 20px;
          justify-content: center;
        }
        .aria-rt-action {
          padding: 8px 16px;
          border-radius: 20px;
          background: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'};
          border: 1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};
          cursor: pointer;
          font-size: 13px;
          color: ${isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.7)'};
        }
        .aria-rt-action:hover { background: ${this.hexToRgba(primary, 0.15)}; border-color: ${primary}; color: ${primary}; }

        .aria-rt-footer {
          padding: 16px 24px;
          border-top: 1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'};
          text-align: center;
        }
        .aria-rt-powered { font-size: 11px; color: ${isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}; }
        .aria-rt-powered a { color: ${primary}; text-decoration: none; }

        .aria-rt-visualizer {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 3px;
          height: 40px;
          margin-top: 12px;
        }
        .aria-rt-bar {
          width: 4px;
          background: ${primary};
          border-radius: 2px;
          transition: height 0.1s;
        }

        @media (max-width: 480px) {
          .aria-rt-modal { max-width: 100%; border-radius: 20px 20px 0 0; }
          .aria-rt-overlay { align-items: flex-end; padding: 0; }
        }
      `;

      document.head.appendChild(styles);
    }

    // Create floating button
    createFloatingButton() {
      const btn = document.createElement('button');
      btn.className = 'aria-rt-btn';
      btn.id = 'ariaRealtimeBtn';
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

    // Render inline
    renderInline() {
      this.container.innerHTML = this.getModalHTML();
      this.attachEvents();
    }

    // Get modal HTML
    getModalHTML() {
      return `
        <div class="aria-rt-modal aria-rt">
          <div class="aria-rt-header">
            <button class="aria-rt-close" id="ariaRtClose" type="button" aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            <div class="aria-rt-avatar" id="ariaRtAvatar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              </svg>
            </div>
            <div class="aria-rt-name">${this.config.assistantName}</div>
            <div class="aria-rt-status" id="ariaRtStatus">Tap to start talking</div>
            <div class="aria-rt-visualizer" id="ariaRtVisualizer">
              ${Array(12).fill().map(() => '<div class="aria-rt-bar" style="height: 8px;"></div>').join('')}
            </div>
          </div>

          <div class="aria-rt-body">
            <div class="aria-rt-conversation" id="ariaRtConversation"></div>

            <div class="aria-rt-live" id="ariaRtLive">
              Press the button and speak naturally. Aria will respond with a real voice.
            </div>

            <div class="aria-rt-controls">
              <button class="aria-rt-talk-btn" id="ariaRtTalkBtn" type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              </button>
            </div>

            <div class="aria-rt-actions">
              <button class="aria-rt-action" data-action="schedule" type="button">Schedule Visit</button>
              <button class="aria-rt-action" data-action="quote" type="button">Get Quote</button>
              <button class="aria-rt-action" data-action="hours" type="button">Business Hours</button>
            </div>
          </div>

          <div class="aria-rt-footer">
            <div class="aria-rt-powered">Voice AI by <a href="https://remodely.ai" target="_blank">Remodely.ai</a></div>
          </div>
        </div>
      `;
    }

    // Open modal
    open() {
      if (!this.modalOverlay) {
        this.createModal();
      }
      this.modalOverlay.classList.add('open');
      this.state.isOpen = true;

      // Connect to voice service
      if (!this.state.isConnected) {
        this.connect();
      }
    }

    // Close modal
    close() {
      if (this.modalOverlay) {
        this.modalOverlay.classList.remove('open');
      }
      this.state.isOpen = false;
      this.disconnect();
    }

    // Create modal
    createModal() {
      const overlay = document.createElement('div');
      overlay.className = 'aria-rt-overlay';
      overlay.innerHTML = this.getModalHTML();

      // Close on overlay click (but not modal click)
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.close();
      });

      document.body.appendChild(overlay);
      this.modalOverlay = overlay;
      this.attachEvents();
    }

    // Attach events
    attachEvents() {
      const container = this.modalOverlay || this.container;
      if (!container) return;

      // Close button - use event delegation with better targeting
      const closeBtn = container.querySelector('#ariaRtClose');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.close();
        });
      }

      // Talk button
      const talkBtn = container.querySelector('#ariaRtTalkBtn');
      if (talkBtn) talkBtn.onclick = () => this.toggleTalk();

      // Quick actions
      container.querySelectorAll('.aria-rt-action').forEach(btn => {
        btn.onclick = () => this.quickAction(btn.dataset.action);
      });
    }

    // Connect to OpenAI Realtime via relay
    async connect() {
      try {
        this.updateStatus('Connecting...');

        // Build WebSocket URL - support both full URLs and paths
        let wsUrl = this.config.relayEndpoint;
        if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
          const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          wsUrl = `${wsProtocol}//${window.location.host}${this.config.relayEndpoint}`;
        }

        console.log('[Aria] Connecting to:', wsUrl);
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('[Aria] WebSocket connected');

          // Send configuration to relay
          this.ws.send(JSON.stringify({
            type: 'config',
            voice: this.config.voice,
            businessName: this.config.businessName,
            businessContext: this.config.businessContext,
            systemInstructions: this.config.systemInstructions || this.buildSystemInstructions()
          }));
        };

        this.ws.onmessage = (event) => {
          try {
            this.handleMessage(JSON.parse(event.data));
          } catch (e) {
            console.error('[Aria] Failed to parse message:', e);
          }
        };

        this.ws.onerror = (error) => {
          console.error('[Aria] WebSocket error:', error);
          this.updateStatus('Connection error');
          if (this.config.onError) this.config.onError(error);
        };

        this.ws.onclose = (event) => {
          console.log('[Aria] WebSocket closed:', event.code, event.reason);
          this.state.isConnected = false;
          this.updateStatus('Disconnected');
          this.updateAvatar();
          if (this.config.onDisconnect) this.config.onDisconnect();
        };

      } catch (error) {
        console.error('[Aria] Connection failed:', error);
        this.updateStatus('Failed to connect');
      }
    }

    // Handle messages from relay
    handleMessage(msg) {
      console.log('[Aria] Message:', msg.type);

      switch (msg.type) {
        case 'connected':
          this.state.isConnected = true;
          this.updateStatus('Connected');
          this.updateAvatar();
          if (this.config.onConnect) this.config.onConnect();

          // Initialize playback context
          this.initPlaybackContext();

          // Trigger greeting
          setTimeout(() => this.triggerGreeting(), 500);
          break;

        case 'transcript':
          // User's speech transcribed
          this.addMessage('user', msg.text);
          if (this.config.onTranscript) this.config.onTranscript('user', msg.text);
          break;

        case 'response_text':
          // Aria's response text
          this.addMessage('assistant', msg.text);
          if (this.config.onTranscript) this.config.onTranscript('assistant', msg.text);
          break;

        case 'audio':
          // Aria's audio response - queue it for smooth playback
          this.queueAudio(msg.audio);
          break;

        case 'speaking_start':
          this.state.isSpeaking = true;
          this.updateAvatar();
          this.updateStatus('Speaking...');
          break;

        case 'speaking_end':
          this.state.isSpeaking = false;
          this.updateAvatar();
          this.updateStatus('Listening...');
          break;

        case 'error':
          console.error('[Aria] Error:', msg.message);
          this.updateStatus('Error: ' + msg.message);
          break;
      }
    }

    // Disconnect
    disconnect() {
      this.stopMicrophone();
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      if (this.playbackContext) {
        this.playbackContext.close().catch(() => {});
        this.playbackContext = null;
      }
      this.audioQueue = [];
      this.isPlaying = false;
      this.state.isConnected = false;
      this.state.isListening = false;
    }

    // Toggle talk
    async toggleTalk() {
      if (this.state.isListening) {
        this.stopListening();
      } else {
        await this.startListening();
      }
    }

    // Start listening
    async startListening() {
      if (!this.state.isConnected) {
        await this.connect();
        return;
      }

      try {
        // Get microphone access
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

        // Create audio context - use device's native sample rate
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const nativeSampleRate = this.audioContext.sampleRate;
        console.log('[Aria] Native sample rate:', nativeSampleRate);

        // Create source from microphone
        this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

        // Create script processor to capture audio
        const bufferSize = 4096;
        const processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

        processor.onaudioprocess = (e) => {
          if (!this.state.isListening || this.state.isSpeaking) return;

          const inputData = e.inputBuffer.getChannelData(0);

          // Resample to 24000Hz if needed
          const resampled = this.resample(inputData, nativeSampleRate, 24000);
          const pcm16 = this.floatTo16BitPCM(resampled);
          const base64 = this.arrayBufferToBase64(pcm16);

          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
              type: 'audio',
              audio: base64
            }));
          }
        };

        this.sourceNode.connect(processor);
        processor.connect(this.audioContext.destination);
        this.processor = processor;

        this.state.isListening = true;
        this.updateStatus('Listening...');
        this.updateTalkButton();
        this.updateAvatar();

        // Tell relay we're ready
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'start_listening' }));
        }

      } catch (error) {
        console.error('[Aria] Microphone error:', error);
        this.updateStatus('Microphone access denied');
      }
    }

    // Resample audio data
    resample(inputData, fromSampleRate, toSampleRate) {
      if (fromSampleRate === toSampleRate) {
        return inputData;
      }

      const ratio = fromSampleRate / toSampleRate;
      const newLength = Math.round(inputData.length / ratio);
      const result = new Float32Array(newLength);

      for (let i = 0; i < newLength; i++) {
        const srcIndex = i * ratio;
        const srcIndexFloor = Math.floor(srcIndex);
        const srcIndexCeil = Math.min(srcIndexFloor + 1, inputData.length - 1);
        const t = srcIndex - srcIndexFloor;
        result[i] = inputData[srcIndexFloor] * (1 - t) + inputData[srcIndexCeil] * t;
      }

      return result;
    }

    // Stop listening
    stopListening() {
      this.state.isListening = false;
      this.stopMicrophone();
      this.updateStatus('Connected');
      this.updateTalkButton();
      this.updateAvatar();

      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'stop_listening' }));
      }
    }

    // Stop microphone
    stopMicrophone() {
      if (this.processor) {
        this.processor.disconnect();
        this.processor = null;
      }
      if (this.sourceNode) {
        this.sourceNode.disconnect();
        this.sourceNode = null;
      }
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
      }
      if (this.audioContext) {
        this.audioContext.close().catch(() => {});
        this.audioContext = null;
      }
    }

    // Initialize playback context
    initPlaybackContext() {
      if (!this.playbackContext) {
        this.playbackContext = new (window.AudioContext || window.webkitAudioContext)();
        this.nextPlayTime = 0;
        this.audioQueue = [];
        this.isPlaying = false;
      }
    }

    // Queue audio for smooth playback
    queueAudio(base64Audio) {
      try {
        if (!this.playbackContext) {
          this.initPlaybackContext();
        }

        // Decode base64 to PCM16
        const audioData = this.base64ToArrayBuffer(base64Audio);
        const pcm16 = new Int16Array(audioData);

        // Convert to float32
        const float32 = new Float32Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) {
          float32[i] = pcm16[i] / 32768;
        }

        // Create audio buffer at 24kHz
        const audioBuffer = this.playbackContext.createBuffer(1, float32.length, 24000);
        audioBuffer.getChannelData(0).set(float32);

        // Add to queue
        this.audioQueue.push(audioBuffer);

        // Start playback if not already playing
        if (!this.isPlaying) {
          this.playNextInQueue();
        }

      } catch (error) {
        console.error('[Aria] Audio queue error:', error);
      }
    }

    // Play next audio buffer in queue
    playNextInQueue() {
      if (this.audioQueue.length === 0) {
        this.isPlaying = false;
        this.animateVisualizer(false);
        return;
      }

      this.isPlaying = true;
      this.animateVisualizer(true);

      const audioBuffer = this.audioQueue.shift();
      const source = this.playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.playbackContext.destination);

      // Calculate when to start this buffer
      const currentTime = this.playbackContext.currentTime;
      const startTime = Math.max(currentTime, this.nextPlayTime);

      source.start(startTime);
      this.nextPlayTime = startTime + audioBuffer.duration;

      // Schedule next buffer playback
      source.onended = () => {
        this.playNextInQueue();
      };
    }

    // Trigger greeting
    triggerGreeting() {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'trigger_greeting',
          greeting: this.config.greeting
        }));
      }
    }

    // Quick action
    quickAction(action) {
      const messages = {
        schedule: "I'd like to schedule an appointment",
        quote: "I need a quote for my project",
        hours: "What are your business hours?"
      };

      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'text_input',
          text: messages[action]
        }));
        this.addMessage('user', messages[action]);
      }
    }

    // Build system instructions
    buildSystemInstructions() {
      const ctx = this.config.businessContext;
      return `You are ${this.config.assistantName}, a friendly and professional AI voice assistant for ${this.config.businessName}.

PERSONALITY:
- Warm, helpful, and conversational
- Keep responses SHORT (1-2 sentences max)
- Use natural language, contractions, and casual phrasing
- Be direct and get to the point

BUSINESS CONTEXT:
- Industry: ${ctx.industry || 'home services'}
- Services: ${ctx.services?.join(', ') || 'various services'}
- Service Area: ${ctx.serviceArea || 'local area'}
- Hours: ${ctx.businessHours || 'business hours'}

CAPABILITIES:
- Answer questions about services and pricing
- Help schedule appointments
- Provide quotes and estimates
- Transfer to human if needed

Always be helpful and guide users toward scheduling or getting a quote.`;
    }

    // Update status text
    updateStatus(text) {
      const status = (this.modalOverlay || this.container)?.querySelector('#ariaRtStatus');
      if (status) {
        status.textContent = text;
        status.classList.toggle('connected', this.state.isConnected);
      }
    }

    // Update talk button
    updateTalkButton() {
      const btn = (this.modalOverlay || this.container)?.querySelector('#ariaRtTalkBtn');
      if (btn) {
        btn.classList.toggle('listening', this.state.isListening);
      }
      if (this.floatingBtn) {
        this.floatingBtn.classList.toggle('listening', this.state.isListening);
        this.floatingBtn.classList.toggle('active', this.state.isConnected && !this.state.isListening);
      }
    }

    // Update avatar
    updateAvatar() {
      const avatar = (this.modalOverlay || this.container)?.querySelector('#ariaRtAvatar');
      if (avatar) {
        avatar.classList.toggle('connected', this.state.isConnected);
        avatar.classList.toggle('listening', this.state.isListening);
        avatar.classList.toggle('speaking', this.state.isSpeaking);
      }
    }

    // Animate visualizer
    animateVisualizer(active) {
      const bars = (this.modalOverlay || this.container)?.querySelectorAll('.aria-rt-bar');
      if (!bars) return;

      if (active) {
        if (this.visualizerInterval) clearInterval(this.visualizerInterval);
        this.visualizerInterval = setInterval(() => {
          bars.forEach(bar => {
            bar.style.height = `${8 + Math.random() * 24}px`;
          });
        }, 100);
      } else {
        clearInterval(this.visualizerInterval);
        this.visualizerInterval = null;
        bars.forEach(bar => bar.style.height = '8px');
      }
    }

    // Add message to conversation
    addMessage(role, text) {
      const conversation = (this.modalOverlay || this.container)?.querySelector('#ariaRtConversation');
      if (conversation) {
        const msg = document.createElement('div');
        msg.className = `aria-rt-msg ${role}`;
        msg.textContent = text;
        conversation.appendChild(msg);
        conversation.scrollTop = conversation.scrollHeight;
      }

      this.state.conversationHistory.push({ role, content: text });
    }

    // Utilities
    floatTo16BitPCM(float32Array) {
      const buffer = new ArrayBuffer(float32Array.length * 2);
      const view = new DataView(buffer);
      for (let i = 0; i < float32Array.length; i++) {
        let s = Math.max(-1, Math.min(1, float32Array[i]));
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      }
      return buffer;
    }

    arrayBufferToBase64(buffer) {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    }

    base64ToArrayBuffer(base64) {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    }

    adjustColor(hex, amount) {
      const num = parseInt(hex.replace('#', ''), 16);
      const r = Math.min(255, Math.max(0, (num >> 16) + amount));
      const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
      const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
      return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
    }

    hexToRgba(hex, alpha) {
      const num = parseInt(hex.replace('#', ''), 16);
      return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
    }

    // Destroy
    destroy() {
      this.disconnect();
      if (this.floatingBtn) this.floatingBtn.remove();
      if (this.modalOverlay) this.modalOverlay.remove();
      const styles = document.getElementById('aria-realtime-styles');
      if (styles) styles.remove();
    }
  }

  // Export
  window.AriaRealtime = AriaRealtime;
})();
