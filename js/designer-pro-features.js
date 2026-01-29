// ========== PRO FEATURES: FAVORITES, NOTES, SMART GUIDES ==========
// Room Designer Pro Features - v1.0

(function() {
  'use strict';

  // === FAVORITES SYSTEM ===
  const FAVORITES_KEY = 'sg_designer_favorites';
  let favorites = [];

  window.initFavorites = function() {
    try {
      const stored = localStorage.getItem(FAVORITES_KEY);
      if (stored) {
        favorites = JSON.parse(stored);
        renderFavorites();
      }
    } catch (e) { console.log('Favorites load error'); }
  };

  function saveFavorites() {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); } catch (e) {}
  }

  window.addToFavorites = function(item) {
    if (favorites.find(f => f.id === item.id && f.type === item.type)) {
      if (typeof showToast === 'function') showToast('Already in favorites', 'info');
      return;
    }
    if (favorites.length >= 12) {
      if (typeof showToast === 'function') showToast('Favorites limit reached (12)', 'warning');
      return;
    }
    favorites.push({
      id: item.id,
      type: item.type,
      name: item.name,
      icon: item.icon || '⭐',
      data: item.data,
      addedAt: new Date().toISOString()
    });
    saveFavorites();
    renderFavorites();
    if (typeof showToast === 'function') showToast(`Added "${item.name}" to favorites`, 'success');
  };

  window.removeFromFavorites = function(id, type) {
    favorites = favorites.filter(f => !(f.id === id && f.type === type));
    saveFavorites();
    renderFavorites();
  };

  window.clearFavorites = function() {
    if (!confirm('Clear all favorites?')) return;
    favorites = [];
    saveFavorites();
    renderFavorites();
  };

  function renderFavorites() {
    const list = document.getElementById('favoritesList');
    const empty = document.getElementById('favoritesEmpty');
    const actions = document.getElementById('favoritesActions');
    if (!list) return;

    if (favorites.length === 0) {
      if (empty) empty.style.display = 'flex';
      if (actions) actions.style.display = 'none';
      list.innerHTML = '<div class="favorites-empty"><span style="font-size:20px">⭐</span><span>No favorites</span><span style="font-size:10px;color:var(--text-muted)">Right-click elements to add</span></div>';
      return;
    }
    if (empty) empty.style.display = 'none';
    if (actions) actions.style.display = 'block';

    list.innerHTML = favorites.map(f => `
      <div class="favorite-item" onclick="useFavorite('${f.id}','${f.type}')" title="${f.name}">
        <span class="fav-icon">${f.icon}</span>
        <span class="fav-label">${f.name}</span>
        <span class="fav-remove" onclick="event.stopPropagation();removeFromFavorites('${f.id}','${f.type}')">×</span>
      </div>`).join('');
  }

  window.useFavorite = function(id, type) {
    const fav = favorites.find(f => f.id === id && f.type === type);
    if (!fav) return;
    if (fav.type === 'element' && fav.data && typeof window.addElement === 'function') {
      window.addElement(fav.data.elementType, fav.data);
      if (typeof showToast === 'function') showToast(`Added ${fav.name}`, 'success');
    } else if (fav.type === 'material' && window.selectedElement) {
      if (typeof showToast === 'function') showToast('Material applied', 'success');
    }
  };

  window.getElementIcon = function(type) {
    const icons = {
      counter: '🔲', cabinet: '🗄️', sink: '🚰', stove: '🔥', dishwasher: '🫧',
      refrigerator: '❄️', window: '🪟', door: '🚪', wall: '🧱', toilet: '🚽',
      tub: '🛁', shower: '🚿', vanity: '🪞', washer: '🧺', dryer: '💨'
    };
    return icons[type] || '📦';
  };

  // === NOTES SYSTEM ===
  const NOTES_KEY = 'sg_designer_notes';
  let designNotes = [];
  let noteMode = false;
  let selectedNote = null;
  const NOTE_COLORS = ['gold', 'red', 'blue', 'green', 'purple', 'orange'];

  window.initNotes = function() {
    try {
      const stored = localStorage.getItem(NOTES_KEY);
      if (stored) {
        designNotes = JSON.parse(stored);
        renderNotes();
        renderNotePins();
      }
    } catch (e) {}
  };

  function saveNotes() {
    try { localStorage.setItem(NOTES_KEY, JSON.stringify(designNotes)); } catch (e) {}
  }

  window.enableNoteMode = function() {
    noteMode = true;
    document.body.style.cursor = 'crosshair';
    const btn = document.getElementById('addNoteBtn');
    if (btn) {
      btn.textContent = 'Click canvas to place...';
      btn.classList.add('active');
    }
    if (typeof showToast === 'function') showToast('Click canvas to add note', 'info');
  };

  window.disableNoteMode = function() {
    noteMode = false;
    document.body.style.cursor = '';
    const btn = document.getElementById('addNoteBtn');
    if (btn) {
      btn.textContent = '+ Add Note';
      btn.classList.remove('active');
    }
  };

  window.isNoteMode = function() {
    return noteMode;
  };

  window.handleNoteClick = function(e, canvasX, canvasY) {
    if (!noteMode) return false;
    const text = prompt('Enter note:');
    if (!text) {
      window.disableNoteMode();
      return true;
    }

    designNotes.push({
      id: 'note_' + Date.now(),
      text: text,
      x: canvasX,
      y: canvasY,
      color: NOTE_COLORS[designNotes.length % NOTE_COLORS.length],
      createdAt: new Date().toISOString()
    });
    saveNotes();
    renderNotes();
    renderNotePins();
    window.disableNoteMode();
    if (typeof showToast === 'function') showToast('Note added', 'success');
    return true;
  };

  function renderNotes() {
    const list = document.getElementById('notesList');
    if (!list) return;
    if (designNotes.length === 0) {
      list.innerHTML = '<div class="notes-empty"><span style="font-size:20px">📝</span><span>No notes</span></div>';
      return;
    }
    list.innerHTML = designNotes.map(n => `
      <div class="note-item ${selectedNote === n.id ? 'selected' : ''}" onclick="selectNote('${n.id}')">
        <div class="note-color" style="background:${n.color === 'gold' ? 'var(--gold-primary)' : n.color}"></div>
        <div class="note-content">
          <div class="note-text">${n.text.length > 50 ? escapeHtml(n.text.slice(0, 50)) + '...' : escapeHtml(n.text)}</div>
          <div class="note-meta">${formatNoteTime(n.createdAt)}</div>
        </div>
        <div class="note-actions">
          <button class="note-action-btn" onclick="event.stopPropagation();editNote('${n.id}')">✏️</button>
          <button class="note-action-btn" onclick="event.stopPropagation();deleteNote('${n.id}')">🗑️</button>
        </div>
      </div>`).join('');
  }

  function renderNotePins() {
    document.querySelectorAll('.canvas-note-pin').forEach(p => p.remove());
    const canvas = document.getElementById('roomCanvas');
    if (!canvas) return;
    const container = canvas.parentElement;

    designNotes.forEach(n => {
      const pin = document.createElement('div');
      pin.className = `canvas-note-pin ${n.color}`;
      pin.style.cssText = `left:${n.x - 12}px;top:${n.y - 24}px`;
      pin.dataset.noteId = n.id;
      pin.title = n.text;
      pin.onclick = (e) => {
        e.stopPropagation();
        window.selectNote(n.id);
      };
      container.appendChild(pin);
    });
  }

  window.selectNote = function(id) {
    selectedNote = selectedNote === id ? null : id;
    renderNotes();
    document.querySelectorAll('.canvas-note-pin').forEach(p => {
      p.style.transform = p.dataset.noteId === selectedNote ? 'rotate(-45deg) scale(1.2)' : 'rotate(-45deg)';
    });
  };

  window.editNote = function(id) {
    const note = designNotes.find(n => n.id === id);
    if (!note) return;
    const text = prompt('Edit note:', note.text);
    if (text !== null) {
      note.text = text;
      saveNotes();
      renderNotes();
      renderNotePins();
    }
  };

  window.deleteNote = function(id) {
    if (!confirm('Delete note?')) return;
    designNotes = designNotes.filter(n => n.id !== id);
    saveNotes();
    renderNotes();
    renderNotePins();
  };

  function formatNoteTime(d) {
    if (!d) return '';
    const diff = Date.now() - new Date(d);
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    const h = Math.floor(diff / 3600000);
    if (h < 24) return h + 'h ago';
    return Math.floor(diff / 86400000) + 'd ago';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  // === SMART GUIDES ===
  let smartGuidesEnabled = true;
  let activeSmartGuides = [];

  window.toggleSmartGuides = function() {
    smartGuidesEnabled = !smartGuidesEnabled;
    if (typeof showToast === 'function') showToast(`Smart guides ${smartGuidesEnabled ? 'on' : 'off'}`, 'info');
    if (!smartGuidesEnabled) window.clearSmartGuides();
  };

  window.checkSmartGuides = function(movingEl, elements) {
    if (!smartGuidesEnabled || !movingEl) return [];
    const guides = [];
    const threshold = 5;
    const mRect = {
      left: movingEl.x,
      right: movingEl.x + (movingEl.width || 0),
      top: movingEl.y,
      bottom: movingEl.y + (movingEl.height || 0),
      centerX: movingEl.x + (movingEl.width || 0) / 2,
      centerY: movingEl.y + (movingEl.height || 0) / 2
    };

    elements.forEach(el => {
      if (el === movingEl || el.id === movingEl.id) return;
      const r = {
        left: el.x,
        right: el.x + (el.width || 0),
        top: el.y,
        bottom: el.y + (el.height || 0),
        centerX: el.x + (el.width || 0) / 2,
        centerY: el.y + (el.height || 0) / 2
      };
      if (Math.abs(mRect.left - r.left) < threshold) guides.push({ type: 'vertical', pos: r.left });
      if (Math.abs(mRect.right - r.right) < threshold) guides.push({ type: 'vertical', pos: r.right });
      if (Math.abs(mRect.centerX - r.centerX) < threshold) guides.push({ type: 'vertical', pos: r.centerX });
      if (Math.abs(mRect.top - r.top) < threshold) guides.push({ type: 'horizontal', pos: r.top });
      if (Math.abs(mRect.bottom - r.bottom) < threshold) guides.push({ type: 'horizontal', pos: r.bottom });
      if (Math.abs(mRect.centerY - r.centerY) < threshold) guides.push({ type: 'horizontal', pos: r.centerY });
    });
    return guides;
  };

  window.renderSmartGuides = function(guides) {
    window.clearSmartGuides();
    const canvas = document.getElementById('roomCanvas');
    if (!canvas) return;
    const container = canvas.parentElement;
    guides.forEach(g => {
      const guide = document.createElement('div');
      guide.className = `smart-guide ${g.type}`;
      guide.style[g.type === 'horizontal' ? 'top' : 'left'] = g.pos + 'px';
      guide.style[g.type === 'horizontal' ? 'left' : 'top'] = '0';
      container.appendChild(guide);
      activeSmartGuides.push(guide);
    });
  };

  window.clearSmartGuides = function() {
    activeSmartGuides.forEach(g => g.remove());
    activeSmartGuides = [];
  };

  // === ELEMENT GROUPING ===
  let elementGroups = [];
  let selectedGroup = null;

  window.groupSelectedElements = function() {
    if (!window.selectedElements || window.selectedElements.length < 2) {
      if (typeof showToast === 'function') showToast('Select 2+ elements to group', 'warning');
      return;
    }
    const group = {
      id: 'group_' + Date.now(),
      name: 'Group ' + (elementGroups.length + 1),
      elementIds: window.selectedElements.map(e => e.id)
    };
    elementGroups.push(group);
    if (typeof showToast === 'function') showToast(`Created ${group.name}`, 'success');
    renderGroupIndicators();
  };

  window.ungroupElements = function(groupId) {
    elementGroups = elementGroups.filter(g => g.id !== groupId);
    renderGroupIndicators();
    if (typeof showToast === 'function') showToast('Ungrouped', 'info');
  };

  window.selectGroup = function(groupId) {
    const group = elementGroups.find(g => g.id === groupId);
    if (!group || !window.elements) return;
    window.selectedElements = window.elements.filter(e => group.elementIds.includes(e.id));
    selectedGroup = groupId;
    if (typeof window.renderCanvas === 'function') window.renderCanvas();
  };

  window.getSelectedGroup = function() {
    return selectedGroup;
  };

  function renderGroupIndicators() {
    document.querySelectorAll('.group-indicator').forEach(g => g.remove());
    const canvas = document.getElementById('roomCanvas');
    if (!canvas || !window.elements) return;
    const container = canvas.parentElement;

    elementGroups.forEach(group => {
      const els = window.elements.filter(e => group.elementIds.includes(e.id));
      if (!els.length) return;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      els.forEach(e => {
        minX = Math.min(minX, e.x);
        minY = Math.min(minY, e.y);
        maxX = Math.max(maxX, e.x + (e.width || 0));
        maxY = Math.max(maxY, e.y + (e.height || 0));
      });
      const ind = document.createElement('div');
      ind.className = 'group-indicator';
      ind.style.cssText = `left:${minX - 4}px;top:${minY - 4}px;width:${maxX - minX + 8}px;height:${maxY - minY + 8}px`;
      ind.innerHTML = `<span class="group-badge">${group.name}</span>`;
      ind.onclick = () => window.selectGroup(group.id);
      container.appendChild(ind);
    });
  }

  // === QUICK MEASUREMENT OVERLAY ===
  let measurementOverlay = null;

  window.showMeasurementOverlay = function(element) {
    if (!element || !element.width || !element.height) return;
    hideMeasurementOverlay();

    const canvas = document.getElementById('roomCanvas');
    if (!canvas) return;
    const container = canvas.parentElement;

    measurementOverlay = document.createElement('div');
    measurementOverlay.className = 'measurement-overlay';
    measurementOverlay.innerHTML = `
      <div class="measure-dimension measure-width" style="left:${element.x}px;top:${element.y - 20}px;width:${element.width}px">
        <span>${formatDimension(element.width)}</span>
      </div>
      <div class="measure-dimension measure-height" style="left:${element.x + element.width + 5}px;top:${element.y}px;height:${element.height}px">
        <span>${formatDimension(element.height)}</span>
      </div>
    `;
    container.appendChild(measurementOverlay);
  };

  window.hideMeasurementOverlay = function() {
    if (measurementOverlay) {
      measurementOverlay.remove();
      measurementOverlay = null;
    }
  };

  function formatDimension(pixels) {
    // Convert pixels to feet-inches at 12px per inch
    const ppi = window.pixelsPerInch || 12;
    const inches = pixels / ppi;
    const feet = Math.floor(inches / 12);
    const remainingInches = Math.round((inches % 12) * 16) / 16;
    if (feet === 0) return `${remainingInches}"`;
    if (remainingInches === 0) return `${feet}'`;
    return `${feet}'-${remainingInches}"`;
  }

  // === DESIGN TEMPLATES ===
  const TEMPLATES_KEY = 'sg_designer_templates';
  let customTemplates = [];

  window.initTemplates = function() {
    try {
      const stored = localStorage.getItem(TEMPLATES_KEY);
      if (stored) customTemplates = JSON.parse(stored);
    } catch (e) {}
  };

  window.saveAsTemplate = function(name) {
    if (!window.elements || window.elements.length === 0) {
      if (typeof showToast === 'function') showToast('Nothing to save as template', 'warning');
      return;
    }
    if (!name) name = prompt('Template name:');
    if (!name) return;

    const template = {
      id: 'template_' + Date.now(),
      name: name,
      elements: JSON.parse(JSON.stringify(window.elements)),
      roomWidth: window.roomWidth || 240,
      roomDepth: window.roomDepth || 180,
      createdAt: new Date().toISOString()
    };
    customTemplates.push(template);
    try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(customTemplates)); } catch (e) {}
    if (typeof showToast === 'function') showToast(`Template "${name}" saved`, 'success');
  };

  window.loadTemplate = function(templateId) {
    const template = customTemplates.find(t => t.id === templateId);
    if (!template) return;

    if (window.elements && window.elements.length > 0) {
      if (!confirm('Replace current design with template?')) return;
    }

    window.elements = JSON.parse(JSON.stringify(template.elements));
    if (template.roomWidth) window.roomWidth = template.roomWidth;
    if (template.roomDepth) window.roomDepth = template.roomDepth;
    if (typeof window.renderCanvas === 'function') window.renderCanvas();
    if (typeof showToast === 'function') showToast(`Loaded "${template.name}"`, 'success');
  };

  window.getCustomTemplates = function() {
    return customTemplates;
  };

  window.deleteTemplate = function(templateId) {
    if (!confirm('Delete this template?')) return;
    customTemplates = customTemplates.filter(t => t.id !== templateId);
    try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(customTemplates)); } catch (e) {}
    if (typeof showToast === 'function') showToast('Template deleted', 'info');
  };

  // === QUICK DUPLICATE WITH OFFSET ===
  window.duplicateWithOffset = function(element, offsetX = 20, offsetY = 20) {
    if (!element) {
      element = window.selectedElement;
    }
    if (!element) {
      if (typeof showToast === 'function') showToast('Select an element first', 'warning');
      return null;
    }

    const newElement = JSON.parse(JSON.stringify(element));
    newElement.id = element.type + '_' + Date.now();
    newElement.x = (newElement.x || 0) + offsetX;
    newElement.y = (newElement.y || 0) + offsetY;

    if (window.elements) {
      window.elements.push(newElement);
      if (typeof window.renderCanvas === 'function') window.renderCanvas();
      if (typeof showToast === 'function') showToast('Element duplicated', 'success');
    }
    return newElement;
  };

  // === ALIGNMENT TOOLS ===
  window.alignElements = function(alignment) {
    if (!window.selectedElements || window.selectedElements.length < 2) {
      if (typeof showToast === 'function') showToast('Select 2+ elements to align', 'warning');
      return;
    }

    const els = window.selectedElements;
    let ref;

    switch (alignment) {
      case 'left':
        ref = Math.min(...els.map(e => e.x));
        els.forEach(e => e.x = ref);
        break;
      case 'right':
        ref = Math.max(...els.map(e => e.x + (e.width || 0)));
        els.forEach(e => e.x = ref - (e.width || 0));
        break;
      case 'top':
        ref = Math.min(...els.map(e => e.y));
        els.forEach(e => e.y = ref);
        break;
      case 'bottom':
        ref = Math.max(...els.map(e => e.y + (e.height || 0)));
        els.forEach(e => e.y = ref - (e.height || 0));
        break;
      case 'centerH':
        ref = els.reduce((sum, e) => sum + e.x + (e.width || 0) / 2, 0) / els.length;
        els.forEach(e => e.x = ref - (e.width || 0) / 2);
        break;
      case 'centerV':
        ref = els.reduce((sum, e) => sum + e.y + (e.height || 0) / 2, 0) / els.length;
        els.forEach(e => e.y = ref - (e.height || 0) / 2);
        break;
    }

    if (typeof window.renderCanvas === 'function') window.renderCanvas();
    if (typeof showToast === 'function') showToast('Elements aligned', 'success');
  };

  // === DISTRIBUTE EVENLY ===
  window.distributeElements = function(direction) {
    if (!window.selectedElements || window.selectedElements.length < 3) {
      if (typeof showToast === 'function') showToast('Select 3+ elements to distribute', 'warning');
      return;
    }

    const els = [...window.selectedElements];

    if (direction === 'horizontal') {
      els.sort((a, b) => a.x - b.x);
      const first = els[0].x;
      const last = els[els.length - 1].x + (els[els.length - 1].width || 0);
      const totalWidth = els.reduce((sum, e) => sum + (e.width || 0), 0);
      const gap = (last - first - totalWidth) / (els.length - 1);
      let currentX = first;
      els.forEach((e, i) => {
        if (i > 0) e.x = currentX;
        currentX += (e.width || 0) + gap;
      });
    } else {
      els.sort((a, b) => a.y - b.y);
      const first = els[0].y;
      const last = els[els.length - 1].y + (els[els.length - 1].height || 0);
      const totalHeight = els.reduce((sum, e) => sum + (e.height || 0), 0);
      const gap = (last - first - totalHeight) / (els.length - 1);
      let currentY = first;
      els.forEach((e, i) => {
        if (i > 0) e.y = currentY;
        currentY += (e.height || 0) + gap;
      });
    }

    if (typeof window.renderCanvas === 'function') window.renderCanvas();
    if (typeof showToast === 'function') showToast('Elements distributed', 'success');
  };

  // === QUICK ACTIONS TOOLBAR ===
  window.showQuickActions = function(element, x, y) {
    hideQuickActions();
    if (!element) return;

    const toolbar = document.createElement('div');
    toolbar.id = 'quickActionsToolbar';
    toolbar.className = 'quick-actions-toolbar';
    toolbar.style.cssText = `left:${x}px;top:${y}px`;
    toolbar.innerHTML = `
      <button onclick="duplicateWithOffset()" title="Duplicate (Ctrl+D)">📋</button>
      <button onclick="window.selectedElement && addToFavorites({type:'element',id:window.selectedElement.type+'_fav',name:window.selectedElement.name||window.selectedElement.type,icon:getElementIcon(window.selectedElement.type),data:window.selectedElement})" title="Add to Favorites">⭐</button>
      <button onclick="deleteSelectedElement()" title="Delete (Del)">🗑️</button>
      <button onclick="hideQuickActions()" title="Close">✕</button>
    `;
    document.body.appendChild(toolbar);
  };

  window.hideQuickActions = function() {
    const toolbar = document.getElementById('quickActionsToolbar');
    if (toolbar) toolbar.remove();
  };

  // === UNDO/REDO HISTORY DISPLAY ===
  window.getUndoHistoryCount = function() {
    return window.undoHistory ? window.undoHistory.length : 0;
  };

  window.getRedoHistoryCount = function() {
    return window.redoHistory ? window.redoHistory.length : 0;
  };

  // === KEYBOARD SHORTCUTS ===
  document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + G = Group selected
    if ((e.ctrlKey || e.metaKey) && e.key === 'g' && !e.shiftKey) {
      e.preventDefault();
      window.groupSelectedElements();
    }
    // Ctrl/Cmd + Shift + G = Ungroup
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'G') {
      e.preventDefault();
      if (selectedGroup) window.ungroupElements(selectedGroup);
    }
    // N = Toggle note mode
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      noteMode ? window.disableNoteMode() : window.enableNoteMode();
    }
    // Escape = Cancel note mode or hide quick actions
    if (e.key === 'Escape') {
      if (noteMode) window.disableNoteMode();
      window.hideQuickActions();
    }
    // Ctrl/Cmd + D = Duplicate
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      e.preventDefault();
      window.duplicateWithOffset();
    }
    // Ctrl/Cmd + Shift + S = Save as template
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
      e.preventDefault();
      window.saveAsTemplate();
    }
  });

  // === INIT ON LOAD ===
  document.addEventListener('DOMContentLoaded', function() {
    window.initFavorites();
    window.initNotes();
  });

  console.log('Room Designer Pro Features loaded');
})();
