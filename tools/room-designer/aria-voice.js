/*
 * aria-voice.js — voice for the Aria design chat. Two modes:
 *   HYBRID (default, ~free): device speech (Web Speech API) in/out + our text
 *     brain /api/ai/design-chat + the Phase-1 design verbs. No per-minute cost.
 *   REALTIME (opt-in, premium): OpenAI Realtime/WebRTC for natural voice;
 *     set window.ARIA_VOICE_MODE='realtime'. Needs ARIA_REALTIME_MODEL on the API.
 * Tool calls run through window.aiApplyVoiceAction (same executor as text chat);
 * transcripts render via window.aiChatSay; room context via window.getAiRoomState.
 */
(function () {
  'use strict';

  function mode() { return window.ARIA_VOICE_MODE === 'realtime' ? 'realtime' : 'hybrid'; }
  function say(role, text) { if (text && typeof window.aiChatSay === 'function') window.aiChatSay(role, text); }
  function setChip(state) {
    const chip = document.getElementById('aiVoiceChip');
    if (chip) chip.textContent = state === 'live' ? '🔴 Stop' : (state === 'connecting' ? '… connecting' : '🎙️ Talk to Aria');
  }

  let active = false;

  // ---------- HYBRID (default): free device speech + design-chat brain ----------
  let recog = null, busy = false;

  function speak(text) {
    if (!window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      u.onend = function () { if (active && mode() === 'hybrid') listen(); };
      window.speechSynthesis.speak(u);
    } catch (_) {}
  }

  // One spoken turn: transcript -> design-chat -> run actions -> speak reply.
  // Exposed so the turn logic is testable without the browser speech engine.
  async function handleTranscript(text) {
    if (!text || !text.trim() || busy) return;
    busy = true;
    say('user', text);
    let data;
    try {
      const r = await fetch('/api/ai/design-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: [], roomState: window.getAiRoomState ? window.getAiRoomState() : {} })
      });
      data = await r.json();
      if (data.error) throw new Error(data.error);
    } catch (e) {
      busy = false; say('assistant', 'Sorry — ' + e.message); speak('Sorry, something went wrong.'); return;
    }
    if (Array.isArray(data.actions)) {
      for (const a of data.actions) { try { await window.aiApplyVoiceAction(a); } catch (_) {} }
    }
    const reply = data.response || 'Done.';
    busy = false;
    say('assistant', reply);
    if (window.speechSynthesis) speak(reply); else if (active) listen(); // no TTS -> keep listening
  }
  window.ariaVoiceHandleTranscript = handleTranscript;

  function listen() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { say('assistant', "This browser can't do voice input — you can type instead."); stopHybrid(); return; }
    if (busy || (window.speechSynthesis && window.speechSynthesis.speaking)) return;
    try {
      recog = new SR();
      recog.lang = 'en-US'; recog.interimResults = false; recog.maxAlternatives = 1; recog.continuous = false;
      recog.onresult = function (e) { handleTranscript(e.results[0][0].transcript); };
      recog.onerror = function (e) { if (e.error === 'not-allowed') { say('assistant', 'I need mic permission to listen.'); stopHybrid(); } };
      recog.onend = function () { if (active && mode() === 'hybrid' && !busy && !(window.speechSynthesis && window.speechSynthesis.speaking)) { try { recog.start(); } catch (_) {} } };
      recog.start();
    } catch (_) {}
  }

  function startHybrid() {
    if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) {
      say('assistant', "This browser can't do voice input — type your request or use the camera.");
      return;
    }
    active = true; setChip('live');
    say('assistant', "I'm listening — tell me what you'd like to change.");
    listen();
  }
  function stopHybrid() {
    active = false; setChip('idle');
    try { if (recog) recog.onend = null, recog.stop(); } catch (_) {}
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (_) {}
    recog = null; busy = false;
  }

  // ---------- REALTIME (opt-in): OpenAI Realtime over WebRTC ----------
  function toolToAction(name, a) {
    a = a || {};
    switch (name) {
      case 'set_finish':    return { type: 'SET_FINISH',     params: { target: a.target, style: a.style } };
      case 'set_material':  return { type: 'SET_MATERIAL',   params: { target: a.target, material: a.material } };
      case 'move_element':  return { type: 'MOVE_ELEMENT',   params: { label: a.label, wall: a.wall, position: a.position } };
      case 'add_backsplash':return { type: 'ADD_BACKSPLASH', params: { wall: a.wall, material: a.material } };
      case 'add_cabinet':   return { type: 'ADD_CABINET',    params: { type: a.type, wall: a.wall, width: a.width } };
      case 'add_appliance': return { type: 'ADD_APPLIANCE',  params: { type: a.type, wall: a.wall, width: a.width } };
      case 'add_island':    return { type: 'ADD_ISLAND',     params: { width: a.width, depth: a.depth } };
      case 'set_room_size': return { type: 'SET_ROOM_SIZE',  params: { width: a.width, depth: a.depth } };
      case 'clear_room':    return { type: 'CLEAR_ELEMENTS', params: {} };
      default: return null;
    }
  }
  window.ariaVoiceApplyToolCall = async function (name, args) {
    const action = toolToAction(name, args);
    if (!action) return 'Unknown tool: ' + name;
    if (typeof window.aiApplyVoiceAction !== 'function') return 'Designer not ready';
    try { return (await window.aiApplyVoiceAction(action)) || 'Done'; }
    catch (e) { return 'Could not apply: ' + e.message; }
  };

  const TOOLS = [
    { type: 'function', name: 'set_finish', description: 'Restyle cabinets, e.g. "white shaker".', parameters: { type: 'object', properties: { target: { type: 'string' }, style: { type: 'string' } }, required: ['style'] } },
    { type: 'function', name: 'set_material', description: 'Set countertop/island/backsplash stone.', parameters: { type: 'object', properties: { target: { type: 'string' }, material: { type: 'string' } }, required: ['material'] } },
    { type: 'function', name: 'move_element', description: 'Move an element to a wall.', parameters: { type: 'object', properties: { label: { type: 'string' }, wall: { type: 'string' }, position: { type: 'number' } }, required: ['label'] } },
    { type: 'function', name: 'add_backsplash', description: 'Add a backsplash.', parameters: { type: 'object', properties: { wall: { type: 'string' }, material: { type: 'string' } } } },
    { type: 'function', name: 'add_cabinet', description: 'Add a cabinet.', parameters: { type: 'object', properties: { type: { type: 'string' }, wall: { type: 'string' }, width: { type: 'number' } } } },
    { type: 'function', name: 'add_appliance', description: 'Add an appliance.', parameters: { type: 'object', properties: { type: { type: 'string' }, wall: { type: 'string' }, width: { type: 'number' } } } },
    { type: 'function', name: 'add_island', description: 'Add a center island (inches).', parameters: { type: 'object', properties: { width: { type: 'number' }, depth: { type: 'number' } } } },
    { type: 'function', name: 'set_room_size', description: 'Set room dimensions in feet.', parameters: { type: 'object', properties: { width: { type: 'number' }, depth: { type: 'number' } } } },
    { type: 'function', name: 'clear_room', description: 'Clear everything.', parameters: { type: 'object', properties: {} } }
  ];

  let pc = null, dc = null, micStream = null, audioEl = null;
  function sendEvent(o) { if (dc && dc.readyState === 'open') dc.send(JSON.stringify(o)); }
  function configureSession() {
    let ctx = '';
    try { const s = window.getAiRoomState && window.getAiRoomState(); if (s) ctx = `Current room: ${s.roomWidth}' x ${s.roomDepth}', ${s.elementCount} items.`; } catch (_) {}
    sendEvent({ type: 'session.update', session: { tools: TOOLS, tool_choice: 'auto', input_audio_transcription: { model: 'whisper-1' }, instructions: 'You are Aria, a warm expert kitchen designer. Be concise. Call a tool for any change; advise when asked. ' + ctx } });
  }
  async function handleRealtimeEvent(evt) {
    if (!evt || !evt.type) return;
    if (evt.type === 'response.function_call_arguments.done') {
      let args = {}; try { args = JSON.parse(evt.arguments || '{}'); } catch (_) {}
      const result = await window.ariaVoiceApplyToolCall(evt.name, args);
      sendEvent({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: evt.call_id, output: JSON.stringify({ result }) } });
      sendEvent({ type: 'response.create' });
    } else if (evt.type === 'conversation.item.input_audio_transcription.completed') { say('user', evt.transcript); }
    else if (evt.type === 'response.audio_transcript.done') { say('assistant', evt.transcript); }
    else if (evt.type === 'error') { say('assistant', 'Voice error: ' + ((evt.error && evt.error.message) || 'unknown')); }
  }
  async function startRealtime() {
    setChip('connecting');
    let token, model;
    try {
      const r = await fetch('/api/ai/realtime-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const j = await r.json();
      if (!r.ok || !j.client_secret) throw new Error(j.error || 'no session');
      token = j.client_secret.value; model = j.model;
    } catch (e) { setChip('idle'); say('assistant', "Couldn't start premium voice: " + e.message + '. Falling back to standard voice.'); window.ARIA_VOICE_MODE = 'hybrid'; startHybrid(); return; }
    try {
      pc = new RTCPeerConnection();
      audioEl = document.createElement('audio'); audioEl.autoplay = true; document.body.appendChild(audioEl);
      pc.ontrack = function (e) { audioEl.srcObject = e.streams[0]; };
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStream.getTracks().forEach(function (t) { pc.addTrack(t, micStream); });
      dc = pc.createDataChannel('oai-events');
      dc.onopen = configureSession;
      dc.onmessage = function (e) { let d; try { d = JSON.parse(e.data); } catch (_) { return; } handleRealtimeEvent(d); };
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      const resp = await fetch('https://api.openai.com/v1/realtime?model=' + encodeURIComponent(model), { method: 'POST', body: offer.sdp, headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/sdp', 'OpenAI-Beta': 'realtime=v1' } });
      const answer = await resp.text();
      if (!resp.ok) throw new Error('SDP exchange failed');
      await pc.setRemoteDescription({ type: 'answer', sdp: answer });
      active = true; setChip('live'); say('assistant', "I'm listening — tell me what you'd like to change.");
    } catch (e) { stopRealtime(); say('assistant', 'Premium voice failed: ' + e.message); }
  }
  function stopRealtime() {
    active = false; setChip('idle');
    try { if (dc) dc.close(); } catch (_) {}
    try { if (pc) pc.close(); } catch (_) {}
    if (micStream) { micStream.getTracks().forEach(function (t) { t.stop(); }); micStream = null; }
    if (audioEl) { audioEl.remove(); audioEl = null; }
    pc = null; dc = null;
  }

  // ---------- public ----------
  window.toggleAriaVoice = function () {
    if (active) { mode() === 'realtime' ? stopRealtime() : stopHybrid(); return; }
    if (mode() === 'realtime') startRealtime(); else startHybrid();
  };
  window.ariaVoiceIsActive = function () { return active; };
})();
