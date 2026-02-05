/**
 * UI Validation Tests for Surprise Granite Account Dashboard
 * Tests CSS classes, JavaScript functions, and HTML structure
 */

const fs = require('fs');
const path = require('path');

// ANSI colors for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

let passCount = 0;
let failCount = 0;
let warnCount = 0;

function pass(msg) {
  passCount++;
  console.log(`${colors.green}✓${colors.reset} ${msg}`);
}

function fail(msg) {
  failCount++;
  console.log(`${colors.red}✗${colors.reset} ${msg}`);
}

function warn(msg) {
  warnCount++;
  console.log(`${colors.yellow}⚠${colors.reset} ${msg}`);
}

function section(title) {
  console.log(`\n${colors.bold}${colors.blue}═══ ${title} ═══${colors.reset}\n`);
}

// Read the HTML file
const htmlPath = path.join(__dirname, '..', 'account', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// Extract CSS from <style> tags
const styleMatches = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
const css = styleMatches.map(s => s.replace(/<\/?style[^>]*>/gi, '')).join('\n');

// Extract JS from <script> tags (inline only)
const scriptMatches = html.match(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi) || [];
const js = scriptMatches.map(s => s.replace(/<\/?script[^>]*>/gi, '')).join('\n');

// ============ CSS CLASS TESTS ============
section('CSS Class Validation');

const requiredClasses = [
  // Navigation
  '.nav-item',
  '.nav-item.active',
  '.sidebar',
  '.sidebar.collapsed',

  // Toolbar
  '.toolbar-btn',
  '.toolbar-btn.active',
  '.page-toolbar',

  // Buttons
  '.btn-modern',
  '.btn-modern.primary',
  '.btn-modern.secondary',
  '.btn-modern.ghost',
  '.btn-modern.outline',
  '.btn-modern.loading',
  '.btn-modern.success',
  '.btn-modern.danger',

  // Cards
  '.card',
  '.card-header',
  '.card-body',
  '.stat-card',

  // Forms
  '.form-group',
  '.form-row',
  '.form-inline',
  '.form-error',
  '.form-hint',

  // Tables
  'tr.clickable',
  'tr.selected',

  // Loading
  '.loading-spinner',
  '.loading-overlay',
  '.loading-shimmer',

  // Chips/Tags
  '.chip',
  '.chip.primary',
  '.chip.success',
  '.chip.warning',
  '.chip.danger',
  '.chip-group',

  // Status
  '.status-badge',
  '.empty-state',

  // Kanban
  '.kanban-column',
  '.kanban-board',

  // Calendar
  '.calendar-day',
  '.calendar-event',
  '.calendar-day.today',

  // Modals
  '.modal-overlay',
  '.modal',

  // Filter Pills
  '.filter-pill',
  '.filter-pill.active',

  // Tooltips
  '[data-tooltip]',
];

requiredClasses.forEach(cls => {
  // Handle attribute selectors
  const searchPattern = cls.startsWith('[')
    ? cls.replace('[', '\\[').replace(']', '\\]')
    : cls.replace('.', '\\.').replace(/\s+/g, '\\s*');

  const regex = new RegExp(searchPattern + '\\s*\\{', 'i');
  if (regex.test(css)) {
    pass(`CSS class defined: ${cls}`);
  } else {
    fail(`CSS class missing: ${cls}`);
  }
});

// ============ JAVASCRIPT FUNCTION TESTS ============
section('JavaScript Function Validation');

const requiredFunctions = [
  // Navigation
  'showPage',
  'toggleSidebar',
  'toggleSidebarCollapse',

  // Modals
  'openAddLeadModal',
  'closeLeadModal',
  'openNewProjectModal',
  'openCalendarEventModal',
  'openInvoiceModal',
  'closeInvoiceModal',

  // CRUD Operations
  'loadLeads',
  'loadProjects',
  'loadCalendarEvents',
  'loadInvoices',
  'loadEstimates',

  // Views
  'setLeadsView',
  'setProjectsView',
  'setJobsView',

  // Utility
  'showToast',
  'showKeyboardShortcuts',
  'getStatusColor',
  'escapeHtml',

  // Navigation helpers
  'openInGoogleMaps',
  'buildFullAddress',
  'getNavigationUrl',

  // En Route
  'shareEnRouteStatus',

  // Drag & Drop
  'handleCalendarDragOver',
  'handleCalendarDrop',
];

requiredFunctions.forEach(fn => {
  const patterns = [
    new RegExp(`function\\s+${fn}\\s*\\(`),
    new RegExp(`(const|let|var)\\s+${fn}\\s*=\\s*(async\\s+)?function`),
    new RegExp(`(const|let|var)\\s+${fn}\\s*=\\s*(async\\s+)?\\(`),
    new RegExp(`${fn}\\s*:\\s*(async\\s+)?function`),
  ];

  const found = patterns.some(p => p.test(js));
  if (found) {
    pass(`Function defined: ${fn}()`);
  } else {
    fail(`Function missing: ${fn}()`);
  }
});

// ============ ONCLICK HANDLER VALIDATION ============
section('Button onClick Handler Validation');

const onclickMatches = html.match(/onclick="([^"]+)"/g) || [];
const onclickFunctions = new Set();

// Reserved JS keywords to ignore
const jsKeywords = new Set(['if', 'else', 'for', 'while', 'switch', 'return', 'function', 'this', 'event', 'true', 'false', 'null', 'undefined']);

onclickMatches.forEach(match => {
  const funcMatch = match.match(/onclick="([a-zA-Z_][a-zA-Z0-9_]*)\(/);
  if (funcMatch && !jsKeywords.has(funcMatch[1])) {
    onclickFunctions.add(funcMatch[1]);
  }
});

onclickFunctions.forEach(fn => {
  const patterns = [
    new RegExp(`function\\s+${fn}\\s*\\(`),
    new RegExp(`(const|let|var)\\s+${fn}\\s*=`),
    new RegExp(`${fn}\\s*:\\s*function`),
  ];

  const found = patterns.some(p => p.test(js));
  if (found) {
    pass(`onclick handler valid: ${fn}()`);
  } else {
    fail(`onclick handler references undefined function: ${fn}()`);
  }
});

// ============ KEYBOARD SHORTCUT TESTS ============
section('Keyboard Shortcut Validation');

const keyboardShortcuts = [
  { key: 'Escape', desc: 'Close modals' },
  { key: 'd', desc: 'Navigate to Dashboard' },
  { key: 'l', desc: 'Navigate to Leads' },
  { key: 'p', desc: 'Navigate to Projects' },
  { key: 'c', desc: 'Navigate to Calendar' },
  { key: 'f', desc: 'Navigate to Finance' },
  { key: '?', desc: 'Show keyboard shortcuts' },
];

keyboardShortcuts.forEach(({ key, desc }) => {
  const escapedKey = key.replace('?', '\\?');
  const patterns = [
    new RegExp(`e\\.key\\s*===?\\s*['"\`]${escapedKey}['"\`]`, 'i'),
    new RegExp(`case\\s*['"\`]${escapedKey}['"\`]\\s*:`, 'i'),
  ];
  const found = patterns.some(p => p.test(js));
  if (found) {
    pass(`Keyboard shortcut: ${key} - ${desc}`);
  } else {
    fail(`Keyboard shortcut missing: ${key} - ${desc}`);
  }
});

// ============ DATA ATTRIBUTE TESTS ============
section('Data Attribute Validation');

// Check toolbar buttons have data-page attributes
const toolbarButtons = html.match(/<button[^>]*class="toolbar-btn"[^>]*data-page="[^"]*"[^>]*>/g) || [];
if (toolbarButtons.length >= 4) {
  pass(`Toolbar buttons have data-page attributes (${toolbarButtons.length} found)`);
} else {
  warn(`Expected at least 4 toolbar buttons with data-page, found ${toolbarButtons.length}`);
}

// Check nav items have data-page attributes
const navItems = html.match(/class="nav-item"[^>]*data-page="[^"]*"/g) || [];
if (navItems.length >= 5) {
  pass(`Nav items have data-page attributes (${navItems.length} found)`);
} else {
  warn(`Expected at least 5 nav items with data-page, found ${navItems.length}`);
}

// ============ KANBAN COLUMN CONSISTENCY ============
section('Kanban Column Consistency');

const kanbanWidths = html.match(/kanban-column[^>]*min-width:\s*(\d+)px/g) || [];
const widthValues = kanbanWidths.map(m => {
  const match = m.match(/min-width:\s*(\d+)px/);
  return match ? parseInt(match[1]) : 0;
});

const uniqueWidths = [...new Set(widthValues)];
if (uniqueWidths.length === 1 && uniqueWidths[0] === 280) {
  pass(`All kanban columns use consistent 280px width`);
} else if (uniqueWidths.length === 1) {
  warn(`Kanban columns use consistent ${uniqueWidths[0]}px width (expected 280px)`);
} else {
  fail(`Inconsistent kanban column widths: ${uniqueWidths.join(', ')}px`);
}

// ============ ANIMATION TESTS ============
section('Animation Definitions');

const requiredAnimations = [
  'fadeIn',
  'modalIn',
  'spin',
  'shimmer',
  'pageIn',
  'subtlePulse',
  'btnSpin',
];

requiredAnimations.forEach(anim => {
  const regex = new RegExp(`@keyframes\\s+${anim}\\s*\\{`);
  if (regex.test(css)) {
    pass(`Animation defined: @keyframes ${anim}`);
  } else {
    fail(`Animation missing: @keyframes ${anim}`);
  }
});

// ============ ACCESSIBILITY TESTS ============
section('Accessibility Checks');

// Check for focus-visible styling
if (css.includes(':focus-visible')) {
  pass('Focus-visible styling defined');
} else {
  fail('Missing :focus-visible styling');
}

// Check buttons have titles
const buttonsWithTitles = (html.match(/<button[^>]*title="[^"]+"/g) || []).length;
const totalButtons = (html.match(/<button/g) || []).length;
const titlePercentage = Math.round((buttonsWithTitles / totalButtons) * 100);
if (titlePercentage >= 50) {
  pass(`${titlePercentage}% of buttons have title attributes (${buttonsWithTitles}/${totalButtons})`);
} else {
  warn(`Only ${titlePercentage}% of buttons have title attributes (${buttonsWithTitles}/${totalButtons})`);
}

// Check for aria-label usage
const ariaLabels = (html.match(/aria-label="/g) || []).length;
if (ariaLabels >= 5) {
  pass(`Aria-label attributes found: ${ariaLabels}`);
} else {
  warn(`Low aria-label usage: only ${ariaLabels} found`);
}

// ============ COLOR/THEME CONSISTENCY ============
section('Theme Variable Usage');

const themeVars = [
  '--gold-primary',
  '--dark-primary',
  '--dark-elevated',
  '--text-primary',
  '--text-muted',
  '--border-subtle',
  '--success',
  '--error',
  '--warning',
];

themeVars.forEach(varName => {
  const usageCount = (css.match(new RegExp(`var\\(${varName.replace('--', '--')}\\)`, 'g')) || []).length;
  if (usageCount >= 3) {
    pass(`Theme variable used: ${varName} (${usageCount} times)`);
  } else if (usageCount > 0) {
    warn(`Theme variable underused: ${varName} (only ${usageCount} times)`);
  } else {
    fail(`Theme variable not used: ${varName}`);
  }
});

// ============ SUMMARY ============
section('Test Summary');

console.log(`${colors.green}Passed: ${passCount}${colors.reset}`);
console.log(`${colors.red}Failed: ${failCount}${colors.reset}`);
console.log(`${colors.yellow}Warnings: ${warnCount}${colors.reset}`);
console.log();

if (failCount === 0) {
  console.log(`${colors.bold}${colors.green}All critical tests passed!${colors.reset}`);
  process.exit(0);
} else {
  console.log(`${colors.bold}${colors.red}Some tests failed. Please review.${colors.reset}`);
  process.exit(1);
}
