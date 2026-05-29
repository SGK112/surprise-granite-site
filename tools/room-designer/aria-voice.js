/*
 * aria-voice.js — realtime voice for the Aria design chat (OpenAI Realtime /
 * WebRTC), split out of index.html. Mic in + Aria's voice out; her function
 * calls run through window.aiApplyVoiceAction (same executor as text chat),
 * room context comes from window.getAiRoomState, transcripts via window.aiChatSay.
 * The API key never reaches the browser — we fetch an ephemeral token from
 * /api/ai/realtime-session.
 */
(function () {
  'use strict';

  // Voice tool -> design action mapping. Names mirror the text-chat verbs.
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

  // Run a tool Aria called. Exposed so the design verbs are exercisable
  // (and sim-testable) independent of the live transport.
  window.ariaVoiceApplyToolCall = async function (name, args) {
    const action = toolToAction(name, args);
    if (!action) return 'Unknown tool: ' + name;
    if (typeof window.aiApplyVoiceAction !== 'function') return 'Designer not ready';
    try { return (await window.aiApplyVoiceAction(action)) || 'Done'; }
    catch (e) { return 'Could not apply: ' + e.message; }
  };

  const TOOLS = [
    { type: 'function', name: 'set_finish', description: 'Restyle cabinets, e.g. "white shaker", "navy slab".',
      parameters: { type: 'object', properties: { target: { type: 'string', description: '"cabinets", "all", or a label' }, style: { type: 'string' } }, required: ['style'] } },
    { type: 'function', name: 'set_material', description: 'Set countertop/island/backsplash stone, e.g. quartz, granite, marble.',
      parameters: { type: 'object', properties: { target: { type: 'string' }, material: { type: 'string' } }, required: ['material'] } },
    { type: 'function', name: 'move_element', description: 'Move an element (range/oven/sink/fridge/a label) to a wall.',
      parameters: { type: 'object', properties: { label: { type: 'string' }, wall: { type: 'string', enum: ['top', 'bottom', 'left', 'right'] }, position: { type: 'number' } }, required: ['label'] } },
    { type: 'function', name: 'add_backsplash', description: 'Add a backsplash over the counters.',
      parameters: { type: 'object', properties: { wall: { type: 'string' }, material: { type: 'string' } } } },
    { type: 'function', name: 'add_cabinet', description: 'Add a cabinet.',
      parameters: { type: 'object', properties: { type: { type: 'string' }, wall: { type: 'string' }, width: { type: 'number' } } } },
    { type: 'function', name: 'add_appliance', description: 'Add an appliance (refrigerator/range/dishwasher/microwave/hood).',
      parameters: { type: 'object', properties: { type: { type: 'string' }, wall: { type: 'string' }, width: { type: 'number' } } } },
    { type: 'function', name: 'add_island', description: 'Add a center island (inches).',
      parameters: { type: 'object', properties: { width: { type: 'number' }, depth: { type: 'number' } } } },
    { type: 'function', name: 'set_room_size', description: 'Set room dimensions in feet.',
      parameters: { type: 'object', properties: { width: { type: 'number' }, depth: { type: 'number' } } } },
    { type: 'function', name: 'clear_room', description: 'Remove everything and start fresh.', parameters: { type: 'object', properties: {} } }
  ];

  let pc = null, dc = null, micStream = null, audioEl = null, active = false;

  function setChip(state) {
    const chip = document.getElementById('aiVoiceChip');
    if (!chip) return;
    chip.textContent = state === 'live' ? '🔴 Stop' : (state === 'connecting' ? '… connecting' : '🎙️ Talk to Aria');
  }

  function say(role, text) { if (text && typeof window.aiChatSay === 'function') window.aiChatSay(role, text); }

  function sendEvent(obj) { if (dc && dc.readyState === 'open') dc.send(JSON.stringify(obj)); }

  // Configure the session once connected: persona + tools + live room context.
  function configureSession() {
    let ctx = '';
    try {
      const s = window.getAiRoomState ? window.getAiRoomState() : null;
      if (s) ctx = `Current room: ${s.roomWidth}' x ${s.roomDepth}', ${s.elementCount} items` +
        (s.elements.length ? ` — ${s.elements.slice(0, 20).map(e => `${e.label}(${e.type},${e.wall})`).join('; ')}` : '') + '.';
    } catch (_) {}
    sendEvent({
      type: 'session.update',
      session: {
        tools: TOOLS, tool_choice: 'auto',
        input_audio_transcription: { model: 'whisper-1' },
        instructions: 'You are Aria, a warm expert kitchen & bath designer talking with a homeowner. Be concise. Call a tool to make any change they ask for; give real advice when asked an opinion; confirm aloud what you changed. ' + ctx
      }
    });
  }

  async function handleEvent(evt) {
    if (!evt || !evt.type) return;
    if (evt.type === 'response.function_call_arguments.done') {
      let args = {}; try { args = JSON.parse(evt.arguments || '{}'); } catch (_) {}
      const result = await window.ariaVoiceApplyToolCall(evt.name, args);
      sendEvent({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: evt.call_id, output: JSON.stringify({ result }) } });
      sendEvent({ type: 'response.create' });
    } else if (evt.type === 'conversation.item.input_audio_transcription.completed') {
      say('user', evt.transcript);
    } else if (evt.type === 'response.audio_transcript.done') {
      say('assistant', evt.transcript);
    } else if (evt.type === 'error') {
      say('assistant', 'Voice error: ' + ((evt.error && evt.error.message) || 'unknown'));
    }
  }

  async function start() {
    if (active) return;
    setChip('connecting');
    let token, model;
    try {
      const r = await fetch('/api/ai/realtime-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const j = await r.json();
      if (!r.ok || !j.client_secret) throw new Error(j.error || 'no session');
      token = j.client_secret.value; model = j.model;
    } catch (e) {
      setChip('idle'); say('assistant', "I couldn't start voice: " + e.message + '. You can still type or use the camera.'); return;
    }
    try {
      pc = new RTCPeerConnection();
      audioEl = document.createElement('audio'); audioEl.autoplay = true; document.body.appendChild(audioEl);
      pc.ontrack = (e) => { audioEl.srcObject = e.streams[0]; };
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStream.getTracks().forEach((t) => pc.addTrack(t, micStream));
      dc = pc.createDataChannel('oai-events');
      dc.onopen = configureSession;
      dc.onmessage = (e) => { let d; try { d = JSON.parse(e.data); } catch (_) { return; } handleEvent(d); };
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      const resp = await fetch('https://api.openai.com/v1/realtime?model=' + encodeURIComponent(model), {
        method: 'POST', body: offer.sdp,
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/sdp', 'OpenAI-Beta': 'realtime=v1' }
      });
      const answer = await resp.text();
      if (!resp.ok) throw new Error('SDP exchange failed');
      await pc.setRemoteDescription({ type: 'answer', sdp: answer });
      active = true; setChip('live');
      say('assistant', "I'm listening — tell me what you'd like to change.");
    } catch (e) {
      stop(); say('assistant', "Voice setup failed: " + e.message + '. Type or use the camera instead.');
    }
  }

  function stop() {
    active = false; setChip('idle');
    try { if (dc) dc.close(); } catch (_) {}
    try { if (pc) pc.close(); } catch (_) {}
    if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
    if (audioEl) { audioEl.remove(); audioEl = null; }
    pc = null; dc = null;
  }

  window.toggleAriaVoice = function () {
    if (!navigator.mediaDevices || !window.RTCPeerConnection) { say('assistant', 'This browser does not support live voice.'); return; }
    if (active) stop(); else start();
  };
  window.ariaVoiceIsActive = () => active;
})();
