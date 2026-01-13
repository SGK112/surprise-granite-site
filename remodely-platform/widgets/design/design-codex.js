/**
 * DESIGN CODEX - AI-Powered CSS & Design System
 * Visual design editor like Swipe/Webflow powered by AI
 * Powered by Remodely AI
 * Version: 1.0
 */

(function() {
  'use strict';

  const DEFAULT_CONFIG = {
    apiEndpoint: 'https://api.remodely.ai',

    // Design tokens
    tokens: {
      colors: {
        primary: '#f9cb00',
        secondary: '#1a1a2e',
        accent: '#3b82f6',
        success: '#22c55e',
        warning: '#f59e0b',
        error: '#ef4444',
        background: '#ffffff',
        surface: '#f8fafc',
        text: '#1a1a2e',
        textMuted: '#64748b'
      },
      fonts: {
        heading: "'Inter', -apple-system, sans-serif",
        body: "'Inter', -apple-system, sans-serif",
        mono: "'JetBrains Mono', monospace"
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        xxl: '48px'
      },
      radii: {
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        full: '9999px'
      },
      shadows: {
        sm: '0 1px 2px rgba(0,0,0,0.05)',
        md: '0 4px 6px rgba(0,0,0,0.1)',
        lg: '0 10px 15px rgba(0,0,0,0.1)',
        xl: '0 20px 25px rgba(0,0,0,0.15)'
      }
    },

    // Component library
    components: [
      { id: 'button', name: 'Button', category: 'actions' },
      { id: 'card', name: 'Card', category: 'containers' },
      { id: 'input', name: 'Input', category: 'forms' },
      { id: 'modal', name: 'Modal', category: 'overlays' },
      { id: 'navbar', name: 'Navbar', category: 'navigation' },
      { id: 'hero', name: 'Hero Section', category: 'sections' },
      { id: 'testimonial', name: 'Testimonial', category: 'sections' },
      { id: 'pricing', name: 'Pricing Table', category: 'sections' },
      { id: 'footer', name: 'Footer', category: 'navigation' },
      { id: 'gallery', name: 'Gallery', category: 'media' }
    ],

    // Industry presets
    presets: {
      contractor: {
        name: 'Contractor Pro',
        colors: { primary: '#f9cb00', secondary: '#1a1a2e' },
        style: 'bold professional'
      },
      luxury: {
        name: 'Luxury Design',
        colors: { primary: '#c9a227', secondary: '#1c1c1c' },
        style: 'elegant sophisticated'
      },
      modern: {
        name: 'Modern Clean',
        colors: { primary: '#3b82f6', secondary: '#0f172a' },
        style: 'minimal clean'
      },
      natural: {
        name: 'Natural Living',
        colors: { primary: '#16a34a', secondary: '#1e3a2f' },
        style: 'organic earthy'
      }
    },

    theme: 'dark'
  };

  class DesignCodex {
    constructor(config = {}) {
      this.config = this.deepMerge(DEFAULT_CONFIG, config);
      this.state = {
        tokens: { ...this.config.tokens },
        selectedComponent: null,
        generatedCSS: '',
        history: [],
        historyIndex: -1
      };
      this.container = null;
    }

    // Deep merge helper
    deepMerge(target, source) {
      const result = { ...target };
      for (const key in source) {
        if (source[key] instanceof Object && key in target) {
          result[key] = this.deepMerge(target[key], source[key]);
        } else {
          result[key] = source[key];
        }
      }
      return result;
    }

    // Initialize
    init(containerId) {
      this.container = document.getElementById(containerId);
      if (this.container) {
        this.render();
        this.injectStyles();
        this.saveState();
      }
      return this;
    }

    // Inject styles
    injectStyles() {
      if (document.getElementById('design-codex-styles')) return;

      const primary = this.config.tokens.colors.primary;
      const secondary = this.config.tokens.colors.secondary;
      const isDark = this.config.theme === 'dark';

      const styles = document.createElement('style');
      styles.id = 'design-codex-styles';
      styles.textContent = `
        .dcx-container * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Inter', -apple-system, sans-serif; }

        .dcx-container {
          display: grid;
          grid-template-columns: 280px 1fr 320px;
          height: 100vh;
          background: ${isDark ? '#0f0f12' : '#f8fafc'};
          color: ${isDark ? '#fff' : '#1a1a2e'};
        }

        /* Sidebar */
        .dcx-sidebar {
          background: ${isDark ? '#18181b' : '#fff'};
          border-right: 1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'};
          overflow-y: auto;
        }

        .dcx-sidebar-header {
          padding: 20px;
          border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'};
        }
        .dcx-logo { font-size: 18px; font-weight: 700; color: ${primary}; }
        .dcx-logo-sub { font-size: 12px; opacity: 0.6; margin-top: 2px; }

        .dcx-section { padding: 16px; border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}; }
        .dcx-section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.5; margin-bottom: 12px; }

        .dcx-component-list { display: flex; flex-direction: column; gap: 4px; }
        .dcx-component-item {
          padding: 10px 12px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .dcx-component-item:hover { background: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'}; }
        .dcx-component-item.active { background: ${this.hexToRgba(primary, 0.15)}; color: ${primary}; }
        .dcx-component-icon { width: 20px; height: 20px; opacity: 0.6; }

        /* Canvas */
        .dcx-canvas {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .dcx-toolbar {
          padding: 12px 20px;
          background: ${isDark ? '#18181b' : '#fff'};
          border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'};
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .dcx-toolbar-group { display: flex; gap: 8px; }
        .dcx-toolbar-btn {
          padding: 8px 12px;
          border-radius: 6px;
          border: none;
          background: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'};
          color: ${isDark ? '#fff' : '#1a1a2e'};
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .dcx-toolbar-btn:hover { background: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}; }
        .dcx-toolbar-btn svg { width: 16px; height: 16px; }
        .dcx-toolbar-divider { width: 1px; height: 24px; background: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}; }

        .dcx-ai-input {
          flex: 1;
          display: flex;
          gap: 8px;
        }
        .dcx-ai-prompt {
          flex: 1;
          padding: 10px 14px;
          border-radius: 8px;
          border: 2px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};
          background: ${isDark ? 'rgba(255,255,255,0.03)' : '#fff'};
          color: ${isDark ? '#fff' : '#1a1a2e'};
          font-size: 13px;
        }
        .dcx-ai-prompt:focus { outline: none; border-color: ${primary}; }
        .dcx-ai-prompt::placeholder { opacity: 0.4; }

        .dcx-ai-btn {
          padding: 10px 20px;
          border-radius: 8px;
          border: none;
          background: linear-gradient(135deg, ${primary}, ${this.adjustColor(primary, -30)});
          color: ${secondary};
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .dcx-ai-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px ${this.hexToRgba(primary, 0.4)}; }

        .dcx-preview-area {
          flex: 1;
          padding: 32px;
          overflow: auto;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .dcx-preview-frame {
          background: ${isDark ? '#1f1f23' : '#fff'};
          border-radius: 12px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.2);
          min-width: 400px;
          min-height: 300px;
          padding: 32px;
        }

        /* Properties Panel */
        .dcx-properties {
          background: ${isDark ? '#18181b' : '#fff'};
          border-left: 1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'};
          overflow-y: auto;
        }

        .dcx-props-header {
          padding: 20px;
          border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'};
        }
        .dcx-props-title { font-size: 14px; font-weight: 600; }

        .dcx-props-section { padding: 16px; border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}; }
        .dcx-props-label { font-size: 12px; font-weight: 500; margin-bottom: 8px; opacity: 0.7; }

        .dcx-color-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }
        .dcx-color-input {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px;
          border-radius: 6px;
          background: ${isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'};
        }
        .dcx-color-swatch {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          border: 2px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};
          cursor: pointer;
        }
        .dcx-color-value {
          flex: 1;
          background: none;
          border: none;
          color: ${isDark ? '#fff' : '#1a1a2e'};
          font-size: 12px;
          font-family: monospace;
        }
        .dcx-color-value:focus { outline: none; }
        .dcx-color-name { font-size: 10px; opacity: 0.5; }

        .dcx-spacing-control {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }
        .dcx-spacing-item {
          text-align: center;
        }
        .dcx-spacing-value {
          width: 100%;
          padding: 8px;
          border-radius: 6px;
          border: 1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};
          background: ${isDark ? 'rgba(255,255,255,0.03)' : '#fff'};
          color: ${isDark ? '#fff' : '#1a1a2e'};
          font-size: 12px;
          text-align: center;
        }
        .dcx-spacing-label { font-size: 10px; opacity: 0.5; margin-top: 4px; }

        .dcx-preset-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }
        .dcx-preset-btn {
          padding: 12px;
          border-radius: 8px;
          border: 2px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};
          background: none;
          cursor: pointer;
          text-align: left;
          transition: all 0.2s;
        }
        .dcx-preset-btn:hover { border-color: ${primary}; }
        .dcx-preset-name { font-size: 12px; font-weight: 600; color: ${isDark ? '#fff' : '#1a1a2e'}; }
        .dcx-preset-colors {
          display: flex;
          gap: 4px;
          margin-top: 6px;
        }
        .dcx-preset-color {
          width: 20px;
          height: 20px;
          border-radius: 4px;
        }

        .dcx-code-output {
          background: ${isDark ? '#0f0f12' : '#1e1e1e'};
          border-radius: 8px;
          padding: 16px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          color: #abb2bf;
          max-height: 300px;
          overflow: auto;
          white-space: pre-wrap;
        }
        .dcx-code-output .keyword { color: #c678dd; }
        .dcx-code-output .property { color: #e06c75; }
        .dcx-code-output .value { color: #98c379; }
        .dcx-code-output .selector { color: #61afef; }

        .dcx-copy-btn {
          margin-top: 8px;
          padding: 8px 16px;
          border-radius: 6px;
          border: none;
          background: ${primary};
          color: ${secondary};
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          width: 100%;
        }

        .dcx-footer {
          padding: 16px;
          text-align: center;
          font-size: 11px;
          opacity: 0.5;
        }
        .dcx-footer a { color: ${primary}; text-decoration: none; }
      `;

      document.head.appendChild(styles);
    }

    // Main render
    render() {
      this.container.innerHTML = `
        <div class="dcx-container">
          <!-- Sidebar -->
          <div class="dcx-sidebar">
            <div class="dcx-sidebar-header">
              <div class="dcx-logo">Design Codex</div>
              <div class="dcx-logo-sub">AI Design System</div>
            </div>

            <div class="dcx-section">
              <div class="dcx-section-title">Components</div>
              <div class="dcx-component-list" id="dcxComponents">
                ${this.config.components.map(comp => `
                  <div class="dcx-component-item" data-component="${comp.id}">
                    <span>${comp.name}</span>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="dcx-footer">
              Powered by <a href="https://remodely.ai" target="_blank">Remodely.ai</a>
            </div>
          </div>

          <!-- Canvas -->
          <div class="dcx-canvas">
            <div class="dcx-toolbar">
              <div class="dcx-toolbar-group">
                <button class="dcx-toolbar-btn" onclick="designCodex.undo()">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                </button>
                <button class="dcx-toolbar-btn" onclick="designCodex.redo()">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                </button>
              </div>

              <div class="dcx-toolbar-divider"></div>

              <div class="dcx-ai-input">
                <input type="text" class="dcx-ai-prompt" id="dcxAiPrompt" placeholder="Describe your design... (e.g., 'make it more modern with rounded corners')">
                <button class="dcx-ai-btn" onclick="designCodex.generateFromAI()">Generate</button>
              </div>
            </div>

            <div class="dcx-preview-area">
              <div class="dcx-preview-frame" id="dcxPreview">
                ${this.renderComponentPreview('button')}
              </div>
            </div>
          </div>

          <!-- Properties Panel -->
          <div class="dcx-properties">
            <div class="dcx-props-header">
              <div class="dcx-props-title">Design Tokens</div>
            </div>

            <div class="dcx-props-section">
              <div class="dcx-props-label">Colors</div>
              <div class="dcx-color-grid" id="dcxColors">
                ${this.renderColorInputs()}
              </div>
            </div>

            <div class="dcx-props-section">
              <div class="dcx-props-label">Spacing Scale</div>
              <div class="dcx-spacing-control" id="dcxSpacing">
                ${Object.entries(this.state.tokens.spacing).map(([key, value]) => `
                  <div class="dcx-spacing-item">
                    <input type="text" class="dcx-spacing-value" data-spacing="${key}" value="${value}">
                    <div class="dcx-spacing-label">${key}</div>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="dcx-props-section">
              <div class="dcx-props-label">Border Radius</div>
              <div class="dcx-spacing-control">
                ${Object.entries(this.state.tokens.radii).map(([key, value]) => `
                  <div class="dcx-spacing-item">
                    <input type="text" class="dcx-spacing-value" data-radius="${key}" value="${value}">
                    <div class="dcx-spacing-label">${key}</div>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="dcx-props-section">
              <div class="dcx-props-label">Quick Presets</div>
              <div class="dcx-preset-grid">
                ${Object.entries(this.config.presets).map(([key, preset]) => `
                  <button class="dcx-preset-btn" onclick="designCodex.applyPreset('${key}')">
                    <div class="dcx-preset-name">${preset.name}</div>
                    <div class="dcx-preset-colors">
                      <div class="dcx-preset-color" style="background:${preset.colors.primary}"></div>
                      <div class="dcx-preset-color" style="background:${preset.colors.secondary}"></div>
                    </div>
                  </button>
                `).join('')}
              </div>
            </div>

            <div class="dcx-props-section">
              <div class="dcx-props-label">Generated CSS</div>
              <div class="dcx-code-output" id="dcxCode">${this.generateCSS()}</div>
              <button class="dcx-copy-btn" onclick="designCodex.copyCSS()">Copy CSS</button>
            </div>
          </div>
        </div>
      `;

      this.attachEvents();
    }

    // Render color inputs
    renderColorInputs() {
      return Object.entries(this.state.tokens.colors).map(([key, value]) => `
        <div class="dcx-color-input">
          <input type="color" class="dcx-color-swatch" data-color="${key}" value="${value}">
          <div>
            <input type="text" class="dcx-color-value" data-color-text="${key}" value="${value}">
            <div class="dcx-color-name">${key}</div>
          </div>
        </div>
      `).join('');
    }

    // Render component preview
    renderComponentPreview(componentId) {
      const previews = {
        button: `
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            <button style="padding:12px 24px;background:${this.state.tokens.colors.primary};color:${this.state.tokens.colors.secondary};border:none;border-radius:${this.state.tokens.radii.md};font-weight:600;cursor:pointer;">Primary Button</button>
            <button style="padding:12px 24px;background:transparent;color:${this.state.tokens.colors.primary};border:2px solid ${this.state.tokens.colors.primary};border-radius:${this.state.tokens.radii.md};font-weight:600;cursor:pointer;">Secondary</button>
            <button style="padding:12px 24px;background:${this.state.tokens.colors.text};color:#fff;border:none;border-radius:${this.state.tokens.radii.md};font-weight:600;cursor:pointer;">Dark Button</button>
          </div>
        `,
        card: `
          <div style="background:${this.state.tokens.colors.surface};border-radius:${this.state.tokens.radii.lg};padding:${this.state.tokens.spacing.lg};box-shadow:${this.state.tokens.shadows.md};max-width:300px;">
            <div style="width:100%;height:150px;background:linear-gradient(135deg,${this.state.tokens.colors.primary},${this.state.tokens.colors.secondary});border-radius:${this.state.tokens.radii.md};margin-bottom:16px;"></div>
            <h3 style="font-size:18px;margin-bottom:8px;color:${this.state.tokens.colors.text};">Card Title</h3>
            <p style="font-size:14px;color:${this.state.tokens.colors.textMuted};line-height:1.5;">This is a sample card component with your design tokens applied.</p>
          </div>
        `,
        input: `
          <div style="display:flex;flex-direction:column;gap:16px;max-width:300px;">
            <input type="text" placeholder="Text input" style="padding:12px 16px;border:2px solid ${this.state.tokens.colors.textMuted}30;border-radius:${this.state.tokens.radii.md};font-size:14px;outline:none;">
            <input type="text" placeholder="Focused state" style="padding:12px 16px;border:2px solid ${this.state.tokens.colors.primary};border-radius:${this.state.tokens.radii.md};font-size:14px;outline:none;">
            <textarea placeholder="Textarea" style="padding:12px 16px;border:2px solid ${this.state.tokens.colors.textMuted}30;border-radius:${this.state.tokens.radii.md};font-size:14px;outline:none;min-height:80px;resize:vertical;"></textarea>
          </div>
        `,
        hero: `
          <div style="text-align:center;padding:${this.state.tokens.spacing.xxl};">
            <h1 style="font-size:36px;font-weight:700;color:${this.state.tokens.colors.text};margin-bottom:16px;">Welcome to Your Site</h1>
            <p style="font-size:18px;color:${this.state.tokens.colors.textMuted};margin-bottom:24px;max-width:500px;margin-left:auto;margin-right:auto;">Build beautiful experiences with our AI-powered design system.</p>
            <button style="padding:14px 32px;background:${this.state.tokens.colors.primary};color:${this.state.tokens.colors.secondary};border:none;border-radius:${this.state.tokens.radii.md};font-weight:600;font-size:16px;cursor:pointer;">Get Started</button>
          </div>
        `
      };

      return previews[componentId] || previews.button;
    }

    // Attach events
    attachEvents() {
      // Component selection
      const components = this.container.querySelectorAll('.dcx-component-item');
      components.forEach(item => {
        item.addEventListener('click', () => {
          components.forEach(c => c.classList.remove('active'));
          item.classList.add('active');
          this.state.selectedComponent = item.dataset.component;
          this.updatePreview();
        });
      });

      // Color inputs
      const colorSwatches = this.container.querySelectorAll('.dcx-color-swatch');
      colorSwatches.forEach(swatch => {
        swatch.addEventListener('input', (e) => {
          const key = e.target.dataset.color;
          this.state.tokens.colors[key] = e.target.value;
          const textInput = this.container.querySelector(`[data-color-text="${key}"]`);
          if (textInput) textInput.value = e.target.value;
          this.updateAll();
        });
      });

      const colorTexts = this.container.querySelectorAll('.dcx-color-value');
      colorTexts.forEach(input => {
        input.addEventListener('change', (e) => {
          const key = e.target.dataset.colorText;
          this.state.tokens.colors[key] = e.target.value;
          const swatch = this.container.querySelector(`[data-color="${key}"]`);
          if (swatch) swatch.value = e.target.value;
          this.updateAll();
        });
      });

      // Spacing inputs
      const spacingInputs = this.container.querySelectorAll('[data-spacing]');
      spacingInputs.forEach(input => {
        input.addEventListener('change', (e) => {
          this.state.tokens.spacing[e.target.dataset.spacing] = e.target.value;
          this.updateAll();
        });
      });

      // Radius inputs
      const radiusInputs = this.container.querySelectorAll('[data-radius]');
      radiusInputs.forEach(input => {
        input.addEventListener('change', (e) => {
          this.state.tokens.radii[e.target.dataset.radius] = e.target.value;
          this.updateAll();
        });
      });

      // AI prompt enter key
      const aiPrompt = document.getElementById('dcxAiPrompt');
      if (aiPrompt) {
        aiPrompt.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') this.generateFromAI();
        });
      }
    }

    // Update all
    updateAll() {
      this.updatePreview();
      this.updateCSS();
      this.saveState();
    }

    // Update preview
    updatePreview() {
      const preview = document.getElementById('dcxPreview');
      if (preview) {
        preview.innerHTML = this.renderComponentPreview(this.state.selectedComponent || 'button');
      }
    }

    // Update CSS output
    updateCSS() {
      const codeOutput = document.getElementById('dcxCode');
      if (codeOutput) {
        codeOutput.innerHTML = this.generateCSS();
      }
    }

    // Generate CSS variables
    generateCSS() {
      const { colors, spacing, radii, shadows, fonts } = this.state.tokens;

      let css = `:root {\n`;
      css += `  /* Colors */\n`;
      for (const [key, value] of Object.entries(colors)) {
        css += `  --color-${key}: ${value};\n`;
      }
      css += `\n  /* Spacing */\n`;
      for (const [key, value] of Object.entries(spacing)) {
        css += `  --spacing-${key}: ${value};\n`;
      }
      css += `\n  /* Border Radius */\n`;
      for (const [key, value] of Object.entries(radii)) {
        css += `  --radius-${key}: ${value};\n`;
      }
      css += `\n  /* Shadows */\n`;
      for (const [key, value] of Object.entries(shadows)) {
        css += `  --shadow-${key}: ${value};\n`;
      }
      css += `\n  /* Fonts */\n`;
      for (const [key, value] of Object.entries(fonts)) {
        css += `  --font-${key}: ${value};\n`;
      }
      css += `}`;

      this.state.generatedCSS = css;
      return this.highlightCSS(css);
    }

    // Syntax highlight CSS
    highlightCSS(css) {
      return css
        .replace(/(--[\w-]+)/g, '<span class="property">$1</span>')
        .replace(/(:root)/g, '<span class="selector">$1</span>')
        .replace(/(#[a-fA-F0-9]{6}|#[a-fA-F0-9]{3})/g, '<span class="value">$1</span>')
        .replace(/(\d+px)/g, '<span class="value">$1</span>');
    }

    // Apply preset
    applyPreset(presetId) {
      const preset = this.config.presets[presetId];
      if (preset) {
        this.state.tokens.colors.primary = preset.colors.primary;
        this.state.tokens.colors.secondary = preset.colors.secondary;

        // Update color inputs
        const primarySwatch = this.container.querySelector('[data-color="primary"]');
        const primaryText = this.container.querySelector('[data-color-text="primary"]');
        const secondarySwatch = this.container.querySelector('[data-color="secondary"]');
        const secondaryText = this.container.querySelector('[data-color-text="secondary"]');

        if (primarySwatch) primarySwatch.value = preset.colors.primary;
        if (primaryText) primaryText.value = preset.colors.primary;
        if (secondarySwatch) secondarySwatch.value = preset.colors.secondary;
        if (secondaryText) secondaryText.value = preset.colors.secondary;

        this.updateAll();
      }
    }

    // Generate from AI
    async generateFromAI() {
      const prompt = document.getElementById('dcxAiPrompt')?.value;
      if (!prompt) return;

      const aiBtn = this.container.querySelector('.dcx-ai-btn');
      aiBtn.textContent = 'Generating...';
      aiBtn.disabled = true;

      try {
        const response = await fetch(`${this.config.apiEndpoint}/design/tokens`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            currentTokens: this.state.tokens
          })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.tokens) {
            this.state.tokens = this.deepMerge(this.state.tokens, data.tokens);
            this.render(); // Re-render with new tokens
          }
        }
      } catch (error) {
        console.error('AI generation error:', error);
        // Fallback: Apply some changes based on keywords
        this.applyAIKeywords(prompt);
      }

      aiBtn.textContent = 'Generate';
      aiBtn.disabled = false;
    }

    // Apply AI keywords fallback
    applyAIKeywords(prompt) {
      const lower = prompt.toLowerCase();

      if (lower.includes('round') || lower.includes('soft')) {
        this.state.tokens.radii = { sm: '8px', md: '16px', lg: '24px', xl: '32px', full: '9999px' };
      }
      if (lower.includes('sharp') || lower.includes('angular')) {
        this.state.tokens.radii = { sm: '0px', md: '2px', lg: '4px', xl: '6px', full: '9999px' };
      }
      if (lower.includes('spacious') || lower.includes('airy')) {
        this.state.tokens.spacing = { xs: '8px', sm: '16px', md: '24px', lg: '40px', xl: '56px', xxl: '72px' };
      }
      if (lower.includes('compact') || lower.includes('dense')) {
        this.state.tokens.spacing = { xs: '2px', sm: '4px', md: '8px', lg: '12px', xl: '16px', xxl: '24px' };
      }
      if (lower.includes('blue')) {
        this.state.tokens.colors.primary = '#3b82f6';
      }
      if (lower.includes('green')) {
        this.state.tokens.colors.primary = '#22c55e';
      }
      if (lower.includes('red') || lower.includes('bold')) {
        this.state.tokens.colors.primary = '#ef4444';
      }
      if (lower.includes('purple')) {
        this.state.tokens.colors.primary = '#8b5cf6';
      }
      if (lower.includes('dark')) {
        this.state.tokens.colors.background = '#0f0f12';
        this.state.tokens.colors.surface = '#18181b';
        this.state.tokens.colors.text = '#ffffff';
      }
      if (lower.includes('light')) {
        this.state.tokens.colors.background = '#ffffff';
        this.state.tokens.colors.surface = '#f8fafc';
        this.state.tokens.colors.text = '#1a1a2e';
      }

      this.render();
    }

    // Copy CSS
    copyCSS() {
      const css = this.state.generatedCSS;
      navigator.clipboard.writeText(css).then(() => {
        const btn = this.container.querySelector('.dcx-copy-btn');
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy CSS'; }, 2000);
      });
    }

    // Save state for undo/redo
    saveState() {
      const state = JSON.stringify(this.state.tokens);

      // Remove future states if we're not at the end
      if (this.state.historyIndex < this.state.history.length - 1) {
        this.state.history = this.state.history.slice(0, this.state.historyIndex + 1);
      }

      this.state.history.push(state);
      this.state.historyIndex = this.state.history.length - 1;

      // Limit history
      if (this.state.history.length > 50) {
        this.state.history.shift();
        this.state.historyIndex--;
      }
    }

    // Undo
    undo() {
      if (this.state.historyIndex > 0) {
        this.state.historyIndex--;
        this.state.tokens = JSON.parse(this.state.history[this.state.historyIndex]);
        this.render();
      }
    }

    // Redo
    redo() {
      if (this.state.historyIndex < this.state.history.length - 1) {
        this.state.historyIndex++;
        this.state.tokens = JSON.parse(this.state.history[this.state.historyIndex]);
        this.render();
      }
    }

    // Export tokens
    exportTokens(format = 'css') {
      if (format === 'css') {
        return this.state.generatedCSS;
      }
      if (format === 'json') {
        return JSON.stringify(this.state.tokens, null, 2);
      }
      if (format === 'tailwind') {
        return this.generateTailwindConfig();
      }
    }

    // Generate Tailwind config
    generateTailwindConfig() {
      const { colors, spacing, radii } = this.state.tokens;
      return `module.exports = {
  theme: {
    extend: {
      colors: ${JSON.stringify(colors, null, 6)},
      spacing: ${JSON.stringify(spacing, null, 6)},
      borderRadius: ${JSON.stringify(radii, null, 6)}
    }
  }
}`;
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

  // Export
  window.DesignCodex = DesignCodex;
  window.designCodex = null;

  // Auto-init
  document.addEventListener('DOMContentLoaded', () => {
    const container = document.querySelector('[data-design-codex]');
    if (container) {
      window.designCodex = new DesignCodex(JSON.parse(container.dataset.designCodex || '{}'));
      window.designCodex.init(container.id);
    }
  });
})();
