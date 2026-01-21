/**
 * Stone Color Picker Component
 * Provides visual color selection for the fabricator remnant marketplace
 * Version: 1.0
 */

(function() {
  'use strict';

  // Standard 18 colors with families
  const STONE_COLORS = [
    // Neutral (4)
    { name: 'White', slug: 'white', hex: '#FFFFFF', family: 'neutral' },
    { name: 'Gray', slug: 'gray', hex: '#9CA3AF', family: 'neutral' },
    { name: 'Charcoal', slug: 'charcoal', hex: '#374151', family: 'neutral' },
    { name: 'Black', slug: 'black', hex: '#1F2937', family: 'neutral' },
    // Warm (8)
    { name: 'Cream', slug: 'cream', hex: '#FEF3C7', family: 'warm' },
    { name: 'Ivory', slug: 'ivory', hex: '#FFFBEB', family: 'warm' },
    { name: 'Beige', slug: 'beige', hex: '#D4B896', family: 'warm' },
    { name: 'Tan', slug: 'tan', hex: '#D2B48C', family: 'warm' },
    { name: 'Brown', slug: 'brown', hex: '#92400E', family: 'warm' },
    { name: 'Espresso', slug: 'espresso', hex: '#451A03', family: 'warm' },
    { name: 'Gold', slug: 'gold', hex: '#D97706', family: 'warm' },
    { name: 'Copper', slug: 'copper', hex: '#B45309', family: 'warm' },
    // Cool (4)
    { name: 'Blue', slug: 'blue', hex: '#3B82F6', family: 'cool' },
    { name: 'Navy', slug: 'navy', hex: '#1E3A8A', family: 'cool' },
    { name: 'Green', slug: 'green', hex: '#059669', family: 'cool' },
    { name: 'Teal', slug: 'teal', hex: '#0D9488', family: 'cool' },
    // Bold (2)
    { name: 'Red/Burgundy', slug: 'red-burgundy', hex: '#991B1B', family: 'bold' },
    { name: 'Multi-color', slug: 'multi-color', hex: 'multi', family: 'bold' }
  ];

  const COLOR_FAMILIES = [
    { id: 'all', name: 'All' },
    { id: 'neutral', name: 'Neutral' },
    { id: 'warm', name: 'Warm' },
    { id: 'cool', name: 'Cool' },
    { id: 'bold', name: 'Bold' }
  ];

  /**
   * ColorPicker Class
   * Creates an interactive color picker component
   */
  class ColorPicker {
    constructor(container, options = {}) {
      this.container = typeof container === 'string'
        ? document.querySelector(container)
        : container;

      if (!this.container) {
        console.error('ColorPicker: Container not found');
        return;
      }

      this.options = {
        maxColors: options.maxColors || 3,
        onChange: options.onChange || (() => {}),
        initialColors: options.initialColors || [],
        showTabs: options.showTabs !== false,
        showHint: options.showHint !== false,
        label: options.label || 'Select Colors'
      };

      this.selectedColors = [];
      this.activeFamily = 'all';

      this.init();
    }

    init() {
      this.render();
      this.bindEvents();

      // Set initial colors if provided
      if (this.options.initialColors.length > 0) {
        this.options.initialColors.forEach(slug => {
          const color = STONE_COLORS.find(c => c.slug === slug);
          if (color && this.selectedColors.length < this.options.maxColors) {
            this.selectedColors.push(color);
          }
        });
        this.updateUI();
      }
    }

    render() {
      const html = `
        <div class="color-picker">
          <div class="color-picker-header">
            <span class="color-picker-label">${this.options.label}</span>
            <button type="button" class="color-picker-clear" style="display: none;">Clear All</button>
          </div>
          ${this.options.showTabs ? this.renderTabs() : ''}
          <div class="color-picker-grid">
            ${this.renderSwatches()}
          </div>
          <div class="color-picker-selected"></div>
          ${this.options.showHint ? `
            <div class="color-picker-hint">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4m0-4h.01"/>
              </svg>
              First color selected is the primary color
            </div>
          ` : ''}
        </div>
      `;

      this.container.innerHTML = html;
      this.cacheElements();
    }

    renderTabs() {
      return `
        <div class="color-picker-tabs">
          ${COLOR_FAMILIES.map(family => `
            <button type="button" class="color-picker-tab${family.id === 'all' ? ' active' : ''}" data-family="${family.id}">
              ${family.name}
            </button>
          `).join('')}
        </div>
      `;
    }

    renderSwatches(family = 'all') {
      const colors = family === 'all'
        ? STONE_COLORS
        : STONE_COLORS.filter(c => c.family === family);

      return colors.map(color => `
        <button type="button" class="color-swatch" data-slug="${color.slug}" data-hex="${color.hex}">
          <span class="color-swatch-circle${color.slug === 'multi-color' ? ' multi-color' : ''}"
                style="${color.hex !== 'multi' ? `background-color: ${color.hex}` : ''}"
                data-color="${color.hex}">
            <svg class="color-swatch-check" viewBox="0 0 24 24" fill="none" stroke="${this.getCheckColor(color.hex)}" stroke-width="3">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          </span>
          <span class="color-swatch-name">${color.name}</span>
        </button>
      `).join('');
    }

    getCheckColor(hex) {
      // Return white check for dark colors, dark check for light colors
      if (hex === 'multi') return '#fff';
      const rgb = this.hexToRgb(hex);
      if (!rgb) return '#333';
      const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
      return brightness > 128 ? '#333' : '#fff';
    }

    hexToRgb(hex) {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : null;
    }

    cacheElements() {
      this.picker = this.container.querySelector('.color-picker');
      this.grid = this.container.querySelector('.color-picker-grid');
      this.selectedContainer = this.container.querySelector('.color-picker-selected');
      this.clearBtn = this.container.querySelector('.color-picker-clear');
      this.tabs = this.container.querySelectorAll('.color-picker-tab');
    }

    bindEvents() {
      // Swatch clicks
      this.grid.addEventListener('click', (e) => {
        const swatch = e.target.closest('.color-swatch');
        if (swatch) {
          this.toggleColor(swatch.dataset.slug);
        }
      });

      // Tab clicks
      if (this.tabs.length > 0) {
        this.tabs.forEach(tab => {
          tab.addEventListener('click', () => {
            this.setActiveFamily(tab.dataset.family);
          });
        });
      }

      // Clear button
      if (this.clearBtn) {
        this.clearBtn.addEventListener('click', () => {
          this.clearAll();
        });
      }

      // Selected chip removal
      this.selectedContainer.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.color-chip-remove');
        if (removeBtn) {
          const chip = removeBtn.closest('.color-chip');
          if (chip) {
            this.removeColor(chip.dataset.slug);
          }
        }
      });
    }

    setActiveFamily(family) {
      this.activeFamily = family;

      // Update tab states
      this.tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.family === family);
      });

      // Re-render swatches
      this.grid.innerHTML = this.renderSwatches(family);

      // Restore selected states
      this.updateSwatchStates();
    }

    toggleColor(slug) {
      const colorIndex = this.selectedColors.findIndex(c => c.slug === slug);

      if (colorIndex > -1) {
        // Remove color
        this.selectedColors.splice(colorIndex, 1);
      } else {
        // Add color if under limit
        if (this.selectedColors.length >= this.options.maxColors) {
          // Remove oldest and add new
          this.selectedColors.shift();
        }
        const color = STONE_COLORS.find(c => c.slug === slug);
        if (color) {
          this.selectedColors.push(color);
        }
      }

      this.updateUI();
      this.notifyChange();
    }

    removeColor(slug) {
      this.selectedColors = this.selectedColors.filter(c => c.slug !== slug);
      this.updateUI();
      this.notifyChange();
    }

    clearAll() {
      this.selectedColors = [];
      this.updateUI();
      this.notifyChange();
    }

    updateUI() {
      this.updateSwatchStates();
      this.updateSelectedChips();
      this.updateClearButton();
    }

    updateSwatchStates() {
      const swatches = this.grid.querySelectorAll('.color-swatch');
      swatches.forEach(swatch => {
        const slug = swatch.dataset.slug;
        const selectedIndex = this.selectedColors.findIndex(c => c.slug === slug);
        const isSelected = selectedIndex > -1;
        const isPrimary = selectedIndex === 0;

        swatch.classList.toggle('selected', isSelected);
        swatch.classList.toggle('primary', isPrimary);
      });
    }

    updateSelectedChips() {
      if (this.selectedColors.length === 0) {
        this.selectedContainer.innerHTML = '';
        return;
      }

      this.selectedContainer.innerHTML = this.selectedColors.map((color, index) => `
        <span class="color-chip${index === 0 ? ' primary' : ''}" data-slug="${color.slug}">
          <span class="color-chip-dot${color.slug === 'multi-color' ? ' multi-color' : ''}"
                style="${color.hex !== 'multi' ? `background-color: ${color.hex}` : ''}"></span>
          <span class="color-chip-name">${color.name}</span>
          ${index === 0 ? '<span class="color-chip-primary-label">(Primary)</span>' : ''}
          <button type="button" class="color-chip-remove" aria-label="Remove ${color.name}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </span>
      `).join('');
    }

    updateClearButton() {
      if (this.clearBtn) {
        this.clearBtn.style.display = this.selectedColors.length > 0 ? 'block' : 'none';
      }
    }

    notifyChange() {
      const data = {
        colors: this.selectedColors.map(c => c.slug),
        primaryColor: this.selectedColors[0]?.slug || null,
        colorObjects: this.selectedColors
      };
      this.options.onChange(data);
    }

    // Public API
    getSelectedColors() {
      return this.selectedColors.map(c => c.slug);
    }

    getPrimaryColor() {
      return this.selectedColors[0]?.slug || null;
    }

    setColors(slugs) {
      this.selectedColors = [];
      slugs.forEach(slug => {
        const color = STONE_COLORS.find(c => c.slug === slug);
        if (color && this.selectedColors.length < this.options.maxColors) {
          this.selectedColors.push(color);
        }
      });
      this.updateUI();
    }

    reset() {
      this.clearAll();
    }
  }

  /**
   * ColorFilter Class
   * Creates a dropdown color filter for the marketplace browse page
   */
  class ColorFilter {
    constructor(container, options = {}) {
      this.container = typeof container === 'string'
        ? document.querySelector(container)
        : container;

      if (!this.container) {
        console.error('ColorFilter: Container not found');
        return;
      }

      this.options = {
        onChange: options.onChange || (() => {}),
        initialColors: options.initialColors || [],
        multiSelect: options.multiSelect !== false
      };

      this.selectedColors = [...this.options.initialColors];
      this.isOpen = false;

      this.init();
    }

    init() {
      this.render();
      this.bindEvents();
    }

    render() {
      const html = `
        <div class="color-filter-wrapper">
          <button type="button" class="color-filter-btn">
            <span class="color-filter-btn-dots">
              ${this.renderButtonDots()}
            </span>
            <span class="color-filter-btn-text">${this.getButtonText()}</span>
            <svg class="color-filter-btn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
          <div class="color-filter-dropdown">
            <div class="color-filter-grid">
              ${this.renderFilterSwatches()}
            </div>
            <div class="color-filter-actions">
              <button type="button" class="color-filter-clear">Clear</button>
              <button type="button" class="color-filter-apply">Apply</button>
            </div>
          </div>
        </div>
      `;

      this.container.innerHTML = html;
      this.cacheElements();
    }

    renderButtonDots() {
      if (this.selectedColors.length === 0) {
        return `
          <span class="color-filter-btn-dot" style="background: #ccc;"></span>
          <span class="color-filter-btn-dot" style="background: #999;"></span>
          <span class="color-filter-btn-dot" style="background: #666;"></span>
        `;
      }

      return this.selectedColors.slice(0, 3).map(slug => {
        const color = STONE_COLORS.find(c => c.slug === slug);
        if (!color) return '';
        const style = color.hex === 'multi'
          ? 'background: linear-gradient(135deg, #ef4444, #f59e0b, #22c55e, #3b82f6);'
          : `background: ${color.hex};`;
        return `<span class="color-filter-btn-dot" style="${style}"></span>`;
      }).join('');
    }

    renderFilterSwatches() {
      return STONE_COLORS.map(color => `
        <button type="button" class="color-filter-swatch${this.selectedColors.includes(color.slug) ? ' selected' : ''}"
                data-slug="${color.slug}">
          <span class="color-filter-swatch-circle${color.slug === 'multi-color' ? ' multi-color' : ''}"
                style="${color.hex !== 'multi' ? `background-color: ${color.hex}` : ''}"></span>
          <span class="color-filter-swatch-name">${color.name}</span>
        </button>
      `).join('');
    }

    getButtonText() {
      if (this.selectedColors.length === 0) return 'All Colors';
      if (this.selectedColors.length === 1) {
        const color = STONE_COLORS.find(c => c.slug === this.selectedColors[0]);
        return color?.name || 'Color';
      }
      return `${this.selectedColors.length} Colors`;
    }

    cacheElements() {
      this.btn = this.container.querySelector('.color-filter-btn');
      this.dropdown = this.container.querySelector('.color-filter-dropdown');
      this.grid = this.container.querySelector('.color-filter-grid');
      this.clearBtn = this.container.querySelector('.color-filter-clear');
      this.applyBtn = this.container.querySelector('.color-filter-apply');
      this.dotsContainer = this.container.querySelector('.color-filter-btn-dots');
      this.textEl = this.container.querySelector('.color-filter-btn-text');
    }

    bindEvents() {
      // Toggle dropdown
      this.btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggle();
      });

      // Swatch selection
      this.grid.addEventListener('click', (e) => {
        const swatch = e.target.closest('.color-filter-swatch');
        if (swatch) {
          this.toggleColor(swatch.dataset.slug);
        }
      });

      // Clear
      this.clearBtn.addEventListener('click', () => {
        this.selectedColors = [];
        this.updateSwatches();
      });

      // Apply
      this.applyBtn.addEventListener('click', () => {
        this.close();
        this.updateButton();
        this.options.onChange(this.selectedColors);
      });

      // Close on outside click
      document.addEventListener('click', (e) => {
        if (this.isOpen && !this.container.contains(e.target)) {
          this.close();
        }
      });

      // Close on escape
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen) {
          this.close();
        }
      });
    }

    toggle() {
      this.isOpen ? this.close() : this.open();
    }

    open() {
      this.isOpen = true;
      this.dropdown.classList.add('show');
      this.btn.classList.add('open');
    }

    close() {
      this.isOpen = false;
      this.dropdown.classList.remove('show');
      this.btn.classList.remove('open');
    }

    toggleColor(slug) {
      const index = this.selectedColors.indexOf(slug);
      if (index > -1) {
        this.selectedColors.splice(index, 1);
      } else {
        if (this.options.multiSelect) {
          this.selectedColors.push(slug);
        } else {
          this.selectedColors = [slug];
        }
      }
      this.updateSwatches();
    }

    updateSwatches() {
      const swatches = this.grid.querySelectorAll('.color-filter-swatch');
      swatches.forEach(swatch => {
        swatch.classList.toggle('selected', this.selectedColors.includes(swatch.dataset.slug));
      });
    }

    updateButton() {
      this.dotsContainer.innerHTML = this.renderButtonDots();
      this.textEl.textContent = this.getButtonText();
      this.btn.classList.toggle('active', this.selectedColors.length > 0);
    }

    // Public API
    getSelectedColors() {
      return [...this.selectedColors];
    }

    setColors(slugs) {
      this.selectedColors = [...slugs];
      this.updateSwatches();
      this.updateButton();
    }

    reset() {
      this.selectedColors = [];
      this.updateSwatches();
      this.updateButton();
      this.options.onChange([]);
    }
  }

  // Export to global scope
  window.StoneColorPicker = ColorPicker;
  window.StoneColorFilter = ColorFilter;
  window.STONE_COLORS = STONE_COLORS;
  window.COLOR_FAMILIES = COLOR_FAMILIES;

})();
