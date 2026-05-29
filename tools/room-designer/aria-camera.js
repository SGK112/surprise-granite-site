/*
 * aria-camera.js — live camera capture for the Aria design chat, split out of
 * the index.html monolith. Feeds JPEG frames into the chat via three globals
 * the main script exposes: aiChatAttachDataUrl(du)->bool, aiChatPendingCount(),
 * sendAIChatMessage(). Snap a few angles -> scan -> clarifying questions.
 */
(function () {
  'use strict';

  let stream = null;
  let facing = 'environment'; // rear by default; flips to 'user' (selfie)
  let overlay = null;
  const MAX_DIM = 1568;       // matches the vision pipeline downscale

  async function startStream() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
    } catch (err) {
      // No camera / denied — fall back to the file picker so the user isn't stuck.
      closeOverlay();
      alert('Could not open the camera (' + (err && err.name ? err.name : 'error') +
        '). You can upload photos instead.');
      const fi = document.getElementById('aiChatFileInput');
      if (fi) fi.click();
      return false;
    }
    if (!overlay) return false;
    const video = overlay.querySelector('video');
    video.srcObject = stream;
    try { await video.play(); } catch (_) {}
    return true;
  }

  function stopStream() {
    if (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
    }
  }

  function captureFrame() {
    const video = overlay && overlay.querySelector('video');
    if (!video || !video.videoWidth) return;
    const scale = Math.min(1, MAX_DIM / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    const attached = typeof window.aiChatAttachDataUrl === 'function'
      ? window.aiChatAttachDataUrl(dataUrl) : false;
    if (!attached) { markFull(); return; }

    const strip = overlay.querySelector('#aiCamStrip');
    const thumb = document.createElement('img');
    thumb.src = dataUrl;
    thumb.style.cssText = 'height:54px;border-radius:6px;border:2px solid #7C3AED;flex:0 0 auto;';
    strip.appendChild(thumb);

    const count = typeof window.aiChatPendingCount === 'function'
      ? window.aiChatPendingCount() : strip.children.length;
    const done = overlay.querySelector('#aiCamDone');
    done.textContent = count >= 4 ? 'Analyze (max 4)' : 'Analyze ' + count;
    if (count >= 4) markFull();
  }

  function markFull() {
    const shot = overlay && overlay.querySelector('#aiCamShot');
    if (shot) { shot.disabled = true; shot.style.opacity = '0.4'; }
  }

  async function flipCamera() {
    facing = facing === 'environment' ? 'user' : 'environment';
    stopStream();
    await startStream();
  }

  function finish() {
    const count = typeof window.aiChatPendingCount === 'function' ? window.aiChatPendingCount() : 0;
    closeOverlay();
    if (count > 0 && typeof window.sendAIChatMessage === 'function') {
      window.sendAIChatMessage();
    }
  }

  function buildOverlay() {
    const el = document.createElement('div');
    el.id = 'aiCameraOverlay';
    el.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#000;display:flex;flex-direction:column;';
    el.innerHTML =
      '<video autoplay playsinline muted style="flex:1;min-height:0;width:100%;object-fit:cover;background:#000;"></video>' +
      '<div style="position:absolute;top:14px;left:0;right:0;text-align:center;color:#fff;font-size:13px;pointer-events:none;text-shadow:0 1px 3px #000;">Snap a few angles of the room, then tap Analyze</div>' +
      '<button id="aiCamClose" title="Close" style="position:absolute;top:12px;right:14px;background:rgba(0,0,0,.5);color:#fff;border:0;border-radius:50%;width:36px;height:36px;font-size:18px;cursor:pointer;">×</button>' +
      '<div id="aiCamStrip" style="display:flex;gap:6px;padding:8px;overflow-x:auto;background:#111;"></div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;background:#111;">' +
        '<button id="aiCamFlip" style="background:#222;color:#fff;border:0;border-radius:8px;padding:10px 14px;font-size:14px;cursor:pointer;">↺ Flip</button>' +
        '<button id="aiCamShot" title="Capture" style="width:64px;height:64px;border-radius:50%;border:4px solid #fff;background:#7C3AED;cursor:pointer;"></button>' +
        '<button id="aiCamDone" style="background:#10B981;color:#fff;border:0;border-radius:8px;padding:10px 16px;font-weight:600;font-size:14px;cursor:pointer;">Analyze</button>' +
      '</div>';
    document.body.appendChild(el);
    el.querySelector('#aiCamShot').onclick = captureFrame;
    el.querySelector('#aiCamFlip').onclick = flipCamera;
    el.querySelector('#aiCamDone').onclick = finish;
    el.querySelector('#aiCamClose').onclick = closeOverlay;
    return el;
  }

  function closeOverlay() {
    stopStream();
    if (overlay) { overlay.remove(); overlay = null; }
  }

  // Public entry point — wired to the chat's 📸 buttons.
  window.openAiChatCamera = async function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const fi = document.getElementById('aiChatFileInput'); // no camera API — upload instead
      if (fi) fi.click();
      return;
    }
    if (overlay) return; // already open
    overlay = buildOverlay();
    const ok = await startStream();
    if (!ok) closeOverlay();
  };
})();
