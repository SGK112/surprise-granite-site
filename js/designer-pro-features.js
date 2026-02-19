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
    { key: 'I', action: 'Project info' },
    { key: 'T', action: 'Work triangle' },
    { key: 'A', action: 'Appliance library' },
    { key: 'E', action: 'Edge profiles' },
    { key: 'K', action: 'Clearance check' },
    { key: 'L', action: 'Lock/unlock element' },
    { key: 'R', action: 'Rotate 90°' },
    { key: 'H', action: 'Flip horizontal' },
    { key: 'G', action: 'Toggle grid' },
    { key: 'Delete/Backspace', action: 'Delete selected' },
    { key: 'Ctrl+D', action: 'Duplicate' },
    { key: 'Ctrl+G', action: 'Group elements' },
    { key: 'Ctrl+Shift+G', action: 'Ungroup' },
    { key: 'Ctrl+P', action: 'Print settings' },
    { key: 'Ctrl+Z', action: 'Undo' },
    { key: 'Ctrl+Y', action: 'Redo' },
    { key: 'Ctrl+S', action: 'Save design' },
    { key: 'Ctrl+Shift+S', action: 'Save as template' },
    { key: 'Ctrl+F', action: 'Search elements' },
    { key: 'Ctrl+E', action: 'Export' },
    { key: '[ / ]', action: 'Layer up/down' },
    { key: '+/-', action: 'Zoom in/out' },
    { key: '0', action: 'Zoom to fit' },
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

  // ============================================================
  // PRO FEATURES V5.0 - ADVANCED CAPABILITIES
  // ============================================================

  // === PRINT LAYOUT SYSTEM ===
  const printSettings = {
    scale: 'fit',
    orientation: 'landscape',
    showGrid: true,
    showDimensions: true,
    showMaterials: true,
    showNotes: true,
    paperSize: 'letter',
    margins: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 }
  };

  window.showPrintSettings = function() {
    const existing = document.getElementById('printSettingsModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'printSettingsModal';
    modal.className = 'print-settings-modal';
    modal.innerHTML = `
      <div class="print-settings-content">
        <div class="print-settings-header">
          <h3>🖨️ Print Settings</h3>
          <button onclick="this.closest('.print-settings-modal').remove()">&times;</button>
        </div>
        <div class="print-settings-body">
          <div class="form-group">
            <label>Paper Size</label>
            <select id="printPaperSize">
              <option value="letter" ${printSettings.paperSize === 'letter' ? 'selected' : ''}>Letter (8.5" x 11")</option>
              <option value="legal" ${printSettings.paperSize === 'legal' ? 'selected' : ''}>Legal (8.5" x 14")</option>
              <option value="tabloid" ${printSettings.paperSize === 'tabloid' ? 'selected' : ''}>Tabloid (11" x 17")</option>
              <option value="a4" ${printSettings.paperSize === 'a4' ? 'selected' : ''}>A4 (210mm x 297mm)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Orientation</label>
            <select id="printOrientation">
              <option value="landscape" ${printSettings.orientation === 'landscape' ? 'selected' : ''}>Landscape</option>
              <option value="portrait" ${printSettings.orientation === 'portrait' ? 'selected' : ''}>Portrait</option>
            </select>
          </div>
          <div class="form-group">
            <label>Scale</label>
            <select id="printScale">
              <option value="fit" ${printSettings.scale === 'fit' ? 'selected' : ''}>Fit to Page</option>
              <option value="1:48" ${printSettings.scale === '1:48' ? 'selected' : ''}>1/4" = 1' (1:48)</option>
              <option value="1:24" ${printSettings.scale === '1:24' ? 'selected' : ''}>1/2" = 1' (1:24)</option>
              <option value="1:12" ${printSettings.scale === '1:12' ? 'selected' : ''}>1" = 1' (1:12)</option>
            </select>
          </div>
          <div class="form-group-row">
            <label><input type="checkbox" id="printShowGrid" ${printSettings.showGrid ? 'checked' : ''}> Show Grid</label>
            <label><input type="checkbox" id="printShowDims" ${printSettings.showDimensions ? 'checked' : ''}> Show Dimensions</label>
          </div>
          <div class="form-group-row">
            <label><input type="checkbox" id="printShowMaterials" ${printSettings.showMaterials ? 'checked' : ''}> Show Materials List</label>
            <label><input type="checkbox" id="printShowNotes" ${printSettings.showNotes ? 'checked' : ''}> Show Notes</label>
          </div>
          <div class="form-actions">
            <button class="btn-secondary" onclick="this.closest('.print-settings-modal').remove()">Cancel</button>
            <button class="btn-secondary" onclick="previewPrint()">Preview</button>
            <button class="btn-primary" onclick="executePrint()">Print</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  };

  window.previewPrint = function() {
    updatePrintSettings();
    generatePrintLayout(true);
  };

  window.executePrint = function() {
    updatePrintSettings();
    generatePrintLayout(false);
  };

  function updatePrintSettings() {
    printSettings.paperSize = document.getElementById('printPaperSize')?.value || 'letter';
    printSettings.orientation = document.getElementById('printOrientation')?.value || 'landscape';
    printSettings.scale = document.getElementById('printScale')?.value || 'fit';
    printSettings.showGrid = document.getElementById('printShowGrid')?.checked ?? true;
    printSettings.showDimensions = document.getElementById('printShowDims')?.checked ?? true;
    printSettings.showMaterials = document.getElementById('printShowMaterials')?.checked ?? true;
    printSettings.showNotes = document.getElementById('printShowNotes')?.checked ?? true;
  }

  function generatePrintLayout(preview = false) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      if (typeof showToast === 'function') showToast('Please allow popups', 'warning');
      return;
    }

    const info = projectInfo;
    const stats = window.getDesignStats();
    const costs = window.calculateMaterialCosts();
    const ppi = window.pixelsPerInch || 12;
    const roomWidthFt = (window.roomWidth || 240) / 12;
    const roomDepthFt = (window.roomDepth || 180) / 12;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${info.name || 'Design'} - Print</title>
        <style>
          @page { size: ${printSettings.paperSize} ${printSettings.orientation}; margin: 0.5in; }
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #333; }
          .print-header { display: flex; justify-content: space-between; border-bottom: 2px solid #f9cb00; padding-bottom: 10px; margin-bottom: 20px; }
          .print-title { font-size: 24px; font-weight: bold; }
          .print-subtitle { color: #666; }
          .print-client { text-align: right; }
          .print-canvas { border: 1px solid #ccc; margin: 20px 0; background: #f5f5f5; }
          .print-section { margin: 20px 0; }
          .print-section h3 { border-bottom: 1px solid #ddd; padding-bottom: 5px; }
          .print-table { width: 100%; border-collapse: collapse; }
          .print-table th, .print-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          .print-table th { background: #f5f5f5; }
          .print-footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
          .print-dimensions { background: #fffbe6; padding: 10px; border-radius: 4px; }
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <div class="print-header">
          <div>
            <div class="print-title">${info.name || 'Room Design'}</div>
            <div class="print-subtitle">Room: ${roomWidthFt}' x ${roomDepthFt}'</div>
          </div>
          <div class="print-client">
            ${info.client ? `<div><strong>${info.client}</strong></div>` : ''}
            ${info.address ? `<div>${info.address}</div>` : ''}
            ${info.phone ? `<div>${info.phone}</div>` : ''}
          </div>
        </div>

        <div class="print-canvas" id="printCanvas" style="height: 400px;">
          <canvas id="printRoomCanvas"></canvas>
        </div>

        ${printSettings.showDimensions && stats ? `
        <div class="print-section">
          <h3>Design Summary</h3>
          <div class="print-dimensions">
            <strong>Elements:</strong> ${stats.totalElements} |
            <strong>Countertop:</strong> ${stats.countertopArea} sq ft |
            <strong>Cabinets:</strong> ${stats.cabinetCount}
          </div>
        </div>
        ` : ''}

        ${printSettings.showMaterials && costs.items.length > 0 ? `
        <div class="print-section">
          <h3>Materials & Cost Estimate</h3>
          <table class="print-table">
            <thead><tr><th>Item</th><th>Qty</th><th>Material</th><th>Labor</th><th>Total</th></tr></thead>
            <tbody>
              ${costs.items.map(i => `<tr><td>${i.name}</td><td>${i.quantity} ${i.unit}</td><td>$${i.materialCost}</td><td>$${i.laborCost}</td><td>$${i.total}</td></tr>`).join('')}
            </tbody>
            <tfoot>
              <tr><td colspan="4"><strong>Grand Total</strong></td><td><strong>$${costs.grandTotal}</strong></td></tr>
            </tfoot>
          </table>
        </div>
        ` : ''}

        ${printSettings.showNotes && designNotes.length > 0 ? `
        <div class="print-section">
          <h3>Design Notes</h3>
          <ul>
            ${designNotes.map(n => `<li>${n.text}</li>`).join('')}
          </ul>
        </div>
        ` : ''}

        <div class="print-footer">
          Generated on ${new Date().toLocaleDateString()} by Surprise Granite Room Designer
        </div>

        <script>
          ${!preview ? 'window.onload = function() { window.print(); };' : ''}
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();

    document.getElementById('printSettingsModal')?.remove();
  }

  // === EDGE PROFILE LIBRARY ===
  const EDGE_PROFILES = [
    { id: 'straight', name: 'Straight/Eased', icon: '▬', description: 'Simple flat edge with slight bevel' },
    { id: 'bevel', name: 'Beveled', icon: '◢', description: '45-degree angled edge' },
    { id: 'bullnose', name: 'Full Bullnose', icon: '◯', description: 'Fully rounded edge' },
    { id: 'half-bullnose', name: 'Half Bullnose', icon: '◠', description: 'Half-round top edge' },
    { id: 'ogee', name: 'Ogee', icon: '∿', description: 'S-curve decorative edge' },
    { id: 'dupont', name: 'DuPont', icon: '⌐', description: 'Step-down decorative edge' },
    { id: 'waterfall', name: 'Waterfall', icon: '⌒', description: 'Curved waterfall edge' },
    { id: 'mitered', name: 'Mitered', icon: '◤', description: 'Angled to appear thicker' },
    { id: 'chiseled', name: 'Chiseled', icon: '▭', description: 'Rough natural stone look' },
    { id: 'laminated', name: 'Laminated', icon: '═', description: 'Double-thick appearance' }
  ];

  window.showEdgeProfileSelector = function(callback) {
    const existing = document.getElementById('edgeProfileModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'edgeProfileModal';
    modal.className = 'edge-profile-modal';
    modal.innerHTML = `
      <div class="edge-profile-content">
        <div class="edge-profile-header">
          <h3>Edge Profiles</h3>
          <button onclick="this.closest('.edge-profile-modal').remove()">&times;</button>
        </div>
        <div class="edge-profile-grid">
          ${EDGE_PROFILES.map(p => `
            <div class="edge-profile-item" onclick="selectEdgeProfile('${p.id}')" data-profile="${p.id}">
              <div class="edge-profile-icon">${p.icon}</div>
              <div class="edge-profile-name">${p.name}</div>
              <div class="edge-profile-desc">${p.description}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    window._edgeProfileCallback = callback;
  };

  window.selectEdgeProfile = function(profileId) {
    const profile = EDGE_PROFILES.find(p => p.id === profileId);
    if (!profile) return;

    if (window.selectedElement && window.selectedElement.type === 'counter') {
      window.selectedElement.edgeProfile = profileId;
      if (typeof window.renderCanvas === 'function') window.renderCanvas();
    }

    if (window._edgeProfileCallback) {
      window._edgeProfileCallback(profile);
      window._edgeProfileCallback = null;
    }

    document.getElementById('edgeProfileModal')?.remove();
    if (typeof showToast === 'function') showToast(`Edge: ${profile.name}`, 'success');
  };

  window.getEdgeProfiles = function() { return EDGE_PROFILES; };

  // === APPLIANCE LIBRARY ===
  const APPLIANCE_LIBRARY = {
    refrigerators: [
      { id: 'fridge-std', name: 'Standard (36")', width: 36, depth: 30, height: 70, icon: '❄️' },
      { id: 'fridge-counter', name: 'Counter-Depth (36")', width: 36, depth: 24, height: 70, icon: '❄️' },
      { id: 'fridge-french', name: 'French Door (36")', width: 36, depth: 30, height: 70, icon: '❄️' },
      { id: 'fridge-compact', name: 'Compact (24")', width: 24, depth: 24, height: 34, icon: '❄️' }
    ],
    ranges: [
      { id: 'range-30', name: 'Standard (30")', width: 30, depth: 26, height: 36, icon: '🔥' },
      { id: 'range-36', name: 'Professional (36")', width: 36, depth: 26, height: 36, icon: '🔥' },
      { id: 'range-48', name: 'Pro Commercial (48")', width: 48, depth: 28, height: 36, icon: '🔥' },
      { id: 'cooktop-30', name: 'Cooktop (30")', width: 30, depth: 21, height: 5, icon: '🔥' }
    ],
    dishwashers: [
      { id: 'dw-std', name: 'Standard (24")', width: 24, depth: 24, height: 34, icon: '🫧' },
      { id: 'dw-compact', name: 'Compact (18")', width: 18, depth: 24, height: 34, icon: '🫧' },
      { id: 'dw-drawer', name: 'Drawer (24")', width: 24, depth: 24, height: 17, icon: '🫧' }
    ],
    sinks: [
      { id: 'sink-single', name: 'Single Bowl (25")', width: 25, depth: 22, height: 8, icon: '🚰' },
      { id: 'sink-double', name: 'Double Bowl (33")', width: 33, depth: 22, height: 8, icon: '🚰' },
      { id: 'sink-farmhouse', name: 'Farmhouse (33")', width: 33, depth: 21, height: 10, icon: '🚰' },
      { id: 'sink-bar', name: 'Bar Sink (15")', width: 15, depth: 15, height: 6, icon: '🚰' }
    ],
    ovens: [
      { id: 'oven-wall', name: 'Wall Oven (30")', width: 30, depth: 24, height: 29, icon: '♨️' },
      { id: 'oven-double', name: 'Double Wall Oven', width: 30, depth: 24, height: 52, icon: '♨️' },
      { id: 'microwave-otc', name: 'Over-Counter Micro', width: 30, depth: 16, height: 17, icon: '📻' }
    ]
  };

  window.showApplianceLibrary = function() {
    const existing = document.getElementById('applianceLibraryModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'applianceLibraryModal';
    modal.className = 'appliance-library-modal';

    let content = '<div class="appliance-library-content"><div class="appliance-library-header"><h3>📦 Appliance Library</h3><button onclick="this.closest(\'.appliance-library-modal\').remove()">&times;</button></div><div class="appliance-library-body">';

    Object.entries(APPLIANCE_LIBRARY).forEach(([category, items]) => {
      content += `<div class="appliance-category"><h4>${category.charAt(0).toUpperCase() + category.slice(1)}</h4><div class="appliance-grid">`;
      items.forEach(item => {
        content += `
          <div class="appliance-item" onclick="addApplianceToDesign('${category}', '${item.id}')">
            <span class="appliance-icon">${item.icon}</span>
            <span class="appliance-name">${item.name}</span>
            <span class="appliance-size">${item.width}"W x ${item.depth}"D</span>
          </div>
        `;
      });
      content += '</div></div>';
    });

    content += '</div></div>';
    modal.innerHTML = content;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  };

  window.addApplianceToDesign = function(category, itemId) {
    const items = APPLIANCE_LIBRARY[category];
    if (!items) return;

    const appliance = items.find(i => i.id === itemId);
    if (!appliance) return;

    const ppi = window.pixelsPerInch || 12;
    const newElement = {
      id: appliance.id + '_' + Date.now(),
      type: category === 'refrigerators' ? 'refrigerator' :
            category === 'ranges' ? 'stove' :
            category === 'dishwashers' ? 'dishwasher' :
            category === 'sinks' ? 'sink' : 'appliance',
      name: appliance.name,
      width: appliance.width * ppi,
      height: appliance.depth * ppi,
      depth: appliance.height,
      x: 100,
      y: 100
    };

    if (window.elements) {
      window.elements.push(newElement);
      window.selectedElement = newElement;
      if (typeof window.renderCanvas === 'function') window.renderCanvas();
    }

    document.getElementById('applianceLibraryModal')?.remove();
    if (typeof showToast === 'function') showToast(`Added ${appliance.name}`, 'success');
  };

  // === ROOM TEMPLATES GALLERY ===
  const ROOM_TEMPLATES = [
    {
      id: 'galley',
      name: 'Galley Kitchen',
      description: 'Efficient two-wall layout',
      roomWidth: 10,
      roomDepth: 20,
      icon: '║║',
      elements: [
        { type: 'cabinet', x: 0, y: 0, width: 120, height: 24 },
        { type: 'counter', x: 0, y: 24, width: 120, height: 2 },
        { type: 'cabinet', x: 0, y: 180, width: 120, height: 24 },
        { type: 'sink', x: 48, y: 0, width: 24, height: 24 },
        { type: 'stove', x: 48, y: 180, width: 30, height: 24 }
      ]
    },
    {
      id: 'lshape',
      name: 'L-Shaped Kitchen',
      description: 'Corner layout with open space',
      roomWidth: 15,
      roomDepth: 12,
      icon: '└─',
      elements: [
        { type: 'cabinet', x: 0, y: 0, width: 144, height: 24 },
        { type: 'cabinet', x: 0, y: 24, width: 24, height: 96 },
        { type: 'sink', x: 60, y: 0, width: 33, height: 24 },
        { type: 'refrigerator', x: 0, y: 96, width: 36, height: 30 },
        { type: 'stove', x: 108, y: 0, width: 30, height: 24 }
      ]
    },
    {
      id: 'ushape',
      name: 'U-Shaped Kitchen',
      description: 'Three-wall wraparound',
      roomWidth: 14,
      roomDepth: 12,
      icon: '╔═╗',
      elements: [
        { type: 'cabinet', x: 0, y: 0, width: 168, height: 24 },
        { type: 'cabinet', x: 0, y: 24, width: 24, height: 96 },
        { type: 'cabinet', x: 144, y: 24, width: 24, height: 96 },
        { type: 'sink', x: 66, y: 0, width: 36, height: 24 },
        { type: 'stove', x: 0, y: 72, width: 24, height: 30 },
        { type: 'refrigerator', x: 144, y: 72, width: 24, height: 36 }
      ]
    },
    {
      id: 'island',
      name: 'Kitchen with Island',
      description: 'Open layout with center island',
      roomWidth: 16,
      roomDepth: 14,
      icon: '▬═',
      elements: [
        { type: 'cabinet', x: 0, y: 0, width: 192, height: 24 },
        { type: 'counter', x: 48, y: 84, width: 96, height: 36 },
        { type: 'sink', x: 80, y: 0, width: 33, height: 24 },
        { type: 'stove', x: 132, y: 0, width: 30, height: 24 },
        { type: 'refrigerator', x: 0, y: 0, width: 36, height: 30 }
      ]
    },
    {
      id: 'master-bath',
      name: 'Master Bathroom',
      description: 'Full bathroom with double vanity',
      roomWidth: 12,
      roomDepth: 10,
      icon: '🛁',
      elements: [
        { type: 'vanity', x: 0, y: 0, width: 60, height: 22 },
        { type: 'toilet', x: 84, y: 0, width: 20, height: 28 },
        { type: 'tub', x: 0, y: 96, width: 60, height: 32 },
        { type: 'shower', x: 84, y: 56, width: 48, height: 48 }
      ]
    }
  ];

  window.showRoomTemplatesGallery = function() {
    const existing = document.getElementById('roomTemplatesModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'roomTemplatesModal';
    modal.className = 'room-templates-modal';
    modal.innerHTML = `
      <div class="room-templates-content">
        <div class="room-templates-header">
          <h3>🏠 Room Templates</h3>
          <button onclick="this.closest('.room-templates-modal').remove()">&times;</button>
        </div>
        <div class="room-templates-grid">
          ${ROOM_TEMPLATES.map(t => `
            <div class="room-template-card" onclick="applyRoomTemplate('${t.id}')">
              <div class="template-icon">${t.icon}</div>
              <div class="template-name">${t.name}</div>
              <div class="template-desc">${t.description}</div>
              <div class="template-size">${t.roomWidth}' x ${t.roomDepth}'</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  };

  window.applyRoomTemplate = function(templateId) {
    const template = ROOM_TEMPLATES.find(t => t.id === templateId);
    if (!template) return;

    if (window.elements && window.elements.length > 0) {
      if (!confirm('Replace current design with this template?')) return;
    }

    const ppi = window.pixelsPerInch || 12;
    window.roomWidth = template.roomWidth * 12;
    window.roomDepth = template.roomDepth * 12;

    window.elements = template.elements.map((el, i) => ({
      ...el,
      id: `${el.type}_${Date.now()}_${i}`,
      x: el.x * ppi,
      y: el.y * ppi,
      width: el.width * ppi,
      height: el.height * ppi
    }));

    if (typeof window.renderCanvas === 'function') window.renderCanvas();
    document.getElementById('roomTemplatesModal')?.remove();
    if (typeof showToast === 'function') showToast(`Applied: ${template.name}`, 'success');
  };

  // === TOUCH GESTURE SUPPORT ===
  let touchState = {
    startX: 0,
    startY: 0,
    startDistance: 0,
    startZoom: 1,
    isPanning: false,
    isPinching: false
  };

  window.initTouchGestures = function() {
    const canvas = document.getElementById('roomCanvas');
    if (!canvas) return;

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);
  };

  function handleTouchStart(e) {
    if (e.touches.length === 1) {
      touchState.startX = e.touches[0].clientX;
      touchState.startY = e.touches[0].clientY;
      touchState.isPanning = true;
    } else if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchState.startDistance = Math.sqrt(dx * dx + dy * dy);
      touchState.startZoom = currentZoom;
      touchState.isPinching = true;
      touchState.isPanning = false;
    }
  }

  function handleTouchMove(e) {
    if (touchState.isPinching && e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const scale = distance / touchState.startDistance;
      window.setZoom(touchState.startZoom * scale);
    } else if (touchState.isPanning && e.touches.length === 1) {
      const deltaX = e.touches[0].clientX - touchState.startX;
      const deltaY = e.touches[0].clientY - touchState.startY;
      // Pan canvas (would integrate with canvas pan functionality)
      if (window.panCanvas) {
        window.panCanvas(deltaX, deltaY);
      }
      touchState.startX = e.touches[0].clientX;
      touchState.startY = e.touches[0].clientY;
    }
  }

  function handleTouchEnd() {
    touchState.isPanning = false;
    touchState.isPinching = false;
  }

  // === QUICK COLOR THEMES ===
  const COLOR_THEMES = [
    { id: 'modern-white', name: 'Modern White', cabinet: '#ffffff', counter: '#1a1a1a', accent: '#c4a35a' },
    { id: 'classic-navy', name: 'Classic Navy', cabinet: '#1e3a5f', counter: '#ffffff', accent: '#c4a35a' },
    { id: 'warm-wood', name: 'Warm Wood', cabinet: '#8B4513', counter: '#2c2c2c', accent: '#f5f5dc' },
    { id: 'sage-green', name: 'Sage Green', cabinet: '#9CAF88', counter: '#ffffff', accent: '#d4a373' },
    { id: 'slate-gray', name: 'Slate Gray', cabinet: '#708090', counter: '#f5f5f5', accent: '#b8860b' },
    { id: 'charcoal', name: 'Charcoal', cabinet: '#36454f', counter: '#f0f0f0', accent: '#ffd700' }
  ];

  window.showColorThemes = function() {
    const existing = document.getElementById('colorThemesModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'colorThemesModal';
    modal.className = 'color-themes-modal';
    modal.innerHTML = `
      <div class="color-themes-content">
        <div class="color-themes-header">
          <h3>🎨 Color Themes</h3>
          <button onclick="this.closest('.color-themes-modal').remove()">&times;</button>
        </div>
        <div class="color-themes-grid">
          ${COLOR_THEMES.map(t => `
            <div class="color-theme-card" onclick="applyColorTheme('${t.id}')">
              <div class="theme-preview">
                <div class="theme-swatch cabinet" style="background:${t.cabinet}"></div>
                <div class="theme-swatch counter" style="background:${t.counter}"></div>
                <div class="theme-swatch accent" style="background:${t.accent}"></div>
              </div>
              <div class="theme-name">${t.name}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  };

  window.applyColorTheme = function(themeId) {
    const theme = COLOR_THEMES.find(t => t.id === themeId);
    if (!theme || !window.elements) return;

    window.elements.forEach(el => {
      if (el.type === 'cabinet') el.color = theme.cabinet;
      if (el.type === 'counter') el.color = theme.counter;
    });

    if (typeof window.renderCanvas === 'function') window.renderCanvas();
    document.getElementById('colorThemesModal')?.remove();
    if (typeof showToast === 'function') showToast(`Applied: ${theme.name}`, 'success');
  };

  // === CLEARANCE CHECKER ===
  const CLEARANCE_STANDARDS = {
    doorway: 36,           // Min doorway width (inches)
    walkway: 36,           // Min walkway (inches)
    workAisle: 42,         // Min work aisle between counters
    dishwasherClearance: 21, // Clearance in front of dishwasher
    ovenClearance: 30,     // Clearance in front of oven
    fridgeClearance: 36,   // Clearance in front of fridge
    islandClearance: 42    // Min clearance around island
  };

  window.checkClearances = function() {
    if (!window.elements) return { valid: true, issues: [] };

    const issues = [];
    const ppi = window.pixelsPerInch || 12;
    const roomWidthPx = (window.roomWidth || 240) * ppi;
    const roomHeightPx = (window.roomDepth || 180) * ppi;

    // Check appliance clearances
    window.elements.forEach(el => {
      const clearanceNeeded = {
        dishwasher: CLEARANCE_STANDARDS.dishwasherClearance * ppi,
        stove: CLEARANCE_STANDARDS.ovenClearance * ppi,
        refrigerator: CLEARANCE_STANDARDS.fridgeClearance * ppi
      }[el.type];

      if (clearanceNeeded) {
        // Check if there's enough space in front
        const frontY = el.y + (el.height || 0);
        const spaceInFront = roomHeightPx - frontY;

        // Check for obstacles
        window.elements.forEach(other => {
          if (other.id === el.id) return;
          const obstructing = other.y >= el.y &&
                             other.y < frontY + clearanceNeeded &&
                             other.x < el.x + (el.width || 0) &&
                             other.x + (other.width || 0) > el.x;
          if (obstructing) {
            issues.push({
              type: 'clearance',
              element: el.name || el.type,
              message: `${el.type} blocked by ${other.name || other.type}`,
              severity: 'warning'
            });
          }
        });
      }
    });

    // Check aisle widths between parallel counters
    const counters = window.elements.filter(e => e.type === 'counter' || e.type === 'cabinet');
    for (let i = 0; i < counters.length; i++) {
      for (let j = i + 1; j < counters.length; j++) {
        const c1 = counters[i];
        const c2 = counters[j];

        // Check if they're parallel (horizontally aligned)
        if (Math.abs(c1.y - c2.y) < 10) continue; // Same row

        const gap = Math.abs((c1.y + (c1.height || 0)) - c2.y);
        const minAisle = CLEARANCE_STANDARDS.workAisle * ppi;

        if (gap < minAisle && gap > 0) {
          issues.push({
            type: 'aisle',
            message: `Aisle between ${c1.name || c1.type} and ${c2.name || c2.type} is ${Math.round(gap / ppi)}" (min ${CLEARANCE_STANDARDS.workAisle}")`,
            severity: 'warning'
          });
        }
      }
    }

    return {
      valid: issues.filter(i => i.severity === 'error').length === 0,
      issues
    };
  };

  window.showClearanceReport = function() {
    const result = window.checkClearances();

    const modal = document.createElement('div');
    modal.className = 'clearance-modal';
    modal.innerHTML = `
      <div class="clearance-content">
        <div class="clearance-header">
          <h3>${result.valid ? '✅' : '⚠️'} Clearance Check</h3>
          <button onclick="this.closest('.clearance-modal').remove()">&times;</button>
        </div>
        <div class="clearance-body">
          ${result.issues.length === 0 ?
            '<div class="clearance-ok">All clearances meet standards!</div>' :
            `<div class="clearance-issues">
              ${result.issues.map(i => `
                <div class="clearance-issue ${i.severity}">
                  <span class="issue-icon">${i.severity === 'error' ? '❌' : '⚠️'}</span>
                  <span class="issue-text">${i.message}</span>
                </div>
              `).join('')}
            </div>`
          }
          <div class="clearance-standards">
            <h4>Standard Clearances</h4>
            <ul>
              <li>Work aisle: ${CLEARANCE_STANDARDS.workAisle}"</li>
              <li>Doorway: ${CLEARANCE_STANDARDS.doorway}"</li>
              <li>Dishwasher: ${CLEARANCE_STANDARDS.dishwasherClearance}"</li>
              <li>Oven: ${CLEARANCE_STANDARDS.ovenClearance}"</li>
              <li>Refrigerator: ${CLEARANCE_STANDARDS.fridgeClearance}"</li>
            </ul>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  };

  // === SLAB CALCULATOR ===
  window.calculateSlabRequirements = function() {
    if (!window.elements) return null;

    const ppi = window.pixelsPerInch || 12;
    const counters = window.elements.filter(e => e.type === 'counter');

    if (counters.length === 0) {
      return { slabs: 0, totalSqFt: 0, pieces: [] };
    }

    // Standard slab sizes (inches)
    const SLAB_SIZES = [
      { name: 'Jumbo', width: 130, height: 65 },
      { name: 'Standard', width: 120, height: 60 },
      { name: 'Small', width: 96, height: 54 }
    ];

    let pieces = [];
    let totalSqFt = 0;

    counters.forEach(counter => {
      const widthIn = (counter.width || 0) / ppi;
      const heightIn = (counter.height || 0) / ppi;
      const sqFt = (widthIn * heightIn) / 144;

      pieces.push({
        id: counter.id,
        name: counter.name || 'Counter',
        width: Math.round(widthIn * 10) / 10,
        height: Math.round(heightIn * 10) / 10,
        sqFt: Math.round(sqFt * 10) / 10
      });

      totalSqFt += sqFt;
    });

    // Estimate slab count (with 20% waste factor)
    const wastedSqFt = totalSqFt * 1.2;
    const slabSqFt = (SLAB_SIZES[1].width * SLAB_SIZES[1].height) / 144;
    const slabsNeeded = Math.ceil(wastedSqFt / slabSqFt);

    return {
      pieces,
      totalSqFt: Math.round(totalSqFt * 10) / 10,
      withWaste: Math.round(wastedSqFt * 10) / 10,
      slabSqFt: Math.round(slabSqFt * 10) / 10,
      slabsNeeded,
      slabSize: SLAB_SIZES[1]
    };
  };

  window.showSlabCalculator = function() {
    const result = window.calculateSlabRequirements();
    if (!result) {
      if (typeof showToast === 'function') showToast('No counters in design', 'info');
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'slab-calc-modal';
    modal.innerHTML = `
      <div class="slab-calc-content">
        <div class="slab-calc-header">
          <h3>📐 Slab Requirements</h3>
          <button onclick="this.closest('.slab-calc-modal').remove()">&times;</button>
        </div>
        <div class="slab-calc-body">
          <div class="slab-summary">
            <div class="slab-stat">
              <span class="stat-value">${result.slabsNeeded}</span>
              <span class="stat-label">Slabs Needed</span>
            </div>
            <div class="slab-stat">
              <span class="stat-value">${result.totalSqFt}</span>
              <span class="stat-label">Total Sq Ft</span>
            </div>
            <div class="slab-stat">
              <span class="stat-value">${result.withWaste}</span>
              <span class="stat-label">With Waste (20%)</span>
            </div>
          </div>
          <div class="slab-pieces">
            <h4>Counter Pieces</h4>
            <table class="slab-table">
              <thead><tr><th>Piece</th><th>Size</th><th>Sq Ft</th></tr></thead>
              <tbody>
                ${result.pieces.map(p => `
                  <tr>
                    <td>${p.name}</td>
                    <td>${p.width}" x ${p.height}"</td>
                    <td>${p.sqFt}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div class="slab-note">
            Based on ${result.slabSize.width}" x ${result.slabSize.height}" slabs (${result.slabSqFt} sq ft each)
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  };

  // === SHARE DESIGN ===
  window.generateShareLink = function() {
    if (!window.elements || window.elements.length === 0) {
      if (typeof showToast === 'function') showToast('Nothing to share', 'info');
      return null;
    }

    // Create a compact representation
    const data = {
      v: 1,
      w: window.roomWidth,
      h: window.roomDepth,
      e: window.elements.map(el => ({
        t: el.type,
        x: Math.round(el.x),
        y: Math.round(el.y),
        w: Math.round(el.width || 0),
        h: Math.round(el.height || 0)
      }))
    };

    try {
      const encoded = btoa(JSON.stringify(data));
      const shareUrl = `${window.location.origin}/tools/room-designer/?design=${encoded}`;

      navigator.clipboard.writeText(shareUrl).then(() => {
        if (typeof showToast === 'function') showToast('Share link copied!', 'success');
      }).catch(() => {
        prompt('Copy this share link:', shareUrl);
      });

      return shareUrl;
    } catch (e) {
      if (typeof showToast === 'function') showToast('Could not generate link', 'error');
      return null;
    }
  };

  window.loadSharedDesign = function() {
    const params = new URLSearchParams(window.location.search);
    const designData = params.get('design');

    if (!designData) return false;

    try {
      const data = JSON.parse(atob(designData));
      if (data.v !== 1) return false;

      const ppi = window.pixelsPerInch || 12;
      window.roomWidth = data.w || 240;
      window.roomDepth = data.h || 180;
      window.elements = (data.e || []).map((el, i) => ({
        id: `${el.t}_${Date.now()}_${i}`,
        type: el.t,
        x: el.x,
        y: el.y,
        width: el.w,
        height: el.h
      }));

      if (typeof window.renderCanvas === 'function') window.renderCanvas();
      if (typeof showToast === 'function') showToast('Shared design loaded!', 'success');

      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
      return true;
    } catch (e) {
      console.error('Failed to load shared design:', e);
      return false;
    }
  };

  // === ADDITIONAL V5 KEYBOARD SHORTCUTS ===
  document.addEventListener('keydown', function(e) {
    const isInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
    if (isInput) return;

    // Ctrl+P = Print settings
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
      e.preventDefault();
      window.showPrintSettings();
    }
    // A = Appliance library
    if (e.key === 'a' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      window.showApplianceLibrary();
    }
    // E = Edge profiles
    if (e.key === 'e' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      window.showEdgeProfileSelector();
    }
    // K = Clearance check
    if (e.key === 'k' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      window.showClearanceReport();
    }
  });

  // === INIT V5 FEATURES ===
  document.addEventListener('DOMContentLoaded', function() {
    // Initialize touch gestures
    window.initTouchGestures();

    // Check for shared design in URL
    window.loadSharedDesign();
  });

  console.log('Room Designer Pro Features v5.0 loaded');

  // ============================================================
  // PRO FEATURES V6.0 - PROFESSIONAL DESIGN TOOLS
  // ============================================================

  // === ANNOTATION SYSTEM ===
  const ANNOTATIONS_KEY = 'sg_designer_annotations';
  let annotations = [];
  let annotationMode = null; // 'arrow', 'callout', 'dimension', 'area'

  window.initAnnotations = function() {
    try {
      const stored = localStorage.getItem(ANNOTATIONS_KEY);
      if (stored) {
        annotations = JSON.parse(stored);
        renderAnnotations();
      }
    } catch (e) {}
  };

  function saveAnnotations() {
    try { localStorage.setItem(ANNOTATIONS_KEY, JSON.stringify(annotations)); } catch (e) {}
  }

  window.setAnnotationMode = function(mode) {
    annotationMode = annotationMode === mode ? null : mode;
    document.body.style.cursor = annotationMode ? 'crosshair' : '';

    // Update UI
    document.querySelectorAll('.annotation-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === annotationMode);
    });

    if (annotationMode && typeof showToast === 'function') {
      const messages = {
        arrow: 'Click start point, then end point',
        callout: 'Click to place callout',
        dimension: 'Click two points to measure',
        area: 'Click corners to define area'
      };
      showToast(messages[mode] || 'Click to annotate', 'info');
    }
  };

  let annotationStart = null;
  let areaPoints = [];

  window.handleAnnotationClick = function(x, y) {
    if (!annotationMode) return false;

    if (annotationMode === 'callout') {
      const text = prompt('Enter callout text:');
      if (!text) {
        window.setAnnotationMode(null);
        return true;
      }
      annotations.push({
        id: 'annot_' + Date.now(),
        type: 'callout',
        x, y, text,
        color: '#f9cb00',
        createdAt: new Date().toISOString()
      });
      saveAnnotations();
      renderAnnotations();
      window.setAnnotationMode(null);
      return true;
    }

    if (annotationMode === 'arrow') {
      if (!annotationStart) {
        annotationStart = { x, y };
        return true;
      }
      annotations.push({
        id: 'annot_' + Date.now(),
        type: 'arrow',
        x1: annotationStart.x, y1: annotationStart.y,
        x2: x, y2: y,
        color: '#f9cb00',
        createdAt: new Date().toISOString()
      });
      annotationStart = null;
      saveAnnotations();
      renderAnnotations();
      window.setAnnotationMode(null);
      return true;
    }

    if (annotationMode === 'dimension') {
      if (!annotationStart) {
        annotationStart = { x, y };
        return true;
      }

      const ppi = window.pixelsPerInch || 12;
      const dx = x - annotationStart.x;
      const dy = y - annotationStart.y;
      const distPx = Math.sqrt(dx * dx + dy * dy);
      const inches = distPx / ppi;
      const feet = Math.floor(inches / 12);
      const remainingInches = Math.round((inches % 12) * 16) / 16;

      let label = '';
      if (feet > 0) label += `${feet}'`;
      if (remainingInches > 0 || feet === 0) label += `${remainingInches}"`;

      annotations.push({
        id: 'annot_' + Date.now(),
        type: 'dimension',
        x1: annotationStart.x, y1: annotationStart.y,
        x2: x, y2: y,
        label,
        color: '#22c55e',
        createdAt: new Date().toISOString()
      });
      annotationStart = null;
      saveAnnotations();
      renderAnnotations();
      window.setAnnotationMode(null);
      return true;
    }

    if (annotationMode === 'area') {
      areaPoints.push({ x, y });
      renderTempArea();

      if (areaPoints.length >= 3) {
        // Check if clicking near first point to close
        const first = areaPoints[0];
        const dist = Math.sqrt((x - first.x) ** 2 + (y - first.y) ** 2);
        if (dist < 20 && areaPoints.length > 3) {
          areaPoints.pop(); // Remove duplicate closing point

          // Calculate area
          const ppi = window.pixelsPerInch || 12;
          let areaPixels = 0;
          for (let i = 0; i < areaPoints.length; i++) {
            const j = (i + 1) % areaPoints.length;
            areaPixels += areaPoints[i].x * areaPoints[j].y;
            areaPixels -= areaPoints[j].x * areaPoints[i].y;
          }
          areaPixels = Math.abs(areaPixels / 2);
          const areaSqFt = areaPixels / (ppi * ppi * 144);

          annotations.push({
            id: 'annot_' + Date.now(),
            type: 'area',
            points: [...areaPoints],
            areaSqFt: Math.round(areaSqFt * 10) / 10,
            color: 'rgba(249, 203, 0, 0.2)',
            createdAt: new Date().toISOString()
          });

          areaPoints = [];
          clearTempArea();
          saveAnnotations();
          renderAnnotations();
          window.setAnnotationMode(null);
          if (typeof showToast === 'function') showToast(`Area: ${annotations[annotations.length-1].areaSqFt} sq ft`, 'success');
        }
      }
      return true;
    }

    return false;
  };

  function renderTempArea() {
    clearTempArea();
    if (areaPoints.length < 2) return;

    const canvas = document.getElementById('roomCanvas');
    if (!canvas) return;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'tempAreaSvg';
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100';

    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', areaPoints.map(p => `${p.x},${p.y}`).join(' '));
    polygon.setAttribute('fill', 'rgba(249, 203, 0, 0.1)');
    polygon.setAttribute('stroke', '#f9cb00');
    polygon.setAttribute('stroke-width', '2');
    polygon.setAttribute('stroke-dasharray', '5,5');

    svg.appendChild(polygon);
    canvas.parentElement.appendChild(svg);
  }

  function clearTempArea() {
    document.getElementById('tempAreaSvg')?.remove();
  }

  function renderAnnotations() {
    document.querySelectorAll('.design-annotation').forEach(a => a.remove());
    const canvas = document.getElementById('roomCanvas');
    if (!canvas) return;

    annotations.forEach(a => {
      if (a.type === 'callout') {
        const callout = document.createElement('div');
        callout.className = 'design-annotation callout';
        callout.dataset.annotId = a.id;
        callout.style.cssText = `left:${a.x}px;top:${a.y}px`;
        callout.innerHTML = `
          <div class="callout-content" style="border-color:${a.color}">${a.text}</div>
          <button class="annot-delete" onclick="deleteAnnotation('${a.id}')">&times;</button>
        `;
        canvas.parentElement.appendChild(callout);
      }

      if (a.type === 'arrow') {
        const angle = Math.atan2(a.y2 - a.y1, a.x2 - a.x1) * 180 / Math.PI;
        const length = Math.sqrt((a.x2 - a.x1) ** 2 + (a.y2 - a.y1) ** 2);

        const arrow = document.createElement('div');
        arrow.className = 'design-annotation arrow';
        arrow.dataset.annotId = a.id;
        arrow.style.cssText = `left:${a.x1}px;top:${a.y1}px;width:${length}px;transform:rotate(${angle}deg);background:${a.color}`;
        arrow.innerHTML = `<div class="arrow-head" style="border-left-color:${a.color}"></div>`;
        canvas.parentElement.appendChild(arrow);
      }

      if (a.type === 'dimension') {
        const angle = Math.atan2(a.y2 - a.y1, a.x2 - a.x1) * 180 / Math.PI;
        const length = Math.sqrt((a.x2 - a.x1) ** 2 + (a.y2 - a.y1) ** 2);
        const midX = (a.x1 + a.x2) / 2;
        const midY = (a.y1 + a.y2) / 2;

        const dim = document.createElement('div');
        dim.className = 'design-annotation dimension';
        dim.dataset.annotId = a.id;
        dim.innerHTML = `
          <div class="dim-line" style="left:${a.x1}px;top:${a.y1}px;width:${length}px;transform:rotate(${angle}deg);background:${a.color}"></div>
          <div class="dim-label" style="left:${midX}px;top:${midY - 12}px">${a.label}</div>
          <div class="dim-end" style="left:${a.x1 - 1}px;top:${a.y1 - 6}px"></div>
          <div class="dim-end" style="left:${a.x2 - 1}px;top:${a.y2 - 6}px"></div>
        `;
        canvas.parentElement.appendChild(dim);
      }

      if (a.type === 'area') {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.className = 'design-annotation area-annotation';
        svg.dataset.annotId = a.id;
        svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none';

        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', a.points.map(p => `${p.x},${p.y}`).join(' '));
        polygon.setAttribute('fill', a.color);
        polygon.setAttribute('stroke', '#f9cb00');
        polygon.setAttribute('stroke-width', '1');

        // Calculate centroid for label
        let cx = 0, cy = 0;
        a.points.forEach(p => { cx += p.x; cy += p.y; });
        cx /= a.points.length;
        cy /= a.points.length;

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', cx);
        text.setAttribute('y', cy);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('fill', '#f9cb00');
        text.setAttribute('font-size', '12');
        text.setAttribute('font-weight', '600');
        text.textContent = `${a.areaSqFt} sf`;

        svg.appendChild(polygon);
        svg.appendChild(text);
        canvas.parentElement.appendChild(svg);
      }
    });
  }

  window.deleteAnnotation = function(id) {
    annotations = annotations.filter(a => a.id !== id);
    saveAnnotations();
    renderAnnotations();
  };

  window.clearAllAnnotations = function() {
    if (!confirm('Clear all annotations?')) return;
    annotations = [];
    saveAnnotations();
    renderAnnotations();
    if (typeof showToast === 'function') showToast('Annotations cleared', 'info');
  };

  window.getAnnotations = function() { return annotations; };

  // === SEAM PLANNER ===
  const SEAMS_KEY = 'sg_designer_seams';
  let plannedSeams = [];

  window.initSeamPlanner = function() {
    try {
      const stored = localStorage.getItem(SEAMS_KEY);
      if (stored) {
        plannedSeams = JSON.parse(stored);
        renderSeams();
      }
    } catch (e) {}
  };

  window.addSeam = function(x, y, orientation = 'vertical') {
    plannedSeams.push({
      id: 'seam_' + Date.now(),
      x, y,
      orientation,
      length: 100,
      createdAt: new Date().toISOString()
    });
    try { localStorage.setItem(SEAMS_KEY, JSON.stringify(plannedSeams)); } catch (e) {}
    renderSeams();
  };

  window.removeSeam = function(id) {
    plannedSeams = plannedSeams.filter(s => s.id !== id);
    try { localStorage.setItem(SEAMS_KEY, JSON.stringify(plannedSeams)); } catch (e) {}
    renderSeams();
  };

  function renderSeams() {
    document.querySelectorAll('.planned-seam').forEach(s => s.remove());
    const canvas = document.getElementById('roomCanvas');
    if (!canvas) return;

    plannedSeams.forEach(seam => {
      const seamEl = document.createElement('div');
      seamEl.className = `planned-seam ${seam.orientation}`;
      seamEl.dataset.seamId = seam.id;
      seamEl.style.cssText = `left:${seam.x}px;top:${seam.y}px;`;
      if (seam.orientation === 'vertical') {
        seamEl.style.height = seam.length + 'px';
      } else {
        seamEl.style.width = seam.length + 'px';
      }
      seamEl.innerHTML = `<button class="seam-delete" onclick="removeSeam('${seam.id}')">&times;</button>`;
      canvas.parentElement.appendChild(seamEl);
    });
  }

  window.showSeamPlanner = function() {
    if (!window.elements) return;

    const counters = window.elements.filter(e => e.type === 'counter');
    if (counters.length === 0) {
      if (typeof showToast === 'function') showToast('No counters to plan seams for', 'info');
      return;
    }

    const ppi = window.pixelsPerInch || 12;
    const maxSlabWidth = 120 * ppi; // 10 feet max slab length

    // Auto-suggest seams for long counters
    const suggestions = [];
    counters.forEach(counter => {
      if (counter.width > maxSlabWidth) {
        // Suggest vertical seams
        const numSeams = Math.ceil(counter.width / maxSlabWidth) - 1;
        const segmentWidth = counter.width / (numSeams + 1);
        for (let i = 1; i <= numSeams; i++) {
          suggestions.push({
            x: counter.x + segmentWidth * i,
            y: counter.y,
            orientation: 'vertical',
            length: counter.height,
            counter: counter.name || counter.id
          });
        }
      }
      if (counter.height > maxSlabWidth) {
        const numSeams = Math.ceil(counter.height / maxSlabWidth) - 1;
        const segmentHeight = counter.height / (numSeams + 1);
        for (let i = 1; i <= numSeams; i++) {
          suggestions.push({
            x: counter.x,
            y: counter.y + segmentHeight * i,
            orientation: 'horizontal',
            length: counter.width,
            counter: counter.name || counter.id
          });
        }
      }
    });

    const modal = document.createElement('div');
    modal.className = 'seam-planner-modal';
    modal.innerHTML = `
      <div class="seam-planner-content">
        <div class="seam-planner-header">
          <h3>✂️ Seam Planner</h3>
          <button onclick="this.closest('.seam-planner-modal').remove()">&times;</button>
        </div>
        <div class="seam-planner-body">
          <div class="seam-info">
            <p>Seams are typically needed where countertop exceeds slab dimensions (usually ~10 ft).</p>
          </div>
          ${suggestions.length > 0 ? `
            <div class="seam-suggestions">
              <h4>Suggested Seams</h4>
              ${suggestions.map((s, i) => `
                <div class="seam-suggestion">
                  <span>${s.counter}: ${s.orientation} seam</span>
                  <button onclick="addSeam(${s.x}, ${s.y}, '${s.orientation}'); this.disabled=true; this.textContent='Added'">Add</button>
                </div>
              `).join('')}
            </div>
          ` : '<p class="no-seams">No seams needed - all counters fit within slab dimensions.</p>'}
          <div class="seam-current">
            <h4>Current Seams (${plannedSeams.length})</h4>
            ${plannedSeams.length > 0 ?
              plannedSeams.map(s => `
                <div class="seam-item">
                  <span>${s.orientation} at (${Math.round(s.x)}, ${Math.round(s.y)})</span>
                  <button onclick="removeSeam('${s.id}')">Remove</button>
                </div>
              `).join('') :
              '<p class="no-seams">No seams placed yet</p>'
            }
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  };

  // === BACKSPLASH DESIGNER ===
  const TILE_PATTERNS = [
    { id: 'subway', name: 'Subway', offset: 0.5, icon: '▭▭' },
    { id: 'brick', name: 'Brick', offset: 0.33, icon: '▬▬' },
    { id: 'stack', name: 'Stack Bond', offset: 0, icon: '□□' },
    { id: 'herringbone', name: 'Herringbone', offset: 'diagonal', icon: '⋰⋱' },
    { id: 'chevron', name: 'Chevron', offset: 'v', icon: '\\/' }
  ];

  const TILE_SIZES = [
    { width: 3, height: 6, name: '3x6 Subway' },
    { width: 4, height: 12, name: '4x12 Long' },
    { width: 4, height: 4, name: '4x4 Square' },
    { width: 2, height: 2, name: '2x2 Mosaic' },
    { width: 6, height: 6, name: '6x6 Large' }
  ];

  window.showBacksplashDesigner = function() {
    const modal = document.createElement('div');
    modal.className = 'backsplash-modal';
    modal.innerHTML = `
      <div class="backsplash-content">
        <div class="backsplash-header">
          <h3>🧱 Backsplash Designer</h3>
          <button onclick="this.closest('.backsplash-modal').remove()">&times;</button>
        </div>
        <div class="backsplash-body">
          <div class="backsplash-section">
            <h4>Tile Pattern</h4>
            <div class="pattern-grid">
              ${TILE_PATTERNS.map(p => `
                <div class="pattern-option" data-pattern="${p.id}" onclick="selectTilePattern('${p.id}')">
                  <span class="pattern-icon">${p.icon}</span>
                  <span class="pattern-name">${p.name}</span>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="backsplash-section">
            <h4>Tile Size</h4>
            <div class="size-grid">
              ${TILE_SIZES.map(s => `
                <div class="size-option" data-size="${s.width}x${s.height}" onclick="selectTileSize(${s.width}, ${s.height})">
                  <span class="size-preview" style="width:${s.width * 5}px;height:${s.height * 5}px"></span>
                  <span class="size-name">${s.name}</span>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="backsplash-section">
            <h4>Coverage Calculator</h4>
            <div class="coverage-inputs">
              <div class="input-group">
                <label>Width (ft)</label>
                <input type="number" id="bsWidth" value="10" min="1" max="50">
              </div>
              <div class="input-group">
                <label>Height (in)</label>
                <input type="number" id="bsHeight" value="18" min="4" max="48">
              </div>
              <button class="calc-btn" onclick="calculateBacksplash()">Calculate</button>
            </div>
            <div id="backsplashResult" class="coverage-result"></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  };

  window.selectTilePattern = function(patternId) {
    document.querySelectorAll('.pattern-option').forEach(o => o.classList.remove('selected'));
    document.querySelector(`.pattern-option[data-pattern="${patternId}"]`)?.classList.add('selected');
  };

  window.selectTileSize = function(width, height) {
    document.querySelectorAll('.size-option').forEach(o => o.classList.remove('selected'));
    document.querySelector(`.size-option[data-size="${width}x${height}"]`)?.classList.add('selected');
  };

  window.calculateBacksplash = function() {
    const width = parseFloat(document.getElementById('bsWidth')?.value) || 10;
    const height = parseFloat(document.getElementById('bsHeight')?.value) || 18;

    const sqFt = (width * height) / 12;
    const withWaste = sqFt * 1.15; // 15% waste factor
    const boxes = Math.ceil(withWaste / 10); // Assume 10 sq ft per box

    const resultEl = document.getElementById('backsplashResult');
    if (resultEl) {
      resultEl.innerHTML = `
        <div class="result-row"><span>Total Area</span><strong>${sqFt.toFixed(1)} sq ft</strong></div>
        <div class="result-row"><span>With 15% Waste</span><strong>${withWaste.toFixed(1)} sq ft</strong></div>
        <div class="result-row"><span>Boxes Needed</span><strong>${boxes} boxes</strong></div>
      `;
    }
  };

  // === LIGHTING PLAN ===
  const LIGHTING_TYPES = [
    { id: 'recessed', name: 'Recessed Can', icon: '◉', wattage: 12 },
    { id: 'pendant', name: 'Pendant', icon: '⬇', wattage: 40 },
    { id: 'under-cabinet', name: 'Under-Cabinet', icon: '▃', wattage: 8 },
    { id: 'chandelier', name: 'Chandelier', icon: '✧', wattage: 60 },
    { id: 'track', name: 'Track Light', icon: '═◉═', wattage: 25 },
    { id: 'sconce', name: 'Wall Sconce', icon: '◐', wattage: 15 }
  ];

  const LIGHTING_KEY = 'sg_designer_lighting';
  let lightingPlan = [];

  window.initLightingPlan = function() {
    try {
      const stored = localStorage.getItem(LIGHTING_KEY);
      if (stored) {
        lightingPlan = JSON.parse(stored);
        renderLightingPlan();
      }
    } catch (e) {}
  };

  window.addLight = function(type, x, y) {
    const lightType = LIGHTING_TYPES.find(t => t.id === type);
    if (!lightType) return;

    lightingPlan.push({
      id: 'light_' + Date.now(),
      type,
      name: lightType.name,
      icon: lightType.icon,
      wattage: lightType.wattage,
      x, y,
      createdAt: new Date().toISOString()
    });
    try { localStorage.setItem(LIGHTING_KEY, JSON.stringify(lightingPlan)); } catch (e) {}
    renderLightingPlan();
  };

  window.removeLight = function(id) {
    lightingPlan = lightingPlan.filter(l => l.id !== id);
    try { localStorage.setItem(LIGHTING_KEY, JSON.stringify(lightingPlan)); } catch (e) {}
    renderLightingPlan();
  };

  function renderLightingPlan() {
    document.querySelectorAll('.lighting-fixture').forEach(l => l.remove());
    const canvas = document.getElementById('roomCanvas');
    if (!canvas) return;

    lightingPlan.forEach(light => {
      const fixture = document.createElement('div');
      fixture.className = `lighting-fixture ${light.type}`;
      fixture.dataset.lightId = light.id;
      fixture.style.cssText = `left:${light.x - 12}px;top:${light.y - 12}px`;
      fixture.innerHTML = `
        <span class="fixture-icon">${light.icon}</span>
        <button class="fixture-delete" onclick="removeLight('${light.id}')">&times;</button>
      `;
      fixture.title = `${light.name} (${light.wattage}W)`;
      canvas.parentElement.appendChild(fixture);
    });
  }

  window.showLightingPlanner = function() {
    const totalWattage = lightingPlan.reduce((sum, l) => sum + (l.wattage || 0), 0);
    const byType = {};
    lightingPlan.forEach(l => {
      byType[l.name] = (byType[l.name] || 0) + 1;
    });

    const modal = document.createElement('div');
    modal.className = 'lighting-modal';
    modal.innerHTML = `
      <div class="lighting-content">
        <div class="lighting-header">
          <h3>💡 Lighting Planner</h3>
          <button onclick="this.closest('.lighting-modal').remove()">&times;</button>
        </div>
        <div class="lighting-body">
          <div class="lighting-section">
            <h4>Add Fixtures</h4>
            <div class="fixture-grid">
              ${LIGHTING_TYPES.map(t => `
                <button class="fixture-btn" onclick="enableLightPlacement('${t.id}')" title="${t.name}">
                  <span class="fixture-type-icon">${t.icon}</span>
                  <span class="fixture-type-name">${t.name}</span>
                  <span class="fixture-wattage">${t.wattage}W</span>
                </button>
              `).join('')}
            </div>
          </div>
          <div class="lighting-section">
            <h4>Summary</h4>
            <div class="lighting-summary">
              <div class="summary-stat">
                <span class="stat-value">${lightingPlan.length}</span>
                <span class="stat-label">Fixtures</span>
              </div>
              <div class="summary-stat">
                <span class="stat-value">${totalWattage}W</span>
                <span class="stat-label">Total Load</span>
              </div>
            </div>
            ${Object.keys(byType).length > 0 ? `
              <div class="fixture-breakdown">
                ${Object.entries(byType).map(([name, count]) => `
                  <div class="breakdown-row"><span>${name}</span><strong>${count}</strong></div>
                `).join('')}
              </div>
            ` : '<p class="no-lights">No fixtures placed yet</p>'}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  };

  let pendingLightType = null;

  window.enableLightPlacement = function(type) {
    pendingLightType = type;
    document.body.style.cursor = 'crosshair';
    document.querySelector('.lighting-modal')?.remove();
    if (typeof showToast === 'function') showToast('Click to place fixture', 'info');
  };

  window.handleLightPlacement = function(x, y) {
    if (!pendingLightType) return false;
    window.addLight(pendingLightType, x, y);
    pendingLightType = null;
    document.body.style.cursor = '';
    return true;
  };

  // === MATERIAL TAKEOFF REPORT ===
  window.generateMaterialTakeoff = function() {
    if (!window.elements || window.elements.length === 0) {
      if (typeof showToast === 'function') showToast('No design to generate report', 'info');
      return null;
    }

    const ppi = window.pixelsPerInch || 12;
    const info = projectInfo;
    const stats = window.getDesignStats();
    const costs = window.calculateMaterialCosts();
    const triangle = window.validateWorkTriangle();
    const clearances = window.checkClearances();
    const slabs = window.calculateSlabRequirements();

    // Compile comprehensive report
    const report = {
      project: {
        name: info.name,
        client: info.client,
        address: info.address,
        generatedAt: new Date().toISOString()
      },
      room: {
        width: (window.roomWidth || 240),
        depth: (window.roomDepth || 180),
        sqFt: Math.round(((window.roomWidth || 240) * (window.roomDepth || 180)) / 144 * 10) / 10
      },
      elements: {
        total: stats?.totalElements || 0,
        byType: stats?.byType || {},
        countertopSqFt: stats?.countertopArea || 0,
        cabinets: stats?.cabinetCount || 0,
        appliances: stats?.applianceCount || 0
      },
      materials: costs,
      slabRequirements: slabs,
      workTriangle: triangle,
      clearances: clearances,
      lighting: {
        fixtureCount: lightingPlan.length,
        totalWattage: lightingPlan.reduce((sum, l) => sum + (l.wattage || 0), 0)
      },
      annotations: annotations.length,
      seams: plannedSeams.length
    };

    return report;
  };

  window.showMaterialTakeoff = function() {
    const report = window.generateMaterialTakeoff();
    if (!report) return;

    const modal = document.createElement('div');
    modal.className = 'takeoff-modal';
    modal.innerHTML = `
      <div class="takeoff-content">
        <div class="takeoff-header">
          <h3>📋 Material Takeoff Report</h3>
          <div class="takeoff-actions">
            <button onclick="exportTakeoffPDF()">Export PDF</button>
            <button onclick="this.closest('.takeoff-modal').remove()">&times;</button>
          </div>
        </div>
        <div class="takeoff-body">
          <div class="takeoff-section">
            <h4>Project Information</h4>
            <div class="info-grid">
              <div><span>Project</span><strong>${report.project.name || 'Untitled'}</strong></div>
              <div><span>Client</span><strong>${report.project.client || 'N/A'}</strong></div>
              <div><span>Room Size</span><strong>${report.room.sqFt} sq ft</strong></div>
              <div><span>Elements</span><strong>${report.elements.total}</strong></div>
            </div>
          </div>
          <div class="takeoff-section">
            <h4>Countertops</h4>
            <div class="info-grid">
              <div><span>Total Area</span><strong>${report.elements.countertopSqFt} sq ft</strong></div>
              <div><span>Slabs Needed</span><strong>${report.slabRequirements?.slabsNeeded || 0}</strong></div>
              <div><span>With Waste</span><strong>${report.slabRequirements?.withWaste || 0} sq ft</strong></div>
              <div><span>Seams</span><strong>${report.seams}</strong></div>
            </div>
          </div>
          <div class="takeoff-section">
            <h4>Cabinets & Fixtures</h4>
            <div class="info-grid">
              <div><span>Cabinets</span><strong>${report.elements.cabinets}</strong></div>
              <div><span>Appliances</span><strong>${report.elements.appliances}</strong></div>
              <div><span>Light Fixtures</span><strong>${report.lighting.fixtureCount}</strong></div>
              <div><span>Electrical Load</span><strong>${report.lighting.totalWattage}W</strong></div>
            </div>
          </div>
          <div class="takeoff-section">
            <h4>Cost Summary</h4>
            <div class="cost-grid">
              <div><span>Materials</span><strong>$${(report.materials?.materialTotal || 0).toLocaleString()}</strong></div>
              <div><span>Labor</span><strong>$${(report.materials?.laborTotal || 0).toLocaleString()}</strong></div>
              <div class="total"><span>Total Estimate</span><strong>$${(report.materials?.grandTotal || 0).toLocaleString()}</strong></div>
            </div>
          </div>
          <div class="takeoff-section">
            <h4>Design Validation</h4>
            <div class="validation-list">
              <div class="validation-item ${report.workTriangle?.valid ? 'pass' : 'warn'}">
                <span>${report.workTriangle?.valid ? '✅' : '⚠️'}</span>
                <span>Work Triangle: ${report.workTriangle?.message || 'N/A'}</span>
              </div>
              <div class="validation-item ${report.clearances?.valid ? 'pass' : 'warn'}">
                <span>${report.clearances?.valid ? '✅' : '⚠️'}</span>
                <span>Clearances: ${report.clearances?.issues?.length || 0} issues</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  };

  window.exportTakeoffPDF = function() {
    // Generate a printable version
    const report = window.generateMaterialTakeoff();
    if (!report) return;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Material Takeoff - ${report.project.name || 'Design'}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 800px; margin: 0 auto; }
          h1 { border-bottom: 2px solid #f9cb00; padding-bottom: 10px; }
          h2 { color: #555; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-top: 24px; }
          .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
          .total { background: #f9f9f9; font-weight: bold; }
          .footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>📋 Material Takeoff Report</h1>
        <p><strong>Project:</strong> ${report.project.name || 'Untitled'} | <strong>Client:</strong> ${report.project.client || 'N/A'}</p>
        <p><strong>Generated:</strong> ${new Date().toLocaleDateString()}</p>

        <h2>Room Specifications</h2>
        <div class="info-row"><span>Room Size</span><span>${report.room.sqFt} sq ft</span></div>
        <div class="info-row"><span>Total Elements</span><span>${report.elements.total}</span></div>

        <h2>Countertops</h2>
        <div class="info-row"><span>Countertop Area</span><span>${report.elements.countertopSqFt} sq ft</span></div>
        <div class="info-row"><span>Slabs Required</span><span>${report.slabRequirements?.slabsNeeded || 0}</span></div>
        <div class="info-row"><span>Material with Waste (20%)</span><span>${report.slabRequirements?.withWaste || 0} sq ft</span></div>
        <div class="info-row"><span>Planned Seams</span><span>${report.seams}</span></div>

        <h2>Cabinets & Appliances</h2>
        <div class="info-row"><span>Cabinet Count</span><span>${report.elements.cabinets}</span></div>
        <div class="info-row"><span>Appliances</span><span>${report.elements.appliances}</span></div>

        <h2>Electrical</h2>
        <div class="info-row"><span>Light Fixtures</span><span>${report.lighting.fixtureCount}</span></div>
        <div class="info-row"><span>Total Wattage</span><span>${report.lighting.totalWattage}W</span></div>

        <h2>Cost Estimate</h2>
        <div class="info-row"><span>Materials</span><span>$${(report.materials?.materialTotal || 0).toLocaleString()}</span></div>
        <div class="info-row"><span>Labor</span><span>$${(report.materials?.laborTotal || 0).toLocaleString()}</span></div>
        <div class="info-row total"><span>TOTAL</span><span>$${(report.materials?.grandTotal || 0).toLocaleString()}</span></div>

        <div class="footer">Generated by Surprise Granite Room Designer</div>

        <script>window.onload = function() { window.print(); };</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // === ADDITIONAL V6 KEYBOARD SHORTCUTS ===
  document.addEventListener('keydown', function(e) {
    const isInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
    if (isInput) return;

    // B = Backsplash designer
    if (e.key === 'b' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      window.showBacksplashDesigner();
    }
    // Shift+L = Lighting planner
    if (e.key === 'L' && e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      window.showLightingPlanner();
    }
    // Shift+S = Seam planner
    if (e.key === 'S' && e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      window.showSeamPlanner();
    }
    // Shift+M = Material takeoff
    if (e.key === 'M' && e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      window.showMaterialTakeoff();
    }
  });

  // === INIT V6 FEATURES ===
  document.addEventListener('DOMContentLoaded', function() {
    window.initAnnotations();
    window.initSeamPlanner();
    window.initLightingPlan();
  });

  console.log('Room Designer Pro Features v6.0 loaded');

  // ============================================================
  // PRO FEATURES V7.0 - COMMERCIAL PROJECT SUITE
  // ============================================================

  // === 1. CABINET LIBRARY ===
  const CABINET_LIBRARY = {
    base: [
      { id: 'B12', name: 'Base 12"', width: 12, depth: 24, height: 34.5, type: 'base', doors: 1, shelves: 1 },
      { id: 'B15', name: 'Base 15"', width: 15, depth: 24, height: 34.5, type: 'base', doors: 1, shelves: 1 },
      { id: 'B18', name: 'Base 18"', width: 18, depth: 24, height: 34.5, type: 'base', doors: 1, shelves: 1 },
      { id: 'B21', name: 'Base 21"', width: 21, depth: 24, height: 34.5, type: 'base', doors: 1, shelves: 1 },
      { id: 'B24', name: 'Base 24"', width: 24, depth: 24, height: 34.5, type: 'base', doors: 2, shelves: 1 },
      { id: 'B27', name: 'Base 27"', width: 27, depth: 24, height: 34.5, type: 'base', doors: 2, shelves: 1 },
      { id: 'B30', name: 'Base 30"', width: 30, depth: 24, height: 34.5, type: 'base', doors: 2, shelves: 1 },
      { id: 'B33', name: 'Base 33"', width: 33, depth: 24, height: 34.5, type: 'base', doors: 2, shelves: 1 },
      { id: 'B36', name: 'Base 36"', width: 36, depth: 24, height: 34.5, type: 'base', doors: 2, shelves: 1 },
      { id: 'B42', name: 'Base 42"', width: 42, depth: 24, height: 34.5, type: 'base', doors: 2, shelves: 1 },
      { id: 'B48', name: 'Base 48"', width: 48, depth: 24, height: 34.5, type: 'base', doors: 2, shelves: 1 },
      { id: 'SB36', name: 'Sink Base 36"', width: 36, depth: 24, height: 34.5, type: 'sink-base', doors: 2, shelves: 0 },
      { id: 'DB15', name: 'Drawer Base 15"', width: 15, depth: 24, height: 34.5, type: 'drawer-base', drawers: 4 },
      { id: 'DB18', name: 'Drawer Base 18"', width: 18, depth: 24, height: 34.5, type: 'drawer-base', drawers: 4 },
      { id: 'DB24', name: 'Drawer Base 24"', width: 24, depth: 24, height: 34.5, type: 'drawer-base', drawers: 4 },
    ],
    wall: [
      { id: 'W1230', name: 'Wall 12x30"', width: 12, depth: 12, height: 30, type: 'wall', doors: 1, shelves: 2 },
      { id: 'W1530', name: 'Wall 15x30"', width: 15, depth: 12, height: 30, type: 'wall', doors: 1, shelves: 2 },
      { id: 'W1830', name: 'Wall 18x30"', width: 18, depth: 12, height: 30, type: 'wall', doors: 1, shelves: 2 },
      { id: 'W2430', name: 'Wall 24x30"', width: 24, depth: 12, height: 30, type: 'wall', doors: 2, shelves: 2 },
      { id: 'W3030', name: 'Wall 30x30"', width: 30, depth: 12, height: 30, type: 'wall', doors: 2, shelves: 2 },
      { id: 'W3630', name: 'Wall 36x30"', width: 36, depth: 12, height: 30, type: 'wall', doors: 2, shelves: 2 },
      { id: 'W1236', name: 'Wall 12x36"', width: 12, depth: 12, height: 36, type: 'wall', doors: 1, shelves: 2 },
      { id: 'W1836', name: 'Wall 18x36"', width: 18, depth: 12, height: 36, type: 'wall', doors: 1, shelves: 2 },
      { id: 'W2436', name: 'Wall 24x36"', width: 24, depth: 12, height: 36, type: 'wall', doors: 2, shelves: 2 },
      { id: 'W3036', name: 'Wall 30x36"', width: 30, depth: 12, height: 36, type: 'wall', doors: 2, shelves: 2 },
      { id: 'W3636', name: 'Wall 36x36"', width: 36, depth: 12, height: 36, type: 'wall', doors: 2, shelves: 2 },
    ],
    tall: [
      { id: 'T1884', name: 'Tall 18x84"', width: 18, depth: 24, height: 84, type: 'tall', doors: 2, shelves: 4 },
      { id: 'T2484', name: 'Tall 24x84"', width: 24, depth: 24, height: 84, type: 'tall', doors: 2, shelves: 4 },
      { id: 'T3084', name: 'Tall 30x84"', width: 30, depth: 24, height: 84, type: 'tall', doors: 2, shelves: 4 },
      { id: 'T3684', name: 'Tall 36x84"', width: 36, depth: 24, height: 84, type: 'tall', doors: 2, shelves: 4 },
      { id: 'T1896', name: 'Tall 18x96"', width: 18, depth: 24, height: 96, type: 'tall', doors: 2, shelves: 5 },
      { id: 'T2496', name: 'Tall 24x96"', width: 24, depth: 24, height: 96, type: 'tall', doors: 2, shelves: 5 },
    ],
    specialty: [
      { id: 'MW24', name: 'Microwave 24"', width: 24, depth: 18, height: 18, type: 'microwave', lamInterior: true },
      { id: 'MW30', name: 'Microwave 30"', width: 30, depth: 18, height: 18, type: 'microwave', lamInterior: true },
      { id: 'TVN48', name: 'TV Niche 48"', width: 48, depth: 4, height: 36, type: 'tv-niche' },
      { id: 'TVN60', name: 'TV Niche 60"', width: 60, depth: 4, height: 36, type: 'tv-niche' },
      { id: 'FP3', name: 'Filler Panel 3"', width: 3, depth: 0.75, height: 34.5, type: 'filler' },
      { id: 'FP6', name: 'Filler Panel 6"', width: 6, depth: 0.75, height: 34.5, type: 'filler' },
      { id: 'EP', name: 'End Panel', width: 0.75, depth: 24, height: 34.5, type: 'end-panel' },
    ]
  };

  window.showCabinetLibrary = function() {
    const existing = document.getElementById('cabinetLibraryModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'cabinetLibraryModal';
    modal.className = 'cabinet-library-modal';

    let content = `
      <div class="cabinet-library-content">
        <div class="cabinet-library-header">
          <h3>📦 Cabinet Library</h3>
          <div class="cabinet-library-tabs">
            <button class="cab-tab active" onclick="showCabinetCategory('base')">Base</button>
            <button class="cab-tab" onclick="showCabinetCategory('wall')">Wall</button>
            <button class="cab-tab" onclick="showCabinetCategory('tall')">Tall</button>
            <button class="cab-tab" onclick="showCabinetCategory('specialty')">Specialty</button>
          </div>
          <button onclick="this.closest('.cabinet-library-modal').remove()">&times;</button>
        </div>
        <div class="cabinet-library-body">
          <div class="cabinet-search">
            <input type="text" id="cabinetSearchInput" placeholder="Search cabinets..." oninput="filterCabinetLibrary(this.value)">
          </div>
          <div id="cabinetLibraryGrid" class="cabinet-library-grid">
            ${renderCabinetCategory('base')}
          </div>
        </div>
        <div class="cabinet-library-footer">
          <div class="custom-cabinet-form">
            <h4>Custom Cabinet</h4>
            <div class="custom-cab-inputs">
              <input type="number" id="customCabWidth" placeholder="W" min="6" max="60">
              <input type="number" id="customCabDepth" placeholder="D" min="12" max="30">
              <input type="number" id="customCabHeight" placeholder="H" min="12" max="96">
              <button onclick="addCustomCabinet()">Add Custom</button>
            </div>
          </div>
        </div>
      </div>
    `;

    modal.innerHTML = content;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  };

  function renderCabinetCategory(category) {
    const cabinets = CABINET_LIBRARY[category] || [];
    return cabinets.map(cab => `
      <div class="cabinet-lib-item" onclick="addCabinetFromLibrary('${category}', '${cab.id}')">
        <div class="cab-lib-icon">${getCabinetIcon(cab.type)}</div>
        <div class="cab-lib-name">${cab.name}</div>
        <div class="cab-lib-dims">${cab.width}"W x ${cab.depth}"D x ${cab.height}"H</div>
      </div>
    `).join('');
  }

  function getCabinetIcon(type) {
    const icons = {
      'base': '▭',
      'sink-base': '◇',
      'drawer-base': '☰',
      'wall': '▯',
      'tall': '▮',
      'microwave': '◻',
      'tv-niche': '📺',
      'filler': '│',
      'end-panel': '▏'
    };
    return icons[type] || '▭';
  }

  window.showCabinetCategory = function(category) {
    document.querySelectorAll('.cab-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('cabinetLibraryGrid').innerHTML = renderCabinetCategory(category);
  };

  window.filterCabinetLibrary = function(query) {
    if (!query) {
      document.getElementById('cabinetLibraryGrid').innerHTML = renderCabinetCategory('base');
      return;
    }
    query = query.toLowerCase();
    const allCabinets = [...CABINET_LIBRARY.base, ...CABINET_LIBRARY.wall, ...CABINET_LIBRARY.tall, ...CABINET_LIBRARY.specialty];
    const filtered = allCabinets.filter(c => c.name.toLowerCase().includes(query) || c.id.toLowerCase().includes(query));
    document.getElementById('cabinetLibraryGrid').innerHTML = filtered.map(cab => `
      <div class="cabinet-lib-item" onclick="addCabinetFromLibraryDirect('${JSON.stringify(cab).replace(/"/g, '&quot;')}')">
        <div class="cab-lib-icon">${getCabinetIcon(cab.type)}</div>
        <div class="cab-lib-name">${cab.name}</div>
        <div class="cab-lib-dims">${cab.width}"W x ${cab.depth}"D x ${cab.height}"H</div>
      </div>
    `).join('');
  };

  window.addCabinetFromLibrary = function(category, cabId) {
    const cabinet = CABINET_LIBRARY[category]?.find(c => c.id === cabId);
    if (!cabinet) return;
    addCabinetToCanvas(cabinet);
  };

  window.addCabinetFromLibraryDirect = function(cabJson) {
    const cabinet = JSON.parse(cabJson.replace(/&quot;/g, '"'));
    addCabinetToCanvas(cabinet);
  };

  function addCabinetToCanvas(cabinet) {
    const ppi = window.pixelsPerInch || 12;
    const newElement = {
      id: `cab_${cabinet.id}_${Date.now()}`,
      type: 'cabinet',
      subType: cabinet.type,
      name: cabinet.name,
      cabinetId: cabinet.id,
      width: cabinet.width * ppi,
      height: cabinet.depth * ppi, // In 2D, depth becomes height
      actualHeight: cabinet.height,
      actualWidth: cabinet.width,
      actualDepth: cabinet.depth,
      doors: cabinet.doors || 0,
      drawers: cabinet.drawers || 0,
      shelves: cabinet.shelves || 0,
      lamInterior: cabinet.lamInterior || false,
      x: 100,
      y: 100
    };

    if (window.elements) {
      window.elements.push(newElement);
      window.selectedElement = newElement;
      if (typeof window.renderCanvas === 'function') window.renderCanvas();
    }

    document.getElementById('cabinetLibraryModal')?.remove();
    if (typeof showToast === 'function') showToast(`Added ${cabinet.name}`, 'success');
  }

  window.addCustomCabinet = function() {
    const w = parseFloat(document.getElementById('customCabWidth')?.value);
    const d = parseFloat(document.getElementById('customCabDepth')?.value);
    const h = parseFloat(document.getElementById('customCabHeight')?.value);

    if (!w || !d || !h) {
      if (typeof showToast === 'function') showToast('Enter width, depth, and height', 'warning');
      return;
    }

    const cabinet = {
      id: 'CUSTOM',
      name: `Custom ${w}"x${d}"x${h}"`,
      width: w,
      depth: d,
      height: h,
      type: 'base',
      doors: w >= 24 ? 2 : 1,
      shelves: 1
    };

    addCabinetToCanvas(cabinet);
  };

  // === 2. COMMERCIAL PROJECT MODE (Multi-Room) ===
  const COMMERCIAL_PROJECT_KEY = 'sg_commercial_project';
  let commercialProject = null;

  // Preserve the original room system's switchToRoom function
  // (defined in index.html before this file loads)
  if (window.switchToRoom && !window._originalSwitchToRoom) {
    window._originalSwitchToRoom = window.switchToRoom;
  }

  window.initCommercialProject = function(projectName = 'New Commercial Project') {
    commercialProject = {
      id: 'proj_' + Date.now(),
      name: projectName,
      client: '',
      location: '',
      rooms: [],
      currentRoomIndex: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'draft',
      approvals: []
    };
    saveCommercialProject();
    return commercialProject;
  };

  window.loadCommercialProject = function() {
    try {
      const stored = localStorage.getItem(COMMERCIAL_PROJECT_KEY);
      if (stored) {
        commercialProject = JSON.parse(stored);
        return commercialProject;
      }
    } catch (e) {}
    return null;
  };

  function saveCommercialProject() {
    if (!commercialProject) return;
    commercialProject.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(COMMERCIAL_PROJECT_KEY, JSON.stringify(commercialProject));
    } catch (e) {}
  }

  window.showCommercialProjectManager = function() {
    const existing = document.getElementById('commercialProjectModal');
    if (existing) existing.remove();

    if (!commercialProject) {
      window.loadCommercialProject();
    }

    const modal = document.createElement('div');
    modal.id = 'commercialProjectModal';
    modal.className = 'commercial-project-modal';

    const hasProject = !!commercialProject;
    const rooms = commercialProject?.rooms || [];

    modal.innerHTML = `
      <div class="commercial-project-content">
        <div class="commercial-project-header">
          <h3>🏢 Commercial Project Manager</h3>
          <button onclick="this.closest('.commercial-project-modal').remove()">&times;</button>
        </div>
        <div class="commercial-project-body">
          ${!hasProject ? `
            <div class="new-project-form">
              <h4>Start New Commercial Project</h4>
              <div class="form-group">
                <label>Project Name</label>
                <input type="text" id="newProjectName" placeholder="e.g., State Farm Stadium Cabinets">
              </div>
              <div class="form-group">
                <label>Client</label>
                <input type="text" id="newProjectClient" placeholder="e.g., Arizona Cardinals">
              </div>
              <div class="form-group">
                <label>Location</label>
                <input type="text" id="newProjectLocation" placeholder="e.g., 1 Cardinals Drive, Glendale, AZ">
              </div>
              <button class="btn-primary" onclick="createCommercialProject()">Create Project</button>
            </div>
          ` : `
            <div class="project-info">
              <div class="project-header-info">
                <h4>${commercialProject.name}</h4>
                <span class="project-status ${commercialProject.status}">${commercialProject.status.toUpperCase()}</span>
              </div>
              <p><strong>Client:</strong> ${commercialProject.client || 'Not set'}</p>
              <p><strong>Location:</strong> ${commercialProject.location || 'Not set'}</p>
              <p><strong>Rooms:</strong> ${rooms.length}</p>
            </div>
            <div class="rooms-section">
              <div class="rooms-header">
                <h4>Rooms</h4>
                <button onclick="addRoomToProject()">+ Add Room</button>
              </div>
              <div class="rooms-list" id="roomsList">
                ${rooms.length === 0 ? '<p class="no-rooms">No rooms yet. Add your first room.</p>' : rooms.map((room, i) => `
                  <div class="room-item ${i === commercialProject.currentRoomIndex ? 'active' : ''}" onclick="switchToProjectRoom(${i})">
                    <div class="room-item-info">
                      <span class="room-name">${room.name}</span>
                      <span class="room-meta">${room.elements?.length || 0} elements • ${room.width}'x${room.depth}'</span>
                    </div>
                    <div class="room-item-actions">
                      <button onclick="event.stopPropagation(); editRoom(${i})" title="Edit">✏️</button>
                      <button onclick="event.stopPropagation(); duplicateRoom(${i})" title="Duplicate">📋</button>
                      <button onclick="event.stopPropagation(); deleteRoom(${i})" title="Delete">🗑️</button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
            <div class="project-actions">
              <button class="btn-secondary" onclick="exportCommercialProject()">Export All</button>
              <button class="btn-secondary" onclick="generateProjectReport()">Generate Report</button>
              <button class="btn-primary" onclick="sendForApproval()">Send for Approval</button>
            </div>
          `}
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  };

  window.createCommercialProject = function() {
    const name = document.getElementById('newProjectName')?.value || 'New Project';
    const client = document.getElementById('newProjectClient')?.value || '';
    const location = document.getElementById('newProjectLocation')?.value || '';

    commercialProject = {
      id: 'proj_' + Date.now(),
      name,
      client,
      location,
      rooms: [],
      currentRoomIndex: -1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'draft',
      approvals: []
    };

    saveCommercialProject();
    window.showCommercialProjectManager();
    if (typeof showToast === 'function') showToast('Project created!', 'success');
  };

  window.addRoomToProject = function() {
    if (!commercialProject) return;

    const roomName = prompt('Room name:', `Room ${commercialProject.rooms.length + 1}`);
    if (!roomName) return;

    // Save current room state first
    saveCurrentRoomToProject();

    const newRoom = {
      id: 'room_' + Date.now(),
      name: roomName,
      width: 20, // feet
      depth: 15, // feet
      elements: [],
      walls: [],
      countertops: [],
      notes: [],
      createdAt: new Date().toISOString()
    };

    commercialProject.rooms.push(newRoom);
    commercialProject.currentRoomIndex = commercialProject.rooms.length - 1;
    saveCommercialProject();

    // Clear canvas for new room
    if (window.elements) window.elements.length = 0;
    if (window.walls) window.walls.length = 0;
    window.roomWidth = newRoom.width * 12;
    window.roomDepth = newRoom.depth * 12;

    if (typeof window.renderCanvas === 'function') window.renderCanvas();
    window.showCommercialProjectManager();
    if (typeof showToast === 'function') showToast(`Added room: ${roomName}`, 'success');
  };

  // Switch room using the existing room system (preferred method)
  // This syncs with the main Room Designer's room tabs
  window.switchToProjectRoom = function(index) {
    // If we have synced to the existing room system, use that
    if (window.rooms && window.rooms.length > index) {
      const room = window.rooms[index];
      if (room && room.id) {
        // Use the existing room system's switchToRoom
        const originalSwitch = window._originalSwitchToRoom || window.switchToRoom;
        if (typeof originalSwitch === 'function') {
          originalSwitch(room.id);
        }
        document.getElementById('commercialProjectModal')?.remove();
        return;
      }
    }

    // Fallback: Use commercial project directly if no sync
    if (!commercialProject || !commercialProject.rooms[index]) {
      console.error('Cannot switch room - no project or invalid index:', index);
      return;
    }

    commercialProject.currentRoomIndex = index;
    const room = commercialProject.rooms[index];

    // Load elements into canvas
    if (window.elements) {
      window.elements.length = 0;
      (room.elements || []).forEach(el => window.elements.push({...el}));
    }

    if (window.walls) {
      window.walls.length = 0;
      (room.walls || []).forEach(w => window.walls.push({...w}));
    }

    // Update room dimensions
    if (typeof window.roomWidth !== 'undefined') {
      window.roomWidth = room.width || 20;
    }
    if (typeof window.roomDepth !== 'undefined') {
      window.roomDepth = room.depth || 15;
    }

    const projectName = document.getElementById('projectName');
    if (projectName) {
      projectName.value = `${commercialProject.name} - ${room.name}`;
    }

    saveCommercialProject();

    if (typeof window.fitToScreen === 'function') {
      window.fitToScreen();
    }
    if (typeof window.draw === 'function') {
      window.draw();
    }

    document.getElementById('commercialProjectModal')?.remove();
    if (typeof showToast === 'function') {
      showToast(`Switched to: ${room.name}`, 'info');
    }
  };

  function saveCurrentRoomToProject() {
    if (!commercialProject || commercialProject.currentRoomIndex < 0) return;

    const room = commercialProject.rooms[commercialProject.currentRoomIndex];
    if (!room) return;

    room.elements = (window.elements || []).map(el => ({ ...el }));
    room.walls = (window.walls || []).map(w => ({ ...w }));
    // roomWidth and roomDepth are already in feet in the main designer
    room.width = window.roomWidth || 20;
    room.depth = window.roomDepth || 15;
    room.updatedAt = new Date().toISOString();

    saveCommercialProject();
  }

  window.duplicateRoom = function(index) {
    if (!commercialProject || !commercialProject.rooms[index]) return;

    const original = commercialProject.rooms[index];
    const copy = JSON.parse(JSON.stringify(original));
    copy.id = 'room_' + Date.now();
    copy.name = original.name + ' (Copy)';
    copy.createdAt = new Date().toISOString();

    commercialProject.rooms.push(copy);
    saveCommercialProject();
    window.showCommercialProjectManager();
    if (typeof showToast === 'function') showToast('Room duplicated', 'success');
  };

  window.deleteRoom = function(index) {
    if (!commercialProject || !commercialProject.rooms[index]) return;
    if (!confirm(`Delete "${commercialProject.rooms[index].name}"?`)) return;

    commercialProject.rooms.splice(index, 1);
    if (commercialProject.currentRoomIndex >= commercialProject.rooms.length) {
      commercialProject.currentRoomIndex = commercialProject.rooms.length - 1;
    }
    saveCommercialProject();
    window.showCommercialProjectManager();
    if (typeof showToast === 'function') showToast('Room deleted', 'success');
  };

  window.editRoom = function(index) {
    if (!commercialProject || !commercialProject.rooms[index]) return;
    const room = commercialProject.rooms[index];

    const newName = prompt('Room name:', room.name);
    if (newName && newName !== room.name) {
      room.name = newName;
      saveCommercialProject();
      window.showCommercialProjectManager();
    }
  };

  // === 3. PDF IMPORT PARSER ===
  window.showPDFImporter = function() {
    const existing = document.getElementById('pdfImporterModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'pdfImporterModal';
    modal.className = 'pdf-importer-modal';
    modal.innerHTML = `
      <div class="pdf-importer-content">
        <div class="pdf-importer-header">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:36px; height:36px; background:linear-gradient(135deg, var(--primary), #8b5cf6); border-radius:10px; display:flex; align-items:center; justify-content:center;">
              <svg width="20" height="20" fill="white" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>
            </div>
            <div>
              <h3 style="margin:0; font-size:17px;">Import Cabinet Drawings</h3>
              <p style="margin:0; font-size:12px; color:var(--text-muted);">AI-powered blueprint analysis</p>
            </div>
          </div>
          <button onclick="this.closest('.pdf-importer-modal').remove()">&times;</button>
        </div>
        <div class="pdf-importer-body">
          <div class="import-dropzone" id="pdfDropzone">
            <p style="font-size:15px; font-weight:500; color:var(--text); margin:0 0 4px;">Upload Room Photos</p>
            <p style="font-size:13px; color:var(--text-muted); margin:0 0 12px;">Click each slot to add a photo • Up to 4 images for multi-angle scan</p>
            <div style="margin-bottom:10px;">
              <label style="font-size:12px; color:var(--text-muted); display:block; margin-bottom:4px;">Known measurements (optional)</label>
              <input type="text" id="pdfUserMeasurements"
                     placeholder="e.g. Back wall is 14ft, island is 6ft wide"
                     style="width:100%; padding:8px; border:1px solid var(--border); border-radius:6px; background:var(--surface); color:var(--text); font-size:13px; box-sizing:border-box;" />
            </div>
            <div id="pdfImageSlots" style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:12px;"></div>
            <div style="display:flex; gap:8px; justify-content:center; align-items:center;">
              <span id="pdfImageCount" style="font-size:12px; color:var(--text-muted);">Click a slot to add a photo</span>
              <button id="pdfClearAll" onclick="event.stopPropagation(); window._pdfImages=[]; window._renderPdfSlots();" style="display:none; padding:4px 12px; background:var(--surface); border:1px solid var(--border); border-radius:6px; cursor:pointer; color:var(--text); font-size:12px;">✕ Clear All</button>
            </div>
            <input type="file" id="pdfFileInput" accept=".pdf,image/*" style="display:none">
            <div style="margin-top:12px; padding-top:12px; border-top:1px solid var(--border);">
              <p style="font-size:11px; color:var(--text-muted); margin:0;">
                <strong>Tip:</strong> Upload photos from different angles for best results. PDF blueprints and sketches also supported.
              </p>
            </div>
          </div>

          <button id="pdfAnalyzeBtn" onclick="window._analyzeAllImages()" style="display:none; width:100%; padding:12px; margin-bottom:16px; background:linear-gradient(135deg, #6366f1, #8b5cf6); border:none; border-radius:8px; color:white; font-weight:600; font-size:15px; cursor:pointer;">
            🔍 Scan & Build Layout
          </button>

          <div id="pdfParseResults" class="pdf-parse-results" style="display:none">
            <div id="extractedRooms"></div>
          </div>
          <div class="manual-entry-section">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
              <div style="flex:1; height:1px; background:var(--border);"></div>
              <span style="font-size:12px; color:var(--text-muted);">OR</span>
              <div style="flex:1; height:1px; background:var(--border);"></div>
            </div>
            <h4 style="display:flex; align-items:center; gap:8px;">
              <svg width="16" height="16" fill="var(--text-muted)" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
              Enter Cabinet Data Manually
            </h4>
            <p class="help-text">Paste a cut list or cabinet schedule:</p>
            <textarea id="manualCabinetData" rows="5" placeholder="Example:
1 - Base 36&quot; x 24&quot; x 34.5&quot;
2 - Wall Cabinet 30&quot; x 12&quot; x 30&quot;
3 - Sink Base 36&quot; x 24&quot; x 34.5&quot;"></textarea>
            <button onclick="parseManualCabinetData()" style="display:flex; align-items:center; justify-content:center; gap:8px;">
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
              Parse & Import
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Prevent keyboard events from bubbling to canvas/room designer tools
    modal.addEventListener('keydown', e => e.stopPropagation());
    modal.addEventListener('keyup', e => e.stopPropagation());
    modal.addEventListener('keypress', e => e.stopPropagation());

    // Initialize image slots
    window._pdfImages = [];
    window._renderPdfSlots();

    // Setup drag and drop — supports multiple files
    const dropzone = document.getElementById('pdfDropzone');
    dropzone.addEventListener('dragover', e => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || f.type === 'application/pdf');
      const imageFiles = files.slice(0, 4 - window._pdfImages.length);
      imageFiles.forEach(file => {
        if (file.type === 'application/pdf') {
          handlePDFFile(file);
        } else {
          Promise.all([
            window._resizeImage(file, 1200, 0.85),
            window._resizeImage(file, 300, 0.6)
          ]).then(function(results) {
            window._pdfImages.push({ data: results[0], thumb: results[1], file: file });
            window._renderPdfSlots();
          }).catch(function(err) {
            console.error('Drop image error:', err);
          });
        }
      });
    });

    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  };

  // Multi-image state
  window._pdfImages = [];

  // Resize image via canvas to reduce memory — returns base64 JPEG
  window._resizeImage = function(file, maxDim, quality) {
    maxDim = maxDim || 1200;
    quality = quality || 0.8;
    return new Promise(function(resolve, reject) {
      var objectUrl = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function() {
        var w = img.naturalWidth, h = img.naturalHeight;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
          else { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        var dataUrl = canvas.toDataURL('image/jpeg', quality);
        URL.revokeObjectURL(objectUrl);
        resolve(dataUrl);
      };
      img.onerror = function() {
        URL.revokeObjectURL(objectUrl);
        var reader = new FileReader();
        reader.onload = function(ev) { resolve(ev.target.result); };
        reader.onerror = function() { reject(new Error('Failed to read image')); };
        reader.readAsDataURL(file);
      };
      img.src = objectUrl;
    });
  };

  window._renderPdfSlots = function() {
    var grid = document.getElementById('pdfImageSlots');
    if (!grid) return;
    grid.innerHTML = '';
    for (var i = 0; i < 4; i++) {
      var slot = document.createElement('div');
      slot.style.cssText = 'aspect-ratio:1; border:2px dashed var(--border); border-radius:8px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; background:var(--surface); transition:all 0.2s; position:relative; overflow:hidden;';
      if (window._pdfImages[i]) {
        if (typeof window._pdfImages[i].note === 'undefined') window._pdfImages[i].note = '';
        slot.style.border = '2px solid var(--primary)';
        var thumbSrc = window._pdfImages[i].thumb || window._pdfImages[i].data;
        slot.innerHTML = '<img src="' + thumbSrc + '" style="width:100%;height:100%;object-fit:cover;">' +
          '<button onclick="event.stopPropagation();window._removePdfImage(' + i + ')" style="position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,0.7);border:none;color:white;cursor:pointer;font-size:14px;line-height:22px;padding:0;z-index:2;">✕</button>' +
          '<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.6);color:white;font-size:10px;padding:2px 4px;text-align:center;">Photo ' + (i+1) + '</div>';
      } else {
        slot.onmouseover = function(){this.style.borderColor='var(--primary)';this.style.background='rgba(99,102,241,0.08)';};
        slot.onmouseout = function(){this.style.borderColor='var(--border)';this.style.background='var(--surface)';};
        slot.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span style="font-size:11px;color:var(--text-muted);margin-top:4px;">Photo ' + (i+1) + '</span>';
        slot.onclick = function(ev) { ev.stopPropagation(); window._pickPdfImage(); };
      }
      grid.appendChild(slot);
    }
    // Per-image note inputs in a separate row below the grid
    var notesRow = document.getElementById('pdfSlotNotes');
    if (!notesRow) {
      notesRow = document.createElement('div');
      notesRow.id = 'pdfSlotNotes';
      notesRow.style.cssText = 'display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:8px;';
      grid.parentNode.insertBefore(notesRow, grid.nextSibling);
    }
    notesRow.innerHTML = '';
    var hasNotes = false;
    for (var j = 0; j < 4; j++) {
      var cell = document.createElement('div');
      if (window._pdfImages[j]) {
        hasNotes = true;
        var inp = document.createElement('input');
        inp.type = 'text';
        inp.placeholder = 'e.g. Back wall, 14ft';
        inp.dataset.slotIdx = String(j);
        inp.value = window._pdfImages[j].note || '';
        inp.style.cssText = 'width:100%; padding:4px 6px; border:1px solid var(--border); border-radius:4px; background:var(--surface); color:var(--text); font-size:10px; box-sizing:border-box;';
        inp.oninput = (function(idx) {
          return function(e) { if (window._pdfImages[idx]) window._pdfImages[idx].note = e.target.value; };
        })(j);
        inp.onclick = function(e) { e.stopPropagation(); };
        cell.appendChild(inp);
      }
      notesRow.appendChild(cell);
    }
    notesRow.style.display = hasNotes ? 'grid' : 'none';
    var countEl = document.getElementById('pdfImageCount');
    var clearBtn = document.getElementById('pdfClearAll');
    var n = window._pdfImages.length;
    if (countEl) countEl.textContent = n === 0 ? 'Click a slot to add a photo' : n + ' of 4 images' + (n === 1 ? ' — add more angles for better results!' : '');
    if (clearBtn) clearBtn.style.display = n > 0 ? 'inline-block' : 'none';
    var analyzeBtn = document.getElementById('pdfAnalyzeBtn');
    if (analyzeBtn) analyzeBtn.style.display = n > 0 ? 'block' : 'none';
  };

  window._pickPdfImage = function() {
    if (window._pdfImages.length >= 4) return;
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,image/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = function(e) {
      var file = e.target.files[0];
      if (!file) { input.remove(); return; }
      if (file.type === 'application/pdf') {
        handlePDFFile(file);
        input.remove();
        return;
      }
      input.remove();
      // Show loading indicator in next empty slot
      var slotIdx = window._pdfImages.length;
      var slotEl = document.getElementById('pdfImageSlots')?.children[slotIdx];
      if (slotEl) slotEl.innerHTML = '<div style="font-size:11px;color:var(--text-muted);">Loading...</div>';

      // Resize image to reduce memory: 1200px for API, 300px for thumbnail
      Promise.all([
        window._resizeImage(file, 1200, 0.85),
        window._resizeImage(file, 300, 0.6)
      ]).then(function(results) {
        window._pdfImages.push({ data: results[0], thumb: results[1], file: file });
        window._renderPdfSlots();
      }).catch(function(err) {
        console.error('Image load error:', err);
        if (typeof showToast === 'function') showToast('Failed to load image — try a JPEG or PNG', 'error');
        window._renderPdfSlots();
      });
    };
    input.click();
  };

  window._removePdfImage = function(idx) {
    window._pdfImages.splice(idx, 1);
    window._renderPdfSlots();
  };

  window._analyzeAllImages = function() {
    const images = window._pdfImages || [];
    if (images.length === 0) return;

    // Build enriched userContext from global measurements + per-image notes
    const parts = [];
    const globalMeasurements = document.getElementById('pdfUserMeasurements')?.value?.trim();
    if (globalMeasurements) parts.push('KNOWN MEASUREMENTS: ' + globalMeasurements);
    const legacyContext = document.getElementById('userBlueprintContext')?.value?.trim();
    if (legacyContext) parts.push(legacyContext);
    const imageNotes = images
      .map(function(img, idx) { return img.note ? ('Image ' + (idx + 1) + ': ' + img.note) : ''; })
      .filter(Boolean);
    if (imageNotes.length > 0) parts.push('PER-IMAGE NOTES: ' + imageNotes.join(' | '));
    const userContext = parts.join('\n');

    if (images.length >= 2) {
      analyzeMultiImages(images, userContext);
    } else {
      analyzeWithAIVision(images[0].data, 'photo-scan', userContext);
    }
  };

  window.handlePDFUpload = function(event) {
    const file = event.target.files[0];
    if (file) handlePDFFile(file);
  };

  async function handlePDFFile(file) {
    const isImage = file.type.startsWith('image/');
    const isPDF = file.type === 'application/pdf';

    if (!isImage && !isPDF) {
      if (typeof showToast === 'function') showToast('Please select a PDF or image file', 'warning');
      return;
    }

    // Show loading state with enhanced UI
    document.getElementById('pdfParseResults').style.display = 'block';
    document.getElementById('extractedRooms').innerHTML = `
      <div style="text-align:center; padding:32px 20px;">
        <div class="ai-spinner"></div>
        <h4 style="margin:0 0 8px; font-size:16px;">${isPDF ? 'Processing PDF' : 'Analyzing Blueprint'}</h4>
        <p class="ai-pulse" style="margin:0 0 16px; color:var(--text-muted); font-size:14px;">
          ${isPDF ? 'Converting pages to images...' : 'AI Vision is reading your drawing...'}
        </p>
        <div class="ai-progress-bar">
          <div class="ai-progress-fill" style="width:30%"></div>
        </div>
        <p style="margin:16px 0 0; font-size:12px; color:var(--text-muted);">This typically takes 15-30 seconds</p>
      </div>
    `;

    try {
      let base64Data;

      if (isPDF) {
        // Convert PDF to image (handles multi-page selection)
        base64Data = await convertPDFToImage(file);

        // If null, user is selecting a page from multi-page PDF
        if (!base64Data) return;
      } else {
        // Read image as base64
        base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = e => resolve(e.target.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      // Update loading message with enhanced UI
      document.getElementById('extractedRooms').innerHTML = `
        <div style="text-align:center; padding:32px 20px;">
          <div class="ai-spinner"></div>
          <h4 style="margin:0 0 8px; font-size:16px;">Reading Cabinet Drawings</h4>
          <p class="ai-pulse" style="margin:0 0 16px; color:var(--text-muted); font-size:14px;">
            AI is extracting cabinet schedules and dimensions...
          </p>
          <div class="ai-progress-bar">
            <div class="ai-progress-fill" style="width:60%"></div>
          </div>
          <p style="margin:16px 0 0; font-size:12px; color:var(--text-muted);">Looking for room names, cabinet numbers, and measurements</p>
        </div>
      `;

      // Get user context if provided
      const userContext = document.getElementById('userBlueprintContext')?.value?.trim() || '';

      // If we have multiple images queued, send them all together
      const allImages = window._pdfImages || [];
      if (allImages.length >= 2) {
        await analyzeMultiImages(allImages, userContext);
      } else if (allImages.length === 1) {
        await analyzeWithAIVision(allImages[0].data, file.name, userContext);
      } else {
        await analyzeWithAIVision(base64Data, file.name, userContext);
      }
    } catch (error) {
      console.error('File processing failed:', error);
      showManualEntryFallback(file.name, error.message);
    }
  }

  async function analyzeMultiImages(images, userContext) {
    const AI_BASE = (window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'https://surprise-granite-email-api.onrender.com' : '';

    const resultsEl = document.getElementById('extractedRooms');
    document.getElementById('pdfParseResults').style.display = 'block';

    // Helper to update progress UI
    function showProgress(step, title, subtitle, pct) {
      resultsEl.innerHTML = `
        <div style="text-align:center; padding:32px 20px;">
          <div class="ai-spinner"></div>
          <h4 style="margin:0 0 8px; font-size:16px;">Step ${step}/2: ${title}</h4>
          <p class="ai-pulse" style="margin:0 0 16px; color:var(--text-muted); font-size:14px;">${subtitle}</p>
          <div class="ai-progress-bar">
            <div class="ai-progress-fill" style="width:${pct}%"></div>
          </div>
          <p style="margin:16px 0 0; font-size:12px; color:var(--text-muted);">This may take 30-60 seconds</p>
        </div>
      `;
    }

    showProgress(1, 'Analyzing room structure...', 'Identifying layout type, walls, and dimensions', 25);

    const imagePayload = images.map(img => ({ data: img.data, label: img.note || '' }));

    try {
      // Try two-pass endpoint first
      let usedTwoPass = false;
      try {
        const response = await fetch(`${AI_BASE}/api/ai/room-scan-two-pass`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            images: imagePayload,
            projectType: 'residential-kitchen',
            userContext: userContext
          })
        });

        if (response.status === 404) {
          console.log('[TwoPass] Endpoint not found, falling back to single-pass');
        } else if (!response.ok) {
          console.warn('[TwoPass] Error:', response.status, '— falling back');
        } else {
          showProgress(2, 'Counting cabinets...', 'Precisely counting every cabinet on each wall', 70);
          const data = await response.json();
          console.log('AI Two-Pass Analysis:', data);
          usedTwoPass = true;
          if (data.rooms && data.rooms.length > 0) {
            showScanResultsPreview(data, images, userContext);
          } else {
            showManualEntryFallback('multi-image-scan', 'No rooms detected in the images');
          }
        }
      } catch (tpErr) {
        console.warn('[TwoPass] Failed:', tpErr.message, '— falling back');
      }

      if (usedTwoPass) return;

      // Fallback: single-pass multi-image
      showProgress(1, 'Analyzing photos...', 'AI is comparing angles to build the complete layout', 40);

      const spResponse = await fetch(`${AI_BASE}/api/ai/room-scan-multi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: imagePayload,
          projectType: 'residential-kitchen',
          userContext: userContext
        })
      });

      if (!spResponse.ok) {
        // Try to get error details from response
        let errMsg = `Server error (${spResponse.status})`;
        try { const errData = await spResponse.json(); errMsg = errData.error || errMsg; } catch(e) {}
        throw new Error(errMsg);
      }

      const spData = await spResponse.json();
      console.log('AI Single-Pass Analysis:', spData);
      if (spData.rooms && spData.rooms.length > 0) {
        showScanResultsPreview(spData, images, userContext);
      } else {
        showManualEntryFallback('multi-image-scan', 'No rooms detected');
      }

    } catch (error) {
      console.error('Multi-image analysis failed:', error);
      // Final fallback: analyze first image only
      if (images.length > 0) {
        try {
          if (typeof showToast === 'function') showToast('Multi-image failed, trying single image...', 'warning');
          await analyzeWithAIVision(images[0].data, 'single-fallback', userContext);
        } catch (e3) {
          console.error('Single image fallback also failed:', e3);
          showManualEntryFallback('multi-image', error.message);
        }
      } else {
        showManualEntryFallback('multi-image', error.message);
      }
    }
  }

  // ============ POST-SCAN CORRECTION UI ============

  function showScanResultsPreview(data, images, userContext) {
    // Store raw data for re-scan / editing
    window._aiAnalysisData = data;
    window._lastScanImages = images;
    window._lastScanContext = userContext;

    // Convert to parsedRooms format
    convertAIResultsToRooms(data, 'ai-scan');
    const rooms = window._parsedRooms || [];
    if (rooms.length === 0) {
      showManualEntryFallback('ai-scan', 'No rooms parsed');
      return;
    }

    const room = rooms[0];
    const structure = data._pass1Structure || {};
    const confidence = data.confidence || 'medium';
    const confidenceColor = confidence === 'high' ? '#22c55e' : confidence === 'medium' ? '#f9cb00' : '#ef4444';
    const totalElements = room.cabinets.length;

    // Count by wall and type
    const wallCounts = {};
    room.cabinets.forEach(function(c) {
      var w = c.wall || 'top';
      if (!wallCounts[w]) wallCounts[w] = { base: 0, wall: 0, appliance: 0, other: 0 };
      if (c.isAppliance) wallCounts[w].appliance++;
      else if (c.type === 'base-cabinet' || c.type === 'sink-base' || c.type === 'drawer-base') wallCounts[w].base++;
      else if (c.type === 'wall-cabinet') wallCounts[w].wall++;
      else wallCounts[w].other++;
    });

    // Build wall summary rows
    var wallSummaryHtml = Object.keys(wallCounts).map(function(w) {
      var wc = wallCounts[w];
      var parts = [];
      if (wc.base > 0) parts.push(wc.base + ' base');
      if (wc.wall > 0) parts.push(wc.wall + ' upper');
      if (wc.appliance > 0) parts.push(wc.appliance + ' appliance' + (wc.appliance > 1 ? 's' : ''));
      if (wc.other > 0) parts.push(wc.other + ' other');
      return '<div style="display:flex; justify-content:space-between; padding:4px 0; font-size:13px;">' +
        '<span style="text-transform:uppercase; font-weight:600; color:var(--text-muted); font-size:11px;">' + w + ' wall</span>' +
        '<span>' + parts.join(', ') + '</span></div>';
    }).join('');

    // Appliance list
    var applianceNames = room.cabinets
      .filter(function(c) { return c.isAppliance; })
      .map(function(c) { return c.name; });
    var applianceHtml = applianceNames.length > 0 ? applianceNames.join(', ') : 'None detected';

    var layoutOptions = ['L-shape', 'U-shape', 'galley', 'single-wall', 'island', 'peninsula'].map(function(lt) {
      return '<option value="' + lt + '"' + (lt === (room.layoutType || '') ? ' selected' : '') + '>' + lt + '</option>';
    }).join('');

    // Build the preview UI
    var resultsEl = document.getElementById('extractedRooms');
    resultsEl.innerHTML = `
      <div style="padding:4px 0;">
        <div style="text-align:center; margin-bottom:16px;">
          <h3 style="margin:0 0 4px; font-size:18px;">AI Scan Results — Review & Correct</h3>
          <p style="margin:0; color:var(--text-muted); font-size:13px;">Verify the detected layout before importing</p>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
          <div>
            <label style="font-size:11px; color:var(--text-muted); display:block; margin-bottom:3px;">Layout Type</label>
            <select id="scanCorrectLayout" style="width:100%; padding:6px 8px; border:1px solid var(--border); border-radius:6px; background:var(--surface); color:var(--text); font-size:13px;">
              ${layoutOptions}
            </select>
          </div>
          <div style="display:flex; gap:6px;">
            <div style="flex:1;">
              <label style="font-size:11px; color:var(--text-muted); display:block; margin-bottom:3px;">Width (ft)</label>
              <input type="number" id="scanCorrectWidth" value="${room.width || 16}" min="6" max="40" style="width:100%; padding:6px 8px; border:1px solid var(--border); border-radius:6px; background:var(--surface); color:var(--text); font-size:13px; box-sizing:border-box;">
            </div>
            <div style="flex:1;">
              <label style="font-size:11px; color:var(--text-muted); display:block; margin-bottom:3px;">Depth (ft)</label>
              <input type="number" id="scanCorrectDepth" value="${room.depth || 12}" min="6" max="40" style="width:100%; padding:6px 8px; border:1px solid var(--border); border-radius:6px; background:var(--surface); color:var(--text); font-size:13px; box-sizing:border-box;">
            </div>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:8px; margin-bottom:14px;">
          <span style="font-size:12px; color:var(--text-muted);">Confidence:</span>
          <span style="background:${confidenceColor}22; color:${confidenceColor}; padding:2px 10px; border-radius:12px; font-size:12px; font-weight:600; text-transform:uppercase;">${confidence}</span>
          <span style="font-size:12px; color:var(--text-muted); margin-left:auto;">${totalElements} elements total</span>
        </div>

        <div style="background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:12px; margin-bottom:14px;">
          <canvas id="scanPreviewCanvas" width="400" height="300" style="width:100%; border-radius:6px; background:#1a1a2e;"></canvas>
        </div>

        <div style="background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:12px; margin-bottom:14px;">
          <div style="font-size:12px; font-weight:600; margin-bottom:8px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">Wall Breakdown</div>
          ${wallSummaryHtml}
          <div style="border-top:1px solid var(--border); margin-top:8px; padding-top:8px; font-size:13px;">
            <span style="color:var(--text-muted);">Appliances:</span> ${applianceHtml}
          </div>
        </div>

        <div id="scanCorrectElements" style="max-height:200px; overflow-y:auto; background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:8px; margin-bottom:14px;">
          <div style="font-size:12px; font-weight:600; margin-bottom:6px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">Elements (click to edit wall)</div>
          ${room.cabinets.map(function(c, idx) {
            var wallOpts = ['top','bottom','left','right','island','peninsula'].map(function(w) {
              return '<option value="' + w + '"' + (w === (c.wall || 'top') ? ' selected' : '') + '>' + w + '</option>';
            }).join('');
            return '<div style="display:flex; align-items:center; gap:6px; padding:3px 0; font-size:12px; border-bottom:1px solid var(--border);">' +
              '<span style="min-width:28px; font-weight:600; color:var(--primary);">' + c.number + '</span>' +
              '<span style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + c.name + '</span>' +
              '<span style="color:var(--text-muted); font-size:11px;">' + c.width + '"x' + c.depth + '"</span>' +
              '<select data-el-idx="' + idx + '" onchange="window._scanCorrectWall(this)" style="padding:2px 4px; border:1px solid var(--border); border-radius:4px; background:var(--surface); color:var(--text); font-size:11px;">' + wallOpts + '</select>' +
            '</div>';
          }).join('')}
        </div>

        <div style="display:flex; gap:8px;">
          <button onclick="window._rescanRoom()" style="flex:0 0 auto; padding:10px 16px; background:var(--surface); border:1px solid var(--border); border-radius:8px; color:var(--text); font-size:13px; cursor:pointer; font-weight:500;">Re-scan</button>
          <button onclick="window._importCorrectedRoom()" style="flex:1; padding:10px 16px; background:linear-gradient(135deg, #6366f1, #8b5cf6); border:none; border-radius:8px; color:white; font-size:15px; cursor:pointer; font-weight:600;">Import to Designer</button>
        </div>
      </div>
    `;

    // Draw the mini-map preview
    drawScanPreviewMap(room);

    // Listen for dimension/layout changes to redraw
    var widthInput = document.getElementById('scanCorrectWidth');
    var depthInput = document.getElementById('scanCorrectDepth');
    var layoutSelect = document.getElementById('scanCorrectLayout');
    if (widthInput) widthInput.oninput = function() { room.width = parseInt(this.value) || 16; drawScanPreviewMap(room); };
    if (depthInput) depthInput.oninput = function() { room.depth = parseInt(this.value) || 12; drawScanPreviewMap(room); };
    if (layoutSelect) layoutSelect.onchange = function() { room.layoutType = this.value; };
  }

  // Correct wall assignment for an element
  window._scanCorrectWall = function(sel) {
    var idx = parseInt(sel.dataset.elIdx);
    var rooms = window._parsedRooms || [];
    if (rooms[0] && rooms[0].cabinets[idx]) {
      rooms[0].cabinets[idx].wall = sel.value;
      drawScanPreviewMap(rooms[0]);
    }
  };

  // Re-scan with same images
  window._rescanRoom = function() {
    var images = window._lastScanImages || window._pdfImages || [];
    var userContext = window._lastScanContext || '';
    if (images.length >= 2) {
      analyzeMultiImages(images, userContext);
    } else if (images.length === 1) {
      analyzeWithAIVision(images[0].data, 'rescan', userContext);
    }
  };

  // Import the (potentially corrected) room data
  window._importCorrectedRoom = function() {
    var rooms = window._parsedRooms;
    if (!rooms || rooms.length === 0) return;
    // Apply corrected dimensions from inputs
    var w = parseInt(document.getElementById('scanCorrectWidth')?.value) || rooms[0].width;
    var d = parseInt(document.getElementById('scanCorrectDepth')?.value) || rooms[0].depth;
    var layout = document.getElementById('scanCorrectLayout')?.value || rooms[0].layoutType;
    rooms[0].width = w;
    rooms[0].depth = d;
    rooms[0].layoutType = layout;
    window.importParsedRoom(0);
  };

  // Draw mini-map on the preview canvas
  function drawScanPreviewMap(room) {
    var canvas = document.getElementById('scanPreviewCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var cw = canvas.width;
    var ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, cw, ch);

    var roomW = room.width || 16;
    var roomD = room.depth || 12;

    // Scale to fit canvas with padding
    var pad = 30;
    var scaleX = (cw - pad * 2) / roomW;
    var scaleY = (ch - pad * 2) / roomD;
    var scale = Math.min(scaleX, scaleY);
    var offX = (cw - roomW * scale) / 2;
    var offY = (ch - roomD * scale) / 2;

    // Draw room boundary
    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = 2;
    ctx.strokeRect(offX, offY, roomW * scale, roomD * scale);

    // Draw room dimensions
    ctx.fillStyle = '#718096';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(roomW + "'", offX + roomW * scale / 2, offY - 8);
    ctx.save();
    ctx.translate(offX - 12, offY + roomD * scale / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(roomD + "'", 0, 0);
    ctx.restore();

    // Wall labels
    ctx.fillStyle = '#4a556888';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TOP (back)', offX + roomW * scale / 2, offY + 14);
    ctx.fillText('BOTTOM (front)', offX + roomW * scale / 2, offY + roomD * scale - 6);
    ctx.save();
    ctx.translate(offX + 14, offY + roomD * scale / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('LEFT', 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(offX + roomW * scale - 6, offY + roomD * scale / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillText('RIGHT', 0, 0);
    ctx.restore();

    // Color map by type
    var typeColors = {
      'base-cabinet': '#6366f1',
      'sink-base': '#3b82f6',
      'drawer-base': '#8b5cf6',
      'wall-cabinet': '#22c55e',
      'tall-cabinet': '#f59e0b',
      'corner-cabinet': '#ec4899',
      'island': '#06b6d4',
      'peninsula': '#14b8a6',
      'refrigerator': '#a0a0b0',
      'fridge': '#a0a0b0',
      'range': '#ef4444',
      'slide-in-range': '#ef4444',
      'stove': '#ef4444',
      'dishwasher': '#64748b',
      'microwave': '#78716c',
      'hood': '#94a3b8',
      'oven': '#dc2626',
      'double-oven': '#dc2626',
      'wine-cooler': '#92400e',
      'cooktop': '#b91c1c'
    };

    var BASE_D = 2;
    var WALL_D = 1;

    // Track cursor positions per wall for sequential placement
    var cursors = { top: 0, bottom: 0, left: 0, right: 0 };

    room.cabinets.forEach(function(c) {
      var wall = c.wall || 'top';
      var wFt = (c.width || 36) / 12;
      var dFt = (c.depth || 24) / 12;
      var gap = (c.gapBefore || 0) / 12;
      var color = typeColors[c.type] || (c.isAppliance ? '#ef4444' : '#6366f1');
      var x, y, w, h;

      if (wall === 'top') {
        cursors.top += gap;
        x = offX + cursors.top * scale;
        y = offY;
        w = wFt * scale;
        h = dFt * scale;
        cursors.top += wFt;
      } else if (wall === 'bottom') {
        cursors.bottom += gap;
        x = offX + cursors.bottom * scale;
        y = offY + roomD * scale - dFt * scale;
        w = wFt * scale;
        h = dFt * scale;
        cursors.bottom += wFt;
      } else if (wall === 'left') {
        cursors.left += gap;
        x = offX;
        y = offY + cursors.left * scale;
        w = dFt * scale;
        h = wFt * scale;
        cursors.left += wFt;
      } else if (wall === 'right') {
        cursors.right += gap;
        x = offX + roomW * scale - dFt * scale;
        y = offY + cursors.right * scale;
        w = dFt * scale;
        h = wFt * scale;
        cursors.right += wFt;
      } else if (wall === 'island' || wall === 'peninsula') {
        // Center island/peninsula
        x = offX + (roomW / 2 - wFt / 2) * scale;
        y = offY + (roomD / 2 - dFt / 2) * scale;
        w = wFt * scale;
        h = dFt * scale;
      } else {
        return; // skip unknown walls
      }

      // Draw element rectangle
      ctx.fillStyle = color + 'aa';
      ctx.fillRect(x, y, Math.max(w, 2), Math.max(h, 2));
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, Math.max(w, 2), Math.max(h, 2));

      // Label if large enough
      if (w > 18 && h > 12) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(c.number || '', x + w / 2, y + h / 2 + 3);
      }
    });

    // Draw legend
    var legendItems = [
      { color: '#6366f1', label: 'Base' },
      { color: '#22c55e', label: 'Upper' },
      { color: '#f59e0b', label: 'Tall' },
      { color: '#ef4444', label: 'Appl.' },
      { color: '#06b6d4', label: 'Island' }
    ];
    var lx = 6;
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'left';
    legendItems.forEach(function(item) {
      ctx.fillStyle = item.color;
      ctx.fillRect(lx, ch - 14, 8, 8);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(item.label, lx + 11, ch - 6);
      lx += ctx.measureText(item.label).width + 20;
    });
  }

  // Load PDF.js library
  async function loadPDFJS() {
    if (!window.pdfjsLib) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      document.head.appendChild(script);
      await new Promise(resolve => script.onload = resolve);
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }

  // Handle multi-page PDF - show page selector
  async function handleMultiPagePDF(file) {
    await loadPDFJS();

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;

    // Store PDF for later use
    window._currentPDF = pdf;
    window._currentPDFName = file.name;

    if (numPages === 1) {
      // Single page - analyze directly
      const base64 = await renderPDFPage(pdf, 1, 2.0);
      return base64;
    }

    // Multi-page - show page thumbnails with "Analyze All" option
    document.getElementById('extractedRooms').innerHTML = `
      <div style="text-align:center; margin-bottom:20px;">
        <div style="display:inline-flex; align-items:center; justify-content:center; width:48px; height:48px; background:linear-gradient(135deg, var(--primary), #8b5cf6); border-radius:12px; margin-bottom:12px;">
          <svg width="24" height="24" fill="white" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>
        </div>
        <h4 style="margin:0 0 4px; font-size:17px;">Multi-Page PDF Detected</h4>
        <p style="margin:0; font-size:14px; color:var(--text-muted);">${numPages} pages found</p>
      </div>

      <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
        <div style="flex:1; height:1px; background:var(--border);"></div>
        <span style="font-size:11px; color:var(--text-muted);">SELECT PAGES TO ANALYZE</span>
        <div style="flex:1; height:1px; background:var(--border);"></div>
      </div>

      <div id="pdfPageThumbnails" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(100px, 1fr)); gap:10px; max-height:280px; overflow-y:auto; padding:4px;"></div>

      <div style="margin-top:16px; padding:16px; background:rgba(99,102,241,0.05); border-radius:12px; border:1px solid rgba(99,102,241,0.15);">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
          <svg width="16" height="16" fill="var(--primary)" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
          <span style="font-size:13px; font-weight:600; color:var(--text);">Help AI Understand Your Drawing</span>
          <span style="font-size:11px; color:var(--text-muted);">(Optional)</span>
        </div>
        <textarea id="userBlueprintContext" rows="3" style="width:100%; box-sizing:border-box; font-size:13px; padding:10px 12px; border:1px solid var(--border); border-radius:8px; background:var(--dark-elevated); color:var(--text); resize:vertical; font-family:inherit; white-space:pre-wrap; word-wrap:break-word;" placeholder="Examples: This is a 2020 Design cabinet schedule for a wet bar, or L-shaped kitchen with cabinets on top and left walls"></textarea>
        <p style="margin:8px 0 0; font-size:11px; color:var(--text-muted);">
          Describe the layout type, which walls have cabinets, or any special instructions.
        </p>
      </div>

      <button onclick="analyzeAllPDFPages()" class="btn-ai-primary" style="margin-top:16px; width:100%;">
        <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
        Analyze All ${numPages} Pages
      </button>
    `;

    const thumbnailContainer = document.getElementById('pdfPageThumbnails');

    // Prevent keyboard events from bubbling to canvas/tools
    const contextTextarea = document.getElementById('userBlueprintContext');
    if (contextTextarea) {
      contextTextarea.addEventListener('keydown', e => e.stopPropagation());
      contextTextarea.addEventListener('keyup', e => e.stopPropagation());
      contextTextarea.addEventListener('keypress', e => e.stopPropagation());
      contextTextarea.addEventListener('input', e => e.stopPropagation());
    }

    // Generate thumbnails for first 12 pages (or all if less)
    const pagesToShow = Math.min(numPages, 12);
    for (let i = 1; i <= pagesToShow; i++) {
      const thumbBase64 = await renderPDFPage(pdf, i, 0.35);
      const thumb = document.createElement('div');
      thumb.className = 'pdf-page-thumb';
      thumb.style.cssText = `
        cursor: pointer;
        border: 2px solid rgba(255,255,255,0.1);
        border-radius: 10px;
        overflow: hidden;
        transition: all 0.2s ease;
        background: var(--dark-elevated);
      `;
      thumb.innerHTML = `
        <div style="position:relative;">
          <img src="${thumbBase64}" style="width:100%; display:block;" alt="Page ${i}"/>
          <div style="position:absolute; top:6px; right:6px; background:rgba(0,0,0,0.7); padding:2px 6px; border-radius:4px; font-size:10px; font-weight:600;">
            ${i}
          </div>
        </div>
        <div style="padding:8px; text-align:center;">
          <span style="font-size:11px; color:var(--text-secondary);">Page ${i}</span>
        </div>
      `;
      thumb.onclick = () => analyzePDFPage(i);
      thumb.onmouseenter = () => {
        thumb.style.borderColor = 'var(--primary)';
        thumb.style.transform = 'translateY(-2px)';
        thumb.style.boxShadow = '0 4px 12px rgba(99,102,241,0.2)';
      };
      thumb.onmouseleave = () => {
        thumb.style.borderColor = 'rgba(255,255,255,0.1)';
        thumb.style.transform = 'translateY(0)';
        thumb.style.boxShadow = 'none';
      };
      thumbnailContainer.appendChild(thumb);
    }

    if (numPages > 12) {
      const moreMsg = document.createElement('div');
      moreMsg.style.cssText = 'grid-column:1/-1; text-align:center; padding:12px; font-size:12px; color:var(--text-muted); background:rgba(255,255,255,0.03); border-radius:8px; margin-top:4px;';
      moreMsg.innerHTML = `<strong>+${numPages - 12} more pages</strong> • Use "Analyze All" to process everything`;
      thumbnailContainer.appendChild(moreMsg);
    }

    return null; // Signal that we're showing page selector
  }

  // Analyze ALL PDF pages and combine results
  window.analyzeAllPDFPages = async function() {
    if (!window._currentPDF) return;

    const pdf = window._currentPDF;
    const numPages = pdf.numPages;
    const allResults = [];
    let processedCount = 0;
    let successCount = 0;
    let failedPages = [];

    document.getElementById('extractedRooms').innerHTML = `
      <div style="text-align:center; padding:24px;">
        <div class="ai-spinner"></div>
        <h4 style="margin:0 0 8px; font-size:16px;">Analyzing ${numPages} Pages</h4>
        <p id="batchProgress" class="ai-pulse" style="font-size:14px; color:var(--primary); margin:0 0 16px;">Preparing analysis...</p>

        <div class="ai-progress-bar">
          <div class="ai-progress-fill" id="progressFill" style="width:0%"></div>
        </div>

        <div class="ai-stats-grid" style="margin:20px 0;">
          <div class="ai-stat-card">
            <div class="ai-stat-value" id="statPages">0</div>
            <div class="ai-stat-label">Pages Done</div>
          </div>
          <div class="ai-stat-card">
            <div class="ai-stat-value" id="statRooms">0</div>
            <div class="ai-stat-label">Rooms Found</div>
          </div>
          <div class="ai-stat-card">
            <div class="ai-stat-value" id="statCabinets">0</div>
            <div class="ai-stat-label">Cabinets</div>
          </div>
        </div>

        <div class="page-results-list" id="pageResults"></div>
      </div>
    `;

    // Get user context once before processing all pages
    const userContext = document.getElementById('userBlueprintContext')?.value?.trim() || '';

    // Helper function to call API with retry logic for rate limiting
    async function callAPIWithRetry(base64, pageNum, maxRetries = 3) {
      let lastError = null;
      const accountType = getUserAccountType();
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const response = await fetch(`${AI_API_BASE}/api/ai/blueprint`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              image: base64,
              projectType: 'residential-kitchen',
              accountType: accountType,
              userContext: userContext
            })
          });

          if (response.status === 429) {
            // Rate limited - wait with exponential backoff
            const waitTime = Math.min(5000 * Math.pow(2, attempt - 1), 30000);
            console.log(`Page ${pageNum}: Rate limited (429), waiting ${waitTime/1000}s before retry ${attempt}/${maxRetries}`);
            document.getElementById('batchProgress').textContent = `Rate limited - waiting ${Math.round(waitTime/1000)}s... (Page ${pageNum})`;
            await new Promise(r => setTimeout(r, waitTime));
            continue;
          }

          if (!response.ok) {
            throw new Error(`API error ${response.status}`);
          }

          return await response.json();
        } catch (error) {
          lastError = error;
          if (attempt < maxRetries) {
            const waitTime = 2000 * attempt;
            console.log(`Page ${pageNum}: Error, retrying in ${waitTime/1000}s...`, error.message);
            await new Promise(r => setTimeout(r, waitTime));
          }
        }
      }
      throw lastError || new Error('Max retries exceeded');
    }

    // Process pages sequentially with longer delays to avoid rate limiting
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      try {
        // Update progress UI
        const progressPct = Math.round((pageNum / numPages) * 100);
        document.getElementById('batchProgress').textContent = `Analyzing page ${pageNum} of ${numPages}...`;
        document.getElementById('progressFill').style.width = `${progressPct}%`;
        document.getElementById('statPages').textContent = pageNum - 1;

        // Use higher resolution (2.0) for better cabinet schedule reading
        const base64 = await renderPDFPage(pdf, pageNum, 2.0);

        // Call API with retry logic
        const data = await callAPIWithRetry(base64, pageNum);

        if (data.rooms && data.rooms.length > 0) {
          // Tag rooms with page number for reference
          data.rooms.forEach(room => {
            room.sourcePage = pageNum;
            // Only add page number to name if room name is generic
            if (!room.name || room.name === 'Unknown Room' || room.name === 'Kitchen') {
              room.name = `Room (Page ${pageNum})`;
            }
          });
          allResults.push(data);
          successCount++;

          // Update live stats
          const totalRooms = allResults.reduce((s, r) => s + (r.rooms?.length || 0), 0);
          const totalCabs = allResults.reduce((s, r) => s + r.rooms.reduce((rs, rm) => rs + (rm.cabinets?.length || 0), 0), 0);
          document.getElementById('statRooms').textContent = totalRooms;
          document.getElementById('statCabinets').textContent = totalCabs;

          // Show page result
          const pageResultsEl = document.getElementById('pageResults');
          const roomNames = data.rooms.map(r => r.name).join(', ');
          const cabCount = data.rooms.reduce((s, rm) => s + (rm.cabinets?.length || 0), 0);
          pageResultsEl.innerHTML += `<div class="page-result success"><span class="page-result-icon">✓</span> Page ${pageNum}: ${roomNames} (${cabCount} cabs)</div>`;
          pageResultsEl.scrollTop = pageResultsEl.scrollHeight;
        } else if (data.mode === 'demo') {
          // Demo mode - API key not configured
          failedPages.push({ page: pageNum, reason: 'Demo mode - no API key' });
          document.getElementById('pageResults').innerHTML += `<div class="page-result warning"><span class="page-result-icon">○</span> Page ${pageNum}: Demo mode</div>`;
        } else {
          failedPages.push({ page: pageNum, reason: 'No cabinets detected' });
          document.getElementById('pageResults').innerHTML += `<div class="page-result warning"><span class="page-result-icon">○</span> Page ${pageNum}: No cabinet data</div>`;
        }

        processedCount++;
        document.getElementById('statPages').textContent = processedCount;
      } catch (error) {
        console.error(`Error analyzing page ${pageNum}:`, error);
        failedPages.push({ page: pageNum, reason: error.message });
        document.getElementById('pageResults').innerHTML += `<div class="page-result error"><span class="page-result-icon">✗</span> Page ${pageNum}: ${error.message}</div>`;
        processedCount++;
      }

      // Longer delay between pages to avoid rate limiting (2.5 seconds)
      if (pageNum < numPages) {
        await new Promise(r => setTimeout(r, 2500));
      }
    }

    // Combine and deduplicate results
    if (allResults.length > 0) {
      const allRooms = allResults.flatMap(r => r.rooms || []);

      // Smart deduplication: merge rooms with similar names
      const deduplicatedRooms = deduplicateRooms(allRooms);

      const combinedData = {
        rooms: deduplicatedRooms,
        totalArea: allResults.reduce((sum, r) => sum + (r.totalArea || 0), 0),
        countertopSqft: allResults.reduce((sum, r) => sum + (r.countertopSqft || 0), 0),
        flooringSqft: allResults.reduce((sum, r) => sum + (r.flooringSqft || 0), 0),
        tileSqft: allResults.reduce((sum, r) => sum + (r.tileSqft || 0), 0),
        mode: 'ai',
        pagesAnalyzed: processedCount,
        successfulPages: successCount,
        failedPages: failedPages,
        totalPages: numPages
      };

      console.log('Combined AI Analysis:', combinedData);
      convertAIResultsToRooms(combinedData, `${window._currentPDFName} (${successCount}/${numPages} pages)`);
    } else {
      showPartialResultsWithManualEntry({
        pagesAnalyzed: processedCount,
        failedPages: failedPages
      }, window._currentPDFName);
    }
  };

  // Deduplicate rooms by merging similar room names
  function deduplicateRooms(rooms) {
    const roomMap = new Map();

    rooms.forEach(room => {
      // Normalize room name for comparison (remove page numbers, trim, lowercase)
      const baseName = (room.name || 'Unknown')
        .replace(/\s*\(Page \d+\)\s*/gi, '')
        .replace(/\s*-\s*Part\s*\d+/gi, '')
        .replace(/\s*Wall\s*\d+/gi, '')
        .trim();

      const key = baseName.toLowerCase();

      if (roomMap.has(key)) {
        // Merge cabinets from duplicate room
        const existing = roomMap.get(key);

        // Add cabinets that don't already exist (by label/number)
        const existingLabels = new Set(existing.cabinets.map(c => c.label || c.number));

        (room.cabinets || []).forEach(cab => {
          const cabLabel = cab.label || cab.number;
          if (!existingLabels.has(cabLabel)) {
            existing.cabinets.push(cab);
            existingLabels.add(cabLabel);
          }
        });

        // Update room dimensions if the new one has larger values
        if (room.widthFt && room.widthFt > (existing.widthFt || 0)) {
          existing.widthFt = room.widthFt;
        }
        if (room.depthFt && room.depthFt > (existing.depthFt || 0)) {
          existing.depthFt = room.depthFt;
        }

        // Track source pages
        existing.sourcePages = existing.sourcePages || [existing.sourcePage];
        if (room.sourcePage && !existing.sourcePages.includes(room.sourcePage)) {
          existing.sourcePages.push(room.sourcePage);
        }
      } else {
        // New room
        room.sourcePages = [room.sourcePage];
        roomMap.set(key, room);
      }
    });

    // Convert map back to array and update names
    return Array.from(roomMap.values()).map(room => {
      // If room was merged from multiple pages, note it
      if (room.sourcePages && room.sourcePages.length > 1) {
        room.name = `${room.name} (${room.sourcePages.length} views merged)`;
      }
      return room;
    });
  }

  // Analyze specific PDF page
  window.analyzePDFPage = async function(pageNum) {
    if (!window._currentPDF) return;

    document.getElementById('extractedRooms').innerHTML = `
      <div style="text-align:center; padding:20px;">
        <div class="spinner" style="margin:0 auto 16px;"></div>
        <p>Analyzing page ${pageNum} with AI Vision...</p>
        <p style="font-size:12px; opacity:0.7;">This may take 15-30 seconds</p>
      </div>
    `;

    try {
      const base64 = await renderPDFPage(window._currentPDF, pageNum, 2.0);
      const userContext = document.getElementById('userBlueprintContext')?.value?.trim() || '';
      await analyzeWithAIVision(base64, `${window._currentPDFName} (Page ${pageNum})`, userContext);
    } catch (error) {
      console.error('PDF page analysis failed:', error);
      showManualEntryFallback(window._currentPDFName, error.message);
    }
  };

  // Render a PDF page to base64 image
  async function renderPDFPage(pdf, pageNum, scale) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    await page.render({
      canvasContext: ctx,
      viewport: viewport
    }).promise;

    return canvas.toDataURL('image/png');
  }

  // Convert PDF first page to base64 image using PDF.js (legacy single-page)
  async function convertPDFToImage(file) {
    const result = await handleMultiPagePDF(file);
    return result; // null if showing page selector, base64 if single page
  }

  // Analyze blueprint with AI Vision API (uses production endpoint)
  const AI_API_BASE = 'https://surprise-granite-email-api.onrender.com';

  // Get user's account type for rate limiting
  function getUserAccountType() {
    try {
      // Check window.sgAuth first (SG Auth system)
      if (window.sgAuth?.profile?.account_type) {
        return window.sgAuth.profile.account_type;
      }
      // Fallback to stored profile
      const stored = localStorage.getItem('sg_user_profile');
      if (stored) {
        const profile = JSON.parse(stored);
        return profile.account_type || 'free';
      }
    } catch (e) {}
    return 'free';
  }

  async function analyzeWithAIVision(imageBase64, fileName, userContext = '') {
    try {
      const accountType = getUserAccountType();
      const response = await fetch(`${AI_API_BASE}/api/ai/blueprint`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image: imageBase64,
          projectType: 'residential-kitchen',
          accountType: accountType,
          userContext: userContext
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      console.log('AI Blueprint Analysis:', data);

      if (data.rooms && data.rooms.length > 0) {
        // Convert AI results to room format
        convertAIResultsToRooms(data, fileName);
      } else {
        showManualEntryFallback(fileName, 'No rooms detected in the image');
      }

    } catch (error) {
      console.error('AI Vision API error:', error);
      showManualEntryFallback(fileName, error.message);
    }
  }

  // Convert AI analysis results to room/cabinet format with wall positioning
  function convertAIResultsToRooms(aiData, fileName) {
    const parsedRooms = [];

    aiData.rooms.forEach((room, index) => {
      // Use new detailed format if available
      const roomWidth = room.widthFt || (room.sqft ? Math.ceil(Math.sqrt(room.sqft) * 1.2) : 16);
      const roomDepth = room.depthFt || (room.sqft ? Math.ceil(Math.sqrt(room.sqft) / 1.2) : 12);

      const roomData = {
        name: room.name || `Room ${index + 1}`,
        fullName: room.name || `Room ${index + 1} from ${fileName}`,
        cabinets: [],
        width: roomWidth,
        depth: roomDepth,
        layoutType: room.layoutType || 'unknown',
        island: room.island || null,
        appliances: room.appliances || []
      };

      // NEW FORMAT: Individual cabinets with wall positions
      if (room.cabinets && Array.isArray(room.cabinets) && room.cabinets.length > 0) {
        room.cabinets.forEach((cab, cabIndex) => {
          // Validate and sanitize dimensions
          const validatedCab = validateCabinetDimensions(cab, cabIndex);

          roomData.cabinets.push({
            number: cab.label || cab.number || String(cabIndex + 1),
            name: formatCabinetType(cab.type),
            type: cab.type || 'base-cabinet',
            width: validatedCab.width,
            depth: validatedCab.depth,
            height: validatedCab.height,
            wall: inferWallPosition(cab, cabIndex, room.cabinets.length),
            orderIndex: cab.orderIndex || cabIndex,
            gapBefore: cab.gapBefore || 0,
            doorStyle: cab.doorStyle || null,
            finish: cab.finish || null,
            confidence: cab.confidence || 'medium'
          });
        });

        // Add appliances as elements too
        if (room.appliances && Array.isArray(room.appliances)) {
          room.appliances.forEach((app, appIndex) => {
            const appDefaults = {
              'refrigerator': { w: 36, d: 30, h: 70 },
              'range': { w: 30, d: 26, h: 36 },
              'slide-in-range': { w: 30, d: 26, h: 36 },
              'stove': { w: 30, d: 26, h: 36 },
              'cooktop': { w: 36, d: 22, h: 4 },
              'dishwasher': { w: 24, d: 24, h: 34 },
              'microwave': { w: 30, d: 16, h: 18 },
              'hood': { w: 30, d: 20, h: 8 },
              'oven': { w: 30, d: 24, h: 52 },
              'double-oven': { w: 30, d: 24, h: 52 },
              'wine-cooler': { w: 24, d: 24, h: 34 }
            };
            const def = appDefaults[app.type] || { w: 30, d: 24, h: 34 };
            roomData.cabinets.push({
              number: `A${appIndex + 1}`,
              name: formatApplianceType(app.type),
              type: app.type || 'appliance',
              width: app.width || def.w,
              depth: app.depth || def.d,
              height: app.height || def.h,
              wall: app.wall || 'top',
              isAppliance: true,
              orderIndex: app.orderIndex || (100 + appIndex),
              gapBefore: app.gapBefore || 0
            });
          });
        }

        // Add island if present (from separate island field)
        if (room.island && (room.island.widthIn || room.island.width)) {
          roomData.cabinets.push({
            number: 'ISL',
            name: 'Island',
            type: 'island',
            width: room.island.widthIn || room.island.width || 48,
            depth: room.island.depthIn || room.island.depth || 36,
            height: 36,
            wall: 'island',
            hasSink: room.island.hasSink || false
          });
        }
      }
      // LEGACY FORMAT: Linear feet conversion
      else if (room.materials) {
        const mats = room.materials;

        if (mats.cabinets) {
          const upperLF = mats.cabinets.upperLF || 0;
          const lowerLF = mats.cabinets.lowerLF || 0;

          const numUpper = Math.ceil(upperLF / 3);
          const numLower = Math.ceil(lowerLF / 3);

          for (let i = 0; i < numLower; i++) {
            roomData.cabinets.push({
              number: String(roomData.cabinets.length + 1),
              name: 'Base Cabinet',
              type: 'base-cabinet',
              width: 36,
              depth: 24,
              height: 34,
              wall: 'top'
            });
          }

          for (let i = 0; i < numUpper; i++) {
            roomData.cabinets.push({
              number: String(roomData.cabinets.length + 1),
              name: 'Wall Cabinet',
              type: 'wall-cabinet',
              width: 36,
              depth: 12,
              height: 30,
              wall: 'top'
            });
          }
        }

        if (mats.countertops && mats.countertops.sqft > 30) {
          roomData.cabinets.push({
            number: 'ISL',
            name: 'Island',
            type: 'island',
            width: 48,
            depth: 36,
            height: 36,
            wall: 'island'
          });
        }
      }
      // MINIMAL FORMAT: Just "Cabinet" mentioned
      else if (room.material && room.material.includes('Cabinet')) {
        const estimatedCabinets = Math.max(2, Math.ceil((room.sqft || 100) / 40));
        for (let i = 0; i < estimatedCabinets; i++) {
          const isBase = i % 2 === 0;
          roomData.cabinets.push({
            number: String(roomData.cabinets.length + 1),
            name: isBase ? 'Base Cabinet' : 'Wall Cabinet',
            type: isBase ? 'base-cabinet' : 'wall-cabinet',
            width: 36,
            depth: isBase ? 24 : 12,
            height: isBase ? 34 : 30,
            wall: 'top'
          });
        }
      }

      // Only add rooms that have cabinets
      if (roomData.cabinets.length > 0) {
        parsedRooms.push(roomData);
      }
    });

    // Store raw AI data for reference
    window._aiAnalysisData = aiData;

    if (parsedRooms.length > 0) {
      // Store for import functions
      window._parsedRooms = parsedRooms;

      // Get confidence and page type from AI response
      const confidence = aiData.confidence || 'medium';
      const pageType = aiData.pageType || 'unknown';
      const confidenceColor = confidence === 'high' ? '#22c55e' : confidence === 'medium' ? '#f9cb00' : '#ef4444';
      const totalCabinets = parsedRooms.reduce((s,r) => s + r.cabinets.length, 0);

      // Check for potential issues
      const warnings = [];
      parsedRooms.forEach(room => {
        const defaultCount = room.cabinets.filter(c => c.width === 36 && c.depth === 24).length;
        if (defaultCount > room.cabinets.length * 0.5) {
          warnings.push(`${room.name}: Many cabinets have default dimensions - verify accuracy`);
        }
      });

      // Show detailed results with enhanced UI
      document.getElementById('extractedRooms').innerHTML = `
        <div style="text-align:center; margin-bottom:20px;">
          <div style="display:inline-flex; align-items:center; justify-content:center; width:56px; height:56px; background:linear-gradient(135deg, #22c55e, #16a34a); border-radius:50%; margin-bottom:12px;">
            <svg width="28" height="28" fill="white" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </div>
          <h3 style="margin:0 0 4px; font-size:20px;">Analysis Complete</h3>
          <p style="margin:0; color:var(--text-muted); font-size:14px;">Found ${totalCabinets} cabinets across ${parsedRooms.length} room${parsedRooms.length > 1 ? 's' : ''}</p>
        </div>

        <div class="ai-stats-grid" style="margin-bottom:20px;">
          <div class="ai-stat-card">
            <div class="ai-stat-value">${parsedRooms.length}</div>
            <div class="ai-stat-label">Rooms</div>
          </div>
          <div class="ai-stat-card">
            <div class="ai-stat-value">${totalCabinets}</div>
            <div class="ai-stat-label">Cabinets</div>
          </div>
          <div class="ai-stat-card">
            <div style="display:flex; justify-content:center;">
              <span class="confidence-badge ${confidence}">${confidence}</span>
            </div>
            <div class="ai-stat-label">Confidence</div>
          </div>
        </div>

        ${warnings.length > 0 ? `
          <div style="background:rgba(251,191,36,0.08); border:1px solid rgba(251,191,36,0.25); border-radius:10px; padding:14px; margin-bottom:16px;">
            <div style="display:flex; align-items:start; gap:10px;">
              <span style="font-size:18px;">⚠️</span>
              <div style="font-size:13px; color:#f59e0b;">
                <strong style="display:block; margin-bottom:4px;">Review Recommended</strong>
                ${warnings.map(w => `<div style="opacity:0.9; margin-top:2px;">• ${w}</div>`).join('')}
              </div>
            </div>
          </div>
        ` : ''}

        ${parsedRooms.map((room, i) => `
          <div class="room-preview-card">
            <div class="room-preview-header">
              <h4>
                <span style="opacity:0.5;">#${i + 1}</span>
                ${room.name}
                ${room.sourcePages?.length > 1 ? '<span class="room-badge">merged</span>' : ''}
              </h4>
              <span style="font-size:12px; color:var(--text-muted);">${room.width || '?'}' × ${room.depth || '?'}'</span>
            </div>
            <div class="room-preview-body">
              ${room.cabinets.slice(0, 8).map(c => `
                <div class="cabinet-card">
                  <div class="cab-header">
                    <div style="display:flex; align-items:center; gap:10px;">
                      <span class="cab-number">${c.number}</span>
                      <span class="cab-type">${c.name}</span>
                    </div>
                    <span class="cab-wall">${c.wall || 'top'}</span>
                  </div>
                  <div class="cab-dims">${c.width}" W × ${c.depth}" D × ${c.height}" H</div>
                </div>
              `).join('')}
              ${room.cabinets.length > 8 ? `
                <div style="text-align:center; padding:8px; color:var(--text-muted); font-size:12px;">
                  + ${room.cabinets.length - 8} more cabinets
                </div>
              ` : ''}
            </div>
            <div class="room-preview-footer">
              <button onclick="importParsedRoom(${i})" class="btn-ai-secondary" style="flex:1;">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                Import Room
              </button>
              <button onclick="previewRoom(${i})" class="btn-ai-secondary" style="flex:0;">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
              </button>
            </div>
          </div>
        `).join('')}

        <button onclick="importAllParsedRooms()" class="btn-ai-primary" style="margin-top:16px;">
          <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          Import All ${totalCabinets} Cabinets
        </button>

        <div style="display:flex; gap:8px; margin-top:10px;">
          <button onclick="showManualSupplementForm()" class="btn-ai-secondary">
            <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            Add Details
          </button>
          <button onclick="showRawAIData()" class="btn-ai-secondary">
            <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>
            View JSON
          </button>
        </div>
      `;
    } else {
      // Show partial data if available, with manual entry option
      showPartialResultsWithManualEntry(aiData, fileName);
    }
  }

  // Preview room in a popup
  window.previewRoom = function(index) {
    const room = window._parsedRooms?.[index];
    if (!room) return;

    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.85); z-index:10000; display:flex; align-items:center; justify-content:center; padding:20px;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    modal.innerHTML = `
      <div style="background:var(--dark-surface); border-radius:16px; width:100%; max-width:700px; max-height:85vh; overflow:hidden; display:flex; flex-direction:column;">
        <div style="padding:16px 20px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
          <h3 style="margin:0; font-size:18px;">${room.name}</h3>
          <button onclick="this.closest('div[style*=fixed]').remove()" style="background:none; border:none; color:var(--text-muted); font-size:24px; cursor:pointer;">&times;</button>
        </div>
        <div style="padding:20px; overflow-y:auto; flex:1;">
          <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:12px; margin-bottom:20px;">
            <div class="ai-stat-card">
              <div class="ai-stat-value">${room.cabinets.length}</div>
              <div class="ai-stat-label">Cabinets</div>
            </div>
            <div class="ai-stat-card">
              <div class="ai-stat-value">${room.width || '?'}' × ${room.depth || '?'}'</div>
              <div class="ai-stat-label">Dimensions</div>
            </div>
          </div>

          <h4 style="margin:0 0 12px; font-size:14px; color:var(--text-muted);">All Cabinets</h4>
          <div style="display:grid; gap:8px;">
            ${room.cabinets.map(c => `
              <div class="cabinet-card">
                <div class="cab-header">
                  <div style="display:flex; align-items:center; gap:10px;">
                    <span class="cab-number">${c.number}</span>
                    <span class="cab-type">${c.name}</span>
                  </div>
                  <span class="cab-wall">${c.wall || 'top'}</span>
                </div>
                <div class="cab-dims">${c.width}" W × ${c.depth}" D × ${c.height}" H</div>
              </div>
            `).join('')}
          </div>
        </div>
        <div style="padding:16px 20px; border-top:1px solid var(--border);">
          <button onclick="importParsedRoom(${index}); this.closest('div[style*=fixed]').remove();" class="btn-ai-primary">
            <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            Import This Room
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  };

  // Debug: Show raw AI response in a modal
  window.showRawAIData = function() {
    const aiData = window._aiAnalysisData;
    if (!aiData) {
      alert('No AI data available');
      return;
    }

    console.log('Raw AI Analysis Data:', aiData);

    // Create modal with formatted JSON
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:10000; display:flex; align-items:center; justify-content:center; padding:20px;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    const content = document.createElement('div');
    content.style.cssText = 'background:#1a1a2e; border-radius:12px; max-width:800px; max-height:80vh; overflow:auto; padding:20px; color:white;';
    content.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h3 style="margin:0;">Raw AI Response</h3>
        <button onclick="this.closest('div[style*=fixed]').remove()" style="background:none; border:none; color:white; font-size:24px; cursor:pointer;">&times;</button>
      </div>
      <div style="margin-bottom:12px;">
        <button onclick="navigator.clipboard.writeText(JSON.stringify(window._aiAnalysisData, null, 2)); this.textContent='Copied!'"
          style="padding:8px 16px; background:#22c55e; border:none; border-radius:6px; color:white; cursor:pointer;">
          Copy JSON
        </button>
      </div>
      <pre style="background:#0d0d1a; padding:16px; border-radius:8px; overflow:auto; font-size:12px; line-height:1.4; white-space:pre-wrap; word-wrap:break-word;">${JSON.stringify(aiData, null, 2)}</pre>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);
  };

  // Show partial AI results with option to add missing data manually
  function showPartialResultsWithManualEntry(aiData, fileName) {
    const hasAnyData = aiData && (aiData.totalArea > 0 || aiData.countertopSqft > 0 || aiData.rooms?.length > 0);

    document.getElementById('extractedRooms').innerHTML = `
      <div style="background:rgba(251,191,36,0.1); border:1px solid rgba(251,191,36,0.3); border-radius:8px; padding:16px; margin-bottom:16px;">
        <h4 style="color:#f59e0b; margin:0 0 8px;">Partial Analysis</h4>
        <p style="margin:0; font-size:13px; opacity:0.8;">
          ${hasAnyData ? 'Some data detected but no cabinet details found.' : 'Could not extract cabinet data from this image.'}
        </p>
      </div>

      ${hasAnyData ? `
        <div style="background:rgba(255,255,255,0.05); border-radius:8px; padding:12px; margin-bottom:16px;">
          <h5 style="margin:0 0 8px;">Detected Information:</h5>
          <ul style="margin:0; padding-left:20px; font-size:13px;">
            ${aiData.totalArea ? `<li>Total Area: ${aiData.totalArea} sqft</li>` : ''}
            ${aiData.countertopSqft ? `<li>Countertop: ${aiData.countertopSqft} sqft</li>` : ''}
            ${aiData.flooringSqft ? `<li>Flooring: ${aiData.flooringSqft} sqft</li>` : ''}
            ${aiData.tileSqft ? `<li>Tile: ${aiData.tileSqft} sqft</li>` : ''}
            ${aiData.rooms?.length ? `<li>Rooms identified: ${aiData.rooms.map(r => r.name).join(', ')}</li>` : ''}
          </ul>
        </div>
      ` : ''}

      <p style="font-size:14px; margin-bottom:12px;">Enter cabinet details manually:</p>

      <div style="margin-bottom:12px;">
        <label style="display:block; font-size:13px; margin-bottom:4px;">Room Name:</label>
        <input type="text" id="manualRoomName" value="${aiData?.rooms?.[0]?.name || 'Kitchen'}"
          style="width:100%; padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.2); background:rgba(255,255,255,0.1); color:white;">
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
        <div>
          <label style="display:block; font-size:13px; margin-bottom:4px;">Room Width (ft):</label>
          <input type="number" id="manualRoomWidth" value="${aiData?.totalArea ? Math.ceil(Math.sqrt(aiData.totalArea) * 1.2) : 16}"
            style="width:100%; padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.2); background:rgba(255,255,255,0.1); color:white;">
        </div>
        <div>
          <label style="display:block; font-size:13px; margin-bottom:4px;">Room Depth (ft):</label>
          <input type="number" id="manualRoomDepth" value="${aiData?.totalArea ? Math.ceil(Math.sqrt(aiData.totalArea) / 1.2) : 12}"
            style="width:100%; padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.2); background:rgba(255,255,255,0.1); color:white;">
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
        <div>
          <label style="display:block; font-size:13px; margin-bottom:4px;">Base Cabinets (qty):</label>
          <input type="number" id="manualBaseCabinets" value="4" min="0"
            style="width:100%; padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.2); background:rgba(255,255,255,0.1); color:white;">
        </div>
        <div>
          <label style="display:block; font-size:13px; margin-bottom:4px;">Upper Cabinets (qty):</label>
          <input type="number" id="manualUpperCabinets" value="4" min="0"
            style="width:100%; padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.2); background:rgba(255,255,255,0.1); color:white;">
        </div>
      </div>

      <div style="margin-bottom:12px;">
        <label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer;">
          <input type="checkbox" id="manualHasIsland"> Include Island
        </label>
      </div>

      <button onclick="createRoomFromManualEntry()" class="btn-primary" style="width:100%;">Create Room</button>

      <div style="margin-top:16px; padding-top:16px; border-top:1px solid rgba(255,255,255,0.1);">
        <p style="font-size:12px; opacity:0.7; margin-bottom:8px;">Or load sample data:</p>
        <button onclick="loadStateFarmStadiumData()" class="btn-secondary" style="width:100%;">Load State Farm Stadium Data</button>
      </div>
    `;
  }

  // Create room from manual entry form
  window.createRoomFromManualEntry = function() {
    const roomName = document.getElementById('manualRoomName')?.value || 'Kitchen';
    const roomWidth = parseInt(document.getElementById('manualRoomWidth')?.value) || 16;
    const roomDepth = parseInt(document.getElementById('manualRoomDepth')?.value) || 12;
    const baseCabinets = parseInt(document.getElementById('manualBaseCabinets')?.value) || 0;
    const upperCabinets = parseInt(document.getElementById('manualUpperCabinets')?.value) || 0;
    const hasIsland = document.getElementById('manualHasIsland')?.checked || false;

    const cabinets = [];

    for (let i = 0; i < baseCabinets; i++) {
      cabinets.push({ number: String(cabinets.length + 1), name: 'Base Cabinet', width: 36, depth: 24, height: 32 });
    }
    for (let i = 0; i < upperCabinets; i++) {
      cabinets.push({ number: String(cabinets.length + 1), name: 'Upper Cabinet', width: 36, depth: 12, height: 30 });
    }
    if (hasIsland) {
      cabinets.push({ number: String(cabinets.length + 1), name: 'Island', width: 48, depth: 36, height: 36 });
    }

    if (cabinets.length === 0) {
      if (typeof showToast === 'function') showToast('Add at least one cabinet', 'warning');
      return;
    }

    window._parsedRooms = [{
      name: roomName,
      fullName: roomName,
      width: roomWidth,
      depth: roomDepth,
      cabinets: cabinets
    }];

    window.importAllParsedRooms();
  };

  // Show manual supplement form for adding to existing parsed rooms
  window.showManualSupplementForm = function() {
    const container = document.getElementById('extractedRooms');
    const existingContent = container.innerHTML;

    container.innerHTML = `
      <div style="margin-bottom:16px;">
        <button onclick="document.getElementById('extractedRooms').innerHTML = window._savedExtractedContent" class="btn-small" style="margin-bottom:12px;">← Back to Results</button>

        <h4 style="margin:0 0 12px;">Add Additional Room/Cabinets</h4>

        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:13px; margin-bottom:4px;">Room Name:</label>
          <input type="text" id="supplementRoomName" value="Additional Room"
            style="width:100%; padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.2); background:rgba(255,255,255,0.1); color:white;">
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
          <div>
            <label style="display:block; font-size:13px; margin-bottom:4px;">Width (ft):</label>
            <input type="number" id="supplementRoomWidth" value="14"
              style="width:100%; padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.2); background:rgba(255,255,255,0.1); color:white;">
          </div>
          <div>
            <label style="display:block; font-size:13px; margin-bottom:4px;">Depth (ft):</label>
            <input type="number" id="supplementRoomDepth" value="10"
              style="width:100%; padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.2); background:rgba(255,255,255,0.1); color:white;">
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
          <div>
            <label style="display:block; font-size:13px; margin-bottom:4px;">Base Cabinets:</label>
            <input type="number" id="supplementBaseCabinets" value="3" min="0"
              style="width:100%; padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.2); background:rgba(255,255,255,0.1); color:white;">
          </div>
          <div>
            <label style="display:block; font-size:13px; margin-bottom:4px;">Upper Cabinets:</label>
            <input type="number" id="supplementUpperCabinets" value="3" min="0"
              style="width:100%; padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.2); background:rgba(255,255,255,0.1); color:white;">
          </div>
        </div>

        <button onclick="addSupplementRoom()" class="btn-primary" style="width:100%;">Add Room to Import List</button>
      </div>
    `;

    window._savedExtractedContent = existingContent;
  };

  // Add supplemental room to parsed rooms
  window.addSupplementRoom = function() {
    const roomName = document.getElementById('supplementRoomName')?.value || 'Additional Room';
    const roomWidth = parseInt(document.getElementById('supplementRoomWidth')?.value) || 14;
    const roomDepth = parseInt(document.getElementById('supplementRoomDepth')?.value) || 10;
    const baseCabinets = parseInt(document.getElementById('supplementBaseCabinets')?.value) || 0;
    const upperCabinets = parseInt(document.getElementById('supplementUpperCabinets')?.value) || 0;

    const cabinets = [];
    for (let i = 0; i < baseCabinets; i++) {
      cabinets.push({ number: String(cabinets.length + 1), name: 'Base Cabinet', width: 36, depth: 24, height: 32 });
    }
    for (let i = 0; i < upperCabinets; i++) {
      cabinets.push({ number: String(cabinets.length + 1), name: 'Upper Cabinet', width: 36, depth: 12, height: 30 });
    }

    if (cabinets.length === 0) {
      if (typeof showToast === 'function') showToast('Add at least one cabinet', 'warning');
      return;
    }

    if (!window._parsedRooms) window._parsedRooms = [];

    window._parsedRooms.push({
      name: roomName,
      fullName: roomName,
      width: roomWidth,
      depth: roomDepth,
      cabinets: cabinets
    });

    if (typeof showToast === 'function') showToast(`Added ${roomName} with ${cabinets.length} cabinets`, 'success');

    // Go back and show updated results
    document.getElementById('extractedRooms').innerHTML = window._savedExtractedContent;

    // Update the count in the header
    const header = document.querySelector('#extractedRooms h4');
    if (header) {
      header.nextElementSibling.textContent = `Detected ${window._parsedRooms.length} room(s) with ${window._parsedRooms.reduce((s,r) => s + r.cabinets.length, 0)} cabinet(s)`;
    }
  };

  // Fallback to manual entry (legacy)
  function showManualEntryFallback(fileName, errorMsg) {
    showPartialResultsWithManualEntry(window._aiAnalysisData || {}, fileName);
  }

  window.loadStateFarmStadiumData = function() {
    // Clear any existing commercial project
    commercialProject = null;
    localStorage.removeItem('sg_commercial_project');

    // Map cabinet names to proper element types
    function getElementType(cabinetName) {
      const name = cabinetName.toLowerCase();
      if (name.includes('tv niche')) return 'tv-niche';
      if (name.includes('microwave')) return 'microwave';
      if (name.includes('upper')) return 'wall-cabinet';
      if (name.includes('sink')) return 'sink-base';
      if (name.includes('drawer')) return 'drawer-base';
      if (name.includes('tall') || name.includes('pantry')) return 'tall-cabinet';
      if (name.includes('filler')) return 'base-cabinet'; // Thin filler piece
      return 'base-cabinet';
    }

    // Get color based on element type
    function getElementColor(type) {
      const colors = {
        'base-cabinet': '#8B7355',
        'wall-cabinet': '#A0522D',
        'tall-cabinet': '#6B4423',
        'sink-base': '#4682B4',
        'drawer-base': '#9370DB',
        'tv-niche': '#2F4F4F',
        'microwave': '#708090'
      };
      return colors[type] || '#8B7355';
    }

    // State Farm Stadium cabinet data with wall layout info
    const stateFarmRooms = [
      {
        name: 'Teammate Lounge - Wall 1',
        roomType: 'other',
        width: 22, // Room width in feet
        depth: 12,
        walls: [
          {
            position: 'top', // Cabinets along top wall
            cabinets: [
              { number: '1', name: 'Base', width: 18, depth: 30.5, height: 32 },
              { number: '2', name: 'Base', width: 18, depth: 30.5, height: 32 },
              { number: '3', name: 'Base', width: 36, depth: 30.5, height: 32 },
              { number: '4', name: 'Base', width: 36, depth: 30.5, height: 32 },
              { number: '5', name: 'Base', width: 36, depth: 30.5, height: 32 },
              { number: '6', name: 'Base', width: 36, depth: 30.5, height: 32 },
              { number: '7', name: 'Base', width: 36, depth: 30.5, height: 32 }
            ]
          },
          {
            position: 'right', // TV niches on right wall
            cabinets: [
              { number: '8', name: 'TV Niche', width: 59, depth: 0.75, height: 36 },
              { number: '9', name: 'TV Niche', width: 59, depth: 0.75, height: 36 }
            ]
          }
        ]
      },
      {
        name: 'Wet Lounge - Wall 2',
        roomType: 'other',
        width: 18,
        depth: 12,
        walls: [
          {
            position: 'top',
            cabinets: [
              { number: '42', name: 'Base', width: 36.75, depth: 24, height: 32 },
              { number: '43', name: 'Base', width: 36, depth: 24, height: 32 },
              { number: '44', name: 'Filler', width: 0.75, depth: 24.875, height: 32 },
              { number: '50', name: 'Base', width: 36.75, depth: 24, height: 32 },
              { number: '52', name: 'Filler', width: 0.75, depth: 24.875, height: 32 }
            ]
          },
          {
            position: 'top-upper', // Upper cabinets above base
            yOffset: 3, // 3 feet up from base
            cabinets: [
              { number: '45', name: 'Upper', width: 36.75, depth: 12, height: 30 },
              { number: '53', name: 'Upper', width: 36.75, depth: 12, height: 30 }
            ]
          }
        ]
      },
      {
        name: 'Wet Lounge - Wall 3',
        roomType: 'other',
        width: 14,
        depth: 12,
        walls: [
          {
            position: 'top',
            cabinets: [
              { number: '51', name: 'Base', width: 36.75, depth: 24, height: 32 },
              { number: '55', name: 'Drawer Base', width: 18, depth: 24, height: 32 },
              { number: '59', name: 'Base', width: 36, depth: 24, height: 32 },
              { number: '60', name: 'Base', width: 36, depth: 24, height: 32 }
            ]
          },
          {
            position: 'top-upper',
            yOffset: 3,
            cabinets: [
              { number: '46', name: 'Microwave', width: 24, depth: 18, height: 18, lamInterior: true },
              { number: '47', name: 'Microwave', width: 24, depth: 18, height: 18, lamInterior: true },
              { number: '48', name: 'Microwave', width: 24, depth: 18, height: 18, lamInterior: true },
              { number: '49', name: 'Microwave', width: 24, depth: 18, height: 18, lamInterior: true }
            ]
          }
        ]
      },
      {
        name: 'Breakroom Option 1',
        roomType: 'kitchen',
        width: 12,
        depth: 10,
        walls: [
          {
            position: 'top',
            cabinets: [
              { number: '13', name: 'Sink Base', width: 24, depth: 24, height: 32 },
              { number: '14', name: 'Drawer Base', width: 18, depth: 24, height: 32 },
              { number: '16', name: 'Base', width: 30.25, depth: 24, height: 32 },
              { number: '17', name: 'Base', width: 30.25, depth: 24, height: 32 }
            ]
          },
          {
            position: 'top-upper',
            yOffset: 3,
            cabinets: [
              { number: '20', name: 'Microwave', width: 24.75, depth: 18, height: 18, lamInterior: true },
              { number: '21', name: 'Microwave', width: 24, depth: 18, height: 18, lamInterior: true },
              { number: '22', name: 'Microwave', width: 24, depth: 18, height: 18, lamInterior: true }
            ]
          },
          {
            position: 'right',
            cabinets: [
              { number: '23', name: 'Tall Pantry', width: 30.625, depth: 12, height: 92 }
            ]
          }
        ]
      }
    ];

    // Use existing room system - clear existing rooms first
    if (window.rooms) {
      window.rooms.length = 0;
    }
    if (window.elements) {
      window.elements.length = 0;
    }

    // Create rooms using FEET-based positions (xFt, yFt)
    // Room Designer converts these to pixels using current pixelsPerFoot
    stateFarmRooms.forEach((roomData, roomIndex) => {
      const newRoom = {
        id: 'room-sf-' + Date.now() + '-' + roomIndex,
        name: roomData.name,
        type: roomData.roomType || 'other',
        width: roomData.width,
        depth: roomData.depth,
        offsetX: 0,
        offsetY: 0,
        elements: [],
        walls: [],
        floorPlan: 'empty',
        pixelsPerFoot: 40 // Store scale for proper deserialization
      };

      // Flatten all cabinets from wall sections
      const allCabinets = [];
      roomData.walls.forEach(wallSection => {
        wallSection.cabinets.forEach(cab => {
          allCabinets.push({
            ...cab,
            wallPosition: wallSection.position,
            yOffset: wallSection.yOffset || 0
          });
        });
      });

      // Position cabinets - ALL POSITIONS IN FEET
      let xFeet = 0.5; // Start 6" from left edge
      let yFeet = 0;   // Start at top wall
      const gapFeet = 0.25; // 3" gap between cabinets

      allCabinets.forEach((cab, cabIndex) => {
        const elementType = getElementType(cab.name);
        const widthFeet = cab.width / 12;  // Convert inches to feet
        const depthFeet = Math.min((cab.depth || 24) / 12, 2); // Standard 2ft depth max

        // Check if this is on a different row (upper cabinets)
        if (cab.yOffset && cab.yOffset > 0 && yFeet !== cab.yOffset) {
          xFeet = 0.5; // Reset X
          yFeet = cab.yOffset;
        }

        // Wrap to next row if exceeding room width
        if (xFeet + widthFeet > roomData.width - 0.5) {
          xFeet = 0.5;
          yFeet += 3; // Move down 3 feet for next row
        }

        // Create element with FEET-based positions
        const element = {
          id: `sf_r${roomIndex}_c${cabIndex}_${Date.now()}`,
          type: elementType,
          // CRITICAL: Use xFt and yFt (feet), NOT x and y (pixels)
          xFt: xFeet,
          yFt: yFeet,
          width: widthFeet,
          height: depthFeet,
          color: getElementColor(elementType),
          label: `#${cab.number} ${cab.name}`,
          rotation: 0,
          locked: false
        };

        newRoom.elements.push(element);

        // Move to next position (in feet)
        xFeet += widthFeet + gapFeet;
      });

      // Add room to existing system
      if (window.rooms) {
        window.rooms.push(newRoom);
      }

      console.log(`Created room: ${newRoom.name} with ${newRoom.elements.length} elements`);
    });

    // Close import modal
    document.getElementById('pdfImporterModal')?.remove();

    // Load first room - use switchToRoom but skip its save logic
    if (window.rooms && window.rooms.length > 0) {
      // Update room list UI first
      if (typeof window.updateRoomList === 'function') {
        window.updateRoomList();
      }

      // Flag to skip save on next switchToRoom call
      window._skipNextRoomSave = true;

      // Use original switchToRoom which deserializes xFt/yFt properly
      const switchFn = window._originalSwitchToRoom || window.switchToRoom;
      if (typeof switchFn === 'function') {
        switchFn(window.rooms[0].id);
      }
    }

    // Update project name
    const projectNameInput = document.getElementById('projectName');
    if (projectNameInput) {
      projectNameInput.value = 'State Farm Stadium Cabinets';
    }

    if (typeof showToast === 'function') {
      showToast(`Loaded ${stateFarmRooms.length} rooms with ${stateFarmRooms.reduce((sum, r) => r.walls.reduce((s, w) => s + w.cabinets.length, 0) + sum, 0)} cabinets - use Room tabs to switch`, 'success');
    }
  };

  window.parseManualCabinetData = function() {
    const text = document.getElementById('manualCabinetData')?.value;
    if (!text) {
      if (typeof showToast === 'function') showToast('Enter cabinet data first', 'warning');
      return;
    }

    const lines = text.split('\n').filter(l => l.trim());
    const rooms = [];
    let currentRoom = null;

    lines.forEach(line => {
      // Check if it's a room header
      if (line.toLowerCase().includes('room')) {
        if (currentRoom) rooms.push(currentRoom);
        currentRoom = {
          name: line.split('-')[0]?.trim() || line.trim(),
          fullName: line.trim(),
          cabinets: []
        };
        return;
      }

      // Parse cabinet line: "1: Base 18" x 30.5" x 32""
      const match = line.match(/(\d+):\s*(.+?)\s*([\d.]+)["\s]*x\s*([\d.]+)/i);
      if (match) {
        const cabinet = {
          number: match[1],
          name: match[2].trim(),
          width: parseFloat(match[3]),
          depth: parseFloat(match[4]),
          height: 32 // default
        };

        // Try to get height
        const heightMatch = line.match(/x\s*([\d.]+)["\s]*$/);
        if (heightMatch) {
          cabinet.height = parseFloat(heightMatch[1]);
        }

        // Check for laminate interior
        cabinet.lamInterior = line.toLowerCase().includes('lam');

        if (currentRoom) {
          currentRoom.cabinets.push(cabinet);
        }
      }
    });

    if (currentRoom) rooms.push(currentRoom);

    if (rooms.length === 0) {
      if (typeof showToast === 'function') showToast('Could not parse any rooms', 'warning');
      return;
    }

    // Show results
    document.getElementById('pdfParseResults').style.display = 'block';
    document.getElementById('extractedRooms').innerHTML = `
      <p><strong>Found ${rooms.length} room(s):</strong></p>
      ${rooms.map((room, i) => `
        <div class="parsed-room">
          <div class="parsed-room-header">
            <strong>${room.name}</strong>
            <span>${room.cabinets.length} cabinets</span>
          </div>
          <button onclick="importParsedRoom(${i})">Import This Room</button>
        </div>
      `).join('')}
      <button onclick="importAllParsedRooms()" class="btn-primary" style="margin-top:12px;">Import All Rooms</button>
    `;

    window._parsedRooms = rooms;
  };

  // Helper function to map cabinet names to proper element types
  function getElementTypeFromName(cabinetName) {
    const name = (cabinetName || '').toLowerCase();
    if (name.includes('tv niche') || name.includes('tv-niche')) return 'tv-niche';
    if (name.includes('niche')) return 'wall-niche';
    if (name.includes('microwave')) return 'microwave';
    if (name.includes('upper') || name.includes('wall cab')) return 'wall-cabinet';
    if (name.includes('sink')) return 'sink-base';
    if (name.includes('drawer')) return 'drawer-base';
    if (name.includes('tall') || name.includes('pantry')) return 'tall-cabinet';
    if (name.includes('corner')) return 'corner-cabinet';
    if (name.includes('island')) return 'island';
    if (name.includes('filler')) return 'base-cabinet';
    return 'base-cabinet';
  }

  // Helper to get color based on element type
  function getColorForElementType(type) {
    const colors = {
      'base-cabinet': '#8B7355',
      'wall-cabinet': '#A0522D',
      'tall-cabinet': '#6B4423',
      'sink-base': '#4682B4',
      'drawer-base': '#9370DB',
      'corner-cabinet': '#CD853F',
      'lazy-susan': '#CD853F',
      'blind-corner': '#CD853F',
      'tv-niche': '#2F4F4F',
      'wall-niche': '#3D5A5A',
      'microwave': '#708090',
      'microwave-cabinet': '#708090',
      'above-microwave-cabinet': '#A0522D',
      'island': '#5D4037',
      'pantry': '#6B4423',
      'tall-oven': '#6B4423',
      'double-oven-cabinet': '#6B4423',
      'fridge-cabinet': '#6B4423',
      'linen-closet': '#8B7355',
      'linen-tower': '#8B7355',
      'countertop': '#708090',
      'appliance': '#4A5568'
    };
    return colors[type] || '#8B7355';
  }

  // Import single parsed room to current canvas with SMART WALL POSITIONING
  // v4.0 - Uses AI wall positions, gapBefore spacing, appliance types, peninsula support
  window.importParsedRoom = function(index) {
    const room = window._parsedRooms?.[index];
    if (!room) return;

    console.log('[AI Import] Starting import for:', room.name);
    console.log('[AI Import] Layout:', room.layoutType, 'Dims:', room.width + 'x' + room.depth);
    console.log('[AI Import] Cabinets:', room.cabinets.length, 'Appliances:', (room.appliances || []).length);

    const ppf = window.pixelsPerFoot || 40;

    // 1. Update room dimensions from AI data
    let roomWidthFeet = window.roomWidth || 16;
    let roomDepthFeet = window.roomDepth || 12;
    if (room.width && room.width >= 8 && room.width <= 35) {
      roomWidthFeet = room.width;
      window.roomWidth = room.width;
      const wInput = document.getElementById('roomWidth') || document.getElementById('roomWidthInput');
      if (wInput) wInput.value = room.width;
    }
    if (room.depth && room.depth >= 8 && room.depth <= 35) {
      roomDepthFeet = room.depth;
      window.roomDepth = room.depth;
      const dInput = document.getElementById('roomDepth') || document.getElementById('roomDepthInput');
      if (dInput) dInput.value = room.depth;
    }
    console.log('[AI Import] Room set to:', roomWidthFeet + 'x' + roomDepthFeet);

    // 2. Clear existing elements
    if (window.elements) window.elements.length = 0;

    // Constants
    const BASE_DEPTH = 2;          // 24" base cabinet depth in feet
    const WALL_CAB_DEPTH = 1;      // 12" wall cabinet depth
    const TALL_DEPTH = 2;          // 24" tall cabinet depth
    const OVERHANG = 1.5 / 12;     // Counter overhang

    // Appliance type mapping for proper rendering
    const APPLIANCE_DEFAULTS = {
      'refrigerator': { w: 36, d: 30, h: 70, color: '#A0A0B0' },
      'fridge': { w: 36, d: 30, h: 70, color: '#A0A0B0' },
      'range': { w: 30, d: 26, h: 36, color: '#4A5568' },
      'slide-in-range': { w: 30, d: 26, h: 36, color: '#4A5568' },
      'stove': { w: 30, d: 26, h: 36, color: '#4A5568' },
      'cooktop': { w: 36, d: 22, h: 4, color: '#2D3748' },
      'dishwasher': { w: 24, d: 24, h: 34, color: '#718096' },
      'microwave': { w: 30, d: 16, h: 18, color: '#708090' },
      'hood': { w: 30, d: 20, h: 8, color: '#A0AEC0' },
      'range-hood': { w: 30, d: 20, h: 8, color: '#A0AEC0' },
      'oven': { w: 30, d: 24, h: 52, color: '#4A5568' },
      'wall-oven': { w: 30, d: 24, h: 52, color: '#4A5568' },
      'double-oven': { w: 30, d: 24, h: 52, color: '#4A5568' },
      'wine-cooler': { w: 24, d: 24, h: 34, color: '#5D4E37' }
    };

    // 3. Categorize all items by wall and type
    const wallGroups = {
      top: { tall: [], base: [], wall: [] },
      bottom: { tall: [], base: [], wall: [] },
      left: { tall: [], base: [], wall: [] },
      right: { tall: [], base: [], wall: [] },
      island: [],
      peninsula: []
    };

    room.cabinets.forEach((cab, idx) => {
      let type = cab.type || getElementTypeFromName(cab.name);
      const typeKey = (type || '').toLowerCase();
      const appDef = APPLIANCE_DEFAULTS[typeKey];
      const isAppliance = !!appDef || cab.isAppliance;

      // For tall appliances (fridge), treat as tall cabinet for positioning
      const isTallAppliance = typeKey === 'refrigerator' || typeKey === 'fridge';
      const isWallMounted = typeKey === 'microwave' || typeKey === 'hood' || typeKey === 'range-hood';

      const normalized = {
        ...cab,
        _type: type,
        _isAppliance: isAppliance,
        _appDef: appDef,
        _widthFt: (cab.width || (appDef?.w || 36)) / 12,
        _depthFt: (cab.depth || (appDef?.d || 24)) / 12,
        _heightIn: cab.height || (appDef?.h || 34.5),
        _color: isAppliance ? (appDef?.color || '#718096') : getColorForElementType(type),
        _orderIndex: cab.orderIndex || idx,
        _gapBeforeFt: (cab.gapBefore || 0) / 12,
        _doorStyle: cab.doorStyle || 'raised',
        _finish: cab.finish || 'wood-grain'
      };

      let wall = (cab.wall || 'top').toLowerCase();
      if (wall.includes('upper')) wall = wall.replace('-upper', '').replace('upper', 'top');

      if (type === 'island' || wall === 'island') {
        wallGroups.island.push(normalized);
      } else if (wall === 'peninsula') {
        wallGroups.peninsula.push(normalized);
      } else {
        if (!['top', 'bottom', 'left', 'right'].includes(wall)) wall = 'top';

        if (isTallAppliance || type === 'tall-cabinet' || type === 'tall-oven' || type === 'fridge-cabinet' || type === 'double-oven-cabinet') {
          wallGroups[wall].tall.push(normalized);
        } else if (isWallMounted || type === 'wall-cabinet' || type === 'microwave-cabinet' || type === 'above-microwave-cabinet') {
          wallGroups[wall].wall.push(normalized);
        } else {
          wallGroups[wall].base.push(normalized);
        }
      }
    });

    // Sort each group by orderIndex
    ['top', 'bottom', 'left', 'right'].forEach(w => {
      wallGroups[w].tall.sort((a, b) => a._orderIndex - b._orderIndex);
      wallGroups[w].base.sort((a, b) => a._orderIndex - b._orderIndex);
      wallGroups[w].wall.sort((a, b) => a._orderIndex - b._orderIndex);
    });

    // SMART REDISTRIBUTION: If GPT dumped everything on one wall but layout is multi-wall, fix it
    const layout = (room.layoutType || '').toLowerCase();
    const totalBase = wallGroups.top.base.length + wallGroups.bottom.base.length + wallGroups.left.base.length + wallGroups.right.base.length;
    const topHeavy = totalBase > 0 && (wallGroups.top.base.length / totalBase) > 0.7;
    const totalWall = wallGroups.top.wall.length + wallGroups.bottom.wall.length + wallGroups.left.wall.length + wallGroups.right.wall.length;
    const topHeavyWall = totalWall > 0 && (wallGroups.top.wall.length / totalWall) > 0.7;

    if (topHeavy && (layout.includes('l-shape') || layout.includes('l shape') || layout.includes('u-shape') || layout.includes('u shape') || layout.includes('peninsula'))) {
      console.log('[AI Import] Redistributing: GPT put ' + wallGroups.top.base.length + '/' + totalBase + ' base cabs on top wall for ' + layout + ' layout');

      const allBase = wallGroups.top.base.concat(wallGroups.left.base, wallGroups.right.base, wallGroups.bottom.base);
      const allWallCabs = wallGroups.top.wall.concat(wallGroups.left.wall, wallGroups.right.wall, wallGroups.bottom.wall);

      // Calculate how much fits on top wall based on room width
      let topRunWidth = 0;
      const topBaseSplit = [];
      const leftBaseSplit = [];
      for (let i = 0; i < allBase.length; i++) {
        if (topRunWidth + allBase[i]._widthFt <= roomWidthFeet - 1) {
          topBaseSplit.push(allBase[i]);
          topRunWidth += allBase[i]._widthFt;
        } else {
          leftBaseSplit.push(allBase[i]);
        }
      }

      // If nothing went to left wall, force a split
      if (leftBaseSplit.length === 0 && allBase.length > 4) {
        const splitAt = Math.ceil(allBase.length * 0.6);
        topBaseSplit.length = 0;
        leftBaseSplit.length = 0;
        allBase.forEach((c, i) => (i < splitAt ? topBaseSplit : leftBaseSplit).push(c));
      }

      wallGroups.top.base = topBaseSplit;
      wallGroups.left.base = leftBaseSplit;

      // Split wall cabs similarly
      if (topHeavyWall && allWallCabs.length > 2) {
        const wallSplitAt = Math.ceil(allWallCabs.length * 0.6);
        wallGroups.top.wall = allWallCabs.slice(0, wallSplitAt);
        wallGroups.left.wall = allWallCabs.slice(wallSplitAt);
      }

      // Move fridge to left wall if it's on top
      const fridgeIdx = wallGroups.top.tall.findIndex(c => {
        const t = (c._type || '').toLowerCase();
        return t === 'refrigerator' || t === 'fridge';
      });
      if (fridgeIdx >= 0) {
        wallGroups.left.tall.unshift(wallGroups.top.tall.splice(fridgeIdx, 1)[0]);
      }
    }

    // Log wall distribution
    ['top', 'bottom', 'left', 'right'].forEach(w => {
      const g = wallGroups[w];
      if (g.tall.length + g.base.length + g.wall.length > 0) {
        console.log(`[AI Import] ${w.toUpperCase()} wall: ${g.tall.length} tall, ${g.base.length} base, ${g.wall.length} upper`);
      }
    });
    if (wallGroups.island.length) console.log('[AI Import] Islands:', wallGroups.island.length);
    if (wallGroups.peninsula.length) console.log('[AI Import] Peninsula:', wallGroups.peninsula.length);

    // Track countertop runs per wall
    const ctRuns = {};

    // Helper: Create and add element to canvas
    function addElement(type, xFt, yFt, widthFt, depthFt, rotation, wall, cab, isCountertop) {
      const isWallCab = type === 'wall-cabinet' || type === 'microwave-cabinet' || type === 'above-microwave-cabinet' ||
                        type === 'microwave' || type === 'hood' || type === 'range-hood';
      const isTall = type === 'tall-cabinet' || type === 'fridge-cabinet' || type === 'tall-oven' ||
                     type === 'refrigerator' || type === 'fridge';

      let mountHeight = 0;
      if (isCountertop) mountHeight = 3;
      else if (isWallCab) mountHeight = 4.5;
      else if (isTall) mountHeight = 0;

      const actualHeight = cab?._heightIn || (isCountertop ? 1.5 : 34.5);

      const el = {
        id: `imp_${isCountertop ? 'ct' : (cab?.number || 'x')}_${Date.now()}_${Math.random().toString(36).substr(2,5)}`,
        type: type,
        subType: type,
        label: isCountertop ? `Countertop (${wall})` : `#${cab?.number || ''} ${cab?.name || type}`,
        x: xFt * ppf,
        y: yFt * ppf,
        width: widthFt,
        height: depthFt,
        color: isCountertop ? '#708090' : (cab?._color || getColorForElementType(type)),
        rotation: rotation,
        locked: false,
        wall: wall,
        mountHeight: mountHeight,
        isWallMounted: isWallCab,
        actualWidth: isCountertop ? widthFt * 12 : (cab?.width || widthFt * 12),
        actualDepth: isCountertop ? depthFt * 12 : (cab?.depth || depthFt * 12),
        actualHeight: actualHeight,
        actualHeightFt: actualHeight / 12,
        doorStyle: cab?._doorStyle || 'raised',
        construction: 'frameless',
        doorOverlay: 'full',
        cabinetFinish: cab?._finish || 'wood-grain',
        importedFrom: 'ai-scan',
        originalNumber: cab?.number || null
      };

      if (window.elements) window.elements.push(el);
    }

    // Place items along a wall (horizontal walls: top/bottom)
    function placeHorizontalWall(wallName, items, startX, yFn, depthLimit) {
      let x = startX;
      let runStart = null, runEnd = null;
      items.forEach(cab => {
        x += cab._gapBeforeFt;
        const w = cab._widthFt;
        const d = Math.min(cab._depthFt, depthLimit);
        const y = yFn(d);
        if (x + w > roomWidthFeet) x = startX; // Wrap if overflow
        addElement(cab._type, x, y, w, d, 0, wallName, cab, false);
        if (runStart === null) runStart = x;
        runEnd = x + w;
        x += w;
      });
      return { start: runStart, end: runEnd };
    }

    // Place items along a wall (vertical walls: left/right)
    function placeVerticalWall(wallName, items, startY, xFn, depthLimit) {
      let y = startY;
      let runStart = null, runEnd = null;
      items.forEach(cab => {
        y += cab._gapBeforeFt;
        const w = cab._widthFt;
        const d = Math.min(cab._depthFt, depthLimit);
        const x = xFn(d);
        if (y + w > roomDepthFeet) y = startY; // Wrap if overflow
        addElement(cab._type, x, y, d, w, 0, wallName, cab, false);
        if (runStart === null) runStart = y;
        runEnd = y + w;
        y += w;
      });
      return { start: runStart, end: runEnd };
    }

    // === Place TOP wall (y=0, elements face down into room) ===
    let topX = 0;
    // Tall cabinets first
    const topTall = placeHorizontalWall('top', wallGroups.top.tall, topX, () => 0, TALL_DEPTH);
    if (topTall.end) topX = topTall.end;

    const topBaseStart = topX;
    const topBase = placeHorizontalWall('top', wallGroups.top.base, topX, () => 0, BASE_DEPTH);
    if (topBase.end) ctRuns.top = { start: topBaseStart, end: topBase.end };

    // Wall cabs above base cabs
    let topWallX = topBaseStart;
    wallGroups.top.wall.forEach(cab => {
      topWallX += cab._gapBeforeFt;
      addElement(cab._type, topWallX, 0, cab._widthFt, WALL_CAB_DEPTH, 0, 'top', cab, false);
      topWallX += cab._widthFt;
    });

    // === Place LEFT wall (x=0, elements face right into room) ===
    let leftY = 0;
    const leftTall = placeVerticalWall('left', wallGroups.left.tall, leftY, () => 0, TALL_DEPTH);
    if (leftTall.end) leftY = leftTall.end;

    const leftBaseStart = leftY;
    const leftBase = placeVerticalWall('left', wallGroups.left.base, leftY, () => 0, BASE_DEPTH);
    if (leftBase.end) ctRuns.left = { start: leftBaseStart, end: leftBase.end };

    let leftWallY = leftBaseStart;
    wallGroups.left.wall.forEach(cab => {
      leftWallY += cab._gapBeforeFt;
      addElement(cab._type, 0, leftWallY, WALL_CAB_DEPTH, cab._widthFt, 0, 'left', cab, false);
      leftWallY += cab._widthFt;
    });

    // === Place RIGHT wall (x=roomWidth-depth, elements face left) ===
    let rightY = 0;
    const rightTall = placeVerticalWall('right', wallGroups.right.tall, rightY, (d) => roomWidthFeet - d, TALL_DEPTH);
    if (rightTall.end) rightY = rightTall.end;

    const rightBaseStart = rightY;
    const rightBase = placeVerticalWall('right', wallGroups.right.base, rightY, (d) => roomWidthFeet - d, BASE_DEPTH);
    if (rightBase.end) ctRuns.right = { start: rightBaseStart, end: rightBase.end };

    let rightWallY = rightBaseStart;
    wallGroups.right.wall.forEach(cab => {
      rightWallY += cab._gapBeforeFt;
      addElement(cab._type, roomWidthFeet - WALL_CAB_DEPTH, rightWallY, WALL_CAB_DEPTH, cab._widthFt, 0, 'right', cab, false);
      rightWallY += cab._widthFt;
    });

    // === Place BOTTOM wall ===
    let bottomX = 0;
    const bottomTall = placeHorizontalWall('bottom', wallGroups.bottom.tall, bottomX, (d) => roomDepthFeet - d, TALL_DEPTH);
    if (bottomTall.end) bottomX = bottomTall.end;

    const bottomBaseStart = bottomX;
    const bottomBase = placeHorizontalWall('bottom', wallGroups.bottom.base, bottomX, (d) => roomDepthFeet - d, BASE_DEPTH);
    if (bottomBase.end) ctRuns.bottom = { start: bottomBaseStart, end: bottomBase.end };

    // === Place ISLANDS (centered in room) ===
    wallGroups.island.forEach((cab, idx) => {
      const w = cab._widthFt || 4;
      const d = Math.min(cab._depthFt || 3, 4);
      const xFt = (roomWidthFeet - w) / 2 + idx * 1;
      const yFt = roomDepthFeet * 0.55;
      addElement('island', xFt, yFt, w, d, 0, 'island', cab, false);
      ctRuns.island = { x: xFt, y: yFt, w: w, d: d };
    });

    // === Place PENINSULA (extends from end of a wall run into room) ===
    wallGroups.peninsula.forEach((cab, idx) => {
      const w = cab._widthFt || 4;
      const d = Math.min(cab._depthFt || 2, 3);
      // Position peninsula extending from end of top wall counter
      const penX = ctRuns.top ? ctRuns.top.end - d : roomWidthFeet / 2;
      const penY = BASE_DEPTH + 0.25;
      addElement(cab._type || 'base-cabinet', penX, penY, d, w, 0, 'peninsula', cab, false);
      ctRuns.peninsula = { x: penX, y: penY, w: d, d: w };
    });

    // === Generate COUNTERTOPS ===
    if (ctRuns.top) {
      const ct = ctRuns.top;
      addElement('countertop', ct.start, 0, ct.end - ct.start, BASE_DEPTH + OVERHANG, 0, 'top', null, true);
    }
    if (ctRuns.left) {
      const ct = ctRuns.left;
      addElement('countertop', 0, ct.start, BASE_DEPTH + OVERHANG, ct.end - ct.start, 0, 'left', null, true);
    }
    if (ctRuns.right) {
      const ct = ctRuns.right;
      addElement('countertop', roomWidthFeet - BASE_DEPTH - OVERHANG, ct.start, BASE_DEPTH + OVERHANG, ct.end - ct.start, 0, 'right', null, true);
    }
    if (ctRuns.bottom) {
      const ct = ctRuns.bottom;
      addElement('countertop', ct.start, roomDepthFeet - BASE_DEPTH - OVERHANG, ct.end - ct.start, BASE_DEPTH + OVERHANG, 0, 'bottom', null, true);
    }
    if (ctRuns.island) {
      const i = ctRuns.island;
      addElement('countertop', i.x - OVERHANG, i.y - OVERHANG, i.w + OVERHANG * 2, i.d + OVERHANG * 2, 0, 'island', null, true);
    }
    if (ctRuns.peninsula) {
      const p = ctRuns.peninsula;
      addElement('countertop', p.x - OVERHANG, p.y - OVERHANG, p.w + OVERHANG * 2, p.d + OVERHANG * 2, 0, 'peninsula', null, true);
    }

    // 4. Redraw — updateRoom() syncs local roomWidth/roomDepth from inputs, resizes canvas, calls draw()
    if (typeof window.updateRoom === 'function') {
      window.updateRoom();
    } else {
      if (typeof window.fitToScreen === 'function') window.fitToScreen();
      if (typeof window.draw === 'function') window.draw();
    }
    document.getElementById('pdfImporterModal')?.remove();

    const elementCount = (window.elements || []).length;
    console.log('[AI Import] Done:', elementCount, 'total elements on canvas');
    if (typeof showToast === 'function') showToast(`Imported ${elementCount} elements from ${room.name}`, 'success');
  };

  // Helper: Validate and sanitize cabinet dimensions
  function validateCabinetDimensions(cab, index) {
    // Default dimensions by cabinet type
    const defaults = {
      'base-cabinet': { width: 36, depth: 24, height: 34.5 },
      'wall-cabinet': { width: 36, depth: 12, height: 30 },
      'tall-cabinet': { width: 24, depth: 24, height: 84 },
      'sink-base': { width: 36, depth: 24, height: 34.5 },
      'drawer-base': { width: 18, depth: 24, height: 34.5 },
      'tv-niche': { width: 60, depth: 4, height: 36 },
      'microwave': { width: 24, depth: 18, height: 18 },
      'island': { width: 48, depth: 36, height: 36 }
    };

    const type = cab.type || 'base-cabinet';
    const typeDefaults = defaults[type] || defaults['base-cabinet'];

    // Parse dimensions - they might be strings or numbers
    let width = parseFloat(cab.width) || typeDefaults.width;
    let depth = parseFloat(cab.depth) || typeDefaults.depth;
    let height = parseFloat(cab.height) || typeDefaults.height;

    // Sanity checks - catch obviously wrong values
    // Width: typical range 6" to 120" (fillers to large islands)
    if (width < 0.5 || width > 120) {
      console.warn(`Cabinet ${index}: invalid width ${width}, using default`);
      width = typeDefaults.width;
    }

    // Depth: typical range 0.5" (panels) to 36" (deep islands)
    if (depth < 0.25 || depth > 48) {
      console.warn(`Cabinet ${index}: invalid depth ${depth}, using default`);
      depth = typeDefaults.depth;
    }

    // Height: typical range 6" (drawer faces) to 96" (tall pantries)
    if (height < 4 || height > 108) {
      console.warn(`Cabinet ${index}: invalid height ${height}, using default`);
      height = typeDefaults.height;
    }

    return { width, depth, height };
  }

  // Helper: Infer wall position based on cabinet type and index
  function inferWallPosition(cab, index, totalCabinets) {
    // If wall is already specified and valid, use it
    const validWalls = ['top', 'bottom', 'left', 'right', 'island', 'peninsula', 'top-upper', 'corner'];
    if (cab.wall && validWalls.includes(cab.wall.toLowerCase())) {
      return cab.wall.toLowerCase();
    }

    // Infer based on cabinet type
    const type = (cab.type || '').toLowerCase();

    if (type.includes('island')) return 'island';
    if (type.includes('upper') || type.includes('wall')) return 'top-upper';
    if (type.includes('corner')) return 'corner';

    // For TV niches and similar, put on side walls
    if (type.includes('tv') || type.includes('niche')) {
      return index % 2 === 0 ? 'right' : 'left';
    }

    // Default: distribute along top wall (most common for commercial drawings)
    return 'top';
  }

  // Helper: Format cabinet type for display
  function formatCabinetType(type) {
    const names = {
      'base-cabinet': 'Base Cabinet',
      'wall-cabinet': 'Wall Cabinet',
      'tall-cabinet': 'Tall Cabinet',
      'sink-base': 'Sink Base',
      'corner-cabinet': 'Corner Cabinet',
      'drawer-base': 'Drawer Base',
      'pantry': 'Pantry',
      'island': 'Island'
    };
    return names[type] || type || 'Cabinet';
  }

  // Helper: Format appliance type for display
  function formatApplianceType(type) {
    const names = {
      'refrigerator': 'Refrigerator',
      'range': 'Range/Stove',
      'stove': 'Range/Stove',
      'dishwasher': 'Dishwasher',
      'microwave': 'Microwave',
      'oven': 'Wall Oven'
    };
    return names[type] || type || 'Appliance';
  }

  // Import all parsed rooms into the existing room system with SMART LAYOUT GENERATION
  // v3.0 - Creates sensible room layouts based on cabinet inventory, not literal AI positions
  window.importAllParsedRooms = function() {
    const parsedRooms = window._parsedRooms;
    if (!parsedRooms || parsedRooms.length === 0) return;

    // Clear existing rooms and use the existing room system
    if (window.rooms) {
      window.rooms.length = 0;
    }
    if (window.elements) {
      window.elements.length = 0;
    }

    parsedRooms.forEach((room, roomIndex) => {
      // ============================================
      // STEP 1: Categorize all cabinets by type
      // ============================================
      const baseCabinets = [];
      const wallCabinets = [];
      const tallCabinets = [];
      const islands = [];
      const appliances = room.appliances || [];

      room.cabinets.forEach((cab, idx) => {
        const type = cab.type || getElementTypeFromName(cab.name || cab.label);
        const widthFt = (cab.width || 36) / 12;
        const depthFt = (cab.depth || 24) / 12;
        const heightIn = cab.height || 34.5;

        const normalizedCab = {
          ...cab,
          _type: type,
          _index: idx,
          _widthFt: widthFt,
          _depthFt: depthFt,
          _heightIn: heightIn,
          label: cab.label || cab.name || `${type}-${idx}`
        };

        if (type === 'island') {
          islands.push(normalizedCab);
        } else if (type === 'wall-cabinet' || type === 'microwave-cabinet' || type === 'above-microwave-cabinet') {
          wallCabinets.push(normalizedCab);
        } else if (type === 'tall-cabinet' || type === 'tall-oven' || type === 'double-oven-cabinet' || type === 'fridge-cabinet') {
          tallCabinets.push(normalizedCab);
        } else {
          baseCabinets.push(normalizedCab);
        }
      });

      // ============================================
      // STEP 2: Calculate smart room dimensions
      // ============================================
      const totalBaseWidth = baseCabinets.reduce((sum, c) => sum + c._widthFt, 0);
      const totalWallWidth = wallCabinets.reduce((sum, c) => sum + c._widthFt, 0);
      const totalTallWidth = tallCabinets.reduce((sum, c) => sum + c._widthFt, 0);
      const longestRun = Math.max(totalBaseWidth, totalWallWidth);

      // Determine layout type based on cabinet count and AI hints
      let layoutType = room.layoutType || 'single-wall';
      const totalCabinets = baseCabinets.length + wallCabinets.length + tallCabinets.length;

      if (layoutType === 'unknown' || layoutType === 'single-wall') {
        if (totalCabinets > 15) layoutType = 'U-shape';
        else if (totalCabinets > 8) layoutType = 'L-shape';
        else layoutType = 'single-wall';
      }

      // Calculate room size - generous sizing for usable kitchen
      // Minimum 10x10, scale up based on cabinets
      const minRoomSize = 10;
      let roomWidth, roomDepth;

      if (layoutType === 'U-shape') {
        roomWidth = Math.max(minRoomSize + 4, Math.ceil(longestRun / 2) + 6);
        roomDepth = Math.max(minRoomSize + 2, Math.ceil(longestRun / 3) + 6);
      } else if (layoutType === 'L-shape') {
        roomWidth = Math.max(minRoomSize + 2, Math.ceil(longestRun / 2) + 4);
        roomDepth = Math.max(minRoomSize, Math.ceil(longestRun / 2) + 4);
      } else if (layoutType === 'galley') {
        roomWidth = Math.max(minRoomSize, Math.ceil(longestRun) + 2);
        roomDepth = Math.max(8, 10); // Galley is narrower
      } else {
        // Single wall
        roomWidth = Math.max(minRoomSize, Math.ceil(longestRun) + 4);
        roomDepth = Math.max(minRoomSize, 12);
      }

      // Apply AI-provided dimensions if they seem reasonable
      if (room.widthFt && room.widthFt >= 8 && room.widthFt <= 30) roomWidth = room.widthFt;
      if (room.depthFt && room.depthFt >= 8 && room.depthFt <= 30) roomDepth = room.depthFt;

      console.log(`Room "${room.name}": ${layoutType} layout, ${roomWidth}'x${roomDepth}', ${totalCabinets} cabinets`);

      const newRoom = {
        id: 'room-' + Date.now() + '-' + roomIndex,
        name: room.fullName || room.name || `Room ${roomIndex + 1}`,
        type: 'kitchen',
        width: roomWidth,
        depth: roomDepth,
        offsetX: 0,
        offsetY: 0,
        elements: [],
        walls: [],
        floorPlan: 'empty',
        pixelsPerFoot: 40,
        layoutType: layoutType
      };

      // ============================================
      // STEP 3: Layout constants
      // ============================================
      const GAP = 0;              // No gap between cabinets (they're flush)
      const BASE_DEPTH = 2;       // 24" base cabinet depth
      const WALL_CAB_DEPTH = 1;   // 12" wall cabinet depth
      const TALL_DEPTH = 2;       // 24" tall cabinet depth
      const WALL_INSET = 0;       // Cabinets flush to wall edge
      const COUNTER_OVERHANG = 1.5 / 12;

      // ============================================
      // STEP 4: Distribute cabinets to walls based on layout
      // ============================================
      const wallAssignments = {
        top: { base: [], wall: [], tall: [] },
        left: { base: [], wall: [], tall: [] },
        right: { base: [], wall: [], tall: [] },
        bottom: { base: [], wall: [], tall: [] }
      };

      if (layoutType === 'U-shape') {
        // U-shape: cabinets on top, left, and right walls
        const third = Math.ceil(baseCabinets.length / 3);
        wallAssignments.left.base = baseCabinets.slice(0, third);
        wallAssignments.top.base = baseCabinets.slice(third, third * 2);
        wallAssignments.right.base = baseCabinets.slice(third * 2);

        const wallThird = Math.ceil(wallCabinets.length / 3);
        wallAssignments.left.wall = wallCabinets.slice(0, wallThird);
        wallAssignments.top.wall = wallCabinets.slice(wallThird, wallThird * 2);
        wallAssignments.right.wall = wallCabinets.slice(wallThird * 2);

        // Tall cabinets at ends
        if (tallCabinets.length > 0) wallAssignments.left.tall = [tallCabinets[0]];
        if (tallCabinets.length > 1) wallAssignments.right.tall = [tallCabinets[1]];

      } else if (layoutType === 'L-shape') {
        // L-shape: cabinets on top and left (or right) walls
        const half = Math.ceil(baseCabinets.length / 2);
        wallAssignments.top.base = baseCabinets.slice(0, half);
        wallAssignments.left.base = baseCabinets.slice(half);

        const wallHalf = Math.ceil(wallCabinets.length / 2);
        wallAssignments.top.wall = wallCabinets.slice(0, wallHalf);
        wallAssignments.left.wall = wallCabinets.slice(wallHalf);

        // Tall cabinets at corner
        wallAssignments.left.tall = tallCabinets;

      } else if (layoutType === 'galley') {
        // Galley: cabinets on top and bottom (parallel walls)
        const half = Math.ceil(baseCabinets.length / 2);
        wallAssignments.top.base = baseCabinets.slice(0, half);
        wallAssignments.bottom.base = baseCabinets.slice(half);

        const wallHalf = Math.ceil(wallCabinets.length / 2);
        wallAssignments.top.wall = wallCabinets.slice(0, wallHalf);
        wallAssignments.bottom.wall = wallCabinets.slice(wallHalf);

        wallAssignments.top.tall = tallCabinets;

      } else {
        // Single wall: all on top wall
        wallAssignments.top.base = baseCabinets;
        wallAssignments.top.wall = wallCabinets;
        wallAssignments.top.tall = tallCabinets;
      }

      // ============================================
      // STEP 5: Place cabinets on each wall
      // ============================================

      // Helper to create element
      function createElement(cab, x, y, width, depth, rotation, wall) {
        newRoom.elements.push({
          id: Date.now() + Math.random(),
          type: cab._type,
          x: x,
          y: y,
          width: width,
          height: depth,
          rotation: rotation,
          label: cab.label,
          color: getColorForElementType(cab._type),
          actualHeight: cab._heightIn / 12,
          mountHeight: cab._type === 'wall-cabinet' ? 4.5 : 0, // 54" mount height for wall cabs
          wall: wall,
          locked: false
        });
      }

      // Place TOP wall (rotation 0 - faces down into room)
      let topX = 1; // Start 1 foot from left edge
      // Place tall cabinets first on left
      wallAssignments.top.tall.forEach(cab => {
        createElement(cab, topX, WALL_INSET, cab._widthFt, TALL_DEPTH, 0, 'top');
        topX += cab._widthFt + GAP;
      });
      // Then base cabinets
      const topBaseStartX = topX;
      wallAssignments.top.base.forEach(cab => {
        createElement(cab, topX, WALL_INSET, cab._widthFt, BASE_DEPTH, 0, 'top');
        topX += cab._widthFt + GAP;
      });
      // Wall cabinets above base cabinets (same X positions)
      let topWallX = topBaseStartX;
      wallAssignments.top.wall.forEach(cab => {
        createElement(cab, topWallX, WALL_INSET, cab._widthFt, WALL_CAB_DEPTH, 0, 'top');
        topWallX += cab._widthFt + GAP;
      });

      // Place LEFT wall (rotation 90 - faces right into room)
      let leftY = 1;
      wallAssignments.left.tall.forEach(cab => {
        createElement(cab, WALL_INSET, leftY, TALL_DEPTH, cab._widthFt, 90, 'left');
        leftY += cab._widthFt + GAP;
      });
      const leftBaseStartY = leftY;
      wallAssignments.left.base.forEach(cab => {
        createElement(cab, WALL_INSET, leftY, BASE_DEPTH, cab._widthFt, 90, 'left');
        leftY += cab._widthFt + GAP;
      });
      let leftWallY = leftBaseStartY;
      wallAssignments.left.wall.forEach(cab => {
        createElement(cab, WALL_INSET, leftWallY, WALL_CAB_DEPTH, cab._widthFt, 90, 'left');
        leftWallY += cab._widthFt + GAP;
      });

      // Place RIGHT wall (rotation 270 - faces left into room)
      let rightY = 1;
      wallAssignments.right.tall.forEach(cab => {
        createElement(cab, roomWidth - TALL_DEPTH, rightY, TALL_DEPTH, cab._widthFt, 270, 'right');
        rightY += cab._widthFt + GAP;
      });
      const rightBaseStartY = rightY;
      wallAssignments.right.base.forEach(cab => {
        createElement(cab, roomWidth - BASE_DEPTH, rightY, BASE_DEPTH, cab._widthFt, 270, 'right');
        rightY += cab._widthFt + GAP;
      });
      let rightWallY = rightBaseStartY;
      wallAssignments.right.wall.forEach(cab => {
        createElement(cab, roomWidth - WALL_CAB_DEPTH, rightWallY, WALL_CAB_DEPTH, cab._widthFt, 270, 'right');
        rightWallY += cab._widthFt + GAP;
      });

      // Place BOTTOM wall (rotation 180 - faces up into room)
      let bottomX = 1;
      wallAssignments.bottom.tall.forEach(cab => {
        createElement(cab, bottomX, roomDepth - TALL_DEPTH, cab._widthFt, TALL_DEPTH, 180, 'bottom');
        bottomX += cab._widthFt + GAP;
      });
      const bottomBaseStartX = bottomX;
      wallAssignments.bottom.base.forEach(cab => {
        createElement(cab, bottomX, roomDepth - BASE_DEPTH, cab._widthFt, BASE_DEPTH, 180, 'bottom');
        bottomX += cab._widthFt + GAP;
      });
      let bottomWallX = bottomBaseStartX;
      wallAssignments.bottom.wall.forEach(cab => {
        createElement(cab, bottomWallX, roomDepth - WALL_CAB_DEPTH, cab._widthFt, WALL_CAB_DEPTH, 180, 'bottom');
        bottomWallX += cab._widthFt + GAP;
      });

      // Place islands in center
      islands.forEach((island, idx) => {
        const islandX = (roomWidth - island._widthFt) / 2 + (idx * 0.5);
        const islandY = (roomDepth - island._depthFt) / 2;
        createElement(island, islandX, islandY, island._widthFt, island._depthFt, 0, 'island');
      });

      // ============================================
      // STEP 6: Generate countertops for base cabinet runs
      // ============================================
      function addCountertop(startX, startY, width, depth, rotation, wall) {
        const overhang = COUNTER_OVERHANG;
        newRoom.elements.push({
          id: Date.now() + Math.random(),
          type: 'countertop',
          x: startX - overhang,
          y: startY - (wall === 'top' ? 0 : overhang),
          width: width + overhang * 2,
          height: depth + overhang,
          rotation: rotation,
          label: 'Countertop',
          color: '#4a5568',
          material: 'granite',
          mountHeight: 3, // 36" counter height
          actualHeight: 0.125, // 1.5" thick
          wall: wall,
          locked: false
        });
      }

      // Top wall countertop
      if (wallAssignments.top.base.length > 0) {
        const width = wallAssignments.top.base.reduce((sum, c) => sum + c._widthFt, 0);
        addCountertop(topBaseStartX, WALL_INSET, width, BASE_DEPTH, 0, 'top');
      }

      // Left wall countertop
      if (wallAssignments.left.base.length > 0) {
        const width = wallAssignments.left.base.reduce((sum, c) => sum + c._widthFt, 0);
        addCountertop(WALL_INSET, leftBaseStartY, BASE_DEPTH, width, 90, 'left');
      }

      // Right wall countertop
      if (wallAssignments.right.base.length > 0) {
        const width = wallAssignments.right.base.reduce((sum, c) => sum + c._widthFt, 0);
        addCountertop(roomWidth - BASE_DEPTH, rightBaseStartY, BASE_DEPTH, width, 270, 'right');
      }

      // Bottom wall countertop
      if (wallAssignments.bottom.base.length > 0) {
        const width = wallAssignments.bottom.base.reduce((sum, c) => sum + c._widthFt, 0);
        addCountertop(bottomBaseStartX, roomDepth - BASE_DEPTH, width, BASE_DEPTH, 180, 'bottom');
      }

      // Island countertop
      if (islands.length > 0) {
        islands.forEach((island, idx) => {
          const islandX = (roomWidth - island._widthFt) / 2 + (idx * 0.5);
          const islandY = (roomDepth - island._depthFt) / 2;
          addCountertop(islandX, islandY, island._widthFt, island._depthFt, 0, 'island');
        });
      }

      // ============================================
      // STEP 7: Add appliances if specified
      // ============================================
      appliances.forEach(app => {
        const appWidth = (app.width || 30) / 12;
        const appDepth = 2; // Standard appliance depth

        // Find a spot on the appropriate wall (default to top)
        newRoom.elements.push({
          id: Date.now() + Math.random(),
          type: app.type || 'appliance',
          x: roomWidth / 2 - appWidth / 2,
          y: WALL_INSET,
          width: appWidth,
          height: appDepth,
          rotation: 0,
          label: app.type || 'Appliance',
          color: '#718096',
          wall: 'top',
          locked: false
        });
      });

      // Push the completed room to the rooms array
      if (window.rooms) {
        window.rooms.push(newRoom);
      }

      const cabinetCount = newRoom.elements.filter(e => e.type !== 'countertop').length;
      const countertopCount = newRoom.elements.filter(e => e.type === 'countertop').length;
      console.log(`Imported room: ${newRoom.name} with ${cabinetCount} cabinets + ${countertopCount} countertops`);
    });

    // Close modal
    document.getElementById('pdfImporterModal')?.remove();

    // Switch to first room using original switchToRoom (handles deserialization)
    if (window.rooms && window.rooms.length > 0) {
      if (typeof window.updateRoomList === 'function') {
        window.updateRoomList();
      }

      // Flag to skip save on next switchToRoom call (prevents overwriting new data)
      window._skipNextRoomSave = true;

      const switchFn = window._originalSwitchToRoom || window.switchToRoom;
      if (typeof switchFn === 'function') {
        switchFn(window.rooms[0].id);
      }
    }

    if (typeof showToast === 'function') {
      const totalCabinets = parsedRooms.reduce((s, r) => s + r.cabinets.length, 0);
      showToast(`Imported ${parsedRooms.length} room(s) with ${totalCabinets} cabinets + countertops`, 'success');
    }
  };

  // === 4. APPROVAL WORKFLOW ===
  window.sendForApproval = function() {
    if (!commercialProject) {
      if (typeof showToast === 'function') showToast('No project to send', 'warning');
      return;
    }

    // Save current state
    saveCurrentRoomToProject();

    const modal = document.createElement('div');
    modal.className = 'approval-modal';
    modal.id = 'approvalModal';
    modal.innerHTML = `
      <div class="approval-content">
        <div class="approval-header">
          <h3>📨 Send for Approval</h3>
          <button onclick="this.closest('.approval-modal').remove()">&times;</button>
        </div>
        <div class="approval-body">
          <div class="approval-summary">
            <h4>${commercialProject.name}</h4>
            <p><strong>Client:</strong> ${commercialProject.client || 'Not set'}</p>
            <p><strong>Rooms:</strong> ${commercialProject.rooms.length}</p>
            <p><strong>Total Cabinets:</strong> ${commercialProject.rooms.reduce((sum, r) => sum + (r.elements?.length || 0), 0)}</p>
          </div>
          <div class="form-group">
            <label>Recipient Email</label>
            <input type="email" id="approvalEmail" placeholder="client@statefarmstadium.com">
          </div>
          <div class="form-group">
            <label>Recipient Name</label>
            <input type="text" id="approvalName" placeholder="Project Manager">
          </div>
          <div class="form-group">
            <label>Message</label>
            <textarea id="approvalMessage" rows="4" placeholder="Please review the attached cabinet drawings for State Farm Stadium..."></textarea>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" id="approvalNotify" checked>
              Notify me when they respond
            </label>
          </div>
          <div class="approval-options">
            <label><input type="checkbox" id="includeReport" checked> Include PDF Report</label>
            <label><input type="checkbox" id="includeCutList" checked> Include Cut List</label>
            <label><input type="checkbox" id="allowComments" checked> Allow Comments</label>
            <label><input type="checkbox" id="allowEdits"> Allow Edits</label>
          </div>
        </div>
        <div class="approval-footer">
          <button class="btn-secondary" onclick="this.closest('.approval-modal').remove()">Cancel</button>
          <button class="btn-secondary" onclick="generateApprovalLink()">Generate Link Only</button>
          <button class="btn-primary" onclick="sendApprovalRequest()">Send Request</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  };

  window.generateApprovalLink = function() {
    if (!commercialProject) return;

    // Save current room state first
    saveCurrentRoomToProject();

    // Create approval record
    const approval = {
      id: 'appr_' + Date.now(),
      projectId: commercialProject.id,
      token: generateApprovalToken(),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      status: 'pending',
      allowComments: document.getElementById('allowComments')?.checked ?? true,
      allowEdits: document.getElementById('allowEdits')?.checked ?? false
    };

    commercialProject.approvals = commercialProject.approvals || [];
    commercialProject.approvals.push(approval);
    saveCommercialProject();

    // IMPORTANT: Save full project data with the token so it can be retrieved
    const approvalData = {
      ...commercialProject,
      approvalToken: approval.token,
      sharedAt: new Date().toISOString()
    };
    localStorage.setItem('sg_approval_' + approval.token, JSON.stringify(approvalData));

    // Generate link
    const link = `${window.location.origin}/tools/room-designer/?approval=${approval.token}`;

    // Show link in modal
    showGeneratedLinkModal(link, approval.token);
  };

  function showGeneratedLinkModal(link, token) {
    // Remove existing approval modal
    document.getElementById('approvalModal')?.remove();

    const modal = document.createElement('div');
    modal.className = 'approval-modal';
    modal.id = 'approvalLinkModal';
    modal.innerHTML = `
      <div class="approval-content" style="max-width: 500px;">
        <div class="approval-header">
          <h3>✅ Approval Link Generated</h3>
          <button onclick="this.closest('.approval-modal').remove()" style="background:none;border:none;color:var(--text-muted);font-size:24px;cursor:pointer;">&times;</button>
        </div>
        <div class="approval-body">
          <div style="background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 12px; padding: 20px; margin-bottom: 20px;">
            <p style="font-size: 14px; color: #22c55e; margin: 0 0 12px; font-weight: 600;">🔗 Share this link with your client:</p>
            <div style="display: flex; gap: 8px;">
              <input type="text" id="generatedLinkInput" value="${link}" readonly
                style="flex: 1; padding: 12px; background: var(--dark-surface); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 12px; font-family: monospace;">
              <button onclick="copyApprovalLink()" id="copyLinkBtn"
                style="padding: 12px 20px; background: #22c55e; border: none; border-radius: 8px; color: white; font-weight: 600; cursor: pointer; white-space: nowrap;">
                Copy Link
              </button>
            </div>
          </div>
          <div style="background: var(--dark-elevated); border-radius: 10px; padding: 16px;">
            <h4 style="margin: 0 0 12px; font-size: 13px; color: var(--text-muted);">WHAT HAPPENS NEXT:</h4>
            <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: var(--text-secondary); line-height: 1.8;">
              <li>Send this link to your client via email or message</li>
              <li>They can view the full project with all rooms</li>
              <li>They can approve or request changes</li>
              <li>Link expires in 30 days</li>
            </ul>
          </div>
          <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border);">
            <p style="font-size: 12px; color: var(--text-muted); margin: 0;">
              <strong>Token:</strong> ${token}
            </p>
          </div>
        </div>
        <div style="padding: 16px 24px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end;">
          <button onclick="this.closest('.approval-modal').remove()"
            style="padding: 12px 24px; background: linear-gradient(135deg, var(--primary), #8b5cf6); border: none; border-radius: 8px; color: white; font-weight: 600; cursor: pointer;">
            Done
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    // Auto-select the link text
    setTimeout(() => {
      document.getElementById('generatedLinkInput')?.select();
    }, 100);
  }

  window.copyApprovalLink = function() {
    const input = document.getElementById('generatedLinkInput');
    const btn = document.getElementById('copyLinkBtn');
    if (input) {
      navigator.clipboard.writeText(input.value).then(() => {
        btn.textContent = '✓ Copied!';
        btn.style.background = '#16a34a';
        if (typeof showToast === 'function') showToast('Link copied to clipboard!', 'success');
        setTimeout(() => {
          btn.textContent = 'Copy Link';
          btn.style.background = '#22c55e';
        }, 2000);
      }).catch(() => {
        input.select();
        document.execCommand('copy');
        btn.textContent = '✓ Copied!';
      });
    }
  };

  window.sendApprovalRequest = async function() {
    const email = document.getElementById('approvalEmail')?.value;
    const name = document.getElementById('approvalName')?.value;
    const message = document.getElementById('approvalMessage')?.value;

    if (!email) {
      if (typeof showToast === 'function') showToast('Please enter recipient email', 'warning');
      return;
    }

    // Save current room state first
    saveCurrentRoomToProject();

    // Create approval record
    const approval = {
      id: 'appr_' + Date.now(),
      projectId: commercialProject.id,
      token: generateApprovalToken(),
      recipientEmail: email,
      recipientName: name,
      message: message,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
      allowComments: document.getElementById('allowComments')?.checked ?? true,
      allowEdits: document.getElementById('allowEdits')?.checked ?? false,
      includeReport: document.getElementById('includeReport')?.checked ?? true,
      includeCutList: document.getElementById('includeCutList')?.checked ?? true
    };

    commercialProject.approvals = commercialProject.approvals || [];
    commercialProject.approvals.push(approval);
    commercialProject.status = 'pending_approval';
    saveCommercialProject();

    // IMPORTANT: Save full project data with the token so it can be retrieved
    const approvalData = {
      ...commercialProject,
      approvalToken: approval.token,
      recipientEmail: email,
      recipientName: name,
      sharedAt: new Date().toISOString()
    };
    localStorage.setItem('sg_approval_' + approval.token, JSON.stringify(approvalData));

    const link = `${window.location.origin}/tools/room-designer/?approval=${approval.token}`;

    // Try to save to Supabase
    try {
      const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
      if (supabase) {
        await supabase.from('design_approvals').insert({
          project_id: commercialProject.id,
          project_name: commercialProject.name,
          project_data: commercialProject,
          token: approval.token,
          recipient_email: email,
          recipient_name: name,
          message: message,
          status: 'pending',
          expires_at: approval.expiresAt
        });
      }
    } catch (err) {
      console.error('Error saving approval to database:', err);
    }

    // Always show the link modal (email sending would need a backend service)
    showGeneratedLinkModal(link, approval.token);

    if (typeof showToast === 'function') {
      showToast(`Link generated for ${email} - send it manually via email`, 'success');
    }
  };

  function generateApprovalToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 24; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }

  window.generateProjectReport = function() {
    if (!commercialProject) return;

    saveCurrentRoomToProject();

    const report = {
      project: commercialProject.name,
      client: commercialProject.client,
      location: commercialProject.location,
      generatedAt: new Date().toISOString(),
      rooms: commercialProject.rooms.map(room => ({
        name: room.name,
        dimensions: `${room.width}' x ${room.depth}'`,
        elementCount: room.elements?.length || 0,
        elements: (room.elements || []).map(el => ({
          name: el.name,
          width: el.actualWidth || Math.round(el.width / 12),
          depth: el.actualDepth || Math.round(el.height / 12),
          height: el.actualHeight || 34.5,
          type: el.subType || el.type
        }))
      }))
    };

    // Calculate totals
    let totalCabinets = 0;
    let totalCountertopSqFt = 0;

    report.rooms.forEach(room => {
      totalCabinets += room.elementCount;
      // Estimate countertop from room width
      const roomWidthFt = parseFloat(room.dimensions.split('x')[0]) || 0;
      totalCountertopSqFt += roomWidthFt * 2.5; // Estimate 2.5 ft deep counters
    });

    report.totals = {
      rooms: report.rooms.length,
      cabinets: totalCabinets,
      estimatedCountertop: Math.round(totalCountertopSqFt) + ' sq ft'
    };

    // Open print window
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${report.project} - Project Report</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; }
          h1 { color: #1a1a2e; border-bottom: 3px solid #f9cb00; padding-bottom: 10px; }
          h2 { color: #333; margin-top: 30px; }
          .header-info { background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
          .header-info p { margin: 5px 0; }
          .room-section { border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin-bottom: 20px; }
          .room-header { display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background: #f9cb00; color: #1a1a2e; }
          .totals { background: #1a1a2e; color: white; padding: 15px; border-radius: 8px; margin-top: 20px; }
          .totals h3 { margin-top: 0; color: #f9cb00; }
          .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>📋 ${report.project}</h1>
        <div class="header-info">
          <p><strong>Client:</strong> ${report.client || 'N/A'}</p>
          <p><strong>Location:</strong> ${report.location || 'N/A'}</p>
          <p><strong>Generated:</strong> ${new Date(report.generatedAt).toLocaleString()}</p>
        </div>

        ${report.rooms.map(room => `
          <div class="room-section">
            <div class="room-header">
              <h2>${room.name}</h2>
              <span>${room.dimensions} • ${room.elementCount} elements</span>
            </div>
            ${room.elements.length > 0 ? `
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Width</th>
                    <th>Depth</th>
                    <th>Height</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  ${room.elements.map((el, i) => `
                    <tr>
                      <td>${i + 1}</td>
                      <td>${el.name}</td>
                      <td>${el.width}"</td>
                      <td>${el.depth}"</td>
                      <td>${el.height}"</td>
                      <td>${el.type}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : '<p>No elements in this room</p>'}
          </div>
        `).join('')}

        <div class="totals">
          <h3>Project Totals</h3>
          <p><strong>Total Rooms:</strong> ${report.totals.rooms}</p>
          <p><strong>Total Cabinets:</strong> ${report.totals.cabinets}</p>
          <p><strong>Estimated Countertop:</strong> ${report.totals.estimatedCountertop}</p>
        </div>

        <div class="footer">
          Generated by Surprise Granite Room Designer • ${window.location.origin}
        </div>

        <script>window.onload = function() { window.print(); };</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  window.exportCommercialProject = function() {
    if (!commercialProject) return;
    saveCurrentRoomToProject();

    const data = JSON.stringify(commercialProject, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${commercialProject.name.replace(/[^a-z0-9]/gi, '_')}_project.json`;
    a.click();

    URL.revokeObjectURL(url);
    if (typeof showToast === 'function') showToast('Project exported', 'success');
  };

  // === V7 KEYBOARD SHORTCUTS ===
  document.addEventListener('keydown', function(e) {
    const isInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
    if (isInput) return;

    // Shift+C = Cabinet library
    if (e.key === 'C' && e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      window.showCabinetLibrary();
    }
    // Shift+P = Commercial project manager
    if (e.key === 'P' && e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      window.showCommercialProjectManager();
    }
    // Shift+I = PDF importer
    if (e.key === 'I' && e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      window.showPDFImporter();
    }
  });

  // === INIT V7 FEATURES ===
  document.addEventListener('DOMContentLoaded', function() {
    // Load commercial project if exists
    window.loadCommercialProject();

    // Check for approval token in URL
    const params = new URLSearchParams(window.location.search);
    const approvalToken = params.get('approval');
    if (approvalToken) {
      window.loadApprovalView(approvalToken);
    }
  });

  window.loadApprovalView = function(token) {
    // Load project data from localStorage using the token
    const approvalData = localStorage.getItem('sg_approval_' + token);

    if (!approvalData) {
      // Try to load from Supabase if available
      loadApprovalFromServer(token);
      return;
    }

    try {
      const data = JSON.parse(approvalData);
      showApprovalReviewMode(data, token);
    } catch (err) {
      console.error('Error loading approval data:', err);
      if (typeof showToast === 'function') showToast('Invalid approval link', 'error');
    }
  };

  async function loadApprovalFromServer(token) {
    try {
      const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
      if (supabase) {
        const { data, error } = await supabase
          .from('design_approvals')
          .select('*')
          .eq('token', token)
          .single();

        if (data && data.project_data) {
          showApprovalReviewMode(data.project_data, token);
          return;
        }
      }
    } catch (err) {
      console.error('Error fetching from server:', err);
    }

    if (typeof showToast === 'function') showToast('Approval link not found or expired', 'error');
  }

  function showApprovalReviewMode(projectData, token) {
    // Add approval mode class to body
    document.body.classList.add('approval-review-mode');

    // Create approval banner
    const banner = document.createElement('div');
    banner.id = 'approvalBanner';
    banner.className = 'approval-banner';
    banner.innerHTML = `
      <div class="approval-banner-content">
        <div class="approval-banner-info">
          <span class="approval-badge">📋 APPROVAL REQUEST</span>
          <h2>${projectData.name || 'Design Review'}</h2>
          <p>From: ${projectData.client || 'Surprise Granite'} • ${projectData.rooms?.length || 1} Room(s)</p>
        </div>
        <div class="approval-banner-actions">
          <button class="btn-approve" onclick="submitApprovalDecision('${token}', 'approved')">
            ✓ Approve Design
          </button>
          <button class="btn-request-changes" onclick="showRequestChangesModal('${token}')">
            ✎ Request Changes
          </button>
          <button class="btn-reject" onclick="submitApprovalDecision('${token}', 'rejected')">
            ✕ Reject
          </button>
        </div>
      </div>
    `;
    document.body.insertBefore(banner, document.body.firstChild);

    // Load the project data
    commercialProject = projectData;
    saveCommercialProject();

    // If there are rooms, load the first one
    if (projectData.rooms && projectData.rooms.length > 0) {
      window.switchToRoom(0);

      // Show room selector if multiple rooms
      if (projectData.rooms.length > 1) {
        showApprovalRoomSelector(projectData.rooms);
      }
    }

    // Disable editing tools
    disableEditingForApproval();

    if (typeof showToast === 'function') {
      showToast(`Viewing: ${projectData.name} - ${projectData.rooms?.length || 0} rooms`, 'info');
    }
  }

  function showApprovalRoomSelector(rooms) {
    const selector = document.createElement('div');
    selector.id = 'approvalRoomSelector';
    selector.className = 'approval-room-selector';
    selector.innerHTML = `
      <h4>Project Rooms (${rooms.length})</h4>
      <div class="approval-room-list">
        ${rooms.map((room, i) => `
          <button class="approval-room-btn ${i === 0 ? 'active' : ''}" onclick="switchToApprovalRoom(${i})">
            <span class="room-number">${i + 1}</span>
            <span class="room-name">${room.name}</span>
            <span class="room-count">${room.elements?.length || 0} items</span>
          </button>
        `).join('')}
      </div>
    `;

    // Insert after the banner
    const banner = document.getElementById('approvalBanner');
    if (banner) {
      banner.after(selector);
    }
  }

  window.switchToApprovalRoom = function(index) {
    window.switchToRoom(index);

    // Update active state
    document.querySelectorAll('.approval-room-btn').forEach((btn, i) => {
      btn.classList.toggle('active', i === index);
    });
  };

  function disableEditingForApproval() {
    // Hide editing controls
    const style = document.createElement('style');
    style.id = 'approvalModeStyles';
    style.textContent = `
      .approval-review-mode .tool-panel,
      .approval-review-mode .properties-panel .property-group:not(.readonly),
      .approval-review-mode #saveDesignBtn,
      .approval-review-mode .pro-tools-dropdown,
      .approval-review-mode .export-dropdown {
        pointer-events: none;
        opacity: 0.5;
      }

      .approval-banner {
        background: linear-gradient(135deg, #1a1a2e 0%, #2d2d4a 100%);
        border-bottom: 2px solid var(--primary);
        padding: 16px 24px;
        position: sticky;
        top: 0;
        z-index: 9999;
      }

      .approval-banner-content {
        max-width: 1400px;
        margin: 0 auto;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 20px;
        flex-wrap: wrap;
      }

      .approval-badge {
        background: linear-gradient(135deg, var(--primary), #8b5cf6);
        color: white;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 700;
        display: inline-block;
        margin-bottom: 8px;
      }

      .approval-banner-info h2 {
        margin: 0;
        font-size: 20px;
        color: var(--text);
      }

      .approval-banner-info p {
        margin: 4px 0 0;
        font-size: 13px;
        color: var(--text-muted);
      }

      .approval-banner-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .approval-banner-actions button {
        padding: 12px 24px;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .btn-approve {
        background: linear-gradient(135deg, #22c55e, #16a34a);
        color: white;
      }

      .btn-approve:hover {
        transform: scale(1.02);
        box-shadow: 0 4px 15px rgba(34, 197, 94, 0.4);
      }

      .btn-request-changes {
        background: linear-gradient(135deg, #f59e0b, #d97706);
        color: white;
      }

      .btn-request-changes:hover {
        transform: scale(1.02);
      }

      .btn-reject {
        background: rgba(239, 68, 68, 0.2);
        color: #ef4444;
        border: 1px solid rgba(239, 68, 68, 0.3);
      }

      .btn-reject:hover {
        background: #ef4444;
        color: white;
      }

      .approval-room-selector {
        background: var(--dark-surface);
        border-bottom: 1px solid var(--border);
        padding: 12px 24px;
      }

      .approval-room-selector h4 {
        margin: 0 0 10px;
        font-size: 12px;
        color: var(--text-muted);
        text-transform: uppercase;
      }

      .approval-room-list {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .approval-room-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        background: var(--dark-elevated);
        border: 1px solid var(--border);
        border-radius: 8px;
        color: var(--text-muted);
        cursor: pointer;
        transition: all 0.2s;
      }

      .approval-room-btn:hover {
        border-color: var(--primary);
        color: var(--text);
      }

      .approval-room-btn.active {
        background: linear-gradient(135deg, var(--primary), #8b5cf6);
        border-color: var(--primary);
        color: white;
      }

      .approval-room-btn .room-number {
        width: 20px;
        height: 20px;
        background: rgba(255,255,255,0.2);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 700;
      }

      .approval-room-btn .room-name {
        font-size: 13px;
        font-weight: 500;
      }

      .approval-room-btn .room-count {
        font-size: 11px;
        opacity: 0.7;
      }
    `;
    document.head.appendChild(style);
  }

  window.submitApprovalDecision = function(token, decision) {
    const approvalData = localStorage.getItem('sg_approval_' + token);
    if (approvalData) {
      const data = JSON.parse(approvalData);
      data.status = decision;
      data.decidedAt = new Date().toISOString();
      localStorage.setItem('sg_approval_' + token, JSON.stringify(data));
    }

    // Show confirmation
    const modal = document.createElement('div');
    modal.className = 'approval-modal';
    modal.innerHTML = `
      <div class="approval-content" style="max-width: 400px; text-align: center;">
        <div class="approval-body" style="padding: 40px;">
          <div style="font-size: 64px; margin-bottom: 20px;">
            ${decision === 'approved' ? '✅' : '❌'}
          </div>
          <h3 style="margin: 0 0 12px; font-size: 24px;">
            ${decision === 'approved' ? 'Design Approved!' : 'Design Rejected'}
          </h3>
          <p style="color: var(--text-muted); margin: 0 0 24px;">
            ${decision === 'approved'
              ? 'Thank you! The team has been notified of your approval.'
              : 'The team has been notified. They will reach out to discuss alternatives.'}
          </p>
          <button onclick="this.closest('.approval-modal').remove()"
            style="padding: 12px 32px; background: linear-gradient(135deg, var(--primary), #8b5cf6); border: none; border-radius: 8px; color: white; font-weight: 600; cursor: pointer;">
            Close
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Try to update server
    updateApprovalOnServer(token, decision);
  };

  window.showRequestChangesModal = function(token) {
    const modal = document.createElement('div');
    modal.className = 'approval-modal';
    modal.innerHTML = `
      <div class="approval-content" style="max-width: 500px;">
        <div class="approval-header">
          <h3>✎ Request Changes</h3>
          <button onclick="this.closest('.approval-modal').remove()" style="background:none;border:none;color:var(--text-muted);font-size:24px;cursor:pointer;">&times;</button>
        </div>
        <div class="approval-body">
          <p style="color: var(--text-secondary); margin: 0 0 16px;">Please describe the changes you'd like to see:</p>
          <textarea id="changeRequestText" rows="6" placeholder="e.g., Please adjust the cabinet dimensions on Wall 2..."
            style="width: 100%; padding: 12px; background: var(--dark-elevated); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 14px; resize: vertical;"></textarea>
        </div>
        <div style="padding: 16px 24px; border-top: 1px solid var(--border); display: flex; gap: 12px; justify-content: flex-end;">
          <button onclick="this.closest('.approval-modal').remove()"
            style="padding: 12px 24px; background: transparent; border: 1px solid var(--border); border-radius: 8px; color: var(--text-muted); cursor: pointer;">
            Cancel
          </button>
          <button onclick="submitChangeRequest('${token}')"
            style="padding: 12px 24px; background: linear-gradient(135deg, #f59e0b, #d97706); border: none; border-radius: 8px; color: white; font-weight: 600; cursor: pointer;">
            Submit Request
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  };

  window.submitChangeRequest = function(token) {
    const text = document.getElementById('changeRequestText')?.value;
    if (!text?.trim()) {
      if (typeof showToast === 'function') showToast('Please describe the changes needed', 'warning');
      return;
    }

    const approvalData = localStorage.getItem('sg_approval_' + token);
    if (approvalData) {
      const data = JSON.parse(approvalData);
      data.status = 'changes_requested';
      data.changeRequest = text;
      data.decidedAt = new Date().toISOString();
      localStorage.setItem('sg_approval_' + token, JSON.stringify(data));
    }

    document.querySelector('.approval-modal')?.remove();

    // Show confirmation
    const modal = document.createElement('div');
    modal.className = 'approval-modal';
    modal.innerHTML = `
      <div class="approval-content" style="max-width: 400px; text-align: center;">
        <div class="approval-body" style="padding: 40px;">
          <div style="font-size: 64px; margin-bottom: 20px;">📝</div>
          <h3 style="margin: 0 0 12px; font-size: 24px;">Changes Requested</h3>
          <p style="color: var(--text-muted); margin: 0 0 24px;">
            Your feedback has been sent to the team. They will revise the design and send you an updated version.
          </p>
          <button onclick="this.closest('.approval-modal').remove()"
            style="padding: 12px 32px; background: linear-gradient(135deg, var(--primary), #8b5cf6); border: none; border-radius: 8px; color: white; font-weight: 600; cursor: pointer;">
            Close
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    updateApprovalOnServer(token, 'changes_requested', text);
  };

  async function updateApprovalOnServer(token, status, changeRequest = null) {
    try {
      const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
      if (supabase) {
        await supabase
          .from('design_approvals')
          .update({
            status: status,
            change_request: changeRequest,
            decided_at: new Date().toISOString()
          })
          .eq('token', token);
      }
    } catch (err) {
      console.error('Error updating approval on server:', err);
    }
  }

  // Universal approval workflow - works for both commercial projects and single designs
  window.showApprovalWorkflow = function() {
    // If there's a commercial project, use sendForApproval
    if (commercialProject && commercialProject.rooms && commercialProject.rooms.length > 0) {
      window.sendForApproval();
      return;
    }

    // Otherwise show single design approval modal
    const projectName = document.getElementById('projectName')?.value || 'My Design';
    const roomType = document.getElementById('roomType')?.value || 'Kitchen';
    const total = document.getElementById('quoteTotal')?.textContent || '$0';

    const modal = document.createElement('div');
    modal.className = 'approval-modal';
    modal.id = 'approvalModal';
    modal.innerHTML = `
      <div class="approval-content">
        <div class="approval-header">
          <h3>📨 Send for Approval</h3>
          <button onclick="this.closest('.approval-modal').remove()" style="background:none;border:none;color:var(--text-muted);font-size:20px;cursor:pointer;">&times;</button>
        </div>
        <div class="approval-body">
          <div class="approval-preview">
            <h4>${projectName}</h4>
            <p style="font-size:13px;color:var(--text-muted);margin-top:8px;">${roomType}</p>
            <div class="approval-preview-stats">
              <div class="approval-stat">
                <span class="approval-stat-value">${total}</span>
                <span class="approval-stat-label">Estimated</span>
              </div>
            </div>
          </div>
          <div class="recipient-input">
            <label>Recipient Email</label>
            <input type="email" id="approvalEmail" placeholder="client@example.com">
          </div>
          <div class="recipient-input">
            <label>Personal Message (Optional)</label>
            <textarea id="approvalMessage" placeholder="Please review this design..." style="width:100%;padding:14px 16px;background:var(--dark-elevated);border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:14px;resize:vertical;min-height:80px;"></textarea>
          </div>
          <div id="approvalLinkSection" class="approval-link-section">
            <h5>✓ Approval Link Generated</h5>
            <div class="approval-link-box">
              <input type="text" id="approvalLinkInput" readonly>
              <button class="copy-link-btn" onclick="navigator.clipboard.writeText(document.getElementById('approvalLinkInput').value); this.textContent='Copied!';">Copy</button>
            </div>
          </div>
        </div>
        <div class="approval-actions">
          <button class="cancel-approval-btn" onclick="this.closest('.approval-modal').remove()">Cancel</button>
          <button class="send-approval-btn" onclick="generateSingleDesignApprovalLink()">Generate Link</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  };

  window.generateSingleDesignApprovalLink = function() {
    const token = 'appr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const link = `${window.location.origin}/tools/room-designer/?share=${token}`;

    document.getElementById('approvalLinkInput').value = link;
    document.getElementById('approvalLinkSection').classList.add('show');

    // Store for later retrieval
    const approvals = JSON.parse(localStorage.getItem('sg_design_approvals') || '[]');
    approvals.push({
      token: token,
      designId: window.currentDesignId || null,
      createdAt: new Date().toISOString(),
      email: document.getElementById('approvalEmail')?.value || '',
      status: 'pending'
    });
    localStorage.setItem('sg_design_approvals', JSON.stringify(approvals));

    if (typeof showToast === 'function') showToast('Approval link generated!', 'success');
  };

  console.log('Room Designer Pro Features v8.0 loaded - Smart Room Layout from Blueprints');
})();
