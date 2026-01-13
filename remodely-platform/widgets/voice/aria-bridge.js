/**
 * ARIA VOICE BRIDGE
 * Phone system & VoIP integration for Aria AI
 * Connects to Twilio, Google Voice, and other providers
 * Powered by Remodely AI
 * Version: 1.0
 */

(function() {
  'use strict';

  class AriaBridge {
    constructor(config = {}) {
      this.config = {
        // API Configuration
        apiEndpoint: 'https://api.remodely.ai',
        websocketUrl: 'wss://api.remodely.ai/voice/ws',

        // Twilio credentials (set via environment)
        twilioAccountSid: '',
        twilioAuthToken: '',
        twilioPhoneNumber: '',

        // Google Voice / Cloud Speech
        googleCredentials: null,

        // Business configuration
        businessName: 'Your Business',
        businessPhone: '',
        businessContext: {},

        // Voice settings
        voice: 'Polly.Joanna', // AWS Polly voice for phone
        language: 'en-US',
        speechModel: 'phone_call',

        // Call handling
        maxCallDuration: 600, // 10 minutes
        transcribeAll: true,
        recordCalls: false,
        voicemailAfter: 30, // seconds to voicemail

        // Webhooks
        onCallStart: null,
        onCallEnd: null,
        onTranscript: null,
        onIntent: null,

        ...config
      };

      this.activeCalls = new Map();
      this.websocket = null;
    }

    // Initialize bridge
    async init() {
      await this.connectWebSocket();
      console.log('Aria Bridge initialized');
      return this;
    }

    // Connect to real-time websocket
    async connectWebSocket() {
      return new Promise((resolve, reject) => {
        try {
          this.websocket = new WebSocket(this.config.websocketUrl);

          this.websocket.onopen = () => {
            console.log('Aria Bridge WebSocket connected');
            this.authenticate();
            resolve();
          };

          this.websocket.onmessage = (event) => {
            this.handleWebSocketMessage(JSON.parse(event.data));
          };

          this.websocket.onerror = (error) => {
            console.error('WebSocket error:', error);
            reject(error);
          };

          this.websocket.onclose = () => {
            console.log('WebSocket closed, reconnecting...');
            setTimeout(() => this.connectWebSocket(), 5000);
          };
        } catch (e) {
          reject(e);
        }
      });
    }

    // Authenticate with server
    authenticate() {
      this.send({
        type: 'auth',
        credentials: {
          accountSid: this.config.twilioAccountSid,
          businessId: this.config.businessId
        }
      });
    }

    // Send message via WebSocket
    send(message) {
      if (this.websocket?.readyState === WebSocket.OPEN) {
        this.websocket.send(JSON.stringify(message));
      }
    }

    // Handle incoming WebSocket messages
    handleWebSocketMessage(message) {
      switch (message.type) {
        case 'call_start':
          this.handleCallStart(message.data);
          break;
        case 'call_end':
          this.handleCallEnd(message.data);
          break;
        case 'transcript':
          this.handleTranscript(message.data);
          break;
        case 'dtmf':
          this.handleDTMF(message.data);
          break;
        case 'error':
          console.error('Bridge error:', message.data);
          break;
      }
    }

    // Handle incoming call
    handleCallStart(data) {
      const call = {
        id: data.callSid,
        from: data.from,
        to: data.to,
        startTime: new Date(),
        transcript: [],
        status: 'active'
      };

      this.activeCalls.set(data.callSid, call);

      // Trigger callback
      if (this.config.onCallStart) {
        this.config.onCallStart(call);
      }

      // Send initial greeting
      this.speak(data.callSid, this.getGreeting());
    }

    // Handle call end
    handleCallEnd(data) {
      const call = this.activeCalls.get(data.callSid);
      if (call) {
        call.status = 'ended';
        call.endTime = new Date();
        call.duration = (call.endTime - call.startTime) / 1000;

        if (this.config.onCallEnd) {
          this.config.onCallEnd(call);
        }

        // Save call record
        this.saveCallRecord(call);
        this.activeCalls.delete(data.callSid);
      }
    }

    // Handle real-time transcript
    handleTranscript(data) {
      const call = this.activeCalls.get(data.callSid);
      if (call) {
        call.transcript.push({
          role: 'user',
          text: data.text,
          timestamp: new Date()
        });

        if (this.config.onTranscript) {
          this.config.onTranscript(data.callSid, data.text);
        }

        // Process the input
        this.processInput(data.callSid, data.text);
      }
    }

    // Handle DTMF tones (keypad input)
    handleDTMF(data) {
      const { callSid, digit } = data;

      switch (digit) {
        case '1':
          this.speak(callSid, 'Connecting you to schedule an appointment.');
          this.transferToBooking(callSid);
          break;
        case '2':
          this.speak(callSid, 'Let me get you a quote estimate.');
          this.startQuoteFlow(callSid);
          break;
        case '0':
          this.speak(callSid, 'Transferring you to a team member.');
          this.transferToHuman(callSid);
          break;
        default:
          this.speak(callSid, 'I did not recognize that option. Please try again.');
      }
    }

    // Process user voice input
    async processInput(callSid, text) {
      const intent = this.detectIntent(text);

      if (this.config.onIntent) {
        this.config.onIntent(callSid, intent, text);
      }

      const response = await this.generateResponse(callSid, text, intent);
      this.speak(callSid, response);
    }

    // Detect user intent
    detectIntent(text) {
      const lowerText = text.toLowerCase();

      const intents = {
        schedule: ['schedule', 'appointment', 'book', 'available', 'come out', 'visit'],
        quote: ['quote', 'estimate', 'price', 'cost', 'how much'],
        hours: ['hours', 'open', 'close', 'when'],
        location: ['where', 'address', 'located', 'directions'],
        human: ['speak', 'person', 'human', 'representative', 'someone', 'operator'],
        services: ['services', 'offer', 'do you do', 'specialize'],
        status: ['my project', 'status', 'update', 'when will'],
        emergency: ['emergency', 'urgent', 'asap', 'right now', 'today']
      };

      for (const [intent, keywords] of Object.entries(intents)) {
        if (keywords.some(kw => lowerText.includes(kw))) {
          return intent;
        }
      }

      return 'general';
    }

    // Generate AI response
    async generateResponse(callSid, text, intent) {
      const call = this.activeCalls.get(callSid);

      switch (intent) {
        case 'schedule':
          return `I'd be happy to help you schedule an appointment. Our next available time is tomorrow. Would you prefer morning or afternoon?`;

        case 'quote':
          return `I can help you get an estimate. What type of project are you looking to have done? For example, countertops, flooring, or a full remodel?`;

        case 'hours':
          return `We're open ${this.config.businessContext.businessHours || 'Monday through Saturday, 8am to 6pm'}. Would you like to schedule a time for us to come out?`;

        case 'location':
          return `We serve the ${this.config.businessContext.serviceArea || 'local'} area. We'd be happy to come to your location for a free estimate.`;

        case 'human':
          setTimeout(() => this.transferToHuman(callSid), 1000);
          return `Absolutely, let me connect you with one of our team members right now. Please hold.`;

        case 'services':
          const services = this.config.businessContext.services?.join(', ') || 'home remodeling services';
          return `We specialize in ${services}. Which of these are you interested in?`;

        case 'emergency':
          return `I understand this is urgent. Let me get a team member on the line right away.`;

        default:
          // Call external AI for complex queries
          try {
            const aiResponse = await this.callExternalAI(text, call?.transcript || []);
            return aiResponse;
          } catch (e) {
            return `I'd be happy to help with that. Could you tell me a bit more about what you need?`;
          }
      }
    }

    // Call external AI service
    async callExternalAI(text, history) {
      const response = await fetch(`${this.config.apiEndpoint}/voice/phone-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: history.slice(-10),
          businessContext: this.config.businessContext,
          businessName: this.config.businessName
        })
      });

      if (response.ok) {
        const data = await response.json();
        return data.response;
      }

      throw new Error('AI service unavailable');
    }

    // Speak to caller via TTS
    speak(callSid, text) {
      const call = this.activeCalls.get(callSid);
      if (call) {
        call.transcript.push({
          role: 'assistant',
          text,
          timestamp: new Date()
        });
      }

      this.send({
        type: 'speak',
        callSid,
        text,
        voice: this.config.voice
      });
    }

    // Get initial greeting
    getGreeting() {
      return `Hello, thank you for calling ${this.config.businessName}. I'm Aria, your AI assistant. How can I help you today? You can ask about scheduling, quotes, or our services. Press 0 at any time to speak with a team member.`;
    }

    // Transfer to booking system
    transferToBooking(callSid) {
      this.send({
        type: 'transfer',
        callSid,
        destination: 'booking',
        data: {
          caller: this.activeCalls.get(callSid)?.from
        }
      });
    }

    // Start quote flow
    startQuoteFlow(callSid) {
      this.speak(callSid, `Great, let's get you a quote. First, what type of project is this for? Say countertops, tile, flooring, cabinets, or full remodel.`);
    }

    // Transfer to human
    transferToHuman(callSid) {
      this.send({
        type: 'transfer',
        callSid,
        destination: 'human',
        data: {
          transcript: this.activeCalls.get(callSid)?.transcript
        }
      });
    }

    // Save call record
    async saveCallRecord(call) {
      try {
        await fetch(`${this.config.apiEndpoint}/calls/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callId: call.id,
            from: call.from,
            to: call.to,
            duration: call.duration,
            transcript: call.transcript,
            businessId: this.config.businessId,
            timestamp: call.startTime.toISOString()
          })
        });
      } catch (e) {
        console.error('Failed to save call record:', e);
      }
    }

    // Initiate outbound call
    async makeCall(toNumber, options = {}) {
      const response = await fetch(`${this.config.apiEndpoint}/calls/outbound`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: toNumber,
          from: this.config.twilioPhoneNumber,
          message: options.message || `Hi, this is ${this.config.businessName} calling.`,
          ...options
        })
      });

      return response.json();
    }

    // Send SMS
    async sendSMS(toNumber, message) {
      const response = await fetch(`${this.config.apiEndpoint}/sms/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: toNumber,
          from: this.config.twilioPhoneNumber,
          body: message
        })
      });

      return response.json();
    }

    // Get call history
    async getCallHistory(options = {}) {
      const params = new URLSearchParams(options);
      const response = await fetch(
        `${this.config.apiEndpoint}/calls/history?${params}`,
        { headers: { 'Content-Type': 'application/json' } }
      );
      return response.json();
    }

    // Get call analytics
    async getAnalytics(dateRange = '7d') {
      const response = await fetch(
        `${this.config.apiEndpoint}/calls/analytics?range=${dateRange}`,
        { headers: { 'Content-Type': 'application/json' } }
      );
      return response.json();
    }

    // Disconnect
    disconnect() {
      if (this.websocket) {
        this.websocket.close();
      }
    }
  }

  // TwiML Generator for Twilio webhooks
  class AriaTwiML {
    constructor(config) {
      this.config = config;
    }

    // Generate initial greeting TwiML
    generateGreeting() {
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${this.config.voice || 'Polly.Joanna'}">
    Hello, thank you for calling ${this.config.businessName}. I'm Aria, your AI assistant.
    How can I help you today?
  </Say>
  <Gather input="speech dtmf" timeout="5" action="/voice/process" method="POST">
    <Say voice="${this.config.voice || 'Polly.Joanna'}">
      Press 1 to schedule an appointment, press 2 for a quote, or press 0 to speak with someone.
      Or just tell me what you need.
    </Say>
  </Gather>
  <Say voice="${this.config.voice || 'Polly.Joanna'}">
    I didn't catch that. Let me transfer you to a team member.
  </Say>
  <Dial>${this.config.forwardNumber}</Dial>
</Response>`;
    }

    // Generate response TwiML
    generateResponse(text) {
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${this.config.voice || 'Polly.Joanna'}">${text}</Say>
  <Gather input="speech dtmf" timeout="5" action="/voice/process" method="POST">
    <Say voice="${this.config.voice || 'Polly.Joanna'}">Is there anything else I can help with?</Say>
  </Gather>
</Response>`;
    }

    // Generate transfer TwiML
    generateTransfer(number) {
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${this.config.voice || 'Polly.Joanna'}">
    Please hold while I connect you.
  </Say>
  <Dial>${number}</Dial>
</Response>`;
    }

    // Generate voicemail TwiML
    generateVoicemail() {
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${this.config.voice || 'Polly.Joanna'}">
    Sorry we missed you. Please leave your name, number, and a brief message, and we'll get back to you shortly.
  </Say>
  <Record maxLength="120" action="/voice/voicemail" transcribe="true" />
</Response>`;
    }
  }

  // Export globally
  window.AriaBridge = AriaBridge;
  window.AriaTwiML = AriaTwiML;
})();
