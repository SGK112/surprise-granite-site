/**
 * Slab Layout Overlay Module
 * Enables fabricators to overlay countertop shapes onto slab images
 * for optimal material utilization and seam planning
 *
 * @version 1.0.0
 * @author Surprise Granite
 */

(function(window) {
  'use strict';

  // ===== CONFIGURATION =====
  const CONFIG = {
    // Standard slab dimensions (in inches)
    slabSizes: {
      jumbo: { width: 130, height: 65, label: 'Jumbo (130" × 65")' },
      standard: { width: 120, height: 60, label: 'Standard (120" × 60")' },
      medium: { width: 110, height: 55, label: 'Medium (110" × 55")' },
      small: { width: 96, height: 48, label: 'Small (96" × 48")' }
    },
    // Blade kerf (cutting width) in inches
    bladeKerf: 0.125, // 1/8 inch
    // Minimum gap between pieces (in inches)
    minGap: 0.25,
    // Seam rules
    seamRules: {
      minDistanceFromEdge: 3, // inches
      maxLength: 48, // inches - prefer shorter seams
      avoidOverDishwasher: true,
      avoidOverUnsupportedSpan: true,
      preferNarrowSections: true
    },
    // Colors
    colors: {
      piece: 'rgba(99, 102, 241, 0.6)',
      pieceSelected: 'rgba(99, 102, 241, 0.8)',
      pieceBorder: '#6366f1',
      seam: '#ef4444',
      seamWarning: '#f59e0b',
      waste: 'rgba(239, 68, 68, 0.2)',
      veinLine: 'rgba(255, 255, 255, 0.3)',
      grid: 'rgba(255, 255, 255, 0.1)'
    }
  };

  // ===== STATE =====
  const state = {
    isActive: false,
    slabImage: null,
    slabImageUrl: null,
    slabDimensions: { width: 120, height: 60 }, // inches
    pieces: [], // Countertop pieces to place
    seams: [], // Seam locations
    selectedPiece: null,
    scale: 1, // pixels per inch
    panX: 0,
    panY: 0,
    isDragging: false,
    dragOffset: { x: 0, y: 0 },
    showGrid: true,
    showVeinGuide: false,
    veinAngle: 0, // degrees
    inventory: [], // Available slabs from inventory
    selectedSlabId: null
  };

  // ===== DOM ELEMENTS =====
  let slabCanvas, slabCtx, slabPanel;

  // ===== INITIALIZATION =====
  function init() {
    createSlabPanel();
    createSlabCanvas();
    bindEvents();
    console.log('SlabLayout: Module initialized');
  }

  function createSlabPanel() {
    // Check if panel already exists
    if (document.getElementById('slabLayoutPanel')) return;

    const panel = document.createElement('div');
    panel.id = 'slabLayoutPanel';
    panel.className = 'slab-layout-panel hidden';
    panel.innerHTML = `
      <div class="slab-panel-header">
        <h3>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M9 21V9"/>
          </svg>
          Slab Layout
        </h3>
        <button class="slab-panel-close" onclick="SlabLayout.close()">×</button>
      </div>

      <div class="slab-panel-content">
        <!-- Slab Selection -->
        <div class="slab-section">
          <label class="slab-section-title">Slab Source</label>
          <div class="slab-source-tabs">
            <button class="slab-tab active" onclick="SlabLayout.showSourceTab('upload')">Upload Image</button>
            <button class="slab-tab" onclick="SlabLayout.showSourceTab('inventory')">From Inventory</button>
          </div>

          <div id="slabSourceUpload" class="slab-source-content">
            <div class="slab-upload-zone" id="slabDropZone">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17,8 12,3 7,8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <p>Drop slab image here or click to upload</p>
              <input type="file" id="slabImageInput" accept="image/*" style="display:none">
            </div>
          </div>

          <div id="slabSourceInventory" class="slab-source-content" style="display:none">
            <div class="slab-inventory-search">
              <input type="text" id="slabInventorySearch" placeholder="Search slabs..." onkeyup="SlabLayout.searchInventory(this.value)">
            </div>
            <div class="slab-inventory-list" id="slabInventoryList">
              <p class="slab-inventory-empty">Loading inventory...</p>
            </div>
          </div>
        </div>

        <!-- Slab Dimensions -->
        <div class="slab-section">
          <label class="slab-section-title">Slab Dimensions</label>
          <div class="slab-dimension-presets">
            <select id="slabSizePreset" onchange="SlabLayout.applyPreset(this.value)">
              <option value="">Custom Size</option>
              <option value="jumbo">Jumbo (130" × 65")</option>
              <option value="standard" selected>Standard (120" × 60")</option>
              <option value="medium">Medium (110" × 55")</option>
              <option value="small">Small (96" × 48")</option>
            </select>
          </div>
          <div class="slab-dimension-inputs">
            <div class="slab-input-group">
              <label>Width</label>
              <input type="number" id="slabWidth" value="120" min="24" max="200" onchange="SlabLayout.updateSlabSize()">
              <span>in</span>
            </div>
            <div class="slab-input-group">
              <label>Height</label>
              <input type="number" id="slabHeight" value="60" min="24" max="100" onchange="SlabLayout.updateSlabSize()">
              <span>in</span>
            </div>
          </div>
        </div>

        <!-- Pieces List -->
        <div class="slab-section">
          <label class="slab-section-title">
            Countertop Pieces
            <button class="slab-btn-small" onclick="SlabLayout.importFromDesign()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7,10 12,15 17,10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Import from Design
            </button>
          </label>
          <div class="slab-pieces-list" id="slabPiecesList">
            <p class="slab-pieces-empty">No pieces yet. Import from your room design or add manually.</p>
          </div>
          <button class="slab-btn-secondary" onclick="SlabLayout.addPieceManually()">
            + Add Piece Manually
          </button>
        </div>

        <!-- Seam Planning -->
        <div class="slab-section">
          <label class="slab-section-title">Seam Planning</label>
          <div class="slab-seam-options">
            <label class="slab-checkbox">
              <input type="checkbox" id="seamAutoPlace" checked onchange="SlabLayout.toggleAutoSeams(this.checked)">
              Auto-suggest seam locations
            </label>
            <label class="slab-checkbox">
              <input type="checkbox" id="seamShowWarnings" checked>
              Show placement warnings
            </label>
          </div>
          <div class="slab-seams-list" id="slabSeamsList">
            <p class="slab-seams-empty">No seams required for current layout.</p>
          </div>
        </div>

        <!-- Vein Matching -->
        <div class="slab-section">
          <label class="slab-section-title">Vein Matching</label>
          <div class="slab-vein-controls">
            <label class="slab-checkbox">
              <input type="checkbox" id="showVeinGuide" onchange="SlabLayout.toggleVeinGuide(this.checked)">
              Show vein direction guide
            </label>
            <div class="slab-vein-angle" id="veinAngleControl" style="display:none">
              <label>Vein Angle</label>
              <input type="range" id="veinAngle" min="0" max="180" value="0" onchange="SlabLayout.setVeinAngle(this.value)">
              <span id="veinAngleValue">0°</span>
            </div>
          </div>
        </div>

        <!-- Yield Statistics -->
        <div class="slab-section slab-stats">
          <label class="slab-section-title">Material Yield</label>
          <div class="slab-stats-grid">
            <div class="slab-stat">
              <span class="slab-stat-value" id="statSlabArea">50.0</span>
              <span class="slab-stat-label">Slab (sq ft)</span>
            </div>
            <div class="slab-stat">
              <span class="slab-stat-value" id="statUsedArea">0.0</span>
              <span class="slab-stat-label">Used (sq ft)</span>
            </div>
            <div class="slab-stat">
              <span class="slab-stat-value" id="statWasteArea">50.0</span>
              <span class="slab-stat-label">Waste (sq ft)</span>
            </div>
            <div class="slab-stat slab-stat-highlight">
              <span class="slab-stat-value" id="statYieldPercent">0%</span>
              <span class="slab-stat-label">Yield</span>
            </div>
          </div>
          <div class="slab-yield-bar">
            <div class="slab-yield-fill" id="yieldBar" style="width: 0%"></div>
          </div>
          <p class="slab-yield-note" id="yieldNote">Add countertop pieces to calculate yield.</p>
        </div>

        <!-- Actions -->
        <div class="slab-actions">
          <button class="slab-btn-secondary" onclick="SlabLayout.autoOptimize()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
            Auto-Optimize Layout
          </button>
          <button class="slab-btn-primary" onclick="SlabLayout.generateCutSheet()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10,9 9,9 8,9"/>
            </svg>
            Generate Cut Sheet
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    slabPanel = panel;
  }

  function createSlabCanvas() {
    // Check if canvas already exists
    if (document.getElementById('slabLayoutCanvas')) return;

    const canvasContainer = document.createElement('div');
    canvasContainer.id = 'slabCanvasContainer';
    canvasContainer.className = 'slab-canvas-container';
    canvasContainer.innerHTML = `
      <div class="slab-canvas-toolbar">
        <div class="slab-canvas-tools">
          <button class="slab-tool-btn active" onclick="SlabLayout.setTool('select')" title="Select & Move">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
            </svg>
          </button>
          <button class="slab-tool-btn" onclick="SlabLayout.setTool('rotate')" title="Rotate Piece">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
          </button>
          <button class="slab-tool-btn" onclick="SlabLayout.setTool('seam')" title="Add Seam">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="6" y1="3" x2="6" y2="15"/>
              <circle cx="18" cy="6" r="3"/>
              <circle cx="6" cy="18" r="3"/>
              <path d="M18 9a9 9 0 0 1-9 9"/>
            </svg>
          </button>
          <div class="slab-tool-divider"></div>
          <button class="slab-tool-btn" onclick="SlabLayout.zoomIn()" title="Zoom In">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              <line x1="11" y1="8" x2="11" y2="14"/>
              <line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
          </button>
          <button class="slab-tool-btn" onclick="SlabLayout.zoomOut()" title="Zoom Out">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              <line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
          </button>
          <button class="slab-tool-btn" onclick="SlabLayout.fitToView()" title="Fit to View">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
            </svg>
          </button>
        </div>
        <div class="slab-canvas-info">
          <span id="slabCanvasZoom">100%</span>
          <span id="slabCanvasCursor">0", 0"</span>
        </div>
      </div>
      <div class="slab-canvas-wrapper">
        <canvas id="slabLayoutCanvas"></canvas>
      </div>
      <div class="slab-canvas-legend">
        <span><i style="background: ${CONFIG.colors.piece}"></i> Countertop Piece</span>
        <span><i style="background: ${CONFIG.colors.seam}"></i> Seam Line</span>
        <span><i style="background: ${CONFIG.colors.waste}"></i> Waste Area</span>
      </div>
    `;

    document.body.appendChild(canvasContainer);
    slabCanvas = document.getElementById('slabLayoutCanvas');
    slabCtx = slabCanvas.getContext('2d');
  }

  // ===== EVENT BINDING =====
  function bindEvents() {
    // File upload
    const dropZone = document.getElementById('slabDropZone');
    const fileInput = document.getElementById('slabImageInput');

    if (dropZone) {
      dropZone.addEventListener('click', () => fileInput?.click());
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
      });
      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
      });
      dropZone.addEventListener('drop', handleFileDrop);
    }

    if (fileInput) {
      fileInput.addEventListener('change', handleFileSelect);
    }

    // Canvas events
    if (slabCanvas) {
      slabCanvas.addEventListener('mousedown', handleCanvasMouseDown);
      slabCanvas.addEventListener('mousemove', handleCanvasMouseMove);
      slabCanvas.addEventListener('mouseup', handleCanvasMouseUp);
      slabCanvas.addEventListener('wheel', handleCanvasWheel);
      slabCanvas.addEventListener('mouseleave', handleCanvasMouseUp);
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyDown);
  }

  // ===== FILE HANDLING =====
  function handleFileDrop(e) {
    e.preventDefault();
    document.getElementById('slabDropZone')?.classList.remove('dragover');

    const file = e.dataTransfer?.files[0];
    if (file && file.type.startsWith('image/')) {
      loadSlabImage(file);
    }
  }

  function handleFileSelect(e) {
    const file = e.target?.files[0];
    if (file) {
      loadSlabImage(file);
    }
  }

  function loadSlabImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        state.slabImage = img;
        state.slabImageUrl = e.target.result;
        updateDropZonePreview(e.target.result);
        render();
        showToast('Slab image loaded', 'success');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function updateDropZonePreview(imageUrl) {
    const dropZone = document.getElementById('slabDropZone');
    if (dropZone) {
      dropZone.innerHTML = `
        <img src="${imageUrl}" alt="Slab preview" style="max-width: 100%; max-height: 120px; border-radius: 8px;">
        <p style="margin-top: 8px; font-size: 12px;">Click to change image</p>
      `;
    }
  }

  // ===== CANVAS HANDLING =====
  function handleCanvasMouseDown(e) {
    const rect = slabCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - state.panX) / state.scale;
    const y = (e.clientY - rect.top - state.panY) / state.scale;

    // Check if clicking on a piece
    const clickedPiece = findPieceAtPoint(x, y);

    if (clickedPiece) {
      state.selectedPiece = clickedPiece;
      state.isDragging = true;
      state.dragOffset = {
        x: x - clickedPiece.x,
        y: y - clickedPiece.y
      };
      slabCanvas.style.cursor = 'grabbing';
    } else {
      state.selectedPiece = null;
      // Start panning
      state.isPanning = true;
      state.panStart = { x: e.clientX - state.panX, y: e.clientY - state.panY };
      slabCanvas.style.cursor = 'grab';
    }

    render();
    updatePiecesList();
  }

  function handleCanvasMouseMove(e) {
    const rect = slabCanvas.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;
    const x = (rawX - state.panX) / state.scale;
    const y = (rawY - state.panY) / state.scale;

    // Update cursor position display
    const cursorDisplay = document.getElementById('slabCanvasCursor');
    if (cursorDisplay) {
      cursorDisplay.textContent = `${x.toFixed(1)}", ${y.toFixed(1)}"`;
    }

    if (state.isDragging && state.selectedPiece) {
      // Move piece
      state.selectedPiece.x = x - state.dragOffset.x;
      state.selectedPiece.y = y - state.dragOffset.y;

      // Snap to grid (1 inch)
      state.selectedPiece.x = Math.round(state.selectedPiece.x);
      state.selectedPiece.y = Math.round(state.selectedPiece.y);

      // Constrain to slab bounds
      state.selectedPiece.x = Math.max(0, Math.min(state.slabDimensions.width - state.selectedPiece.width, state.selectedPiece.x));
      state.selectedPiece.y = Math.max(0, Math.min(state.slabDimensions.height - state.selectedPiece.height, state.selectedPiece.y));

      render();
      updateStats();
    } else if (state.isPanning) {
      state.panX = e.clientX - state.panStart.x;
      state.panY = e.clientY - state.panStart.y;
      render();
    } else {
      // Hover detection
      const hoveredPiece = findPieceAtPoint(x, y);
      slabCanvas.style.cursor = hoveredPiece ? 'grab' : 'default';
    }
  }

  function handleCanvasMouseUp() {
    if (state.isDragging) {
      checkOverlaps();
    }
    state.isDragging = false;
    state.isPanning = false;
    slabCanvas.style.cursor = 'default';
  }

  function handleCanvasWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.5, Math.min(5, state.scale * delta));

    // Zoom toward cursor position
    const rect = slabCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    state.panX = x - (x - state.panX) * (newScale / state.scale);
    state.panY = y - (y - state.panY) * (newScale / state.scale);
    state.scale = newScale;

    document.getElementById('slabCanvasZoom').textContent = `${Math.round(state.scale * 100)}%`;
    render();
  }

  function handleKeyDown(e) {
    if (!state.isActive) return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (state.selectedPiece) {
        removePiece(state.selectedPiece);
        state.selectedPiece = null;
        render();
        updatePiecesList();
        updateStats();
      }
    } else if (e.key === 'r' || e.key === 'R') {
      if (state.selectedPiece) {
        rotatePiece(state.selectedPiece, 90);
      }
    } else if (e.key === 'Escape') {
      state.selectedPiece = null;
      render();
    }
  }

  function findPieceAtPoint(x, y) {
    // Search in reverse order (top pieces first)
    for (let i = state.pieces.length - 1; i >= 0; i--) {
      const piece = state.pieces[i];
      if (x >= piece.x && x <= piece.x + piece.width &&
          y >= piece.y && y <= piece.y + piece.height) {
        return piece;
      }
    }
    return null;
  }

  // ===== RENDERING =====
  function render() {
    if (!slabCtx || !slabCanvas) return;

    const container = slabCanvas.parentElement;
    if (container) {
      slabCanvas.width = container.clientWidth;
      slabCanvas.height = container.clientHeight;
    }

    // Clear canvas
    slabCtx.fillStyle = '#1a1a2e';
    slabCtx.fillRect(0, 0, slabCanvas.width, slabCanvas.height);

    slabCtx.save();
    slabCtx.translate(state.panX, state.panY);
    slabCtx.scale(state.scale, state.scale);

    // Draw slab background
    drawSlabBackground();

    // Draw grid
    if (state.showGrid) {
      drawGrid();
    }

    // Draw vein guide
    if (state.showVeinGuide) {
      drawVeinGuide();
    }

    // Draw waste areas
    drawWasteAreas();

    // Draw pieces
    state.pieces.forEach(piece => {
      drawPiece(piece, piece === state.selectedPiece);
    });

    // Draw seams
    state.seams.forEach(seam => {
      drawSeam(seam);
    });

    // Draw slab border
    slabCtx.strokeStyle = '#6366f1';
    slabCtx.lineWidth = 2 / state.scale;
    slabCtx.strokeRect(0, 0, state.slabDimensions.width, state.slabDimensions.height);

    // Draw dimension labels
    drawDimensionLabels();

    slabCtx.restore();
  }

  function drawSlabBackground() {
    if (state.slabImage) {
      // Draw actual slab image
      slabCtx.drawImage(
        state.slabImage,
        0, 0,
        state.slabDimensions.width,
        state.slabDimensions.height
      );
    } else {
      // Draw placeholder slab texture
      const gradient = slabCtx.createLinearGradient(0, 0, state.slabDimensions.width, state.slabDimensions.height);
      gradient.addColorStop(0, '#4a4a5a');
      gradient.addColorStop(0.3, '#5a5a6a');
      gradient.addColorStop(0.7, '#4a4a5a');
      gradient.addColorStop(1, '#3a3a4a');
      slabCtx.fillStyle = gradient;
      slabCtx.fillRect(0, 0, state.slabDimensions.width, state.slabDimensions.height);

      // Add some veining effect
      slabCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      slabCtx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        slabCtx.beginPath();
        slabCtx.moveTo(Math.random() * state.slabDimensions.width, 0);
        slabCtx.bezierCurveTo(
          Math.random() * state.slabDimensions.width, state.slabDimensions.height * 0.3,
          Math.random() * state.slabDimensions.width, state.slabDimensions.height * 0.7,
          Math.random() * state.slabDimensions.width, state.slabDimensions.height
        );
        slabCtx.stroke();
      }
    }
  }

  function drawGrid() {
    slabCtx.strokeStyle = CONFIG.colors.grid;
    slabCtx.lineWidth = 0.5 / state.scale;

    // Draw 1-inch grid
    for (let x = 0; x <= state.slabDimensions.width; x += 12) { // Every foot
      slabCtx.beginPath();
      slabCtx.moveTo(x, 0);
      slabCtx.lineTo(x, state.slabDimensions.height);
      slabCtx.stroke();
    }
    for (let y = 0; y <= state.slabDimensions.height; y += 12) {
      slabCtx.beginPath();
      slabCtx.moveTo(0, y);
      slabCtx.lineTo(state.slabDimensions.width, y);
      slabCtx.stroke();
    }
  }

  function drawVeinGuide() {
    const centerX = state.slabDimensions.width / 2;
    const centerY = state.slabDimensions.height / 2;
    const angle = state.veinAngle * Math.PI / 180;
    const length = Math.max(state.slabDimensions.width, state.slabDimensions.height);

    slabCtx.save();
    slabCtx.strokeStyle = CONFIG.colors.veinLine;
    slabCtx.lineWidth = 2 / state.scale;
    slabCtx.setLineDash([10, 5]);

    // Draw multiple parallel lines to show vein direction
    for (let offset = -length; offset <= length; offset += 20) {
      slabCtx.beginPath();
      const perpAngle = angle + Math.PI / 2;
      const startX = centerX + Math.cos(perpAngle) * offset - Math.cos(angle) * length;
      const startY = centerY + Math.sin(perpAngle) * offset - Math.sin(angle) * length;
      const endX = centerX + Math.cos(perpAngle) * offset + Math.cos(angle) * length;
      const endY = centerY + Math.sin(perpAngle) * offset + Math.sin(angle) * length;

      slabCtx.moveTo(startX, startY);
      slabCtx.lineTo(endX, endY);
      slabCtx.stroke();
    }

    slabCtx.restore();
  }

  function drawPiece(piece, isSelected) {
    slabCtx.save();

    // Piece fill
    slabCtx.fillStyle = isSelected ? CONFIG.colors.pieceSelected : CONFIG.colors.piece;
    slabCtx.fillRect(piece.x, piece.y, piece.width, piece.height);

    // Piece border
    slabCtx.strokeStyle = isSelected ? '#fff' : CONFIG.colors.pieceBorder;
    slabCtx.lineWidth = isSelected ? 3 / state.scale : 2 / state.scale;
    slabCtx.strokeRect(piece.x, piece.y, piece.width, piece.height);

    // Piece label
    const fontSize = Math.max(10, 14 / state.scale);
    slabCtx.font = `bold ${fontSize}px Inter, sans-serif`;
    slabCtx.fillStyle = '#fff';
    slabCtx.textAlign = 'center';
    slabCtx.textBaseline = 'middle';

    const label = piece.label || `Piece ${piece.id}`;
    const dims = `${piece.width}" × ${piece.height}"`;

    slabCtx.fillText(label, piece.x + piece.width / 2, piece.y + piece.height / 2 - fontSize / 2);

    slabCtx.font = `${fontSize * 0.8}px Inter, sans-serif`;
    slabCtx.fillStyle = 'rgba(255,255,255,0.8)';
    slabCtx.fillText(dims, piece.x + piece.width / 2, piece.y + piece.height / 2 + fontSize / 2);

    // Selection handles
    if (isSelected) {
      const handleSize = 8 / state.scale;
      slabCtx.fillStyle = '#fff';
      const handles = [
        { x: piece.x, y: piece.y },
        { x: piece.x + piece.width, y: piece.y },
        { x: piece.x, y: piece.y + piece.height },
        { x: piece.x + piece.width, y: piece.y + piece.height }
      ];
      handles.forEach(h => {
        slabCtx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
      });
    }

    slabCtx.restore();
  }

  function drawSeam(seam) {
    slabCtx.save();
    slabCtx.strokeStyle = seam.hasWarning ? CONFIG.colors.seamWarning : CONFIG.colors.seam;
    slabCtx.lineWidth = 3 / state.scale;
    slabCtx.setLineDash([5, 3]);

    slabCtx.beginPath();
    slabCtx.moveTo(seam.x1, seam.y1);
    slabCtx.lineTo(seam.x2, seam.y2);
    slabCtx.stroke();

    // Seam label
    const midX = (seam.x1 + seam.x2) / 2;
    const midY = (seam.y1 + seam.y2) / 2;
    const length = Math.sqrt(Math.pow(seam.x2 - seam.x1, 2) + Math.pow(seam.y2 - seam.y1, 2));

    const fontSize = Math.max(8, 10 / state.scale);
    slabCtx.font = `${fontSize}px Inter, sans-serif`;
    slabCtx.fillStyle = seam.hasWarning ? CONFIG.colors.seamWarning : CONFIG.colors.seam;
    slabCtx.textAlign = 'center';
    slabCtx.fillText(`${length.toFixed(1)}"`, midX, midY - 8 / state.scale);

    slabCtx.restore();
  }

  function drawWasteAreas() {
    // Calculate and draw areas not covered by pieces
    // This is a simplified version - full implementation would use polygon clipping
    slabCtx.fillStyle = CONFIG.colors.waste;

    // For now, just highlight areas outside pieces
    // A more sophisticated version would compute exact waste regions
  }

  function drawDimensionLabels() {
    const fontSize = Math.max(10, 12 / state.scale);
    slabCtx.font = `${fontSize}px Inter, sans-serif`;
    slabCtx.fillStyle = '#fff';
    slabCtx.textAlign = 'center';

    // Width label
    slabCtx.fillText(
      `${state.slabDimensions.width}"`,
      state.slabDimensions.width / 2,
      -10 / state.scale
    );

    // Height label
    slabCtx.save();
    slabCtx.translate(-10 / state.scale, state.slabDimensions.height / 2);
    slabCtx.rotate(-Math.PI / 2);
    slabCtx.fillText(`${state.slabDimensions.height}"`, 0, 0);
    slabCtx.restore();
  }

  // ===== PIECE MANAGEMENT =====
  function importFromDesign() {
    // Get countertop elements from main room designer
    if (typeof elements === 'undefined' || !Array.isArray(elements)) {
      showToast('No design elements found. Create a room design first.', 'warning');
      return;
    }

    const countertops = elements.filter(el =>
      el.type === 'countertop' ||
      el.type === 'countertop-l' ||
      el.type === 'countertop-u' ||
      el.type === 'island'
    );

    if (countertops.length === 0) {
      showToast('No countertop elements found in your design.', 'warning');
      return;
    }

    // Convert feet to inches and add as pieces
    let addedCount = 0;
    countertops.forEach((ct, index) => {
      const widthInches = ct.width * 12;
      const heightInches = ct.height * 12;

      // For L and U shapes, break into rectangles
      if (ct.type === 'countertop-l') {
        // L-shape: two rectangles
        addPiece({
          label: `${ct.label || 'L-Counter'} - Long`,
          width: widthInches,
          height: 25.5, // Standard depth
          sourceElement: ct
        });
        addPiece({
          label: `${ct.label || 'L-Counter'} - Short`,
          width: 25.5,
          height: heightInches - 25.5,
          sourceElement: ct
        });
        addedCount += 2;
      } else if (ct.type === 'countertop-u') {
        // U-shape: three rectangles
        addPiece({
          label: `${ct.label || 'U-Counter'} - Left`,
          width: 25.5,
          height: heightInches,
          sourceElement: ct
        });
        addPiece({
          label: `${ct.label || 'U-Counter'} - Back`,
          width: widthInches - 51,
          height: 25.5,
          sourceElement: ct
        });
        addPiece({
          label: `${ct.label || 'U-Counter'} - Right`,
          width: 25.5,
          height: heightInches,
          sourceElement: ct
        });
        addedCount += 3;
      } else {
        // Simple rectangle
        addPiece({
          label: ct.label || `Countertop ${index + 1}`,
          width: widthInches,
          height: heightInches,
          sourceElement: ct
        });
        addedCount++;
      }
    });

    // Auto-arrange pieces
    autoArrangePieces();

    showToast(`Imported ${addedCount} piece(s) from design`, 'success');
    render();
    updatePiecesList();
    updateStats();
  }

  function addPiece(options = {}) {
    const piece = {
      id: Date.now() + Math.random(),
      label: options.label || `Piece ${state.pieces.length + 1}`,
      x: options.x ?? 10,
      y: options.y ?? 10,
      width: options.width || 36, // Default 3 feet
      height: options.height || 25.5, // Standard 25.5" depth
      rotation: options.rotation || 0,
      sourceElement: options.sourceElement || null,
      edgeProfile: options.edgeProfile || 'eased',
      cutouts: options.cutouts || []
    };

    state.pieces.push(piece);
    return piece;
  }

  function addPieceManually() {
    const width = prompt('Enter width in inches:', '36');
    const height = prompt('Enter height (depth) in inches:', '25.5');
    const label = prompt('Enter piece label:', `Piece ${state.pieces.length + 1}`);

    if (width && height) {
      addPiece({
        label: label || undefined,
        width: parseFloat(width),
        height: parseFloat(height)
      });

      autoArrangePieces();
      render();
      updatePiecesList();
      updateStats();
    }
  }

  function removePiece(piece) {
    const index = state.pieces.indexOf(piece);
    if (index > -1) {
      state.pieces.splice(index, 1);
      showToast('Piece removed', 'info');
    }
  }

  function rotatePiece(piece, degrees = 90) {
    // Swap dimensions for 90-degree rotation
    const temp = piece.width;
    piece.width = piece.height;
    piece.height = temp;
    piece.rotation = (piece.rotation + degrees) % 360;

    // Keep in bounds
    piece.x = Math.max(0, Math.min(state.slabDimensions.width - piece.width, piece.x));
    piece.y = Math.max(0, Math.min(state.slabDimensions.height - piece.height, piece.y));

    render();
    updateStats();
  }

  function autoArrangePieces() {
    // Simple row-based arrangement
    let currentX = CONFIG.minGap;
    let currentY = CONFIG.minGap;
    let rowHeight = 0;

    state.pieces.forEach(piece => {
      // Check if piece fits in current row
      if (currentX + piece.width + CONFIG.minGap > state.slabDimensions.width) {
        // Move to next row
        currentX = CONFIG.minGap;
        currentY += rowHeight + CONFIG.minGap + CONFIG.bladeKerf;
        rowHeight = 0;
      }

      piece.x = currentX;
      piece.y = currentY;

      currentX += piece.width + CONFIG.minGap + CONFIG.bladeKerf;
      rowHeight = Math.max(rowHeight, piece.height);
    });
  }

  // ===== OPTIMIZATION =====
  function autoOptimize() {
    if (state.pieces.length === 0) {
      showToast('Add pieces first before optimizing', 'warning');
      return;
    }

    showToast('Optimizing layout...', 'info');

    // Sort pieces by area (largest first) for better packing
    const sortedPieces = [...state.pieces].sort((a, b) =>
      (b.width * b.height) - (a.width * a.height)
    );

    // Try both orientations for each piece and find best fit
    const bestLayout = findBestLayout(sortedPieces);

    if (bestLayout) {
      // Apply the optimized positions
      bestLayout.forEach((pos, i) => {
        state.pieces[i].x = pos.x;
        state.pieces[i].y = pos.y;
        if (pos.rotated) {
          const temp = state.pieces[i].width;
          state.pieces[i].width = state.pieces[i].height;
          state.pieces[i].height = temp;
        }
      });

      render();
      updateStats();
      showToast(`Layout optimized! Yield: ${calculateYield().toFixed(1)}%`, 'success');
    } else {
      showToast('Could not fit all pieces. Try a larger slab or fewer pieces.', 'warning');
    }
  }

  function findBestLayout(pieces) {
    // Bottom-left bin packing algorithm
    const positions = [];
    const placed = [];
    const slabW = state.slabDimensions.width;
    const slabH = state.slabDimensions.height;
    const gap = CONFIG.minGap + CONFIG.bladeKerf;

    for (const piece of pieces) {
      let bestPos = null;
      let bestScore = Infinity;

      // Try both orientations
      const orientations = [
        { w: piece.width, h: piece.height, rotated: false },
        { w: piece.height, h: piece.width, rotated: true }
      ];

      for (const orient of orientations) {
        // Try each position
        for (let y = 0; y <= slabH - orient.h; y += 1) {
          for (let x = 0; x <= slabW - orient.w; x += 1) {
            // Check if position is valid (no overlaps)
            const overlaps = placed.some(p =>
              !(x + orient.w + gap <= p.x || x >= p.x + p.w + gap ||
                y + orient.h + gap <= p.y || y >= p.y + p.h + gap)
            );

            if (!overlaps) {
              // Score: prefer bottom-left positions
              const score = y * slabW + x;
              if (score < bestScore) {
                bestScore = score;
                bestPos = { x, y, w: orient.w, h: orient.h, rotated: orient.rotated };
              }
            }
          }
        }
      }

      if (bestPos) {
        positions.push(bestPos);
        placed.push(bestPos);
      } else {
        return null; // Could not place piece
      }
    }

    return positions;
  }

  // ===== STATISTICS =====
  function calculateYield() {
    const slabArea = state.slabDimensions.width * state.slabDimensions.height;
    const usedArea = state.pieces.reduce((sum, p) => sum + (p.width * p.height), 0);
    return (usedArea / slabArea) * 100;
  }

  function updateStats() {
    const slabAreaSqft = (state.slabDimensions.width * state.slabDimensions.height) / 144;
    const usedAreaSqft = state.pieces.reduce((sum, p) => sum + (p.width * p.height), 0) / 144;
    const wasteAreaSqft = slabAreaSqft - usedAreaSqft;
    const yieldPercent = calculateYield();

    document.getElementById('statSlabArea').textContent = slabAreaSqft.toFixed(1);
    document.getElementById('statUsedArea').textContent = usedAreaSqft.toFixed(1);
    document.getElementById('statWasteArea').textContent = wasteAreaSqft.toFixed(1);
    document.getElementById('statYieldPercent').textContent = `${yieldPercent.toFixed(0)}%`;

    const yieldBar = document.getElementById('yieldBar');
    if (yieldBar) {
      yieldBar.style.width = `${yieldPercent}%`;
      yieldBar.style.background = yieldPercent >= 85 ? '#10b981' :
                                   yieldPercent >= 70 ? '#f59e0b' : '#ef4444';
    }

    const yieldNote = document.getElementById('yieldNote');
    if (yieldNote) {
      if (yieldPercent >= 85) {
        yieldNote.textContent = 'Excellent yield! This is an efficient layout.';
        yieldNote.style.color = '#10b981';
      } else if (yieldPercent >= 70) {
        yieldNote.textContent = 'Good yield. Try rotating pieces for better fit.';
        yieldNote.style.color = '#f59e0b';
      } else if (usedAreaSqft > 0) {
        yieldNote.textContent = 'Low yield. Consider a smaller slab or rearranging pieces.';
        yieldNote.style.color = '#ef4444';
      } else {
        yieldNote.textContent = 'Add countertop pieces to calculate yield.';
        yieldNote.style.color = '#9ca3af';
      }
    }
  }

  // ===== OVERLAP DETECTION =====
  function checkOverlaps() {
    let hasOverlap = false;

    for (let i = 0; i < state.pieces.length; i++) {
      for (let j = i + 1; j < state.pieces.length; j++) {
        if (piecesOverlap(state.pieces[i], state.pieces[j])) {
          hasOverlap = true;
          break;
        }
      }
    }

    if (hasOverlap) {
      showToast('Warning: Pieces are overlapping!', 'warning');
    }
  }

  function piecesOverlap(a, b) {
    return !(a.x + a.width <= b.x || b.x + b.width <= a.x ||
             a.y + a.height <= b.y || b.y + b.height <= a.y);
  }

  // ===== UI UPDATES =====
  function updatePiecesList() {
    const list = document.getElementById('slabPiecesList');
    if (!list) return;

    if (state.pieces.length === 0) {
      list.innerHTML = '<p class="slab-pieces-empty">No pieces yet. Import from your room design or add manually.</p>';
      return;
    }

    list.innerHTML = state.pieces.map((piece, i) => `
      <div class="slab-piece-item ${piece === state.selectedPiece ? 'selected' : ''}"
           onclick="SlabLayout.selectPiece(${i})">
        <div class="slab-piece-info">
          <strong>${piece.label}</strong>
          <span>${piece.width}" × ${piece.height}" (${((piece.width * piece.height) / 144).toFixed(2)} sq ft)</span>
        </div>
        <div class="slab-piece-actions">
          <button onclick="event.stopPropagation(); SlabLayout.rotatePieceByIndex(${i})" title="Rotate 90°">↻</button>
          <button onclick="event.stopPropagation(); SlabLayout.removePieceByIndex(${i})" title="Remove">×</button>
        </div>
      </div>
    `).join('');
  }

  function selectPiece(index) {
    state.selectedPiece = state.pieces[index] || null;
    render();
    updatePiecesList();
  }

  function rotatePieceByIndex(index) {
    if (state.pieces[index]) {
      rotatePiece(state.pieces[index]);
      updatePiecesList();
    }
  }

  function removePieceByIndex(index) {
    if (state.pieces[index]) {
      state.pieces.splice(index, 1);
      state.selectedPiece = null;
      render();
      updatePiecesList();
      updateStats();
    }
  }

  // ===== SLAB SIZE =====
  function updateSlabSize() {
    const width = parseInt(document.getElementById('slabWidth')?.value) || 120;
    const height = parseInt(document.getElementById('slabHeight')?.value) || 60;

    state.slabDimensions.width = width;
    state.slabDimensions.height = height;

    render();
    updateStats();
  }

  function applyPreset(preset) {
    if (CONFIG.slabSizes[preset]) {
      const size = CONFIG.slabSizes[preset];
      state.slabDimensions.width = size.width;
      state.slabDimensions.height = size.height;

      document.getElementById('slabWidth').value = size.width;
      document.getElementById('slabHeight').value = size.height;

      render();
      updateStats();
    }
  }

  // ===== TABS & PANELS =====
  function showSourceTab(tab) {
    document.querySelectorAll('.slab-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.slab-source-content').forEach(c => c.style.display = 'none');

    event.target.classList.add('active');
    document.getElementById(`slabSource${tab.charAt(0).toUpperCase() + tab.slice(1)}`).style.display = 'block';

    if (tab === 'inventory') {
      loadInventory();
    }
  }

  // ===== INVENTORY INTEGRATION =====
  async function loadInventory() {
    const list = document.getElementById('slabInventoryList');
    if (!list) return;

    try {
      const apiBase = window.SG_CONFIG?.API_URL || '';
      const response = await fetch(`${apiBase}/api/marketplace/slabs?limit=50`);

      if (!response.ok) throw new Error('Failed to load inventory');

      const data = await response.json();
      state.inventory = data.slabs || [];

      if (state.inventory.length === 0) {
        list.innerHTML = '<p class="slab-inventory-empty">No slabs in inventory.</p>';
        return;
      }

      list.innerHTML = state.inventory.map(slab => `
        <div class="slab-inventory-item" onclick="SlabLayout.selectInventorySlab('${slab.id}')">
          <img src="${slab.primary_image_url || slab.images?.[0] || '/assets/placeholder-slab.png'}"
               alt="${slab.product_name || slab.name}"
               onerror="this.src='/assets/placeholder-slab.png'">
          <div class="slab-inventory-info">
            <strong>${slab.product_name || slab.name}</strong>
            <span>${slab.brand || ''} ${slab.material_type || ''}</span>
            <span>${slab.length_inches || 120}" × ${slab.width_inches || 60}"</span>
          </div>
        </div>
      `).join('');
    } catch (err) {
      console.error('Failed to load inventory:', err);
      list.innerHTML = '<p class="slab-inventory-empty">Could not load inventory. Check your connection.</p>';
    }
  }

  function searchInventory(query) {
    const list = document.getElementById('slabInventoryList');
    if (!list || !state.inventory.length) return;

    const filtered = state.inventory.filter(slab => {
      const searchStr = `${slab.product_name} ${slab.brand} ${slab.material_type} ${slab.color}`.toLowerCase();
      return searchStr.includes(query.toLowerCase());
    });

    if (filtered.length === 0) {
      list.innerHTML = '<p class="slab-inventory-empty">No matching slabs found.</p>';
      return;
    }

    list.innerHTML = filtered.map(slab => `
      <div class="slab-inventory-item" onclick="SlabLayout.selectInventorySlab('${slab.id}')">
        <img src="${slab.primary_image_url || slab.images?.[0] || '/assets/placeholder-slab.png'}"
             alt="${slab.product_name || slab.name}">
        <div class="slab-inventory-info">
          <strong>${slab.product_name || slab.name}</strong>
          <span>${slab.brand || ''} ${slab.material_type || ''}</span>
        </div>
      </div>
    `).join('');
  }

  function selectInventorySlab(slabId) {
    const slab = state.inventory.find(s => s.id === slabId);
    if (!slab) return;

    state.selectedSlabId = slabId;
    state.slabDimensions.width = slab.length_inches || 120;
    state.slabDimensions.height = slab.width_inches || 60;

    document.getElementById('slabWidth').value = state.slabDimensions.width;
    document.getElementById('slabHeight').value = state.slabDimensions.height;
    document.getElementById('slabSizePreset').value = '';

    // Load slab image
    const imageUrl = slab.primary_image_url || slab.images?.[0];
    if (imageUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        state.slabImage = img;
        state.slabImageUrl = imageUrl;
        render();
      };
      img.onerror = () => {
        state.slabImage = null;
        render();
      };
      img.src = imageUrl;
    }

    // Highlight selected item
    document.querySelectorAll('.slab-inventory-item').forEach(el => el.classList.remove('selected'));
    event.target.closest('.slab-inventory-item')?.classList.add('selected');

    showToast(`Selected: ${slab.product_name || slab.name}`, 'success');
    updateStats();
  }

  // ===== VEIN GUIDE =====
  function toggleVeinGuide(show) {
    state.showVeinGuide = show;
    document.getElementById('veinAngleControl').style.display = show ? 'flex' : 'none';
    render();
  }

  function setVeinAngle(angle) {
    state.veinAngle = parseInt(angle);
    document.getElementById('veinAngleValue').textContent = `${angle}°`;
    render();
  }

  // ===== TOOLS =====
  function setTool(tool) {
    document.querySelectorAll('.slab-tool-btn').forEach(btn => btn.classList.remove('active'));
    event.target.closest('.slab-tool-btn')?.classList.add('active');
    state.currentTool = tool;
  }

  function zoomIn() {
    state.scale = Math.min(5, state.scale * 1.2);
    document.getElementById('slabCanvasZoom').textContent = `${Math.round(state.scale * 100)}%`;
    render();
  }

  function zoomOut() {
    state.scale = Math.max(0.5, state.scale / 1.2);
    document.getElementById('slabCanvasZoom').textContent = `${Math.round(state.scale * 100)}%`;
    render();
  }

  function fitToView() {
    if (!slabCanvas) return;

    const padding = 40;
    const scaleX = (slabCanvas.width - padding * 2) / state.slabDimensions.width;
    const scaleY = (slabCanvas.height - padding * 2) / state.slabDimensions.height;

    state.scale = Math.min(scaleX, scaleY, 3);
    state.panX = (slabCanvas.width - state.slabDimensions.width * state.scale) / 2;
    state.panY = (slabCanvas.height - state.slabDimensions.height * state.scale) / 2;

    document.getElementById('slabCanvasZoom').textContent = `${Math.round(state.scale * 100)}%`;
    render();
  }

  // ===== CUT SHEET GENERATION =====
  function generateCutSheet() {
    if (state.pieces.length === 0) {
      showToast('Add pieces before generating a cut sheet', 'warning');
      return;
    }

    // Generate PDF cut sheet
    if (typeof jspdf === 'undefined' && typeof jsPDF === 'undefined') {
      showToast('PDF library not loaded', 'error');
      return;
    }

    const { jsPDF } = window.jspdf || window;
    const doc = new jsPDF('landscape');

    // Header
    doc.setFontSize(20);
    doc.text('Slab Cut Sheet', 14, 20);

    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 28);
    doc.text(`Slab Size: ${state.slabDimensions.width}" × ${state.slabDimensions.height}"`, 14, 34);
    doc.text(`Total Pieces: ${state.pieces.length}`, 14, 40);
    doc.text(`Yield: ${calculateYield().toFixed(1)}%`, 14, 46);

    // Draw slab layout
    const layoutX = 14;
    const layoutY = 55;
    const layoutScale = 180 / state.slabDimensions.width;
    const layoutW = state.slabDimensions.width * layoutScale;
    const layoutH = state.slabDimensions.height * layoutScale;

    // Slab outline
    doc.setDrawColor(100, 102, 241);
    doc.setLineWidth(0.5);
    doc.rect(layoutX, layoutY, layoutW, layoutH);

    // Draw pieces
    state.pieces.forEach((piece, i) => {
      const x = layoutX + piece.x * layoutScale;
      const y = layoutY + piece.y * layoutScale;
      const w = piece.width * layoutScale;
      const h = piece.height * layoutScale;

      doc.setFillColor(99, 102, 241);
      doc.setDrawColor(255, 255, 255);
      doc.rect(x, y, w, h, 'FD');

      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text(`${i + 1}`, x + w/2, y + h/2, { align: 'center' });
    });

    // Pieces list
    let listY = layoutY + layoutH + 15;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.text('Piece List:', 14, listY);

    listY += 8;
    doc.setFontSize(10);
    state.pieces.forEach((piece, i) => {
      const sqft = ((piece.width * piece.height) / 144).toFixed(2);
      doc.text(`${i + 1}. ${piece.label}: ${piece.width}" × ${piece.height}" (${sqft} sq ft)`, 20, listY);
      listY += 6;
    });

    // Save
    doc.save('slab-cut-sheet.pdf');
    showToast('Cut sheet generated!', 'success');
  }

  // ===== OPEN/CLOSE =====
  function open() {
    state.isActive = true;
    document.getElementById('slabLayoutPanel')?.classList.add('active');
    document.getElementById('slabCanvasContainer')?.classList.add('active');
    document.body.classList.add('slab-layout-active');

    // Initialize canvas size
    setTimeout(() => {
      fitToView();
      updateStats();
    }, 100);
  }

  function close() {
    state.isActive = false;
    document.getElementById('slabLayoutPanel')?.classList.remove('active');
    document.getElementById('slabCanvasContainer')?.classList.remove('active');
    document.body.classList.remove('slab-layout-active');
  }

  function toggle() {
    if (state.isActive) {
      close();
    } else {
      open();
    }
  }

  // ===== UTILITY =====
  function showToast(message, type = 'info') {
    // Use existing toast function if available, otherwise create simple one
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
    } else {
      console.log(`[${type.toUpperCase()}] ${message}`);

      // Simple toast implementation
      const toast = document.createElement('div');
      toast.className = `slab-toast slab-toast-${type}`;
      toast.textContent = message;
      document.body.appendChild(toast);

      setTimeout(() => toast.classList.add('show'), 10);
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }
  }

  // ===== PUBLIC API =====
  window.SlabLayout = {
    init,
    open,
    close,
    toggle,
    importFromDesign,
    addPieceManually,
    autoOptimize,
    generateCutSheet,
    selectPiece,
    rotatePieceByIndex,
    removePieceByIndex,
    updateSlabSize,
    applyPreset,
    showSourceTab,
    searchInventory,
    selectInventorySlab,
    toggleVeinGuide,
    setVeinAngle,
    setTool,
    zoomIn,
    zoomOut,
    fitToView,
    toggleAutoSeams: (enabled) => { state.autoSeams = enabled; },
    getState: () => state,
    getPieces: () => state.pieces,
    getYield: calculateYield
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);
