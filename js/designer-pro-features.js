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

  // === DESIGN HISTORY / VERSION CONTROL ===
  const HISTORY_KEY = 'sg_designer_history';
  const MAX_HISTORY = 20;
  let designHistory = [];
  let historyIndex = -1;

  window.initHistory = function() {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) {
        designHistory = JSON.parse(stored);
        historyIndex = designHistory.length - 1;
      }
    } catch (e) {}
  };

  window.saveToHistory = function(label) {
    if (!window.elements) return;

    // Remove any future states if we're not at the end
    if (historyIndex < designHistory.length - 1) {
      designHistory = designHistory.slice(0, historyIndex + 1);
    }

    const snapshot = {
      id: 'snap_' + Date.now(),
      label: label || 'Change',
      elements: JSON.parse(JSON.stringify(window.elements)),
      timestamp: new Date().toISOString()
    };

    designHistory.push(snapshot);
    if (designHistory.length > MAX_HISTORY) {
      designHistory.shift();
    }
    historyIndex = designHistory.length - 1;

    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(designHistory)); } catch (e) {}
  };

  window.undoToHistory = function() {
    if (historyIndex <= 0) {
      if (typeof showToast === 'function') showToast('Nothing to undo', 'info');
      return;
    }
    historyIndex--;
    const snapshot = designHistory[historyIndex];
    if (snapshot && snapshot.elements) {
      window.elements = JSON.parse(JSON.stringify(snapshot.elements));
      if (typeof window.renderCanvas === 'function') window.renderCanvas();
      if (typeof showToast === 'function') showToast(`Undo: ${snapshot.label}`, 'info');
    }
  };

  window.redoFromHistory = function() {
    if (historyIndex >= designHistory.length - 1) {
      if (typeof showToast === 'function') showToast('Nothing to redo', 'info');
      return;
    }
    historyIndex++;
    const snapshot = designHistory[historyIndex];
    if (snapshot && snapshot.elements) {
      window.elements = JSON.parse(JSON.stringify(snapshot.elements));
      if (typeof window.renderCanvas === 'function') window.renderCanvas();
      if (typeof showToast === 'function') showToast(`Redo: ${snapshot.label}`, 'info');
    }
  };

  window.getHistorySnapshots = function() {
    return designHistory.map((s, i) => ({
      ...s,
      isCurrent: i === historyIndex
    }));
  };

  window.restoreSnapshot = function(snapshotId) {
    const index = designHistory.findIndex(s => s.id === snapshotId);
    if (index === -1) return;
    historyIndex = index;
    const snapshot = designHistory[index];
    if (snapshot && snapshot.elements) {
      window.elements = JSON.parse(JSON.stringify(snapshot.elements));
      if (typeof window.renderCanvas === 'function') window.renderCanvas();
      if (typeof showToast === 'function') showToast(`Restored: ${snapshot.label}`, 'success');
    }
  };

  // === MATERIAL COST CALCULATOR ===
  const DEFAULT_PRICES = {
    counter: { perSqFt: 75, install: 35 },
    cabinet: { perUnit: 450, install: 150 },
    sink: { perUnit: 350, install: 200 },
    faucet: { perUnit: 250, install: 100 },
    backsplash: { perSqFt: 25, install: 15 },
    flooring: { perSqFt: 8, install: 4 },
    appliance: { perUnit: 800, install: 100 }
  };

  window.calculateMaterialCosts = function(elements, customPrices) {
    if (!elements) elements = window.elements;
    if (!elements || elements.length === 0) return { items: [], total: 0, laborTotal: 0, grandTotal: 0 };

    const prices = { ...DEFAULT_PRICES, ...customPrices };
    const items = [];
    let total = 0;
    let laborTotal = 0;

    elements.forEach(el => {
      const type = el.type || 'other';
      const price = prices[type] || { perUnit: 100, install: 50 };
      let cost = 0;
      let labor = 0;
      let quantity = 1;
      let unit = 'unit';

      if (el.width && el.height && (type === 'counter' || type === 'backsplash' || type === 'flooring')) {
        // Calculate square footage
        const ppi = window.pixelsPerInch || 12;
        const sqFt = (el.width / ppi / 12) * (el.height / ppi / 12);
        quantity = Math.round(sqFt * 10) / 10;
        unit = 'sq ft';
        cost = quantity * (price.perSqFt || 50);
        labor = quantity * (price.install || 20);
      } else {
        cost = price.perUnit || 100;
        labor = price.install || 50;
      }

      items.push({
        id: el.id,
        name: el.name || type,
        type: type,
        quantity: quantity,
        unit: unit,
        materialCost: Math.round(cost),
        laborCost: Math.round(labor),
        total: Math.round(cost + labor)
      });

      total += cost;
      laborTotal += labor;
    });

    return {
      items,
      materialTotal: Math.round(total),
      laborTotal: Math.round(laborTotal),
      grandTotal: Math.round(total + laborTotal)
    };
  };

  window.showCostSummary = function() {
    const costs = window.calculateMaterialCosts();
    const modal = document.createElement('div');
    modal.className = 'cost-summary-modal';
    modal.innerHTML = `
      <div class="cost-summary-content">
        <div class="cost-summary-header">
          <h3>Cost Estimate</h3>
          <button onclick="this.closest('.cost-summary-modal').remove()">&times;</button>
        </div>
        <div class="cost-summary-body">
          <table class="cost-table">
            <thead>
              <tr><th>Item</th><th>Qty</th><th>Material</th><th>Labor</th><th>Total</th></tr>
            </thead>
            <tbody>
              ${costs.items.map(i => `
                <tr>
                  <td>${i.name}</td>
                  <td>${i.quantity} ${i.unit}</td>
                  <td>$${i.materialCost.toLocaleString()}</td>
                  <td>$${i.laborCost.toLocaleString()}</td>
                  <td>$${i.total.toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr class="subtotal"><td colspan="2">Materials</td><td colspan="3">$${costs.materialTotal.toLocaleString()}</td></tr>
              <tr class="subtotal"><td colspan="2">Labor</td><td colspan="3">$${costs.laborTotal.toLocaleString()}</td></tr>
              <tr class="grand-total"><td colspan="2">Total</td><td colspan="3">$${costs.grandTotal.toLocaleString()}</td></tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  };

  // === ELEMENT SEARCH ===
  window.searchElements = function(query) {
    if (!window.elements || !query) return [];
    const q = query.toLowerCase();
    return window.elements.filter(el =>
      (el.name && el.name.toLowerCase().includes(q)) ||
      (el.type && el.type.toLowerCase().includes(q)) ||
      (el.material && el.material.toLowerCase().includes(q))
    );
  };

  window.showElementSearch = function() {
    const existing = document.getElementById('elementSearchModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'elementSearchModal';
    modal.className = 'element-search-modal';
    modal.innerHTML = `
      <div class="element-search-content">
        <input type="text" id="elementSearchInput" placeholder="Search elements..." autofocus>
        <div id="elementSearchResults" class="element-search-results"></div>
      </div>
    `;
    document.body.appendChild(modal);

    const input = document.getElementById('elementSearchInput');
    const results = document.getElementById('elementSearchResults');

    input.addEventListener('input', function() {
      const matches = window.searchElements(this.value);
      if (matches.length === 0) {
        results.innerHTML = '<div class="search-empty">No matches found</div>';
        return;
      }
      results.innerHTML = matches.map(el => `
        <div class="search-result-item" onclick="selectAndZoomElement('${el.id}')">
          <span class="search-result-icon">${getElementIcon(el.type)}</span>
          <span class="search-result-name">${el.name || el.type}</span>
          <span class="search-result-type">${el.type}</span>
        </div>
      `).join('');
    });

    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.remove();
    });

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') modal.remove();
    });
  };

  window.selectAndZoomElement = function(elementId) {
    const el = window.elements?.find(e => e.id === elementId);
    if (!el) return;

    window.selectedElement = el;
    if (typeof window.renderCanvas === 'function') window.renderCanvas();

    // Close search modal
    const modal = document.getElementById('elementSearchModal');
    if (modal) modal.remove();

    if (typeof showToast === 'function') showToast(`Selected: ${el.name || el.type}`, 'info');
  };

  // === KEYBOARD SHORTCUTS PANEL ===
  const SHORTCUTS = [
    { key: 'V', action: 'Select tool' },
    { key: 'W', action: 'Wall tool' },
    { key: 'C', action: 'Counter tool' },
    { key: 'M', action: 'Measure tool' },
    { key: 'P', action: 'Pan tool' },
    { key: 'S', action: 'Slab layout tool' },
    { key: 'N', action: 'Add note' },
    { key: 'Delete/Backspace', action: 'Delete selected' },
    { key: 'Ctrl+D', action: 'Duplicate' },
    { key: 'Ctrl+G', action: 'Group elements' },
    { key: 'Ctrl+Shift+G', action: 'Ungroup' },
    { key: 'Ctrl+Z', action: 'Undo' },
    { key: 'Ctrl+Y', action: 'Redo' },
    { key: 'Ctrl+S', action: 'Save design' },
    { key: 'Ctrl+Shift+S', action: 'Save as template' },
    { key: 'Ctrl+F', action: 'Search elements' },
    { key: 'Ctrl+E', action: 'Export' },
    { key: 'Space', action: 'Toggle 3D view' },
    { key: 'Escape', action: 'Cancel / Deselect' },
    { key: 'Arrow keys', action: 'Nudge selected' },
    { key: '?', action: 'Show shortcuts' }
  ];

  window.showKeyboardShortcuts = function() {
    const existing = document.getElementById('shortcutsModal');
    if (existing) { existing.remove(); return; }

    const modal = document.createElement('div');
    modal.id = 'shortcutsModal';
    modal.className = 'shortcuts-modal';
    modal.innerHTML = `
      <div class="shortcuts-content">
        <div class="shortcuts-header">
          <h3>⌨️ Keyboard Shortcuts</h3>
          <button onclick="this.closest('.shortcuts-modal').remove()">&times;</button>
        </div>
        <div class="shortcuts-body">
          ${SHORTCUTS.map(s => `
            <div class="shortcut-row">
              <kbd>${s.key}</kbd>
              <span>${s.action}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.remove();
    });
  };

  // === DESIGN STATISTICS ===
  window.getDesignStats = function() {
    if (!window.elements) return null;

    const ppi = window.pixelsPerInch || 12;
    const stats = {
      totalElements: window.elements.length,
      byType: {},
      totalArea: 0,
      countertopArea: 0,
      cabinetCount: 0,
      applianceCount: 0
    };

    window.elements.forEach(el => {
      // Count by type
      stats.byType[el.type] = (stats.byType[el.type] || 0) + 1;

      // Calculate areas
      if (el.width && el.height) {
        const sqFt = (el.width / ppi / 12) * (el.height / ppi / 12);
        stats.totalArea += sqFt;
        if (el.type === 'counter') stats.countertopArea += sqFt;
      }

      // Count categories
      if (el.type === 'cabinet') stats.cabinetCount++;
      if (['sink', 'stove', 'dishwasher', 'refrigerator'].includes(el.type)) stats.applianceCount++;
    });

    stats.totalArea = Math.round(stats.totalArea * 10) / 10;
    stats.countertopArea = Math.round(stats.countertopArea * 10) / 10;

    return stats;
  };

  window.showDesignStats = function() {
    const stats = window.getDesignStats();
    if (!stats) {
      if (typeof showToast === 'function') showToast('No design data', 'info');
      return;
    }

    const typeList = Object.entries(stats.byType)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `<li>${getElementIcon(type)} ${type}: ${count}</li>`)
      .join('');

    const modal = document.createElement('div');
    modal.className = 'stats-modal';
    modal.innerHTML = `
      <div class="stats-content">
        <div class="stats-header">
          <h3>📊 Design Statistics</h3>
          <button onclick="this.closest('.stats-modal').remove()">&times;</button>
        </div>
        <div class="stats-body">
          <div class="stat-card">
            <div class="stat-value">${stats.totalElements}</div>
            <div class="stat-label">Total Elements</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.countertopArea} sf</div>
            <div class="stat-label">Countertop Area</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.cabinetCount}</div>
            <div class="stat-label">Cabinets</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.applianceCount}</div>
            <div class="stat-label">Appliances</div>
          </div>
          <div class="stat-breakdown">
            <h4>Elements by Type</h4>
            <ul>${typeList}</ul>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.remove();
    });
  };

  // === RULER & GRID SETTINGS ===
  let gridSettings = {
    show: true,
    size: 12, // pixels
    snap: true,
    showRulers: true
  };

  window.getGridSettings = function() { return gridSettings; };

  window.setGridSettings = function(settings) {
    gridSettings = { ...gridSettings, ...settings };
    if (typeof window.renderCanvas === 'function') window.renderCanvas();
  };

  window.toggleGrid = function() {
    gridSettings.show = !gridSettings.show;
    if (typeof window.renderCanvas === 'function') window.renderCanvas();
    if (typeof showToast === 'function') showToast(`Grid ${gridSettings.show ? 'shown' : 'hidden'}`, 'info');
  };

  window.toggleSnap = function() {
    gridSettings.snap = !gridSettings.snap;
    if (typeof showToast === 'function') showToast(`Snap ${gridSettings.snap ? 'enabled' : 'disabled'}`, 'info');
  };

  window.setGridSize = function(size) {
    gridSettings.size = size;
    if (typeof window.renderCanvas === 'function') window.renderCanvas();
  };

  // === COPY/PASTE BETWEEN DESIGNS ===
  const CLIPBOARD_KEY = 'sg_designer_clipboard';

  window.copyElementsToClipboard = function(elements) {
    if (!elements) elements = window.selectedElements || (window.selectedElement ? [window.selectedElement] : []);
    if (!elements || elements.length === 0) {
      if (typeof showToast === 'function') showToast('Nothing to copy', 'warning');
      return;
    }
    try {
      localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(elements));
      if (typeof showToast === 'function') showToast(`Copied ${elements.length} element(s)`, 'success');
    } catch (e) {}
  };

  window.pasteElementsFromClipboard = function() {
    try {
      const stored = localStorage.getItem(CLIPBOARD_KEY);
      if (!stored) {
        if (typeof showToast === 'function') showToast('Clipboard empty', 'info');
        return;
      }
      const elements = JSON.parse(stored);
      if (!elements || elements.length === 0) return;

      // Offset pasted elements
      elements.forEach(el => {
        el.id = el.type + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        el.x = (el.x || 0) + 20;
        el.y = (el.y || 0) + 20;
        if (window.elements) window.elements.push(el);
      });

      if (typeof window.renderCanvas === 'function') window.renderCanvas();
      if (typeof showToast === 'function') showToast(`Pasted ${elements.length} element(s)`, 'success');
    } catch (e) {}
  };

  // === ENHANCED KEYBOARD SHORTCUTS ===
  document.addEventListener('keydown', function(e) {
    const isInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);

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
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !isInput) {
      e.preventDefault();
      noteMode ? window.disableNoteMode() : window.enableNoteMode();
    }
    // Escape = Cancel
    if (e.key === 'Escape') {
      if (noteMode) window.disableNoteMode();
      window.hideQuickActions();
      document.querySelectorAll('.shortcuts-modal, .stats-modal, .cost-summary-modal, .element-search-modal').forEach(m => m.remove());
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
    // Ctrl/Cmd + F = Search elements
    if ((e.ctrlKey || e.metaKey) && e.key === 'f' && !isInput) {
      e.preventDefault();
      window.showElementSearch();
    }
    // Ctrl/Cmd + C = Copy
    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !isInput) {
      window.copyElementsToClipboard();
    }
    // Ctrl/Cmd + V = Paste
    if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !isInput) {
      window.pasteElementsFromClipboard();
    }
    // ? = Show shortcuts
    if (e.key === '?' && !isInput) {
      e.preventDefault();
      window.showKeyboardShortcuts();
    }
    // G = Toggle grid (without Ctrl)
    if (e.key === 'g' && !e.ctrlKey && !e.metaKey && !isInput) {
      window.toggleGrid();
    }
  });

  // === LAYER MANAGEMENT ===
  window.bringToFront = function(element) {
    if (!element) element = window.selectedElement;
    if (!element || !window.elements) return;

    const index = window.elements.indexOf(element);
    if (index > -1) {
      window.elements.splice(index, 1);
      window.elements.push(element);
      if (typeof window.renderCanvas === 'function') window.renderCanvas();
      if (typeof showToast === 'function') showToast('Brought to front', 'info');
    }
  };

  window.sendToBack = function(element) {
    if (!element) element = window.selectedElement;
    if (!element || !window.elements) return;

    const index = window.elements.indexOf(element);
    if (index > -1) {
      window.elements.splice(index, 1);
      window.elements.unshift(element);
      if (typeof window.renderCanvas === 'function') window.renderCanvas();
      if (typeof showToast === 'function') showToast('Sent to back', 'info');
    }
  };

  window.moveLayerUp = function(element) {
    if (!element) element = window.selectedElement;
    if (!element || !window.elements) return;

    const index = window.elements.indexOf(element);
    if (index > -1 && index < window.elements.length - 1) {
      window.elements.splice(index, 1);
      window.elements.splice(index + 1, 0, element);
      if (typeof window.renderCanvas === 'function') window.renderCanvas();
    }
  };

  window.moveLayerDown = function(element) {
    if (!element) element = window.selectedElement;
    if (!element || !window.elements) return;

    const index = window.elements.indexOf(element);
    if (index > 0) {
      window.elements.splice(index, 1);
      window.elements.splice(index - 1, 0, element);
      if (typeof window.renderCanvas === 'function') window.renderCanvas();
    }
  };

  // === ZOOM CONTROLS ===
  let currentZoom = 1;
  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 4;

  window.getZoom = function() { return currentZoom; };

  window.setZoom = function(zoom) {
    currentZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
    const canvas = document.getElementById('roomCanvas');
    if (canvas) {
      canvas.style.transform = `scale(${currentZoom})`;
      canvas.style.transformOrigin = 'center center';
    }
    updateZoomDisplay();
    return currentZoom;
  };

  window.zoomIn = function() {
    return window.setZoom(currentZoom * 1.25);
  };

  window.zoomOut = function() {
    return window.setZoom(currentZoom / 1.25);
  };

  window.zoomToFit = function() {
    const canvas = document.getElementById('roomCanvas');
    const container = canvas?.parentElement;
    if (!canvas || !container) return;

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const canvasWidth = canvas.width || 800;
    const canvasHeight = canvas.height || 600;

    const scaleX = containerWidth / canvasWidth;
    const scaleY = containerHeight / canvasHeight;
    const scale = Math.min(scaleX, scaleY, 1) * 0.9;

    return window.setZoom(scale);
  };

  window.zoomToSelection = function() {
    if (!window.selectedElement && (!window.selectedElements || window.selectedElements.length === 0)) {
      if (typeof showToast === 'function') showToast('Select an element first', 'info');
      return;
    }

    const elements = window.selectedElements?.length > 0 ? window.selectedElements : [window.selectedElement];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    elements.forEach(el => {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + (el.width || 0));
      maxY = Math.max(maxY, el.y + (el.height || 0));
    });

    const width = maxX - minX;
    const height = maxY - minY;
    const container = document.getElementById('roomCanvas')?.parentElement;
    if (!container) return;

    const scaleX = container.clientWidth / (width + 100);
    const scaleY = container.clientHeight / (height + 100);
    const scale = Math.min(scaleX, scaleY, 2);

    window.setZoom(scale);
  };

  function updateZoomDisplay() {
    const display = document.getElementById('zoomDisplay');
    if (display) display.textContent = Math.round(currentZoom * 100) + '%';
  }

  // === AUTO-LAYOUT HELPERS ===
  window.autoArrangeCabinets = function(direction = 'horizontal') {
    const cabinets = window.elements?.filter(el => el.type === 'cabinet') || [];
    if (cabinets.length < 2) {
      if (typeof showToast === 'function') showToast('Need 2+ cabinets to arrange', 'warning');
      return;
    }

    const gap = 0; // No gap between cabinets
    let currentPos = cabinets[0].x;

    if (direction === 'horizontal') {
      cabinets.sort((a, b) => a.x - b.x);
      currentPos = cabinets[0].x;
      cabinets.forEach((cab, i) => {
        if (i > 0) {
          cab.x = currentPos;
          cab.y = cabinets[0].y; // Align to first cabinet's Y
        }
        currentPos += (cab.width || 24) + gap;
      });
    } else {
      cabinets.sort((a, b) => a.y - b.y);
      currentPos = cabinets[0].y;
      cabinets.forEach((cab, i) => {
        if (i > 0) {
          cab.y = currentPos;
          cab.x = cabinets[0].x; // Align to first cabinet's X
        }
        currentPos += (cab.height || 24) + gap;
      });
    }

    if (typeof window.renderCanvas === 'function') window.renderCanvas();
    if (typeof showToast === 'function') showToast('Cabinets arranged', 'success');
  };

  window.centerInRoom = function(element) {
    if (!element) element = window.selectedElement;
    if (!element) return;

    const roomWidth = window.roomWidth || 240;
    const roomHeight = window.roomDepth || 180;
    const ppi = window.pixelsPerInch || 12;

    element.x = (roomWidth * ppi - (element.width || 0)) / 2;
    element.y = (roomHeight * ppi - (element.height || 0)) / 2;

    if (typeof window.renderCanvas === 'function') window.renderCanvas();
    if (typeof showToast === 'function') showToast('Centered in room', 'info');
  };

  window.snapToWall = function(element, wall = 'top') {
    if (!element) element = window.selectedElement;
    if (!element) return;

    const roomWidth = window.roomWidth || 240;
    const roomHeight = window.roomDepth || 180;
    const ppi = window.pixelsPerInch || 12;
    const margin = 0;

    switch (wall) {
      case 'top':
        element.y = margin;
        break;
      case 'bottom':
        element.y = roomHeight * ppi - (element.height || 0) - margin;
        break;
      case 'left':
        element.x = margin;
        break;
      case 'right':
        element.x = roomWidth * ppi - (element.width || 0) - margin;
        break;
    }

    if (typeof window.renderCanvas === 'function') window.renderCanvas();
    if (typeof showToast === 'function') showToast(`Snapped to ${wall} wall`, 'info');
  };

  // === ELEMENT LOCK/UNLOCK ===
  window.toggleElementLock = function(element) {
    if (!element) element = window.selectedElement;
    if (!element) return;

    element.locked = !element.locked;
    if (typeof window.renderCanvas === 'function') window.renderCanvas();
    if (typeof showToast === 'function') showToast(element.locked ? 'Element locked' : 'Element unlocked', 'info');
  };

  window.lockAllElements = function() {
    if (!window.elements) return;
    window.elements.forEach(el => el.locked = true);
    if (typeof window.renderCanvas === 'function') window.renderCanvas();
    if (typeof showToast === 'function') showToast('All elements locked', 'info');
  };

  window.unlockAllElements = function() {
    if (!window.elements) return;
    window.elements.forEach(el => el.locked = false);
    if (typeof window.renderCanvas === 'function') window.renderCanvas();
    if (typeof showToast === 'function') showToast('All elements unlocked', 'info');
  };

  // === FLIP/ROTATE HELPERS ===
  window.flipHorizontal = function(element) {
    if (!element) element = window.selectedElement;
    if (!element) return;

    element.flippedX = !element.flippedX;
    if (typeof window.renderCanvas === 'function') window.renderCanvas();
  };

  window.flipVertical = function(element) {
    if (!element) element = window.selectedElement;
    if (!element) return;

    element.flippedY = !element.flippedY;
    if (typeof window.renderCanvas === 'function') window.renderCanvas();
  };

  window.rotateElement = function(element, degrees = 90) {
    if (!element) element = window.selectedElement;
    if (!element) return;

    element.rotation = ((element.rotation || 0) + degrees) % 360;
    if (typeof window.renderCanvas === 'function') window.renderCanvas();
  };

  // === EXPORT HELPERS ===
  window.exportAsJSON = function() {
    if (!window.elements) return;

    const data = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      roomWidth: window.roomWidth,
      roomDepth: window.roomDepth,
      elements: window.elements,
      notes: designNotes,
      groups: elementGroups
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `design_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    if (typeof showToast === 'function') showToast('Design exported', 'success');
  };

  window.importFromJSON = function(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = JSON.parse(e.target.result);
        if (data.elements) {
          window.elements = data.elements;
          if (data.roomWidth) window.roomWidth = data.roomWidth;
          if (data.roomDepth) window.roomDepth = data.roomDepth;
          if (data.notes) designNotes = data.notes;
          if (data.groups) elementGroups = data.groups;

          if (typeof window.renderCanvas === 'function') window.renderCanvas();
          renderNotes();
          renderNotePins();
          renderGroupIndicators();

          if (typeof showToast === 'function') showToast('Design imported', 'success');
        }
      } catch (err) {
        if (typeof showToast === 'function') showToast('Invalid file format', 'error');
      }
    };
    reader.readAsText(file);
  };

  // === ADDITIONAL KEYBOARD SHORTCUTS ===
  document.addEventListener('keydown', function(e) {
    const isInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
    if (isInput) return;

    // [ and ] = Layer up/down
    if (e.key === ']' && !e.ctrlKey) {
      e.preventDefault();
      window.moveLayerUp();
    }
    if (e.key === '[' && !e.ctrlKey) {
      e.preventDefault();
      window.moveLayerDown();
    }
    // Ctrl+] and Ctrl+[ = Bring to front/send to back
    if (e.key === ']' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      window.bringToFront();
    }
    if (e.key === '[' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      window.sendToBack();
    }
    // + and - = Zoom
    if ((e.key === '=' || e.key === '+') && !e.ctrlKey) {
      e.preventDefault();
      window.zoomIn();
    }
    if (e.key === '-' && !e.ctrlKey) {
      e.preventDefault();
      window.zoomOut();
    }
    // 0 = Zoom to fit
    if (e.key === '0' && !e.ctrlKey) {
      e.preventDefault();
      window.zoomToFit();
    }
    // L = Toggle lock
    if (e.key === 'l' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      window.toggleElementLock();
    }
    // H = Flip horizontal
    if (e.key === 'h' && !e.ctrlKey && !e.metaKey) {
      window.flipHorizontal();
    }
    // R = Rotate 90
    if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
      window.rotateElement();
    }
  });

  // === PROJECT INFO PANEL ===
  const PROJECT_KEY = 'sg_designer_project';
  let projectInfo = {
    name: 'Untitled Project',
    client: '',
    address: '',
    phone: '',
    email: '',
    notes: '',
    createdAt: null,
    modifiedAt: null
  };

  window.initProjectInfo = function() {
    try {
      const stored = localStorage.getItem(PROJECT_KEY);
      if (stored) projectInfo = { ...projectInfo, ...JSON.parse(stored) };
    } catch (e) {}
  };

  window.saveProjectInfo = function(info) {
    projectInfo = { ...projectInfo, ...info, modifiedAt: new Date().toISOString() };
    if (!projectInfo.createdAt) projectInfo.createdAt = projectInfo.modifiedAt;
    try { localStorage.setItem(PROJECT_KEY, JSON.stringify(projectInfo)); } catch (e) {}
  };

  window.getProjectInfo = function() { return projectInfo; };

  window.showProjectInfoModal = function() {
    const existing = document.getElementById('projectInfoModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'projectInfoModal';
    modal.className = 'project-info-modal';
    modal.innerHTML = `
      <div class="project-info-content">
        <div class="project-info-header">
          <h3>📋 Project Information</h3>
          <button onclick="this.closest('.project-info-modal').remove()">&times;</button>
        </div>
        <div class="project-info-body">
          <div class="form-group">
            <label>Project Name</label>
            <input type="text" id="projName" value="${projectInfo.name || ''}" placeholder="Kitchen Remodel">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Client Name</label>
              <input type="text" id="projClient" value="${projectInfo.client || ''}" placeholder="John Smith">
            </div>
            <div class="form-group">
              <label>Phone</label>
              <input type="tel" id="projPhone" value="${projectInfo.phone || ''}" placeholder="(555) 123-4567">
            </div>
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="projEmail" value="${projectInfo.email || ''}" placeholder="client@email.com">
          </div>
          <div class="form-group">
            <label>Address</label>
            <input type="text" id="projAddress" value="${projectInfo.address || ''}" placeholder="123 Main St, City, ST 12345">
          </div>
          <div class="form-group">
            <label>Notes</label>
            <textarea id="projNotes" rows="3" placeholder="Special requirements, preferences...">${projectInfo.notes || ''}</textarea>
          </div>
          <div class="form-actions">
            <button class="btn-secondary" onclick="this.closest('.project-info-modal').remove()">Cancel</button>
            <button class="btn-primary" onclick="saveProjectInfoFromModal()">Save</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  };

  window.saveProjectInfoFromModal = function() {
    window.saveProjectInfo({
      name: document.getElementById('projName')?.value || '',
      client: document.getElementById('projClient')?.value || '',
      phone: document.getElementById('projPhone')?.value || '',
      email: document.getElementById('projEmail')?.value || '',
      address: document.getElementById('projAddress')?.value || '',
      notes: document.getElementById('projNotes')?.value || ''
    });
    document.getElementById('projectInfoModal')?.remove();
    if (typeof showToast === 'function') showToast('Project info saved', 'success');
  };

  // === QUICK MEASUREMENT TOOL ===
  let measureMode = false;
  let measureStart = null;
  let measureLine = null;

  window.enableMeasureMode = function() {
    measureMode = true;
    measureStart = null;
    document.body.style.cursor = 'crosshair';
    if (typeof showToast === 'function') showToast('Click two points to measure', 'info');
  };

  window.disableMeasureMode = function() {
    measureMode = false;
    measureStart = null;
    document.body.style.cursor = '';
    clearMeasureLine();
  };

  window.isMeasureMode = function() { return measureMode; };

  window.handleMeasureClick = function(x, y) {
    if (!measureMode) return false;

    if (!measureStart) {
      measureStart = { x, y };
      showMeasurePoint(x, y);
      return true;
    }

    // Calculate distance
    const dx = x - measureStart.x;
    const dy = y - measureStart.y;
    const distPx = Math.sqrt(dx * dx + dy * dy);

    // Convert to real units
    const ppi = window.pixelsPerInch || 12;
    const inches = distPx / ppi;
    const feet = Math.floor(inches / 12);
    const remainingInches = Math.round((inches % 12) * 16) / 16;

    let measurement = '';
    if (feet > 0) measurement += `${feet}'`;
    if (remainingInches > 0 || feet === 0) measurement += `${remainingInches}"`;

    showMeasureLine(measureStart.x, measureStart.y, x, y, measurement);

    // Reset for next measurement
    measureStart = null;

    return true;
  };

  function showMeasurePoint(x, y) {
    clearMeasureLine();
    const canvas = document.getElementById('roomCanvas');
    if (!canvas) return;

    const point = document.createElement('div');
    point.className = 'measure-point';
    point.style.cssText = `left:${x - 5}px;top:${y - 5}px`;
    canvas.parentElement.appendChild(point);
  }

  function showMeasureLine(x1, y1, x2, y2, label) {
    clearMeasureLine();
    const canvas = document.getElementById('roomCanvas');
    if (!canvas) return;

    const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

    measureLine = document.createElement('div');
    measureLine.className = 'measure-line-display';
    measureLine.innerHTML = `
      <div class="measure-line" style="width:${length}px;transform:rotate(${angle}deg);left:${x1}px;top:${y1}px"></div>
      <div class="measure-label" style="left:${(x1 + x2) / 2}px;top:${(y1 + y2) / 2 - 20}px">${label}</div>
      <div class="measure-point" style="left:${x1 - 5}px;top:${y1 - 5}px"></div>
      <div class="measure-point" style="left:${x2 - 5}px;top:${y2 - 5}px"></div>
    `;
    canvas.parentElement.appendChild(measureLine);

    // Auto-clear after 5 seconds
    setTimeout(clearMeasureLine, 5000);
  }

  function clearMeasureLine() {
    document.querySelectorAll('.measure-line-display, .measure-point').forEach(el => el.remove());
    measureLine = null;
  }

  // === MATERIAL PREVIEW PANEL ===
  window.showMaterialPreview = function(material) {
    const existing = document.getElementById('materialPreview');
    if (existing) existing.remove();

    if (!material) return;

    const preview = document.createElement('div');
    preview.id = 'materialPreview';
    preview.className = 'material-preview-panel';
    preview.innerHTML = `
      <div class="material-preview-image" style="background-image: url('${material.image || material.thumbnail || ''}')"></div>
      <div class="material-preview-info">
        <div class="material-preview-name">${material.name || 'Unknown'}</div>
        <div class="material-preview-details">
          ${material.brand ? `<span>Brand: ${material.brand}</span>` : ''}
          ${material.color ? `<span>Color: ${material.color}</span>` : ''}
          ${material.finish ? `<span>Finish: ${material.finish}</span>` : ''}
          ${material.price ? `<span class="price">$${material.price}/sf</span>` : ''}
        </div>
      </div>
      <button class="material-preview-close" onclick="hideMaterialPreview()">&times;</button>
    `;
    document.body.appendChild(preview);

    setTimeout(() => preview.classList.add('show'), 10);
  };

  window.hideMaterialPreview = function() {
    const preview = document.getElementById('materialPreview');
    if (preview) {
      preview.classList.remove('show');
      setTimeout(() => preview.remove(), 200);
    }
  };

  // === AUTO-SAVE SYSTEM ===
  const AUTOSAVE_KEY = 'sg_designer_autosave';
  let autoSaveInterval = null;
  let autoSaveEnabled = true;
  let lastSaveTime = null;
  let hasUnsavedChanges = false;

  window.initAutoSave = function(intervalMs = 30000) {
    if (autoSaveInterval) clearInterval(autoSaveInterval);
    autoSaveInterval = setInterval(() => {
      if (autoSaveEnabled && hasUnsavedChanges) {
        window.performAutoSave();
      }
    }, intervalMs);

    // Listen for changes
    window.markUnsaved = function() {
      hasUnsavedChanges = true;
      updateSaveStatus('unsaved');
    };
  };

  window.performAutoSave = function() {
    if (!window.elements) return;

    const data = {
      timestamp: new Date().toISOString(),
      elements: window.elements,
      roomWidth: window.roomWidth,
      roomDepth: window.roomDepth,
      projectInfo: projectInfo,
      notes: designNotes,
      groups: elementGroups
    };

    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
      hasUnsavedChanges = false;
      lastSaveTime = new Date();
      updateSaveStatus('saved');
    } catch (e) {
      updateSaveStatus('error');
    }
  };

  window.loadAutoSave = function() {
    try {
      const stored = localStorage.getItem(AUTOSAVE_KEY);
      if (!stored) return null;
      return JSON.parse(stored);
    } catch (e) {
      return null;
    }
  };

  window.hasAutoSave = function() {
    return localStorage.getItem(AUTOSAVE_KEY) !== null;
  };

  window.clearAutoSave = function() {
    localStorage.removeItem(AUTOSAVE_KEY);
  };

  function updateSaveStatus(status) {
    const indicator = document.getElementById('saveStatusIndicator');
    if (!indicator) return;

    indicator.className = `save-status ${status}`;
    const icon = indicator.querySelector('.save-icon');
    const text = indicator.querySelector('.save-text');

    switch (status) {
      case 'saved':
        if (text) text.textContent = 'Saved';
        break;
      case 'saving':
        if (text) text.textContent = 'Saving...';
        break;
      case 'unsaved':
        if (text) text.textContent = 'Unsaved';
        break;
      case 'error':
        if (text) text.textContent = 'Error';
        break;
    }
  }

  // === WORK TRIANGLE VALIDATOR ===
  window.validateWorkTriangle = function() {
    if (!window.elements) return null;

    const sink = window.elements.find(e => e.type === 'sink');
    const stove = window.elements.find(e => e.type === 'stove' || e.type === 'range' || e.type === 'cooktop');
    const fridge = window.elements.find(e => e.type === 'refrigerator' || e.type === 'fridge');

    if (!sink || !stove || !fridge) {
      return { valid: false, message: 'Need sink, stove, and refrigerator for work triangle' };
    }

    const ppi = window.pixelsPerInch || 12;

    // Calculate distances
    const getCenterPoint = (el) => ({
      x: el.x + (el.width || 0) / 2,
      y: el.y + (el.height || 0) / 2
    });

    const distance = (p1, p2) => {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      return Math.sqrt(dx * dx + dy * dy) / ppi / 12; // Convert to feet
    };

    const sinkCenter = getCenterPoint(sink);
    const stoveCenter = getCenterPoint(stove);
    const fridgeCenter = getCenterPoint(fridge);

    const sinkToStove = distance(sinkCenter, stoveCenter);
    const stoveToFridge = distance(stoveCenter, fridgeCenter);
    const fridgeToSink = distance(fridgeCenter, sinkCenter);

    const perimeter = sinkToStove + stoveToFridge + fridgeToSink;

    // Ideal: Each leg 4-9 feet, total 13-26 feet
    const issues = [];
    if (sinkToStove < 4) issues.push('Sink to stove too close');
    if (sinkToStove > 9) issues.push('Sink to stove too far');
    if (stoveToFridge < 4) issues.push('Stove to fridge too close');
    if (stoveToFridge > 9) issues.push('Stove to fridge too far');
    if (fridgeToSink < 4) issues.push('Fridge to sink too close');
    if (fridgeToSink > 9) issues.push('Fridge to sink too far');
    if (perimeter < 13) issues.push('Triangle too small');
    if (perimeter > 26) issues.push('Triangle too large');

    return {
      valid: issues.length === 0,
      perimeter: Math.round(perimeter * 10) / 10,
      legs: {
        sinkToStove: Math.round(sinkToStove * 10) / 10,
        stoveToFridge: Math.round(stoveToFridge * 10) / 10,
        fridgeToSink: Math.round(fridgeToSink * 10) / 10
      },
      issues,
      message: issues.length === 0 ? 'Work triangle is optimal!' : issues.join(', ')
    };
  };

  window.showWorkTriangleModal = function() {
    const result = window.validateWorkTriangle();
    if (!result) return;

    const modal = document.createElement('div');
    modal.className = 'work-triangle-modal';
    modal.innerHTML = `
      <div class="work-triangle-content">
        <div class="work-triangle-header">
          <h3>${result.valid ? '✅' : '⚠️'} Work Triangle Analysis</h3>
          <button onclick="this.closest('.work-triangle-modal').remove()">&times;</button>
        </div>
        <div class="work-triangle-body">
          <div class="triangle-status ${result.valid ? 'valid' : 'invalid'}">
            ${result.message}
          </div>
          ${result.legs ? `
            <div class="triangle-measurements">
              <div class="triangle-leg">
                <span>Sink → Stove</span>
                <strong>${result.legs.sinkToStove} ft</strong>
              </div>
              <div class="triangle-leg">
                <span>Stove → Fridge</span>
                <strong>${result.legs.stoveToFridge} ft</strong>
              </div>
              <div class="triangle-leg">
                <span>Fridge → Sink</span>
                <strong>${result.legs.fridgeToSink} ft</strong>
              </div>
              <div class="triangle-total">
                <span>Total Perimeter</span>
                <strong>${result.perimeter} ft</strong>
              </div>
            </div>
            <div class="triangle-guide">
              <p>Ideal work triangle:</p>
              <ul>
                <li>Each leg: 4-9 feet</li>
                <li>Total: 13-26 feet</li>
              </ul>
            </div>
          ` : ''}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  };

  // === CABINET SPECIFICATIONS ===
  window.showCabinetSpecs = function(cabinet) {
    if (!cabinet) cabinet = window.selectedElement;
    if (!cabinet || cabinet.type !== 'cabinet') {
      if (typeof showToast === 'function') showToast('Select a cabinet', 'info');
      return;
    }

    const ppi = window.pixelsPerInch || 12;
    const widthIn = (cabinet.width || 0) / ppi;
    const heightIn = (cabinet.height || 0) / ppi;
    const depthIn = (cabinet.depth || 24);

    const modal = document.createElement('div');
    modal.className = 'cabinet-specs-modal';
    modal.innerHTML = `
      <div class="cabinet-specs-content">
        <div class="cabinet-specs-header">
          <h3>🗄️ Cabinet Specifications</h3>
          <button onclick="this.closest('.cabinet-specs-modal').remove()">&times;</button>
        </div>
        <div class="cabinet-specs-body">
          <div class="spec-row"><span>Type</span><strong>${cabinet.cabinetType || cabinet.subType || 'Base'}</strong></div>
          <div class="spec-row"><span>Width</span><strong>${widthIn}"</strong></div>
          <div class="spec-row"><span>Height</span><strong>${heightIn}"</strong></div>
          <div class="spec-row"><span>Depth</span><strong>${depthIn}"</strong></div>
          <div class="spec-row"><span>Style</span><strong>${cabinet.style || 'Shaker'}</strong></div>
          <div class="spec-row"><span>Color</span><strong>${cabinet.color || 'White'}</strong></div>
          ${cabinet.doorStyle ? `<div class="spec-row"><span>Door Style</span><strong>${cabinet.doorStyle}</strong></div>` : ''}
          ${cabinet.hardware ? `<div class="spec-row"><span>Hardware</span><strong>${cabinet.hardware}</strong></div>` : ''}
          ${cabinet.sku ? `<div class="spec-row"><span>SKU</span><strong>${cabinet.sku}</strong></div>` : ''}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  };

  // === DIMENSION INPUT HELPER ===
  window.parseDimension = function(input) {
    if (!input) return null;
    input = input.toString().trim().toLowerCase();

    // Handle various formats: "3'6\"", "3'-6\"", "3' 6\"", "42\"", "42", "3.5'"
    let inches = 0;

    // Feet and inches: 3'6", 3'-6", 3' 6"
    const feetInches = input.match(/(\d+(?:\.\d+)?)\s*['']\s*-?\s*(\d+(?:\.\d+)?)\s*["""]?/);
    if (feetInches) {
      inches = parseFloat(feetInches[1]) * 12 + parseFloat(feetInches[2]);
      return inches;
    }

    // Just feet: 3', 3.5'
    const justFeet = input.match(/^(\d+(?:\.\d+)?)\s*['']\s*$/);
    if (justFeet) {
      inches = parseFloat(justFeet[1]) * 12;
      return inches;
    }

    // Just inches: 42", 42
    const justInches = input.match(/^(\d+(?:\.\d+)?)\s*["""]?\s*$/);
    if (justInches) {
      inches = parseFloat(justInches[1]);
      return inches;
    }

    return null;
  };

  window.formatDimensionFull = function(inches) {
    if (inches === null || inches === undefined) return '';
    const feet = Math.floor(inches / 12);
    const remaining = Math.round((inches % 12) * 16) / 16;

    if (feet === 0) return `${remaining}"`;
    if (remaining === 0) return `${feet}'`;
    return `${feet}'-${remaining}"`;
  };

  // === COMPARISON VIEW ===
  let comparisonSnapshot = null;

  window.takeComparisonSnapshot = function() {
    if (!window.elements) return;
    comparisonSnapshot = JSON.parse(JSON.stringify(window.elements));
    if (typeof showToast === 'function') showToast('Snapshot saved for comparison', 'success');
  };

  window.showComparison = function() {
    if (!comparisonSnapshot) {
      if (typeof showToast === 'function') showToast('Take a snapshot first', 'info');
      return;
    }

    const current = window.elements || [];
    const added = current.filter(e => !comparisonSnapshot.find(s => s.id === e.id));
    const removed = comparisonSnapshot.filter(s => !current.find(e => e.id === s.id));
    const modified = current.filter(e => {
      const orig = comparisonSnapshot.find(s => s.id === e.id);
      return orig && JSON.stringify(orig) !== JSON.stringify(e);
    });

    const modal = document.createElement('div');
    modal.className = 'comparison-modal';
    modal.innerHTML = `
      <div class="comparison-content">
        <div class="comparison-header">
          <h3>📊 Design Comparison</h3>
          <button onclick="this.closest('.comparison-modal').remove()">&times;</button>
        </div>
        <div class="comparison-body">
          <div class="comparison-section added">
            <h4>➕ Added (${added.length})</h4>
            ${added.map(e => `<div class="comparison-item">${getElementIcon(e.type)} ${e.name || e.type}</div>`).join('') || '<div class="comparison-empty">None</div>'}
          </div>
          <div class="comparison-section removed">
            <h4>➖ Removed (${removed.length})</h4>
            ${removed.map(e => `<div class="comparison-item">${getElementIcon(e.type)} ${e.name || e.type}</div>`).join('') || '<div class="comparison-empty">None</div>'}
          </div>
          <div class="comparison-section modified">
            <h4>✏️ Modified (${modified.length})</h4>
            ${modified.map(e => `<div class="comparison-item">${getElementIcon(e.type)} ${e.name || e.type}</div>`).join('') || '<div class="comparison-empty">None</div>'}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  };

  // === KEYBOARD SHORTCUT ADDITIONS ===
  document.addEventListener('keydown', function(e) {
    const isInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
    if (isInput) return;

    // I = Project info
    if (e.key === 'i' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      window.showProjectInfoModal();
    }
    // T = Work triangle
    if (e.key === 't' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      window.showWorkTriangleModal();
    }
  });

  // === INIT ON LOAD ===
  document.addEventListener('DOMContentLoaded', function() {
    window.initFavorites();
    window.initNotes();
    window.initTemplates();
    window.initHistory();
    window.initProjectInfo();
    window.initAutoSave();

    // Add zoom controls if not present
    const canvas = document.getElementById('roomCanvas');
    if (canvas && !document.getElementById('zoomControls')) {
      const controls = document.createElement('div');
      controls.id = 'zoomControls';
      controls.className = 'zoom-controls';
      controls.innerHTML = `
        <button onclick="zoomOut()" title="Zoom Out (-)">−</button>
        <span id="zoomDisplay">100%</span>
        <button onclick="zoomIn()" title="Zoom In (+)">+</button>
        <button onclick="zoomToFit()" title="Fit (0)">⊡</button>
      `;
      canvas.parentElement?.appendChild(controls);
    }

    // Check for auto-save recovery
    if (window.hasAutoSave()) {
      const autoSave = window.loadAutoSave();
      if (autoSave && autoSave.timestamp) {
        const saveDate = new Date(autoSave.timestamp);
        const age = Date.now() - saveDate.getTime();
        if (age < 24 * 60 * 60 * 1000) { // Less than 24 hours
          setTimeout(() => {
            if (confirm(`Recover auto-saved design from ${saveDate.toLocaleString()}?`)) {
              if (autoSave.elements) window.elements = autoSave.elements;
              if (autoSave.roomWidth) window.roomWidth = autoSave.roomWidth;
              if (autoSave.roomDepth) window.roomDepth = autoSave.roomDepth;
              if (autoSave.projectInfo) projectInfo = autoSave.projectInfo;
              if (typeof window.renderCanvas === 'function') window.renderCanvas();
              if (typeof showToast === 'function') showToast('Design recovered', 'success');
            }
          }, 1000);
        }
      }
    }
  });

  console.log('Room Designer Pro Features v4.0 loaded');
})();
