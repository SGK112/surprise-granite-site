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
    // Grid spacing in inches (1 foot)
    gridSpacing: 12,
    // Vein guide line spacing
    veinLineSpacing: 20,
    // Standard countertop depth
    standardDepth: 25.5,
    // Zoom constraints
    minZoom: 0.5,
    maxZoom: 5,
    // Optimization step size (larger = faster but less precise)
    optimizationStep: 2,
    // Colors
    colors: {
      piece: 'rgba(99, 102, 241, 0.6)',
      pieceSelected: 'rgba(99, 102, 241, 0.8)',
      pieceBorder: '#6366f1',
      seam: '#ef4444',
      seamWarning: '#f59e0b',
      waste: 'rgba(239, 68, 68, 0.2)',
      veinLine: 'rgba(255, 255, 255, 0.3)',
      grid: 'rgba(255, 255, 255, 0.1)',
      background: '#1a1a2e',
      slabBorder: '#6366f1'
    },
    // Yield thresholds
    yieldThresholds: {
      excellent: 85,
      good: 70
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
    isPanning: false,
    panStart: { x: 0, y: 0 },
    dragOffset: { x: 0, y: 0 },
    showGrid: true,
    showVeinGuide: false,
    veinAngle: 0, // degrees
    inventory: [], // Available slabs from inventory
    canvasSize: { width: 0, height: 0 }, // Cached canvas dimensions
    placeholderTexture: null // Cached placeholder texture
  };

  // ===== DOM ELEMENTS (cached for performance) =====
  let slabCanvas, slabCtx, slabPanel;
  const domCache = {
    cursorDisplay: null,
    zoomDisplay: null,
    statSlabArea: null,
    statUsedArea: null,
    statWasteArea: null,
    statYieldPercent: null,
    yieldBar: null,
    yieldNote: null,
    piecesList: null,
    inventoryList: null
  };

  // Cache DOM elements for frequent access
  function cacheDomElements() {
    domCache.cursorDisplay = document.getElementById('slabCanvasCursor');
    domCache.zoomDisplay = document.getElementById('slabCanvasZoom');
    domCache.statSlabArea = document.getElementById('statSlabArea');
    domCache.statUsedArea = document.getElementById('statUsedArea');
    domCache.statWasteArea = document.getElementById('statWasteArea');
    domCache.statYieldPercent = document.getElementById('statYieldPercent');
    domCache.yieldBar = document.getElementById('yieldBar');
    domCache.yieldNote = document.getElementById('yieldNote');
    domCache.piecesList = document.getElementById('slabPiecesList');
    domCache.inventoryList = document.getElementById('slabInventoryList');
  }

  // ===== INITIALIZATION =====
  function init() {
    createSlabPanel();
    createSlabCanvas();
    bindEvents();
    cacheDomElements();
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
    // Validate file type
    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file', 'error');
      return;
    }

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

      img.onerror = () => {
        showToast('Failed to load image. Please try another file.', 'error');
        state.slabImage = null;
        state.slabImageUrl = null;
      };

      img.src = e.target.result;
    };

    reader.onerror = () => {
      showToast('Failed to read file. Please try again.', 'error');
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

    // Update cursor position display (using cached element)
    if (domCache.cursorDisplay) {
      domCache.cursorDisplay.textContent = `${x.toFixed(1)}", ${y.toFixed(1)}"`;
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

    updateZoomDisplay();
    render();
  }

  // Helper to update zoom display
  function updateZoomDisplay() {
    if (domCache.zoomDisplay) {
      domCache.zoomDisplay.textContent = `${Math.round(state.scale * 100)}%`;
    }
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

    // Only resize canvas if container size changed (expensive operation)
    const container = slabCanvas.parentElement;
    if (container) {
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      if (state.canvasSize.width !== newWidth || state.canvasSize.height !== newHeight) {
        slabCanvas.width = newWidth;
        slabCanvas.height = newHeight;
        state.canvasSize.width = newWidth;
        state.canvasSize.height = newHeight;
      }
    }

    // Clear canvas
    slabCtx.fillStyle = CONFIG.colors.background;
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
    slabCtx.strokeStyle = CONFIG.colors.slabBorder;
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
      // Draw placeholder slab texture (use cached if available)
      drawPlaceholderTexture();
    }
  }

  // Create and cache placeholder texture for performance
  function drawPlaceholderTexture() {
    const gradient = slabCtx.createLinearGradient(0, 0, state.slabDimensions.width, state.slabDimensions.height);
    gradient.addColorStop(0, '#4a4a5a');
    gradient.addColorStop(0.3, '#5a5a6a');
    gradient.addColorStop(0.7, '#4a4a5a');
    gradient.addColorStop(1, '#3a3a4a');
    slabCtx.fillStyle = gradient;
    slabCtx.fillRect(0, 0, state.slabDimensions.width, state.slabDimensions.height);

    // Draw consistent veining effect (seeded by slab dimensions for consistency)
    slabCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    slabCtx.lineWidth = 2;
    const seed = state.slabDimensions.width + state.slabDimensions.height;
    for (let i = 0; i < 5; i++) {
      const offset = (seed * (i + 1) * 0.1) % 1;
      slabCtx.beginPath();
      slabCtx.moveTo(offset * state.slabDimensions.width, 0);
      slabCtx.bezierCurveTo(
        ((offset + 0.3) % 1) * state.slabDimensions.width, state.slabDimensions.height * 0.3,
        ((offset + 0.6) % 1) * state.slabDimensions.width, state.slabDimensions.height * 0.7,
        ((offset + 0.2) % 1) * state.slabDimensions.width, state.slabDimensions.height
      );
      slabCtx.stroke();
    }
  }

  function drawGrid() {
    slabCtx.strokeStyle = CONFIG.colors.grid;
    slabCtx.lineWidth = 0.5 / state.scale;

    const spacing = CONFIG.gridSpacing; // Grid lines every foot (12 inches)

    // Draw vertical grid lines
    for (let x = 0; x <= state.slabDimensions.width; x += spacing) {
      slabCtx.beginPath();
      slabCtx.moveTo(x, 0);
      slabCtx.lineTo(x, state.slabDimensions.height);
      slabCtx.stroke();
    }

    // Draw horizontal grid lines
    for (let y = 0; y <= state.slabDimensions.height; y += spacing) {
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
    const spacing = CONFIG.veinLineSpacing;

    slabCtx.save();
    slabCtx.strokeStyle = CONFIG.colors.veinLine;
    slabCtx.lineWidth = 2 / state.scale;
    slabCtx.setLineDash([10, 5]);

    // Draw multiple parallel lines to show vein direction
    const perpAngle = angle + Math.PI / 2;
    for (let offset = -length; offset <= length; offset += spacing) {
      const startX = centerX + Math.cos(perpAngle) * offset - Math.cos(angle) * length;
      const startY = centerY + Math.sin(perpAngle) * offset - Math.sin(angle) * length;
      const endX = centerX + Math.cos(perpAngle) * offset + Math.cos(angle) * length;
      const endY = centerY + Math.sin(perpAngle) * offset + Math.sin(angle) * length;

      slabCtx.beginPath();
      slabCtx.moveTo(startX, startY);
      slabCtx.lineTo(endX, endY);
      slabCtx.stroke();
    }

    slabCtx.restore();
  }

  function drawPiece(piece, isSelected) {
    slabCtx.save();

    const centerX = piece.x + piece.width / 2;
    const centerY = piece.y + piece.height / 2;

    // Piece fill
    slabCtx.fillStyle = isSelected ? CONFIG.colors.pieceSelected : CONFIG.colors.piece;
    slabCtx.fillRect(piece.x, piece.y, piece.width, piece.height);

    // Piece border
    slabCtx.strokeStyle = isSelected ? '#fff' : CONFIG.colors.pieceBorder;
    slabCtx.lineWidth = (isSelected ? 3 : 2) / state.scale;
    slabCtx.strokeRect(piece.x, piece.y, piece.width, piece.height);

    // Draw labels only if piece is large enough
    const minLabelSize = 20 / state.scale;
    if (piece.width >= minLabelSize && piece.height >= minLabelSize) {
      const fontSize = Math.max(10, 14 / state.scale);

      // Piece label
      slabCtx.font = `bold ${fontSize}px Inter, sans-serif`;
      slabCtx.fillStyle = '#fff';
      slabCtx.textAlign = 'center';
      slabCtx.textBaseline = 'middle';

      const label = piece.label || `Piece ${piece.id}`;
      slabCtx.fillText(label, centerX, centerY - fontSize / 2);

      // Dimensions
      const dims = `${piece.width}" × ${piece.height}"`;
      slabCtx.font = `${fontSize * 0.8}px Inter, sans-serif`;
      slabCtx.fillStyle = 'rgba(255,255,255,0.8)';
      slabCtx.fillText(dims, centerX, centerY + fontSize / 2);
    }

    // Selection handles
    if (isSelected) {
      drawSelectionHandles(piece);
    }

    slabCtx.restore();
  }

  function drawSelectionHandles(piece) {
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

  // Placeholder for future waste area visualization
  // TODO: Implement polygon clipping for accurate waste region display
  function drawWasteAreas() {
    // Currently not implemented - would require polygon clipping
    // to accurately show waste areas between placed pieces
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

      const depth = CONFIG.standardDepth;

      // For L and U shapes, break into rectangles
      if (ct.type === 'countertop-l') {
        // L-shape: two rectangles
        addPiece({
          label: `${ct.label || 'L-Counter'} - Long`,
          width: widthInches,
          height: depth,
          sourceElement: ct
        });
        addPiece({
          label: `${ct.label || 'L-Counter'} - Short`,
          width: depth,
          height: heightInches - depth,
          sourceElement: ct
        });
        addedCount += 2;
      } else if (ct.type === 'countertop-u') {
        // U-shape: three rectangles
        addPiece({
          label: `${ct.label || 'U-Counter'} - Left`,
          width: depth,
          height: heightInches,
          sourceElement: ct
        });
        addPiece({
          label: `${ct.label || 'U-Counter'} - Back`,
          width: widthInches - (depth * 2),
          height: depth,
          sourceElement: ct
        });
        addPiece({
          label: `${ct.label || 'U-Counter'} - Right`,
          width: depth,
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
      x: options.x ?? CONFIG.minGap,
      y: options.y ?? CONFIG.minGap,
      width: options.width || 36, // Default 3 feet
      height: options.height || CONFIG.standardDepth,
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
    const height = prompt('Enter height (depth) in inches:', String(CONFIG.standardDepth));
    const label = prompt('Enter piece label:', `Piece ${state.pieces.length + 1}`);

    if (width && height) {
      const parsedWidth = parseFloat(width);
      const parsedHeight = parseFloat(height);

      // Validate dimensions
      if (isNaN(parsedWidth) || isNaN(parsedHeight) || parsedWidth <= 0 || parsedHeight <= 0) {
        showToast('Invalid dimensions. Please enter positive numbers.', 'error');
        return;
      }

      addPiece({
        label: label || undefined,
        width: parsedWidth,
        height: parsedHeight
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
    // Bottom-left bin packing algorithm with optimizations
    const positions = [];
    const placed = [];
    const slabW = state.slabDimensions.width;
    const slabH = state.slabDimensions.height;
    const gap = CONFIG.minGap + CONFIG.bladeKerf;
    const step = CONFIG.optimizationStep; // Larger step = faster but less precise

    for (const piece of pieces) {
      let bestPos = null;
      let bestScore = Infinity;

      // Try both orientations
      const orientations = [
        { w: piece.width, h: piece.height, rotated: false },
        { w: piece.height, h: piece.width, rotated: true }
      ];

      for (const orient of orientations) {
        // Skip if piece doesn't fit in this orientation
        if (orient.w > slabW || orient.h > slabH) continue;

        // Try each position with step size for optimization
        for (let y = 0; y <= slabH - orient.h; y += step) {
          for (let x = 0; x <= slabW - orient.w; x += step) {
            // Early termination: if we found a position at y=0, x=0, it's optimal
            if (bestPos && bestPos.y === 0 && bestPos.x < step) break;

            // Check if position is valid (no overlaps)
            const overlaps = checkOverlapsWithPlaced(x, y, orient.w, orient.h, placed, gap);

            if (!overlaps) {
              // Score: prefer bottom-left positions
              const score = y * slabW + x;
              if (score < bestScore) {
                bestScore = score;
                bestPos = { x, y, w: orient.w, h: orient.h, rotated: orient.rotated };
              }
            }
          }
          // Early termination at row level
          if (bestPos && bestPos.y === 0) break;
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

  // Helper function to check overlaps with placed pieces
  function checkOverlapsWithPlaced(x, y, w, h, placed, gap) {
    for (const p of placed) {
      if (!(x + w + gap <= p.x || x >= p.x + p.w + gap ||
            y + h + gap <= p.y || y >= p.y + p.h + gap)) {
        return true;
      }
    }
    return false;
  }

  // ===== STATISTICS =====
  function calculateYield() {
    const slabArea = state.slabDimensions.width * state.slabDimensions.height;
    const usedArea = state.pieces.reduce((sum, p) => sum + (p.width * p.height), 0);
    return (usedArea / slabArea) * 100;
  }

  function updateStats() {
    // Calculate areas
    const slabAreaSqft = (state.slabDimensions.width * state.slabDimensions.height) / 144;
    const usedAreaSqft = state.pieces.reduce((sum, p) => sum + (p.width * p.height), 0) / 144;
    const wasteAreaSqft = slabAreaSqft - usedAreaSqft;
    const yieldPercent = calculateYield();

    // Update stat displays using cached elements
    if (domCache.statSlabArea) domCache.statSlabArea.textContent = slabAreaSqft.toFixed(1);
    if (domCache.statUsedArea) domCache.statUsedArea.textContent = usedAreaSqft.toFixed(1);
    if (domCache.statWasteArea) domCache.statWasteArea.textContent = wasteAreaSqft.toFixed(1);
    if (domCache.statYieldPercent) domCache.statYieldPercent.textContent = `${yieldPercent.toFixed(0)}%`;

    // Update yield bar
    if (domCache.yieldBar) {
      domCache.yieldBar.style.width = `${yieldPercent}%`;
      domCache.yieldBar.style.background =
        yieldPercent >= CONFIG.yieldThresholds.excellent ? '#10b981' :
        yieldPercent >= CONFIG.yieldThresholds.good ? '#f59e0b' : '#ef4444';
    }

    // Update yield note
    if (domCache.yieldNote) {
      updateYieldNote(yieldPercent, usedAreaSqft);
    }
  }

  function updateYieldNote(yieldPercent, usedAreaSqft) {
    const note = domCache.yieldNote;
    if (!note) return;

    if (yieldPercent >= CONFIG.yieldThresholds.excellent) {
      note.textContent = 'Excellent yield! This is an efficient layout.';
      note.style.color = '#10b981';
    } else if (yieldPercent >= CONFIG.yieldThresholds.good) {
      note.textContent = 'Good yield. Try rotating pieces for better fit.';
      note.style.color = '#f59e0b';
    } else if (usedAreaSqft > 0) {
      note.textContent = 'Low yield. Consider a smaller slab or rearranging pieces.';
      note.style.color = '#ef4444';
    } else {
      note.textContent = 'Add countertop pieces to calculate yield.';
      note.style.color = '#9ca3af';
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
    const size = CONFIG.slabSizes[preset];
    if (!size) return;

    state.slabDimensions.width = size.width;
    state.slabDimensions.height = size.height;

    // Update input fields with null checks
    const widthInput = document.getElementById('slabWidth');
    const heightInput = document.getElementById('slabHeight');
    if (widthInput) widthInput.value = size.width;
    if (heightInput) heightInput.value = size.height;

    render();
    updateStats();
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
    const list = domCache.inventoryList || document.getElementById('slabInventoryList');
    if (!list) return;

    // Show loading state
    list.innerHTML = '<p class="slab-inventory-empty">Loading inventory...</p>';

    try {
      const apiBase = window.SG_CONFIG?.API_URL || '';

      // Fetch with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(`${apiBase}/api/marketplace/slabs?limit=50`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Validate response structure
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response format');
      }

      state.inventory = Array.isArray(data.slabs) ? data.slabs : [];

      if (state.inventory.length === 0) {
        list.innerHTML = '<p class="slab-inventory-empty">No slabs in inventory.</p>';
        return;
      }

      list.innerHTML = state.inventory.map(renderInventoryItem).join('');
    } catch (err) {
      console.error('Failed to load inventory:', err);

      // Provide specific error messages
      let errorMessage = 'Could not load inventory.';
      if (err.name === 'AbortError') {
        errorMessage = 'Request timed out. Please try again.';
      } else if (err.message.includes('HTTP')) {
        errorMessage = 'Server error. Please try again later.';
      } else if (!navigator.onLine) {
        errorMessage = 'No internet connection.';
      }

      list.innerHTML = `<p class="slab-inventory-empty">${errorMessage}</p>`;
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

    list.innerHTML = filtered.map(renderInventoryItem).join('');
  }

  // Reusable template for inventory items
  function renderInventoryItem(slab) {
    const imageUrl = slab.primary_image_url || slab.images?.[0] || '/assets/placeholder-slab.png';
    const name = slab.product_name || slab.name || 'Unknown Slab';
    const brand = slab.brand || '';
    const material = slab.material_type || '';
    const dimensions = `${slab.length_inches || 120}" × ${slab.width_inches || 60}"`;

    return `
      <div class="slab-inventory-item" onclick="SlabLayout.selectInventorySlab('${slab.id}')">
        <img src="${imageUrl}" alt="${name}" onerror="this.src='/assets/placeholder-slab.png'">
        <div class="slab-inventory-info">
          <strong>${name}</strong>
          <span>${brand} ${material}</span>
          <span>${dimensions}</span>
        </div>
      </div>
    `;
  }

  function selectInventorySlab(slabId) {
    const slab = state.inventory.find(s => s.id === slabId);
    if (!slab) {
      showToast('Slab not found', 'error');
      return;
    }

    // Update dimensions
    state.slabDimensions.width = slab.length_inches || 120;
    state.slabDimensions.height = slab.width_inches || 60;

    // Update input fields with null checks
    const widthInput = document.getElementById('slabWidth');
    const heightInput = document.getElementById('slabHeight');
    const presetSelect = document.getElementById('slabSizePreset');

    if (widthInput) widthInput.value = state.slabDimensions.width;
    if (heightInput) heightInput.value = state.slabDimensions.height;
    if (presetSelect) presetSelect.value = '';

    // Load slab image
    const imageUrl = slab.primary_image_url || slab.images?.[0];
    if (imageUrl) {
      loadImageFromUrl(imageUrl);
    } else {
      state.slabImage = null;
      state.slabImageUrl = null;
      render();
    }

    // Highlight selected item
    document.querySelectorAll('.slab-inventory-item').forEach(el => el.classList.remove('selected'));
    if (event?.target) {
      event.target.closest('.slab-inventory-item')?.classList.add('selected');
    }

    showToast(`Selected: ${slab.product_name || slab.name}`, 'success');
    updateStats();
  }

  // Helper to load image from URL with error handling
  function loadImageFromUrl(imageUrl) {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      state.slabImage = img;
      state.slabImageUrl = imageUrl;
      render();
    };

    img.onerror = () => {
      console.warn('Failed to load slab image:', imageUrl);
      state.slabImage = null;
      state.slabImageUrl = null;
      render();
    };

    img.src = imageUrl;
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
    state.scale = Math.min(CONFIG.maxZoom, state.scale * 1.2);
    updateZoomDisplay();
    render();
  }

  function zoomOut() {
    state.scale = Math.max(CONFIG.minZoom, state.scale / 1.2);
    updateZoomDisplay();
    render();
  }

  function fitToView() {
    if (!slabCanvas) return;

    const padding = 40;
    const scaleX = (slabCanvas.width - padding * 2) / state.slabDimensions.width;
    const scaleY = (slabCanvas.height - padding * 2) / state.slabDimensions.height;

    state.scale = Math.min(scaleX, scaleY, CONFIG.maxZoom);
    state.panX = (slabCanvas.width - state.slabDimensions.width * state.scale) / 2;
    state.panY = (slabCanvas.height - state.slabDimensions.height * state.scale) / 2;

    updateZoomDisplay();
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
    // Lifecycle
    init,
    open,
    close,
    toggle,

    // Piece management
    importFromDesign,
    addPieceManually,
    selectPiece,
    rotatePieceByIndex,
    removePieceByIndex,

    // Layout operations
    autoOptimize,
    generateCutSheet,

    // Slab configuration
    updateSlabSize,
    applyPreset,

    // UI controls
    showSourceTab,
    searchInventory,
    selectInventorySlab,
    toggleVeinGuide,
    setVeinAngle,
    setTool,
    zoomIn,
    zoomOut,
    fitToView,

    // State accessors (read-only)
    getState: () => ({ ...state }), // Return copy to prevent mutation
    getPieces: () => [...state.pieces], // Return copy
    getYield: calculateYield,
    isActive: () => state.isActive
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);
