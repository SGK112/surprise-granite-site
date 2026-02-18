/**
 * Slab Layout Overlay Module v3.0
 * Full-screen countertop-to-slab layout planner with drag-and-drop.
 *
 * - Uses actual countertop texture image as slab background
 * - Click-and-drag pieces on the slab canvas
 * - Auto-generates lamination strips, backsplash, waterfall panels
 * - Material-aware slab sizing with vein direction constraints
 * - Multi-slab tabs with auto-distribution
 * - Interactive seam placement
 * - Prominent slab count, edge profile, and yield display
 * - PDF cut sheet export
 *
 * @version 3.0.0
 * @author Surprise Granite
 */
(function(window) {
  'use strict';

  // =====================================================================
  // CONFIGURATION
  // =====================================================================
  const CONFIG = {
    slabSizes: {
      jumbo:    { width: 130, height: 68, label: 'Jumbo (130" x 68")' },
      standard: { width: 120, height: 60, label: 'Standard (120" x 60")' },
      medium:   { width: 110, height: 55, label: 'Medium (110" x 55")' },
      small:    { width: 96,  height: 48, label: 'Small (96" x 48")' }
    },
    materialSlabSizes: {
      granite:    { width: 115, height: 68, label: 'Granite (115" x 68")' },
      quartzite:  { width: 120, height: 65, label: 'Quartzite (120" x 65")' },
      marble:     { width: 110, height: 65, label: 'Marble (110" x 65")' },
      quartz:     { width: 126, height: 63, label: 'Quartz (126" x 63")' },
      porcelain:  { width: 126, height: 63, label: 'Porcelain (126" x 63")' },
      calacatta:  { width: 110, height: 65, label: 'Calacatta (110" x 65")' },
      sintered:   { width: 126, height: 63, label: 'Sintered (126" x 63")' },
      dekton:     { width: 126, height: 56, label: 'Dekton (126" x 56")' },
      soapstone:  { width: 84,  height: 36, label: 'Soapstone (84" x 36")' }
    },
    bladeKerf: 0.125,
    minGap: 0.25,
    gridSpacing: 12,
    veinLineSpacing: 20,
    standardDepth: 25.5,
    counterHeight: 34.5,
    laminationStripWidth: 1.5,
    minZoom: 0.3,
    maxZoom: 6,
    optimizationStep: 1,
    laminationProfiles: ['ogee', 'double-ogee', 'dupont', 'full-bullnose', 'cove', 'mitered'],
    colors: {
      countertop:       'rgba(99, 102, 241, 0.55)',
      countertopSel:    'rgba(99, 102, 241, 0.85)',
      countertopBorder: '#818cf8',
      lamination:       'rgba(245, 158, 11, 0.55)',
      laminationSel:    'rgba(245, 158, 11, 0.85)',
      laminationBorder: '#fbbf24',
      backsplash:       'rgba(20, 184, 166, 0.55)',
      backsplashSel:    'rgba(20, 184, 166, 0.85)',
      backsplashBorder: '#2dd4bf',
      waterfall:        'rgba(168, 85, 247, 0.55)',
      waterfallSel:     'rgba(168, 85, 247, 0.85)',
      waterfallBorder:  '#c084fc',
      seam:             '#ef4444',
      seamWarn:         '#f59e0b',
      kerf:             'rgba(239, 68, 68, 0.45)',
      vein:             'rgba(255,255,255,0.25)',
      grid:             'rgba(255,255,255,0.08)',
      bg:               '#0f172a',
      slabBorder:       '#6366f1'
    },
    yieldThresholds: { excellent: 85, good: 70 },
    veinConstraints: {
      marble: 'strict', calacatta: 'strict', quartzite: 'strict',
      granite: 'preferred',
      quartz: 'none', porcelain: 'none', sintered: 'none', dekton: 'none', soapstone: 'none'
    }
  };

  // =====================================================================
  // STATE
  // =====================================================================
  const state = {
    isActive: false,
    slabs: [],          // Array of { number, pieces[], image, imageUrl, dimensions }
    activeSlabIdx: 0,
    pieces: [],         // Pieces on the active slab
    allPieces: [],      // All generated pieces (before distribution)
    selectedPiece: null,
    slabDims: { width: 120, height: 60 },
    slabImage: null,
    slabImageUrl: null,
    textureUrl: null,   // From countertop element
    scale: 1,
    panX: 0, panY: 0,
    isDragging: false, isPanning: false,
    panStart: { x: 0, y: 0 },
    dragOffset: { x: 0, y: 0 },
    showGrid: true,
    showVeinGuide: false,
    showKerf: true,
    veinAngle: 0,
    materialType: null,
    materialName: null,
    veinConstraint: 'none',
    currentTool: 'select',
    canvasSize: { width: 0, height: 0 },
    inventory: [],
    seams: []
  };

  let canvas, ctx, overlay;

  // =====================================================================
  // INITIALIZATION — builds a single full-screen overlay
  // =====================================================================
  function init() {
    if (document.getElementById('slabLayoutOverlay')) return;
    buildOverlay();
    bindCanvasEvents();
    bindKeyboardEvents();
    if (state.slabs.length === 0) state.slabs.push(newSlab(1));
    console.log('SlabLayout v3 initialized');
  }

  function newSlab(num) {
    return { number: num, pieces: [], image: null, imageUrl: null, dimensions: { ...state.slabDims } };
  }

  // =====================================================================
  // BUILD OVERLAY DOM
  // =====================================================================
  function buildOverlay() {
    overlay = document.createElement('div');
    overlay.id = 'slabLayoutOverlay';
    overlay.className = 'sl-overlay sl-hidden';
    overlay.innerHTML = `
      <!-- SIDEBAR -->
      <div class="sl-sidebar" id="slSidebar">
        <div class="sl-sidebar-header">
          <h3>Slab Layout</h3>
          <button class="sl-close-btn" onclick="SlabLayout.close()" title="Close">&times;</button>
        </div>
        <div class="sl-sidebar-scroll">

          <!-- Slab Count Banner -->
          <div class="sl-slab-count-banner" id="slSlabCountBanner">
            <span class="sl-slab-count-num" id="slSlabCountNum">1</span>
            <span class="sl-slab-count-label">Slab(s) Required</span>
          </div>

          <!-- Material -->
          <div class="sl-section">
            <div class="sl-section-title">Material</div>
            <select id="slMaterialSelect" class="sl-select" onchange="SlabLayout.setMaterial(this.value)">
              <option value="">Auto-detect</option>
              <option value="granite">Granite (115" x 68")</option>
              <option value="marble">Marble (110" x 65")</option>
              <option value="quartz">Quartz (126" x 63")</option>
              <option value="quartzite">Quartzite (120" x 65")</option>
              <option value="porcelain">Porcelain (126" x 63")</option>
              <option value="calacatta">Calacatta (110" x 65")</option>
              <option value="dekton">Dekton (126" x 56")</option>
              <option value="soapstone">Soapstone (84" x 36")</option>
            </select>
            <div id="slVeinInfo" class="sl-vein-badge" style="display:none"></div>
          </div>

          <!-- Slab Dimensions -->
          <div class="sl-section">
            <div class="sl-section-title">Slab Size</div>
            <div class="sl-dim-row">
              <div class="sl-dim-input">
                <label>W</label>
                <input type="number" id="slSlabW" value="120" min="24" max="200" onchange="SlabLayout.updateSlabSize()">
                <span>"</span>
              </div>
              <span class="sl-dim-x">&times;</span>
              <div class="sl-dim-input">
                <label>H</label>
                <input type="number" id="slSlabH" value="60" min="24" max="120" onchange="SlabLayout.updateSlabSize()">
                <span>"</span>
              </div>
            </div>
          </div>

          <!-- Slab Tabs -->
          <div class="sl-section">
            <div class="sl-section-title">Slabs</div>
            <div class="sl-tab-bar" id="slTabBar"></div>
          </div>

          <!-- Import / Add -->
          <div class="sl-section">
            <div class="sl-section-title">Pieces</div>
            <div class="sl-btn-row">
              <button class="sl-btn sl-btn-accent" onclick="SlabLayout.importFromDesign()">Import from Design</button>
              <button class="sl-btn sl-btn-ghost" onclick="SlabLayout.addPieceManually()">+ Add</button>
            </div>
          </div>

          <!-- Piece List -->
          <div class="sl-section sl-piece-list-section">
            <div id="slPieceList" class="sl-piece-list">
              <p class="sl-empty">No pieces. Import from design or add manually.</p>
            </div>
          </div>

          <!-- Seam Info -->
          <div class="sl-section">
            <div class="sl-section-title">Seams</div>
            <div id="slSeamInfo" class="sl-seam-info">
              <p class="sl-empty">No seams detected.</p>
            </div>
          </div>

          <!-- Vein / Kerf toggles -->
          <div class="sl-section">
            <div class="sl-section-title">Display</div>
            <label class="sl-check"><input type="checkbox" checked onchange="SlabLayout.toggleGrid(this.checked)"> Grid</label>
            <label class="sl-check"><input type="checkbox" onchange="SlabLayout.toggleVeinGuide(this.checked)"> Vein guide</label>
            <label class="sl-check"><input type="checkbox" checked onchange="SlabLayout.toggleKerf(this.checked)"> Blade kerf</label>
            <div id="slVeinAngleRow" class="sl-vein-angle-row" style="display:none">
              <label>Vein angle</label>
              <input type="range" min="0" max="180" value="0" oninput="SlabLayout.setVeinAngle(this.value)">
              <span id="slVeinAngleLbl">0&deg;</span>
            </div>
          </div>

          <!-- Yield -->
          <div class="sl-section sl-stats-section">
            <div class="sl-section-title">Yield</div>
            <div class="sl-stats-grid">
              <div class="sl-stat"><span id="slStatSlab">50.0</span><small>Slab ft&sup2;</small></div>
              <div class="sl-stat"><span id="slStatUsed">0.0</span><small>Used ft&sup2;</small></div>
              <div class="sl-stat"><span id="slStatWaste">50.0</span><small>Waste ft&sup2;</small></div>
              <div class="sl-stat sl-stat-hl"><span id="slStatYield">0%</span><small>Yield</small></div>
            </div>
            <div class="sl-yield-bar"><div class="sl-yield-fill" id="slYieldBar"></div></div>
            <p class="sl-yield-note" id="slYieldNote">Import pieces to see yield.</p>
          </div>

          <!-- Actions -->
          <div class="sl-section">
            <button class="sl-btn sl-btn-primary sl-btn-full" onclick="SlabLayout.autoOptimize()">Auto-Optimize Layout</button>
            <button class="sl-btn sl-btn-secondary sl-btn-full" onclick="SlabLayout.generateCutSheet()" style="margin-top:6px">Export Cut Sheet PDF</button>
          </div>
        </div>
      </div>

      <!-- CANVAS AREA -->
      <div class="sl-canvas-area" id="slCanvasArea">
        <div class="sl-canvas-toolbar">
          <button class="sl-tool active" data-tool="select" onclick="SlabLayout.setTool('select')" title="Select/Move (V)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>
          </button>
          <button class="sl-tool" data-tool="seam" onclick="SlabLayout.setTool('seam')" title="Add Seam (S)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="22"/></svg>
          </button>
          <div class="sl-tool-sep"></div>
          <button class="sl-tool" onclick="SlabLayout.zoomIn()" title="Zoom In (+)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          </button>
          <button class="sl-tool" onclick="SlabLayout.zoomOut()" title="Zoom Out (-)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          </button>
          <button class="sl-tool" onclick="SlabLayout.fitToView()" title="Fit (F)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>
          </button>
          <div class="sl-tool-sep"></div>
          <span class="sl-canvas-info" id="slZoomLbl">100%</span>
          <span class="sl-canvas-info" id="slCursorLbl">0", 0"</span>
        </div>
        <canvas id="slCanvas"></canvas>
        <div class="sl-legend">
          <span><i class="sl-leg-sq" style="background:${CONFIG.colors.countertop}"></i>Countertop</span>
          <span><i class="sl-leg-sq" style="background:${CONFIG.colors.lamination}"></i>Lamination</span>
          <span><i class="sl-leg-sq" style="background:${CONFIG.colors.backsplash}"></i>Backsplash</span>
          <span><i class="sl-leg-sq" style="background:${CONFIG.colors.waterfall}"></i>Waterfall</span>
          <span><i class="sl-leg-sq" style="background:${CONFIG.colors.seam}"></i>Seam</span>
          <span><i class="sl-leg-sq" style="background:${CONFIG.colors.kerf}"></i>Kerf</span>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    canvas = document.getElementById('slCanvas');
    ctx = canvas.getContext('2d');
  }

  // =====================================================================
  // EVENT BINDING
  // =====================================================================
  function bindCanvasEvents() {
    if (!canvas) return;
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDblClick);
    // Touch events for mobile
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    // Auto-resize canvas when container changes size
    if (typeof ResizeObserver !== 'undefined') {
      const area = document.getElementById('slCanvasArea');
      if (area) {
        new ResizeObserver(() => { if (state.isActive) { resizeCanvas(); render(); } }).observe(area);
      }
    }
  }

  function bindKeyboardEvents() {
    // Use overlay-level capture to intercept keys before the room designer
    if (overlay) {
      overlay.addEventListener('keydown', onKeyDown, true);
      overlay.setAttribute('tabindex', '-1');
    }
    // Fallback on document for when overlay doesn't have focus
    document.addEventListener('keydown', onKeyDown);
  }

  function resizeCanvas() {
    const area = document.getElementById('slCanvasArea');
    if (!area || !canvas) return;
    const w = area.clientWidth;
    const h = area.clientHeight - 40 - 28; // toolbar + legend
    if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  // =====================================================================
  // CANVAS INTERACTIONS
  // =====================================================================
  function toSlab(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - state.panX) / state.scale,
      y: (e.clientY - r.top - state.panY) / state.scale
    };
  }

  function hitTest(sx, sy) {
    for (let i = state.pieces.length - 1; i >= 0; i--) {
      const p = state.pieces[i];
      if (sx >= p.x && sx <= p.x + p.width && sy >= p.y && sy <= p.y + p.height) return p;
    }
    return null;
  }

  function onMouseDown(e) {
    const s = toSlab(e);

    if (state.currentTool === 'seam') {
      // Place a vertical seam line at click position
      if (s.x > 0 && s.x < state.slabDims.width && s.y >= 0 && s.y <= state.slabDims.height) {
        state.seams.push({ x: Math.round(s.x), y1: 0, y2: state.slabDims.height });
        updateSeamInfo();
        render();
        showToast(`Seam placed at ${Math.round(s.x)}" from left`, 'success');
      }
      return;
    }

    const hit = hitTest(s.x, s.y);
    if (hit) {
      state.selectedPiece = hit;
      state.isDragging = true;
      state.dragOffset = { x: s.x - hit.x, y: s.y - hit.y };
      canvas.style.cursor = 'grabbing';
    } else {
      state.selectedPiece = null;
      state.isPanning = true;
      state.panStart = { x: e.clientX - state.panX, y: e.clientY - state.panY };
      canvas.style.cursor = 'grab';
    }
    render();
    updatePieceList();
  }

  function snapToGrid(val) {
    return Math.round(val * 4) / 4; // snap to nearest 0.25"
  }

  function onMouseMove(e) {
    const s = toSlab(e);
    const lbl = document.getElementById('slCursorLbl');
    if (lbl) lbl.textContent = `${s.x.toFixed(1)}", ${s.y.toFixed(1)}"`;

    if (state.isDragging && state.selectedPiece) {
      const p = state.selectedPiece;
      p.x = snapToGrid(s.x - state.dragOffset.x);
      p.y = snapToGrid(s.y - state.dragOffset.y);
      p.x = Math.max(0, Math.min(state.slabDims.width - p.width, p.x));
      p.y = Math.max(0, Math.min(state.slabDims.height - p.height, p.y));
      render();
    } else if (state.isPanning) {
      state.panX = e.clientX - state.panStart.x;
      state.panY = e.clientY - state.panStart.y;
      render();
    } else {
      canvas.style.cursor = hitTest(s.x, s.y) ? 'grab' : 'default';
    }
  }

  function onMouseUp() {
    if (state.isDragging) {
      checkOverlaps();
      updateStats();
      savePiecesToSlab();
    }
    state.isDragging = false;
    state.isPanning = false;
    canvas.style.cursor = 'default';
  }

  function onWheel(e) {
    e.preventDefault();
    const d = e.deltaY > 0 ? 0.9 : 1.1;
    const ns = Math.max(CONFIG.minZoom, Math.min(CONFIG.maxZoom, state.scale * d));
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    state.panX = mx - (mx - state.panX) * (ns / state.scale);
    state.panY = my - (my - state.panY) * (ns / state.scale);
    state.scale = ns;
    const zl = document.getElementById('slZoomLbl');
    if (zl) zl.textContent = Math.round(ns * 100) + '%';
    render();
  }

  function onDblClick(e) {
    const s = toSlab(e);
    const hit = hitTest(s.x, s.y);
    if (hit) rotatePiece(hit, 90);
  }

  // --- Touch Events ---
  let lastTouchDist = 0;
  function onTouchStart(e) {
    e.preventDefault();
    if (e.touches.length === 2) {
      lastTouchDist = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
      return;
    }
    const touch = e.touches[0];
    onMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
  }
  function onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 2) {
      const dist = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
      if (lastTouchDist > 0) {
        const factor = dist / lastTouchDist;
        state.scale = Math.max(CONFIG.minZoom, Math.min(CONFIG.maxZoom, state.scale * factor));
        setText('slZoomLbl', Math.round(state.scale * 100) + '%');
        render();
      }
      lastTouchDist = dist;
      return;
    }
    const touch = e.touches[0];
    onMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
  }
  function onTouchEnd(e) {
    lastTouchDist = 0;
    onMouseUp();
  }

  function onKeyDown(e) {
    if (!state.isActive) return;
    const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;
    if (inInput) return;

    let handled = false;

    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedPiece) {
      removePiece(state.selectedPiece);
      state.selectedPiece = null;
      render(); updatePieceList(); updateStats();
      handled = true;
    } else if (e.key === 'r' || e.key === 'R') {
      if (state.selectedPiece) rotatePiece(state.selectedPiece, 90);
      handled = true;
    } else if (e.key === 'Escape') {
      if (state.selectedPiece) { state.selectedPiece = null; render(); updatePieceList(); }
      else close();
      handled = true;
    } else if (e.key === 'f' || e.key === 'F') {
      fitToView();
      handled = true;
    } else if (e.key === 'v' || e.key === 'V') {
      setTool('select');
      handled = true;
    } else if (e.key === 's') {
      // Lowercase 's' = seam tool (prevents room designer's S handler)
      setTool('seam');
      handled = true;
    } else if (e.key === '+' || e.key === '=') {
      zoomIn();
      handled = true;
    } else if (e.key === '-') {
      zoomOut();
      handled = true;
    }

    if (handled) {
      e.stopImmediatePropagation(); // prevent room designer handlers from also firing
      e.preventDefault();
    }
  }

  // =====================================================================
  // MATERIAL & SLAB SIZING
  // =====================================================================
  function detectMaterial() {
    if (state.materialType) return state.materialType;
    if (typeof currentMaterialCategory !== 'undefined' && currentMaterialCategory) {
      const c = currentMaterialCategory.toLowerCase();
      if (CONFIG.materialSlabSizes[c]) return c;
    }
    if (typeof elements !== 'undefined' && Array.isArray(elements)) {
      const ctTypes = ['countertop','countertop-l','countertop-u','countertop-corner','island','bar-top'];
      const ct = elements.find(el => ctTypes.includes(el.type));
      if (ct) {
        const m = (ct.texture || ct.materialName || '').toLowerCase();
        if (m.includes('marble') || m.includes('calacatta')) return 'marble';
        if (m.includes('quartzite')) return 'quartzite';
        if (m.includes('granite')) return 'granite';
        if (m.includes('quartz')) return 'quartz';
        if (m.includes('porcelain')) return 'porcelain';
        if (m.includes('dekton')) return 'dekton';
        if (m.includes('soapstone')) return 'soapstone';
      }
    }
    return null;
  }

  function detectTextureUrl() {
    if (typeof elements === 'undefined' || !Array.isArray(elements)) return null;
    const ctTypes = ['countertop','countertop-l','countertop-u','countertop-corner','island','bar-top'];
    for (const el of elements) {
      if (!ctTypes.includes(el.type)) continue;
      if (el.texture) return el.texture;
      if (el.textureImg && el.textureImg.src) return el.textureImg.src;
      if (el.storeProduct && el.storeProduct.image) return el.storeProduct.image;
    }
    return null;
  }

  function setMaterial(val) {
    state.materialType = val || null;
    const sz = val ? CONFIG.materialSlabSizes[val] : null;
    if (sz) {
      state.slabDims = { width: sz.width, height: sz.height };
      state.slabs.forEach(s => s.dimensions = { width: sz.width, height: sz.height });
      const wi = document.getElementById('slSlabW');
      const hi = document.getElementById('slSlabH');
      if (wi) wi.value = sz.width;
      if (hi) hi.value = sz.height;
    }
    state.veinConstraint = CONFIG.veinConstraints[val] || 'none';
    // Update vein info badge
    const badge = document.getElementById('slVeinInfo');
    if (badge) {
      if (state.veinConstraint === 'strict') {
        badge.style.display = 'block';
        badge.className = 'sl-vein-badge sl-vein-strict';
        badge.textContent = 'Strict vein: 90\u00B0 rotation blocked';
      } else if (state.veinConstraint === 'preferred') {
        badge.style.display = 'block';
        badge.className = 'sl-vein-badge sl-vein-preferred';
        badge.textContent = 'Preferred vein: 90\u00B0 rotation warned';
      } else {
        badge.style.display = 'none';
      }
    }
    render(); updateStats();
  }

  function updateSlabSize() {
    const w = parseInt(document.getElementById('slSlabW')?.value) || 120;
    const h = parseInt(document.getElementById('slSlabH')?.value) || 60;
    state.slabDims = { width: w, height: h };
    const slab = state.slabs[state.activeSlabIdx];
    if (slab) slab.dimensions = { width: w, height: h };
    render(); updateStats();
  }

  // =====================================================================
  // PIECE GENERATION PIPELINE
  // =====================================================================
  function getVeinConstraint(mat) {
    if (!mat) return state.veinConstraint || 'none';
    const m = mat.toLowerCase();
    if (m.includes('marble') || m.includes('calacatta')) return 'strict';
    if (m.includes('quartzite')) return 'strict';
    if (m.includes('granite')) return 'preferred';
    return CONFIG.veinConstraints[m] || 'none';
  }

  function needsLamination(profile, thickness) {
    return thickness === '2cm' && CONFIG.laminationProfiles.includes(profile);
  }

  function getExposedEdges(el) {
    const thresh = 0.3;
    const ppf = (typeof pixelsPerFoot !== 'undefined') ? pixelsPerFoot : 40;
    const rw = (typeof roomWidth !== 'undefined') ? roomWidth : 20;
    const rd = (typeof roomDepth !== 'undefined') ? roomDepth : 16;
    const ex = el.x / ppf, ey = el.y / ppf;
    return {
      front: (rd - (ey + el.height)) >= thresh,
      back:  ey >= thresh,
      left:  ex >= thresh,
      right: (rw - (ex + el.width)) >= thresh
    };
  }

  function generateAllPieces(elems) {
    if (!elems || !Array.isArray(elems)) return [];
    const pieces = [];
    let id = 1;
    const mat = detectMaterial();
    const vc = getVeinConstraint(mat);
    const ctTypes = ['countertop','countertop-l','countertop-u','countertop-corner','island','bar-top'];
    const countertops = elems.filter(el => ctTypes.includes(el.type));

    countertops.forEach(ct => {
      const wIn = ct.width * 12;
      const dIn = ct.height * 12;
      const thick = ct.thickness || '3cm';
      const edge = ct.edgeProfile || 'eased';
      const label = ct.label || ct.type;
      const exposed = getExposedEdges(ct);
      const wfSides = ct.waterfallSides || [];
      const bsObj = ct.backsplash;
      const bsHeight = bsObj ? (bsObj.height || 0) : 0;

      // Build base rectangles
      let rects = [];
      if (ct.type === 'countertop-l') {
        rects.push({ label: label + ' - Long', width: wIn, height: CONFIG.standardDepth, pid: ct.id });
        rects.push({ label: label + ' - Short', width: CONFIG.standardDepth, height: dIn - CONFIG.standardDepth, pid: ct.id });
      } else if (ct.type === 'countertop-u') {
        rects.push({ label: label + ' - Left', width: CONFIG.standardDepth, height: dIn, pid: ct.id });
        rects.push({ label: label + ' - Back', width: wIn - CONFIG.standardDepth * 2, height: CONFIG.standardDepth, pid: ct.id });
        rects.push({ label: label + ' - Right', width: CONFIG.standardDepth, height: dIn, pid: ct.id });
      } else {
        rects.push({ label: label, width: wIn, height: dIn, pid: ct.id });
      }

      // Split by seams
      const seams = ct.seams || [];
      let split = [];
      rects.forEach(r => {
        if (seams.length > 0 && r.width === wIn) {
          let last = 0;
          seams.forEach((sm, si) => {
            const pw = (sm.position - last) * r.width;
            split.push({ ...r, label: r.label + ' #' + (si + 1), width: pw });
            last = sm.position;
          });
          split.push({ ...r, label: r.label + ' #' + (seams.length + 1), width: (1 - last) * r.width });
        } else {
          split.push(r);
        }
      });

      // Auto-split oversized
      const sw = state.slabDims.width, sh = state.slabDims.height;
      let final = [];
      split.forEach(r => {
        const fN = r.width <= sw && r.height <= sh;
        const fR = r.height <= sw && r.width <= sh;
        if (!fN && !fR) {
          if (r.width > sw) {
            final.push({ ...r, label: r.label + 'A', width: r.width / 2 });
            final.push({ ...r, label: r.label + 'B', width: r.width / 2 });
          } else {
            final.push({ ...r, label: r.label + 'A', height: r.height / 2 });
            final.push({ ...r, label: r.label + 'B', height: r.height / 2 });
          }
        } else {
          final.push(r);
        }
      });

      // Generate pieces
      final.forEach((r, ri) => {
        const w = Math.round(r.width * 100) / 100;
        const h = Math.round(r.height * 100) / 100;

        // Countertop piece
        pieces.push({
          id: id++, label: r.label, type: 'countertop',
          width: w, height: h, x: 0, y: 0,
          parentId: r.pid, edgeProfile: edge, thickness: thick,
          veinConstraint: vc, rotation: 0
        });

        // Lamination strips
        if (needsLamination(edge, thick)) {
          const stripH = edge === 'mitered' ? (thick === '2cm' ? 0.78 : 1.18) : CONFIG.laminationStripWidth;
          if (exposed.front) {
            pieces.push({ id: id++, label: 'LAM ' + r.label + ' (front)', type: 'lamination',
              width: w, height: stripH, x: 0, y: 0, parentId: r.pid,
              edgeProfile: edge, thickness: thick, veinConstraint: vc, rotation: 0 });
          }
          if (exposed.left) {
            pieces.push({ id: id++, label: 'LAM ' + r.label + ' (left)', type: 'lamination',
              width: h, height: stripH, x: 0, y: 0, parentId: r.pid,
              edgeProfile: edge, thickness: thick, veinConstraint: vc, rotation: 0 });
          }
          if (exposed.right) {
            pieces.push({ id: id++, label: 'LAM ' + r.label + ' (right)', type: 'lamination',
              width: h, height: stripH, x: 0, y: 0, parentId: r.pid,
              edgeProfile: edge, thickness: thick, veinConstraint: vc, rotation: 0 });
          }
        }

        // Backsplash
        if (bsHeight > 0) {
          pieces.push({ id: id++, label: 'BS ' + r.label, type: 'backsplash',
            width: w, height: bsHeight, x: 0, y: 0, parentId: r.pid,
            edgeProfile: 'eased', thickness: thick, veinConstraint: vc, rotation: 0 });
        }

        // Waterfall
        if (wfSides.includes('left') && ri === 0) {
          pieces.push({ id: id++, label: 'WF ' + label + ' (left)', type: 'waterfall',
            width: CONFIG.counterHeight, height: h, x: 0, y: 0, parentId: ct.id,
            edgeProfile: 'eased', thickness: thick, veinConstraint: vc, rotation: 0 });
        }
        if (wfSides.includes('right') && ri === final.length - 1) {
          pieces.push({ id: id++, label: 'WF ' + label + ' (right)', type: 'waterfall',
            width: CONFIG.counterHeight, height: h, x: 0, y: 0, parentId: ct.id,
            edgeProfile: 'eased', thickness: thick, veinConstraint: vc, rotation: 0 });
        }
      });
    });

    return pieces;
  }

  // =====================================================================
  // IMPORT FROM DESIGN
  // =====================================================================
  function importFromDesign() {
    if (typeof elements === 'undefined' || !Array.isArray(elements)) {
      showToast('No design elements found. Create a room design first.', 'warning');
      return;
    }

    // Detect material & set
    const mat = detectMaterial();
    if (mat) {
      setMaterial(mat);
      const sel = document.getElementById('slMaterialSelect');
      if (sel) sel.value = mat;
    }

    // Load texture as slab background
    const texUrl = detectTextureUrl();
    if (texUrl) {
      loadSlabImageFromUrl(texUrl);
    }

    // Generate pieces
    const newPieces = generateAllPieces(elements);
    if (newPieces.length === 0) {
      showToast('No countertop elements found in design.', 'warning');
      return;
    }

    state.allPieces = newPieces;

    // Collect seams from elements
    state.seams = [];
    const ctTypes = ['countertop','countertop-l','countertop-u','countertop-corner','island','bar-top'];
    elements.filter(el => ctTypes.includes(el.type)).forEach(el => {
      if (el.seams && el.seams.length > 0) {
        const wIn = el.width * 12;
        el.seams.forEach(sm => {
          state.seams.push({ x: Math.round(sm.position * wIn), y1: 0, y2: state.slabDims.height });
        });
      }
    });

    // Distribute across slabs
    distributeAllPieces(newPieces);

    const counts = { countertop: 0, lamination: 0, backsplash: 0, waterfall: 0 };
    newPieces.forEach(p => counts[p.type] = (counts[p.type] || 0) + 1);

    let msg = `${counts.countertop} countertop`;
    if (counts.lamination) msg += `, ${counts.lamination} lamination`;
    if (counts.backsplash) msg += `, ${counts.backsplash} backsplash`;
    if (counts.waterfall) msg += `, ${counts.waterfall} waterfall`;
    showToast('Imported: ' + msg, 'success');

    render(); updatePieceList(); updateStats(); updateSlabTabs(); updateSeamInfo();
  }

  function loadSlabImageFromUrl(url) {
    state.textureUrl = url;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      state.slabImage = img;
      state.slabImageUrl = url;
      state.slabs.forEach(s => { s.image = img; s.imageUrl = url; });
      render();
    };
    img.onerror = () => { state.slabImage = null; render(); };
    img.src = url;
  }

  // =====================================================================
  // PIECE MANAGEMENT
  // =====================================================================
  function addPieceManually() {
    const w = prompt('Width (inches):', '36');
    const h = prompt('Depth (inches):', String(CONFIG.standardDepth));
    const l = prompt('Label:', 'Piece ' + (state.pieces.length + 1));
    if (!w || !h) return;
    const pw = parseFloat(w), ph = parseFloat(h);
    if (isNaN(pw) || isNaN(ph) || pw <= 0 || ph <= 0) { showToast('Invalid dimensions', 'error'); return; }
    state.pieces.push({
      id: Date.now(), label: l || 'Piece', type: 'countertop',
      width: pw, height: ph, x: CONFIG.minGap, y: CONFIG.minGap,
      parentId: null, edgeProfile: 'eased', thickness: '3cm',
      veinConstraint: state.veinConstraint, rotation: 0
    });
    savePiecesToSlab();
    render(); updatePieceList(); updateStats();
  }

  function removePiece(piece) {
    const i = state.pieces.indexOf(piece);
    if (i > -1) { state.pieces.splice(i, 1); savePiecesToSlab(); showToast('Piece removed', 'info'); }
  }

  function rotatePiece(piece, deg) {
    const vc = piece.veinConstraint || state.veinConstraint;
    if ((deg === 90 || deg === 270) && vc === 'strict') {
      showToast('90\u00B0 rotation blocked: strict vein matching for this material', 'warning');
      return;
    }
    if ((deg === 90 || deg === 270) && vc === 'preferred') {
      showToast('Warning: 90\u00B0 rotation may disrupt vein direction', 'warning');
    }
    if (deg === 90 || deg === 270) {
      const t = piece.width; piece.width = piece.height; piece.height = t;
    }
    piece.rotation = (piece.rotation + deg) % 360;
    piece.x = Math.max(0, Math.min(state.slabDims.width - piece.width, piece.x));
    piece.y = Math.max(0, Math.min(state.slabDims.height - piece.height, piece.y));
    savePiecesToSlab();
    render(); updatePieceList(); updateStats();
  }

  // =====================================================================
  // MULTI-SLAB
  // =====================================================================
  function savePiecesToSlab() {
    const slab = state.slabs[state.activeSlabIdx];
    if (slab) slab.pieces = state.pieces.map(p => ({ ...p }));
    updateSlabCount();
  }

  function switchSlab(idx) {
    if (idx < 0 || idx >= state.slabs.length) return;
    savePiecesToSlab();
    state.activeSlabIdx = idx;
    const slab = state.slabs[idx];
    state.pieces = slab.pieces ? slab.pieces.map(p => ({ ...p })) : [];
    state.slabImage = slab.image || null;
    state.slabDims = { ...slab.dimensions };
    const wi = document.getElementById('slSlabW');
    const hi = document.getElementById('slSlabH');
    if (wi) wi.value = state.slabDims.width;
    if (hi) hi.value = state.slabDims.height;
    state.selectedPiece = null;
    updateSlabTabs(); render(); updatePieceList(); updateStats();
  }

  function addSlab() {
    const n = state.slabs.length + 1;
    const s = newSlab(n);
    s.dimensions = { ...state.slabDims };
    s.image = state.slabImage;
    s.imageUrl = state.slabImageUrl;
    state.slabs.push(s);
    updateSlabTabs(); switchSlab(n - 1);
    showToast('Slab ' + n + ' added', 'success');
  }

  function distributeAllPieces(allPcs) {
    const pieces = allPcs.map(p => ({ ...p }));
    pieces.sort((a, b) => (b.width * b.height) - (a.width * a.height));

    state.slabs = [newSlab(1)];
    state.slabs[0].image = state.slabImage;
    state.slabs[0].imageUrl = state.slabImageUrl;
    state.slabs[0].dimensions = { ...state.slabDims };

    const sw = state.slabDims.width, sh = state.slabDims.height;
    const gap = CONFIG.minGap + CONFIG.bladeKerf;

    pieces.forEach(piece => {
      let placed = false;
      for (let si = 0; si < state.slabs.length; si++) {
        const pos = findPos(piece, state.slabs[si].pieces, sw, sh, gap);
        if (pos) {
          piece.x = pos.x; piece.y = pos.y;
          if (pos.rotated) {
            const t = piece.width; piece.width = piece.height; piece.height = t;
            piece.rotation = (piece.rotation + 90) % 360;
          }
          state.slabs[si].pieces.push(piece);
          placed = true; break;
        }
      }
      if (!placed) {
        const ns = newSlab(state.slabs.length + 1);
        ns.dimensions = { ...state.slabDims };
        ns.image = state.slabImage;
        ns.imageUrl = state.slabImageUrl;
        piece.x = CONFIG.minGap; piece.y = CONFIG.minGap;
        ns.pieces.push(piece);
        state.slabs.push(ns);
      }
    });

    state.activeSlabIdx = 0;
    state.pieces = state.slabs[0].pieces.map(p => ({ ...p }));
    updateSlabCount();
  }

  function findPos(piece, placed, sw, sh, gap) {
    const vc = piece.veinConstraint || state.veinConstraint;
    const step = CONFIG.optimizationStep;
    const orients = [{ w: piece.width, h: piece.height, rot: false }];
    if (vc !== 'strict') orients.push({ w: piece.height, h: piece.width, rot: true });

    for (const o of orients) {
      if (o.w > sw || o.h > sh) continue;
      for (let y = 0; y <= sh - o.h; y += step) {
        for (let x = 0; x <= sw - o.w; x += step) {
          let ok = true;
          for (const pp of placed) {
            if (!(x + o.w + gap <= pp.x || x >= pp.x + pp.width + gap ||
                  y + o.h + gap <= pp.y || y >= pp.y + pp.height + gap)) { ok = false; break; }
          }
          if (ok) return { x, y, rotated: o.rot };
        }
      }
    }
    return null;
  }

  function updateSlabCount() {
    const el = document.getElementById('slSlabCountNum');
    if (el) el.textContent = state.slabs.length;
  }

  function updateSlabTabs() {
    const bar = document.getElementById('slTabBar');
    if (!bar) return;
    let h = '';
    state.slabs.forEach((s, i) => {
      const cls = i === state.activeSlabIdx ? 'sl-slab-tab sl-active' : 'sl-slab-tab';
      const cnt = (s.pieces || []).length;
      h += `<button class="${cls}" onclick="SlabLayout.switchSlab(${i})">Slab ${s.number} <small>(${cnt})</small></button>`;
    });
    h += `<button class="sl-add-tab" onclick="SlabLayout.addSlab()">+</button>`;
    bar.innerHTML = h;
    updateSlabCount();
  }

  // =====================================================================
  // OPTIMIZATION
  // =====================================================================
  function autoOptimize() {
    if (state.allPieces.length > 0) {
      distributeAllPieces(state.allPieces);
    } else if (state.pieces.length > 0) {
      // Re-distribute just current pieces
      const all = [];
      state.slabs.forEach(s => (s.pieces || []).forEach(p => all.push({ ...p })));
      if (all.length === 0) all.push(...state.pieces.map(p => ({ ...p })));
      distributeAllPieces(all);
    } else {
      showToast('No pieces to optimize', 'warning'); return;
    }
    updateSlabTabs(); render(); updatePieceList(); updateStats();
    showToast('Layout optimized across ' + state.slabs.length + ' slab(s). Yield: ' + calcYield().toFixed(0) + '%', 'success');
  }

  // =====================================================================
  // RENDERING
  // =====================================================================
  function render() {
    if (!ctx || !canvas) return;
    resizeCanvas();
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = CONFIG.colors.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(state.panX, state.panY);
    ctx.scale(state.scale, state.scale);

    drawSlabBg();
    if (state.showGrid) drawGrid();
    if (state.showVeinGuide) drawVeinLines();
    if (state.showKerf) drawKerfs();
    drawSeams();
    state.pieces.forEach(p => drawPiece(p, p === state.selectedPiece));
    drawSlabBorder();
    drawDimLabels();

    ctx.restore();
  }

  function drawSlabBg() {
    if (state.slabImage) {
      ctx.drawImage(state.slabImage, 0, 0, state.slabDims.width, state.slabDims.height);
      // Slight darken overlay so pieces are visible
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(0, 0, state.slabDims.width, state.slabDims.height);
    } else {
      const g = ctx.createLinearGradient(0, 0, state.slabDims.width, state.slabDims.height);
      g.addColorStop(0, '#4a4a5a'); g.addColorStop(0.5, '#5a5a6a'); g.addColorStop(1, '#3a3a4a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, state.slabDims.width, state.slabDims.height);
      // Fake veins
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const off = ((state.slabDims.width + state.slabDims.height) * (i + 1) * 0.1) % 1;
        ctx.beginPath();
        ctx.moveTo(off * state.slabDims.width, 0);
        ctx.bezierCurveTo(
          ((off + 0.3) % 1) * state.slabDims.width, state.slabDims.height * 0.3,
          ((off + 0.6) % 1) * state.slabDims.width, state.slabDims.height * 0.7,
          ((off + 0.2) % 1) * state.slabDims.width, state.slabDims.height);
        ctx.stroke();
      }
    }
  }

  function drawGrid() {
    ctx.strokeStyle = CONFIG.colors.grid;
    ctx.lineWidth = 0.5 / state.scale;
    for (let x = 0; x <= state.slabDims.width; x += CONFIG.gridSpacing) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, state.slabDims.height); ctx.stroke();
    }
    for (let y = 0; y <= state.slabDims.height; y += CONFIG.gridSpacing) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(state.slabDims.width, y); ctx.stroke();
    }
  }

  function drawVeinLines() {
    const cx = state.slabDims.width / 2, cy = state.slabDims.height / 2;
    const a = state.veinAngle * Math.PI / 180;
    const len = Math.max(state.slabDims.width, state.slabDims.height);
    ctx.save();
    ctx.strokeStyle = CONFIG.colors.vein;
    ctx.lineWidth = 1.5 / state.scale;
    ctx.setLineDash([8, 4]);
    const pa = a + Math.PI / 2;
    for (let off = -len; off <= len; off += CONFIG.veinLineSpacing) {
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(pa) * off - Math.cos(a) * len, cy + Math.sin(pa) * off - Math.sin(a) * len);
      ctx.lineTo(cx + Math.cos(pa) * off + Math.cos(a) * len, cy + Math.sin(pa) * off + Math.sin(a) * len);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawKerfs() {
    const kerf = CONFIG.bladeKerf;
    ctx.save();
    ctx.strokeStyle = CONFIG.colors.kerf;
    ctx.lineWidth = Math.max(kerf, 1 / state.scale);
    for (let i = 0; i < state.pieces.length; i++) {
      for (let j = i + 1; j < state.pieces.length; j++) {
        const a = state.pieces[i], b = state.pieces[j];
        const yOv = !(a.y + a.height <= b.y || b.y + b.height <= a.y);
        const xOv = !(a.x + a.width <= b.x || b.x + b.width <= a.x);
        if (yOv) {
          const g1 = Math.abs((a.x + a.width) - b.x);
          const g2 = Math.abs((b.x + b.width) - a.x);
          if (g1 < 2 || g2 < 2) {
            const xl = g1 < g2 ? a.x + a.width + kerf / 2 : b.x + b.width + kerf / 2;
            ctx.beginPath(); ctx.moveTo(xl, Math.max(a.y, b.y));
            ctx.lineTo(xl, Math.min(a.y + a.height, b.y + b.height)); ctx.stroke();
          }
        }
        if (xOv) {
          const g1 = Math.abs((a.y + a.height) - b.y);
          const g2 = Math.abs((b.y + b.height) - a.y);
          if (g1 < 2 || g2 < 2) {
            const yl = g1 < g2 ? a.y + a.height + kerf / 2 : b.y + b.height + kerf / 2;
            ctx.beginPath(); ctx.moveTo(Math.max(a.x, b.x), yl);
            ctx.lineTo(Math.min(a.x + a.width, b.x + b.width), yl); ctx.stroke();
          }
        }
      }
    }
    ctx.restore();
  }

  function drawSeams() {
    ctx.save();
    ctx.strokeStyle = CONFIG.colors.seam;
    ctx.lineWidth = 2.5 / state.scale;
    ctx.setLineDash([6, 4]);
    state.seams.forEach(sm => {
      ctx.beginPath();
      ctx.moveTo(sm.x, sm.y1 || 0);
      ctx.lineTo(sm.x, sm.y2 || state.slabDims.height);
      ctx.stroke();
      // Label
      const fs = Math.max(8, 10 / state.scale);
      ctx.font = `bold ${fs}px sans-serif`;
      ctx.fillStyle = CONFIG.colors.seam;
      ctx.textAlign = 'center';
      ctx.fillText(`SEAM ${sm.x}"`, sm.x, -6 / state.scale);
    });
    ctx.restore();
  }

  function drawSlabBorder() {
    ctx.strokeStyle = CONFIG.colors.slabBorder;
    ctx.lineWidth = 2 / state.scale;
    ctx.strokeRect(0, 0, state.slabDims.width, state.slabDims.height);
  }

  function drawDimLabels() {
    const fs = Math.max(10, 12 / state.scale);
    ctx.font = `${fs}px sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(state.slabDims.width + '"', state.slabDims.width / 2, -10 / state.scale);
    ctx.save();
    ctx.translate(-12 / state.scale, state.slabDims.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(state.slabDims.height + '"', 0, 0);
    ctx.restore();
  }

  function pieceColor(type, selected) {
    const map = {
      countertop: { f: CONFIG.colors.countertop, s: CONFIG.colors.countertopSel, b: CONFIG.colors.countertopBorder },
      lamination: { f: CONFIG.colors.lamination, s: CONFIG.colors.laminationSel, b: CONFIG.colors.laminationBorder },
      backsplash: { f: CONFIG.colors.backsplash, s: CONFIG.colors.backsplashSel, b: CONFIG.colors.backsplashBorder },
      waterfall:  { f: CONFIG.colors.waterfall,  s: CONFIG.colors.waterfallSel,  b: CONFIG.colors.waterfallBorder }
    };
    const c = map[type] || map.countertop;
    return { fill: selected ? c.s : c.f, border: selected ? '#fff' : c.b };
  }

  function typeBadge(t) {
    return { lamination: 'LAM', backsplash: 'BS', waterfall: 'WF' }[t] || null;
  }

  function drawPiece(p, sel) {
    ctx.save();
    const c = pieceColor(p.type, sel);

    // Fill
    ctx.fillStyle = c.fill;
    ctx.fillRect(p.x, p.y, p.width, p.height);

    // Border
    ctx.strokeStyle = c.border;
    ctx.lineWidth = (sel ? 3 : 1.5) / state.scale;
    ctx.strokeRect(p.x, p.y, p.width, p.height);

    // Vein indicators
    if (p.veinConstraint && p.veinConstraint !== 'none') {
      drawVeinOnPiece(p);
    }

    // Labels
    const cx = p.x + p.width / 2, cy = p.y + p.height / 2;
    const minSz = 15 / state.scale;
    if (p.width >= minSz && p.height >= minSz) {
      const fs = Math.max(8, 12 / state.scale);

      // Badge
      const badge = typeBadge(p.type);
      if (badge) {
        const bfs = Math.max(6, 8 / state.scale);
        ctx.font = `bold ${bfs}px sans-serif`;
        ctx.fillStyle = c.border;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(badge, p.x + 2 / state.scale, p.y + 2 / state.scale);
      }

      // Name
      ctx.font = `bold ${fs}px sans-serif`;
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let lbl = p.label || 'Piece';
      if (lbl.length > 22) lbl = lbl.slice(0, 20) + '..';
      ctx.fillText(lbl, cx, cy - fs * 0.6);

      // Dimensions
      ctx.font = `${fs * 0.75}px sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(p.width.toFixed(1) + '" x ' + p.height.toFixed(1) + '"', cx, cy + fs * 0.15);

      // Edge profile + thickness
      if (p.type === 'countertop' && p.height >= minSz * 1.3) {
        ctx.font = `${fs * 0.65}px sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillText(p.edgeProfile + ' | ' + p.thickness, cx, cy + fs * 0.8);
      }
    }

    // Selection handles
    if (sel) {
      const hs = 6 / state.scale;
      ctx.fillStyle = '#fff';
      [[p.x, p.y], [p.x + p.width, p.y], [p.x, p.y + p.height], [p.x + p.width, p.y + p.height]]
        .forEach(([hx, hy]) => ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs));
    }

    ctx.restore();
  }

  function drawVeinOnPiece(p) {
    const a = state.veinAngle * Math.PI / 180;
    const cx = p.x + p.width / 2, cy = p.y + p.height / 2;
    const len = Math.min(p.width, p.height) * 0.25;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1 / state.scale;
    ctx.setLineDash([3, 2]);
    const pa = a + Math.PI / 2;
    for (let off = -1; off <= 1; off++) {
      const ox = Math.cos(pa) * off * len * 0.4;
      const oy = Math.sin(pa) * off * len * 0.4;
      ctx.beginPath();
      ctx.moveTo(cx + ox - Math.cos(a) * len, cy + oy - Math.sin(a) * len);
      ctx.lineTo(cx + ox + Math.cos(a) * len, cy + oy + Math.sin(a) * len);
      ctx.stroke();
    }
    ctx.restore();
  }

  // =====================================================================
  // STATISTICS
  // =====================================================================
  function calcYield() {
    const sa = state.slabDims.width * state.slabDims.height;
    const ua = state.pieces.reduce((s, p) => s + p.width * p.height, 0);
    return sa > 0 ? (ua / sa) * 100 : 0;
  }

  function updateStats() {
    const sa = (state.slabDims.width * state.slabDims.height) / 144;
    const ua = state.pieces.reduce((s, p) => s + p.width * p.height, 0) / 144;
    const wa = Math.max(0, sa - ua);
    const yp = calcYield();
    setText('slStatSlab', sa.toFixed(1));
    setText('slStatUsed', ua.toFixed(1));
    setText('slStatWaste', wa.toFixed(1));
    setText('slStatYield', yp.toFixed(0) + '%');
    const bar = document.getElementById('slYieldBar');
    if (bar) {
      bar.style.width = Math.min(yp, 100) + '%';
      bar.style.background = yp >= 85 ? '#10b981' : yp >= 70 ? '#f59e0b' : '#ef4444';
    }
    const note = document.getElementById('slYieldNote');
    if (note) {
      if (yp >= 85) { note.textContent = 'Excellent yield!'; note.style.color = '#10b981'; }
      else if (yp >= 70) { note.textContent = 'Good yield. Rotate pieces for better fit.'; note.style.color = '#f59e0b'; }
      else if (ua > 0) { note.textContent = 'Low yield. Optimize or add slabs.'; note.style.color = '#ef4444'; }
      else { note.textContent = 'Import pieces to see yield.'; note.style.color = '#9ca3af'; }
    }
    updateTotalStats();
  }

  function updateTotalStats() {
    const el = document.getElementById('slSlabCountBanner');
    if (!el) return;
    const num = document.getElementById('slSlabCountNum');
    if (num) num.textContent = state.slabs.length;
  }

  // =====================================================================
  // OVERLAPS
  // =====================================================================
  function checkOverlaps() {
    for (let i = 0; i < state.pieces.length; i++)
      for (let j = i + 1; j < state.pieces.length; j++)
        if (!(state.pieces[i].x + state.pieces[i].width <= state.pieces[j].x ||
              state.pieces[j].x + state.pieces[j].width <= state.pieces[i].x ||
              state.pieces[i].y + state.pieces[i].height <= state.pieces[j].y ||
              state.pieces[j].y + state.pieces[j].height <= state.pieces[i].y)) {
          showToast('Pieces overlapping!', 'warning'); return;
        }
  }

  // =====================================================================
  // UI UPDATES
  // =====================================================================
  function updatePieceList() {
    const el = document.getElementById('slPieceList');
    if (!el) return;
    if (state.pieces.length === 0) {
      el.innerHTML = '<p class="sl-empty">No pieces on this slab.</p>'; return;
    }
    el.innerHTML = state.pieces.map((p, i) => {
      const c = pieceColor(p.type, false);
      const badge = typeBadge(p.type);
      const sqft = ((p.width * p.height) / 144).toFixed(2);
      const sel = p === state.selectedPiece ? ' sl-sel' : '';
      return `
        <div class="sl-piece-item${sel}" onclick="SlabLayout.selectPiece(${i})">
          <div class="sl-piece-bar" style="background:${c.border}"></div>
          <div class="sl-piece-body">
            <div class="sl-piece-name">${badge ? '<span class="sl-badge" style="background:' + c.border + '">' + badge + '</span>' : ''}${p.label}</div>
            <div class="sl-piece-dims">${p.width.toFixed(1)}" x ${p.height.toFixed(1)}" &middot; ${sqft} ft&sup2; &middot; ${p.edgeProfile} &middot; ${p.thickness}</div>
          </div>
          <div class="sl-piece-btns">
            <button onclick="event.stopPropagation();SlabLayout.rotatePieceByIdx(${i})" title="Rotate">\u21BB</button>
            <button onclick="event.stopPropagation();SlabLayout.removePieceByIdx(${i})" title="Remove">&times;</button>
          </div>
        </div>`;
    }).join('');
  }

  function updateSeamInfo() {
    const el = document.getElementById('slSeamInfo');
    if (!el) return;
    if (state.seams.length === 0) {
      el.innerHTML = '<p class="sl-empty">No seams. Use the seam tool to add.</p>'; return;
    }
    el.innerHTML = state.seams.map((sm, i) =>
      `<div class="sl-seam-item">Seam ${i + 1}: ${sm.x}" from left <button class="sl-seam-del" onclick="SlabLayout.removeSeam(${i})">&times;</button></div>`
    ).join('');
  }

  function selectPiece(i) { state.selectedPiece = state.pieces[i] || null; render(); updatePieceList(); }
  function rotatePieceByIdx(i) { if (state.pieces[i]) rotatePiece(state.pieces[i], 90); }
  function removePieceByIdx(i) {
    if (state.pieces[i]) {
      state.pieces.splice(i, 1); state.selectedPiece = null;
      savePiecesToSlab(); render(); updatePieceList(); updateStats();
    }
  }
  function removeSeam(i) {
    state.seams.splice(i, 1); updateSeamInfo(); render();
  }

  // =====================================================================
  // TOGGLES
  // =====================================================================
  function toggleGrid(v) { state.showGrid = v; render(); }
  function toggleVeinGuide(v) {
    state.showVeinGuide = v;
    const row = document.getElementById('slVeinAngleRow');
    if (row) row.style.display = v ? 'flex' : 'none';
    render();
  }
  function toggleKerf(v) { state.showKerf = v; render(); }
  function setVeinAngle(v) {
    state.veinAngle = parseInt(v);
    setText('slVeinAngleLbl', v + '\u00B0');
    render();
  }
  function setTool(t) {
    state.currentTool = t;
    document.querySelectorAll('.sl-tool').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  }

  // =====================================================================
  // ZOOM / PAN
  // =====================================================================
  function zoomIn() { state.scale = Math.min(CONFIG.maxZoom, state.scale * 1.25); setText('slZoomLbl', Math.round(state.scale * 100) + '%'); render(); }
  function zoomOut() { state.scale = Math.max(CONFIG.minZoom, state.scale / 1.25); setText('slZoomLbl', Math.round(state.scale * 100) + '%'); render(); }
  function fitToView() {
    if (!canvas) return;
    resizeCanvas(); // ensure canvas dimensions are up to date
    if (canvas.width === 0 || canvas.height === 0) return; // not visible yet
    const pad = 60;
    const sx = (canvas.width - pad * 2) / state.slabDims.width;
    const sy = (canvas.height - pad * 2) / state.slabDims.height;
    state.scale = Math.min(sx, sy, CONFIG.maxZoom);
    state.panX = (canvas.width - state.slabDims.width * state.scale) / 2;
    state.panY = (canvas.height - state.slabDims.height * state.scale) / 2;
    setText('slZoomLbl', Math.round(state.scale * 100) + '%');
    render();
  }

  // =====================================================================
  // CUT SHEET PDF
  // =====================================================================
  function generateCutSheet() {
    let all = [];
    state.slabs.forEach(s => (s.pieces || []).forEach(p => all.push({ ...p, slabNum: s.number })));
    if (all.length === 0) all = state.pieces.map(p => ({ ...p, slabNum: 1 }));
    if (all.length === 0) { showToast('Add pieces first', 'warning'); return; }
    if (typeof jspdf === 'undefined' && typeof jsPDF === 'undefined') { showToast('PDF library not loaded', 'error'); return; }

    const { jsPDF } = window.jspdf || window;
    const doc = new jsPDF('landscape');

    doc.setFontSize(18);
    doc.text('Slab Cut Sheet', 14, 18);
    doc.setFontSize(10);
    doc.text('Generated: ' + new Date().toLocaleDateString(), 14, 26);
    doc.text('Material: ' + (state.materialType || 'N/A') + '  |  Slab: ' + state.slabDims.width + '" x ' + state.slabDims.height + '"  |  Slabs: ' + state.slabs.length, 14, 32);

    const types = ['countertop', 'lamination', 'backsplash', 'waterfall'];
    const counts = {};
    types.forEach(t => counts[t] = all.filter(p => p.type === t).length);
    doc.text('Pieces: ' + types.filter(t => counts[t]).map(t => counts[t] + ' ' + t).join(', '), 14, 38);

    // Draw each slab
    let cy = 48;
    state.slabs.forEach((slab, si) => {
      if (cy > 160) { doc.addPage(); cy = 18; }
      const sc = Math.min(180 / state.slabDims.width, 55 / state.slabDims.height);
      const lw = state.slabDims.width * sc, lh = state.slabDims.height * sc;
      doc.setFontSize(10); doc.setTextColor(0);
      doc.text('Slab ' + slab.number + ' (' + (slab.pieces || []).length + ' pieces)', 14, cy);
      cy += 3;
      doc.setDrawColor(99, 102, 241); doc.setLineWidth(0.4);
      doc.rect(14, cy, lw, lh);
      (slab.pieces || []).forEach(p => {
        const tc = { countertop: [99,102,241], lamination: [245,158,11], backsplash: [20,184,166], waterfall: [168,85,247] };
        doc.setFillColor(...(tc[p.type] || tc.countertop));
        doc.setDrawColor(255,255,255);
        doc.rect(14 + p.x * sc, cy + p.y * sc, p.width * sc, p.height * sc, 'FD');
        if (p.width * sc > 10) {
          doc.setFontSize(5); doc.setTextColor(255,255,255);
          doc.text(p.width.toFixed(0) + 'x' + p.height.toFixed(0), 14 + (p.x + p.width / 2) * sc, cy + (p.y + p.height / 2) * sc, { align: 'center' });
        }
      });
      cy += lh + 10;
    });

    // Tables
    if (cy > 140) { doc.addPage(); cy = 18; }
    doc.setTextColor(0); doc.setFontSize(11);
    types.forEach(t => {
      const items = all.filter(p => p.type === t);
      if (items.length === 0) return;
      doc.text(t.charAt(0).toUpperCase() + t.slice(1) + ' Pieces:', 14, cy); cy += 5;
      doc.setFontSize(8);
      items.forEach((p, i) => {
        const sqft = ((p.width * p.height) / 144).toFixed(2);
        doc.text((i + 1) + '. ' + p.label + ': ' + p.width.toFixed(1) + '" x ' + p.height.toFixed(1) + '" (' + sqft + ' ft2) - ' + p.edgeProfile + ' ' + p.thickness + ' [Slab ' + p.slabNum + ']', 18, cy);
        cy += 4;
        if (cy > 195) { doc.addPage(); cy = 18; }
      });
      cy += 3; doc.setFontSize(11);
    });

    doc.save('slab-cut-sheet.pdf');
    showToast('Cut sheet saved!', 'success');
  }

  // =====================================================================
  // OPEN / CLOSE
  // =====================================================================
  function open() {
    state.isActive = true;
    if (overlay) {
      overlay.classList.remove('sl-hidden');
      overlay.focus(); // grab keyboard focus from room designer
    }
    // Wait for layout to settle, then initialize view
    requestAnimationFrame(() => {
      resizeCanvas();
      fitToView();
      updateStats(); updateSlabTabs(); updatePieceList(); updateSeamInfo();
    });
  }

  function close() {
    state.isActive = false;
    if (overlay) overlay.classList.add('sl-hidden');
  }

  function toggle() { state.isActive ? close() : open(); }

  // =====================================================================
  // HELPERS
  // =====================================================================
  function setText(id, txt) { const e = document.getElementById(id); if (e) e.textContent = txt; }

  function showToast(msg, type) {
    if (typeof window.showToast === 'function') { window.showToast(msg, type); return; }
    const t = document.createElement('div');
    t.className = 'sl-toast sl-toast-' + (type || 'info');
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('sl-show'));
    setTimeout(() => { t.classList.remove('sl-show'); setTimeout(() => t.remove(), 300); }, 3000);
  }

  function getAllPieces() {
    const all = [];
    state.slabs.forEach(s => (s.pieces || []).forEach(p => all.push({ ...p, slabNumber: s.number })));
    return all.length > 0 ? all : state.pieces.map(p => ({ ...p, slabNumber: 1 }));
  }

  // =====================================================================
  // PUBLIC API
  // =====================================================================
  window.SlabLayout = {
    init, open, close, toggle,
    importFromDesign, addPieceManually,
    selectPiece, rotatePieceByIdx, removePieceByIdx,
    autoOptimize, generateCutSheet,
    setMaterial, updateSlabSize,
    addSlab, switchSlab, removeSeam,
    toggleGrid, toggleVeinGuide, toggleKerf, setVeinAngle, setTool,
    zoomIn, zoomOut, fitToView,
    showSourceTab: function() {},
    searchInventory: function() {},
    selectInventorySlab: function() {},
    toggleAutoSeams: function() {},
    getState: () => ({ ...state }),
    getPieces: () => [...state.pieces],
    getAllPieces,
    getYield: calcYield,
    isActive: () => state.isActive,
    getSlabs: () => state.slabs.map(s => ({ ...s })),
    getMaterial: () => state.materialType,
    getVeinConstraint: () => state.veinConstraint,
    generateAllSlabPieces: generateAllPieces
  };

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);
