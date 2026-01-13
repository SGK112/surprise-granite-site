/**
 * BLUEPRINT AI - Design & Image Generation System
 * AI-powered design visualization for remodeling
 * Powered by Remodely AI
 * Version: 1.0
 */

(function() {
  'use strict';

  const DEFAULT_CONFIG = {
    // API Configuration
    apiEndpoint: 'https://api.remodely.ai',

    // Image Generation Settings
    imageModel: 'stable-diffusion-xl', // or 'dall-e-3', 'midjourney'
    defaultSize: '1024x1024',
    quality: 'hd',

    // Blueprint Settings
    blueprintStyle: 'modern',
    units: 'imperial', // 'metric'

    // Branding
    businessName: 'Your Business',
    primaryColor: '#f9cb00',
    secondaryColor: '#1a1a2e',
    watermark: true,

    // Categories
    categories: [
      { id: 'kitchen', name: 'Kitchen', icon: 'kitchen' },
      { id: 'bathroom', name: 'Bathroom', icon: 'bathroom' },
      { id: 'living', name: 'Living Room', icon: 'sofa' },
      { id: 'outdoor', name: 'Outdoor', icon: 'tree' },
      { id: 'commercial', name: 'Commercial', icon: 'building' }
    ],

    // Style presets
    styles: [
      { id: 'modern', name: 'Modern', prompt: 'modern minimalist clean lines' },
      { id: 'traditional', name: 'Traditional', prompt: 'traditional classic elegant' },
      { id: 'farmhouse', name: 'Farmhouse', prompt: 'farmhouse rustic warm wood' },
      { id: 'contemporary', name: 'Contemporary', prompt: 'contemporary sleek urban' },
      { id: 'mediterranean', name: 'Mediterranean', prompt: 'mediterranean warm terracotta' },
      { id: 'industrial', name: 'Industrial', prompt: 'industrial exposed brick metal' },
      { id: 'coastal', name: 'Coastal', prompt: 'coastal beach light airy' },
      { id: 'transitional', name: 'Transitional', prompt: 'transitional blend modern traditional' }
    ],

    // Material options
    materials: {
      countertops: ['Granite', 'Quartz', 'Marble', 'Quartzite', 'Concrete', 'Butcher Block'],
      cabinets: ['White Shaker', 'Dark Wood', 'Gray Modern', 'Natural Oak', 'Two-Tone'],
      flooring: ['Hardwood', 'Tile', 'LVP', 'Natural Stone', 'Concrete'],
      backsplash: ['Subway Tile', 'Mosaic', 'Natural Stone', 'Glass', 'Metallic']
    },

    // Theme
    theme: 'dark'
  };

  class BlueprintAI {
    constructor(config = {}) {
      this.config = { ...DEFAULT_CONFIG, ...config };
      this.state = {
        currentProject: null,
        generatedImages: [],
        roomDimensions: null,
        selectedStyle: null,
        selectedMaterials: {},
        isGenerating: false
      };
      this.container = null;
    }

    // Initialize widget
    init(containerId) {
      this.container = document.getElementById(containerId);
      if (this.container) {
        this.render();
        this.injectStyles();
      }
      return this;
    }

    // Inject styles
    injectStyles() {
      if (document.getElementById('blueprint-ai-styles')) return;

      const primary = this.config.primaryColor;
      const secondary = this.config.secondaryColor;
      const isDark = this.config.theme === 'dark';

      const styles = document.createElement('style');
      styles.id = 'blueprint-ai-styles';
      styles.textContent = `
        .bai-container * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Inter', -apple-system, sans-serif; }

        .bai-container {
          background: ${isDark ? secondary : '#ffffff'};
          border-radius: 16px;
          overflow: hidden;
          color: ${isDark ? '#fff' : '#1a1a2e'};
        }

        .bai-header {
          padding: 24px;
          background: linear-gradient(135deg, ${secondary}, ${this.adjustColor(secondary, 15)});
          color: #fff;
        }
        .bai-header-title { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
        .bai-header-subtitle { font-size: 14px; opacity: 0.8; }

        .bai-body { padding: 24px; }

        .bai-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 24px;
          overflow-x: auto;
          padding-bottom: 8px;
        }
        .bai-tab {
          padding: 10px 20px;
          border-radius: 10px;
          border: none;
          background: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'};
          color: ${isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)'};
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          white-space: nowrap;
          transition: all 0.2s;
        }
        .bai-tab:hover { background: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}; }
        .bai-tab.active {
          background: ${primary};
          color: ${secondary};
        }

        .bai-section { margin-bottom: 24px; }
        .bai-section-title {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .bai-style-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 12px;
        }
        .bai-style-card {
          background: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'};
          border: 2px solid transparent;
          border-radius: 12px;
          padding: 16px;
          cursor: pointer;
          text-align: center;
          transition: all 0.2s;
        }
        .bai-style-card:hover { border-color: ${primary}; }
        .bai-style-card.selected {
          border-color: ${primary};
          background: ${this.hexToRgba(primary, 0.15)};
        }
        .bai-style-card-name { font-weight: 600; font-size: 14px; }

        .bai-materials {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .bai-material-row {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .bai-material-label { font-size: 14px; font-weight: 500; }
        .bai-material-select {
          padding: 12px 16px;
          border-radius: 10px;
          border: 2px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};
          background: ${isDark ? 'rgba(255,255,255,0.05)' : '#fff'};
          color: ${isDark ? '#fff' : '#1a1a2e'};
          font-size: 14px;
          cursor: pointer;
          transition: border-color 0.2s;
        }
        .bai-material-select:focus {
          outline: none;
          border-color: ${primary};
        }

        .bai-dimensions {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        .bai-dim-input {
          padding: 12px;
          border-radius: 10px;
          border: 2px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};
          background: ${isDark ? 'rgba(255,255,255,0.05)' : '#fff'};
          color: ${isDark ? '#fff' : '#1a1a2e'};
          font-size: 14px;
          text-align: center;
        }
        .bai-dim-input:focus {
          outline: none;
          border-color: ${primary};
        }
        .bai-dim-label { font-size: 12px; text-align: center; opacity: 0.6; margin-top: 4px; }

        .bai-prompt-area {
          width: 100%;
          padding: 16px;
          border-radius: 12px;
          border: 2px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};
          background: ${isDark ? 'rgba(255,255,255,0.05)' : '#fff'};
          color: ${isDark ? '#fff' : '#1a1a2e'};
          font-size: 14px;
          resize: vertical;
          min-height: 100px;
          font-family: inherit;
        }
        .bai-prompt-area:focus {
          outline: none;
          border-color: ${primary};
        }
        .bai-prompt-area::placeholder { color: ${isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}; }

        .bai-generate-btn {
          width: 100%;
          padding: 16px;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, ${primary}, ${this.adjustColor(primary, -20)});
          color: ${secondary};
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }
        .bai-generate-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px ${this.hexToRgba(primary, 0.4)}; }
        .bai-generate-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .bai-generate-btn svg { width: 20px; height: 20px; }

        .bai-results {
          margin-top: 24px;
        }
        .bai-results-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 16px;
        }
        .bai-result-card {
          background: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'};
          border-radius: 12px;
          overflow: hidden;
          cursor: pointer;
          transition: all 0.3s;
        }
        .bai-result-card:hover { transform: scale(1.02); }
        .bai-result-image {
          width: 100%;
          aspect-ratio: 1;
          object-fit: cover;
        }
        .bai-result-actions {
          padding: 12px;
          display: flex;
          gap: 8px;
        }
        .bai-action-btn {
          flex: 1;
          padding: 8px;
          border-radius: 8px;
          border: none;
          background: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'};
          color: ${isDark ? '#fff' : '#1a1a2e'};
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .bai-action-btn:hover { background: ${primary}; color: ${secondary}; }

        .bai-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px;
          gap: 16px;
        }
        .bai-spinner {
          width: 48px;
          height: 48px;
          border: 4px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};
          border-top-color: ${primary};
          border-radius: 50%;
          animation: baiSpin 1s linear infinite;
        }
        @keyframes baiSpin { to { transform: rotate(360deg); } }
        .bai-loading-text { font-size: 14px; opacity: 0.7; }

        .bai-upload-zone {
          border: 2px dashed ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'};
          border-radius: 12px;
          padding: 32px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
        }
        .bai-upload-zone:hover {
          border-color: ${primary};
          background: ${this.hexToRgba(primary, 0.05)};
        }
        .bai-upload-zone.dragging {
          border-color: ${primary};
          background: ${this.hexToRgba(primary, 0.1)};
        }
        .bai-upload-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.5; }
        .bai-upload-text { font-size: 14px; opacity: 0.7; }

        .bai-preview-modal {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.9);
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          visibility: hidden;
          transition: all 0.3s;
        }
        .bai-preview-modal.open { opacity: 1; visibility: visible; }
        .bai-preview-image { max-width: 90%; max-height: 90%; border-radius: 8px; }
        .bai-preview-close {
          position: absolute;
          top: 20px;
          right: 20px;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: rgba(255,255,255,0.1);
          border: none;
          color: #fff;
          cursor: pointer;
          font-size: 24px;
        }

        .bai-footer {
          padding: 16px 24px;
          border-top: 1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'};
          text-align: center;
        }
        .bai-powered {
          font-size: 11px;
          color: ${isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'};
        }
        .bai-powered a { color: ${primary}; text-decoration: none; }
      `;

      document.head.appendChild(styles);
    }

    // Main render
    render() {
      this.container.innerHTML = `
        <div class="bai-container">
          <div class="bai-header">
            <div class="bai-header-title">AI Design Studio</div>
            <div class="bai-header-subtitle">Visualize your dream space with AI</div>
          </div>

          <div class="bai-body">
            <div class="bai-tabs" id="baiTabs">
              <button class="bai-tab active" data-tab="generate">Generate Design</button>
              <button class="bai-tab" data-tab="transform">Transform Photo</button>
              <button class="bai-tab" data-tab="blueprint">Floor Plan</button>
            </div>

            <div id="baiContent">
              ${this.renderGenerateTab()}
            </div>
          </div>

          <div class="bai-footer">
            <div class="bai-powered">AI Design by <a href="https://remodely.ai" target="_blank">Remodely.ai</a></div>
          </div>
        </div>
      `;

      this.attachEvents();
    }

    // Render generate tab
    renderGenerateTab() {
      return `
        <div class="bai-section">
          <div class="bai-section-title">Room Type</div>
          <div class="bai-tabs" id="baiRoomTabs">
            ${this.config.categories.map(cat => `
              <button class="bai-tab ${cat.id === 'kitchen' ? 'active' : ''}" data-room="${cat.id}">${cat.name}</button>
            `).join('')}
          </div>
        </div>

        <div class="bai-section">
          <div class="bai-section-title">Design Style</div>
          <div class="bai-style-grid">
            ${this.config.styles.map(style => `
              <div class="bai-style-card" data-style="${style.id}">
                <div class="bai-style-card-name">${style.name}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="bai-section">
          <div class="bai-section-title">Materials</div>
          <div class="bai-materials">
            <div class="bai-material-row">
              <label class="bai-material-label">Countertops</label>
              <select class="bai-material-select" id="baiCountertops">
                <option value="">Select countertop material...</option>
                ${this.config.materials.countertops.map(m => `<option value="${m}">${m}</option>`).join('')}
              </select>
            </div>
            <div class="bai-material-row">
              <label class="bai-material-label">Cabinets</label>
              <select class="bai-material-select" id="baiCabinets">
                <option value="">Select cabinet style...</option>
                ${this.config.materials.cabinets.map(m => `<option value="${m}">${m}</option>`).join('')}
              </select>
            </div>
            <div class="bai-material-row">
              <label class="bai-material-label">Flooring</label>
              <select class="bai-material-select" id="baiFlooring">
                <option value="">Select flooring type...</option>
                ${this.config.materials.flooring.map(m => `<option value="${m}">${m}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>

        <div class="bai-section">
          <div class="bai-section-title">Room Dimensions (optional)</div>
          <div class="bai-dimensions">
            <div>
              <input type="number" class="bai-dim-input" id="baiWidth" placeholder="12">
              <div class="bai-dim-label">Width (ft)</div>
            </div>
            <div>
              <input type="number" class="bai-dim-input" id="baiLength" placeholder="14">
              <div class="bai-dim-label">Length (ft)</div>
            </div>
            <div>
              <input type="number" class="bai-dim-input" id="baiHeight" placeholder="9">
              <div class="bai-dim-label">Ceiling (ft)</div>
            </div>
          </div>
        </div>

        <div class="bai-section">
          <div class="bai-section-title">Additional Details</div>
          <textarea class="bai-prompt-area" id="baiPrompt" placeholder="Describe any specific features you'd like to see... (e.g., large island, pendant lights, subway tile backsplash, stainless appliances)"></textarea>
        </div>

        <button class="bai-generate-btn" id="baiGenerateBtn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polygon points="10,8 16,12 10,16"/>
          </svg>
          Generate Design
        </button>

        <div class="bai-results" id="baiResults"></div>
      `;
    }

    // Render transform tab
    renderTransformTab() {
      return `
        <div class="bai-section">
          <div class="bai-section-title">Upload Your Space</div>
          <div class="bai-upload-zone" id="baiUploadZone">
            <div class="bai-upload-icon">📷</div>
            <div class="bai-upload-text">Drag & drop a photo or click to upload</div>
            <input type="file" id="baiFileInput" accept="image/*" style="display:none">
          </div>
        </div>

        <div id="baiUploadedImage" style="display:none;margin-bottom:24px;"></div>

        <div class="bai-section">
          <div class="bai-section-title">Transform Style</div>
          <div class="bai-style-grid">
            ${this.config.styles.map(style => `
              <div class="bai-style-card" data-style="${style.id}">
                <div class="bai-style-card-name">${style.name}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="bai-section">
          <div class="bai-section-title">What to Change</div>
          <textarea class="bai-prompt-area" id="baiTransformPrompt" placeholder="Describe what you want to change... (e.g., replace countertops with white quartz, add modern pendant lights, change cabinets to gray)"></textarea>
        </div>

        <button class="bai-generate-btn" id="baiTransformBtn" disabled>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6"/>
            <path d="M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          Transform Image
        </button>

        <div class="bai-results" id="baiTransformResults"></div>
      `;
    }

    // Render blueprint tab
    renderBlueprintTab() {
      return `
        <div class="bai-section">
          <div class="bai-section-title">Room Dimensions</div>
          <div class="bai-dimensions">
            <div>
              <input type="number" class="bai-dim-input" id="baiBpWidth" placeholder="12" value="12">
              <div class="bai-dim-label">Width (ft)</div>
            </div>
            <div>
              <input type="number" class="bai-dim-input" id="baiBpLength" placeholder="14" value="14">
              <div class="bai-dim-label">Length (ft)</div>
            </div>
            <div>
              <input type="number" class="bai-dim-input" id="baiBpHeight" placeholder="9" value="9">
              <div class="bai-dim-label">Ceiling (ft)</div>
            </div>
          </div>
        </div>

        <div class="bai-section">
          <div class="bai-section-title">Room Type</div>
          <div class="bai-tabs" id="baiBpRoomTabs">
            ${this.config.categories.slice(0, 4).map(cat => `
              <button class="bai-tab ${cat.id === 'kitchen' ? 'active' : ''}" data-room="${cat.id}">${cat.name}</button>
            `).join('')}
          </div>
        </div>

        <div class="bai-section">
          <div class="bai-section-title">Features</div>
          <textarea class="bai-prompt-area" id="baiBpFeatures" placeholder="Describe key features... (e.g., island with seating, walk-in pantry, double oven, window over sink)"></textarea>
        </div>

        <button class="bai-generate-btn" id="baiBlueprintBtn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="9" y1="3" x2="9" y2="21"/>
            <line x1="15" y1="3" x2="15" y2="21"/>
            <line x1="3" y1="9" x2="21" y2="9"/>
            <line x1="3" y1="15" x2="21" y2="15"/>
          </svg>
          Generate Floor Plan
        </button>

        <div class="bai-results" id="baiBlueprintResults"></div>
      `;
    }

    // Attach event handlers
    attachEvents() {
      // Tab switching
      const tabs = this.container.querySelectorAll('#baiTabs .bai-tab');
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          tabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');

          const content = document.getElementById('baiContent');
          const tabId = tab.dataset.tab;

          if (tabId === 'generate') {
            content.innerHTML = this.renderGenerateTab();
          } else if (tabId === 'transform') {
            content.innerHTML = this.renderTransformTab();
          } else if (tabId === 'blueprint') {
            content.innerHTML = this.renderBlueprintTab();
          }

          this.attachContentEvents();
        });
      });

      this.attachContentEvents();
    }

    // Attach content-specific events
    attachContentEvents() {
      // Style selection
      const styleCards = this.container.querySelectorAll('.bai-style-card');
      styleCards.forEach(card => {
        card.addEventListener('click', () => {
          styleCards.forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          this.state.selectedStyle = card.dataset.style;
        });
      });

      // Room tabs
      const roomTabs = this.container.querySelectorAll('#baiRoomTabs .bai-tab, #baiBpRoomTabs .bai-tab');
      roomTabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const parent = tab.parentElement;
          parent.querySelectorAll('.bai-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
        });
      });

      // Generate button
      const generateBtn = document.getElementById('baiGenerateBtn');
      if (generateBtn) {
        generateBtn.addEventListener('click', () => this.generateDesign());
      }

      // Transform button
      const transformBtn = document.getElementById('baiTransformBtn');
      if (transformBtn) {
        transformBtn.addEventListener('click', () => this.transformImage());
      }

      // Blueprint button
      const blueprintBtn = document.getElementById('baiBlueprintBtn');
      if (blueprintBtn) {
        blueprintBtn.addEventListener('click', () => this.generateBlueprint());
      }

      // File upload
      this.setupFileUpload();
    }

    // Setup file upload
    setupFileUpload() {
      const zone = document.getElementById('baiUploadZone');
      const input = document.getElementById('baiFileInput');

      if (!zone || !input) return;

      zone.addEventListener('click', () => input.click());

      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragging');
      });

      zone.addEventListener('dragleave', () => {
        zone.classList.remove('dragging');
      });

      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragging');
        if (e.dataTransfer.files.length) {
          this.handleFileUpload(e.dataTransfer.files[0]);
        }
      });

      input.addEventListener('change', (e) => {
        if (e.target.files.length) {
          this.handleFileUpload(e.target.files[0]);
        }
      });
    }

    // Handle file upload
    handleFileUpload(file) {
      if (!file.type.startsWith('image/')) {
        alert('Please upload an image file');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        this.state.uploadedImage = e.target.result;

        const preview = document.getElementById('baiUploadedImage');
        if (preview) {
          preview.style.display = 'block';
          preview.innerHTML = `<img src="${e.target.result}" style="width:100%;border-radius:12px;">`;
        }

        const transformBtn = document.getElementById('baiTransformBtn');
        if (transformBtn) {
          transformBtn.disabled = false;
        }
      };
      reader.readAsDataURL(file);
    }

    // Generate design
    async generateDesign() {
      const btn = document.getElementById('baiGenerateBtn');
      const results = document.getElementById('baiResults');

      // Gather inputs
      const roomType = this.container.querySelector('#baiRoomTabs .bai-tab.active')?.dataset.room || 'kitchen';
      const style = this.state.selectedStyle || 'modern';
      const countertops = document.getElementById('baiCountertops')?.value;
      const cabinets = document.getElementById('baiCabinets')?.value;
      const flooring = document.getElementById('baiFlooring')?.value;
      const additionalPrompt = document.getElementById('baiPrompt')?.value;
      const width = document.getElementById('baiWidth')?.value;
      const length = document.getElementById('baiLength')?.value;

      // Build prompt
      const styleData = this.config.styles.find(s => s.id === style);
      let prompt = `Professional interior design photograph of a ${style} ${roomType}`;

      if (countertops) prompt += `, ${countertops} countertops`;
      if (cabinets) prompt += `, ${cabinets} cabinets`;
      if (flooring) prompt += `, ${flooring} flooring`;
      if (styleData) prompt += `, ${styleData.prompt}`;
      if (width && length) prompt += `, ${width}x${length} foot room`;
      if (additionalPrompt) prompt += `, ${additionalPrompt}`;

      prompt += ', high quality, realistic, well-lit, 4k';

      btn.disabled = true;
      btn.innerHTML = '<div class="bai-spinner" style="width:20px;height:20px;border-width:2px;"></div> Generating...';

      results.innerHTML = `
        <div class="bai-loading">
          <div class="bai-spinner"></div>
          <div class="bai-loading-text">Creating your design...</div>
        </div>
      `;

      try {
        const images = await this.callImageAPI(prompt);
        this.displayResults(results, images);
      } catch (error) {
        results.innerHTML = `<div style="text-align:center;padding:24px;opacity:0.7;">Error generating design. Please try again.</div>`;
        console.error('Generation error:', error);
      }

      btn.disabled = false;
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polygon points="10,8 16,12 10,16"/>
        </svg>
        Generate Design
      `;
    }

    // Transform image
    async transformImage() {
      if (!this.state.uploadedImage) return;

      const btn = document.getElementById('baiTransformBtn');
      const results = document.getElementById('baiTransformResults');

      const style = this.state.selectedStyle || 'modern';
      const transformPrompt = document.getElementById('baiTransformPrompt')?.value || '';
      const styleData = this.config.styles.find(s => s.id === style);

      let prompt = `Transform this interior to ${style} style`;
      if (styleData) prompt += `, ${styleData.prompt}`;
      if (transformPrompt) prompt += `, ${transformPrompt}`;

      btn.disabled = true;
      btn.innerHTML = '<div class="bai-spinner" style="width:20px;height:20px;border-width:2px;"></div> Transforming...';

      results.innerHTML = `
        <div class="bai-loading">
          <div class="bai-spinner"></div>
          <div class="bai-loading-text">Transforming your space...</div>
        </div>
      `;

      try {
        const images = await this.callImageAPI(prompt, this.state.uploadedImage);
        this.displayResults(results, images);
      } catch (error) {
        results.innerHTML = `<div style="text-align:center;padding:24px;opacity:0.7;">Error transforming image. Please try again.</div>`;
      }

      btn.disabled = false;
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6"/>
          <path d="M1 20v-6h6"/>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
        Transform Image
      `;
    }

    // Generate blueprint
    async generateBlueprint() {
      const btn = document.getElementById('baiBlueprintBtn');
      const results = document.getElementById('baiBlueprintResults');

      const width = document.getElementById('baiBpWidth')?.value || 12;
      const length = document.getElementById('baiBpLength')?.value || 14;
      const roomType = this.container.querySelector('#baiBpRoomTabs .bai-tab.active')?.dataset.room || 'kitchen';
      const features = document.getElementById('baiBpFeatures')?.value || '';

      const prompt = `Architectural floor plan blueprint, ${roomType} layout, ${width}x${length} feet, professional CAD style, top-down view, measurements labeled, ${features}, clean white background, technical drawing`;

      btn.disabled = true;
      btn.innerHTML = '<div class="bai-spinner" style="width:20px;height:20px;border-width:2px;"></div> Generating...';

      results.innerHTML = `
        <div class="bai-loading">
          <div class="bai-spinner"></div>
          <div class="bai-loading-text">Creating floor plan...</div>
        </div>
      `;

      try {
        const images = await this.callImageAPI(prompt);
        this.displayResults(results, images);
      } catch (error) {
        results.innerHTML = `<div style="text-align:center;padding:24px;opacity:0.7;">Error generating floor plan. Please try again.</div>`;
      }

      btn.disabled = false;
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="9" y1="3" x2="9" y2="21"/>
          <line x1="15" y1="3" x2="15" y2="21"/>
        </svg>
        Generate Floor Plan
      `;
    }

    // Call image generation API
    async callImageAPI(prompt, sourceImage = null) {
      const payload = {
        prompt,
        model: this.config.imageModel,
        size: this.config.defaultSize,
        quality: this.config.quality,
        n: 2
      };

      if (sourceImage) {
        payload.image = sourceImage;
        payload.mode = 'img2img';
      }

      const response = await fetch(`${this.config.apiEndpoint}/design/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      const data = await response.json();
      return data.images || [];
    }

    // Display results
    displayResults(container, images) {
      if (!images.length) {
        container.innerHTML = `<div style="text-align:center;padding:24px;opacity:0.7;">No images generated. Try a different prompt.</div>`;
        return;
      }

      this.state.generatedImages = images;

      container.innerHTML = `
        <div class="bai-section-title">Generated Designs</div>
        <div class="bai-results-grid">
          ${images.map((img, i) => `
            <div class="bai-result-card" data-index="${i}">
              <img class="bai-result-image" src="${img.url || img}" alt="Generated design ${i + 1}">
              <div class="bai-result-actions">
                <button class="bai-action-btn" onclick="blueprintAI.downloadImage(${i})">Download</button>
                <button class="bai-action-btn" onclick="blueprintAI.shareImage(${i})">Share</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;

      // Add click to preview
      container.querySelectorAll('.bai-result-card').forEach(card => {
        card.querySelector('img').addEventListener('click', () => {
          this.showPreview(this.state.generatedImages[card.dataset.index]);
        });
      });
    }

    // Show image preview
    showPreview(image) {
      let modal = document.getElementById('baiPreviewModal');

      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'baiPreviewModal';
        modal.className = 'bai-preview-modal';
        modal.innerHTML = `
          <button class="bai-preview-close" onclick="this.parentElement.classList.remove('open')">×</button>
          <img class="bai-preview-image" id="baiPreviewImage">
        `;
        modal.addEventListener('click', (e) => {
          if (e.target === modal) modal.classList.remove('open');
        });
        document.body.appendChild(modal);
      }

      document.getElementById('baiPreviewImage').src = image.url || image;
      modal.classList.add('open');
    }

    // Download image
    downloadImage(index) {
      const image = this.state.generatedImages[index];
      const link = document.createElement('a');
      link.href = image.url || image;
      link.download = `remodely-design-${Date.now()}.png`;
      link.click();
    }

    // Share image
    async shareImage(index) {
      const image = this.state.generatedImages[index];
      const imageUrl = image.url || image;

      if (navigator.share) {
        try {
          await navigator.share({
            title: 'My Design from Remodely AI',
            text: 'Check out this design I created!',
            url: imageUrl
          });
        } catch (e) {
          this.copyToClipboard(imageUrl);
        }
      } else {
        this.copyToClipboard(imageUrl);
      }
    }

    // Copy to clipboard
    copyToClipboard(text) {
      navigator.clipboard.writeText(text).then(() => {
        alert('Link copied to clipboard!');
      });
    }

    // Helper methods
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
  }

  // Export globally
  window.BlueprintAI = BlueprintAI;
  window.blueprintAI = null;

  // Auto-initialize
  document.addEventListener('DOMContentLoaded', () => {
    const container = document.querySelector('[data-blueprint-ai]');
    if (container) {
      const config = JSON.parse(container.dataset.blueprintAi || '{}');
      window.blueprintAI = new BlueprintAI(config);
      window.blueprintAI.init(container.id);
    }
  });
})();
