/**
 * JavaScript Syntax Validator for account/index.html
 */

const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'account', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

console.log('=== Checking for escaped backticks ===');
const escapedBackticks = html.match(/\\\`/g);
if (escapedBackticks) {
  console.log(`✗ Found ${escapedBackticks.length} escaped backticks`);
  // Find line numbers
  const lines = html.split('\n');
  lines.forEach((line, i) => {
    if (line.includes('\\`')) {
      console.log(`  Line ${i + 1}: ${line.substring(0, 100)}...`);
    }
  });
} else {
  console.log('✓ No escaped backticks found');
}

console.log('\n=== Checking for escaped dollar signs in template literals ===');
const escapedDollars = html.match(/\\\$\{/g);
if (escapedDollars) {
  console.log(`✗ Found ${escapedDollars.length} escaped template expressions`);
  const lines = html.split('\n');
  lines.forEach((line, i) => {
    if (line.includes('\\${')) {
      console.log(`  Line ${i + 1}: ${line.substring(0, 100)}...`);
    }
  });
} else {
  console.log('✓ No escaped template expressions found');
}

console.log('\n=== Extracting and validating JavaScript ===');

// Extract inline scripts (not src scripts)
const scriptRegex = /<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi;
let match;
const scripts = [];
while ((match = scriptRegex.exec(html)) !== null) {
  scripts.push(match[1]);
}

console.log(`Found ${scripts.length} inline script blocks`);

const js = scripts.join('\n;\n');

// Check for common syntax issues
const issues = [];

// Check for unbalanced template literals
let backtickCount = 0;
let inString = false;
let stringChar = '';
for (let i = 0; i < js.length; i++) {
  const char = js[i];
  const prev = js[i - 1];

  if (!inString && (char === '"' || char === "'" || char === '`') && prev !== '\\') {
    inString = true;
    stringChar = char;
    if (char === '`') backtickCount++;
  } else if (inString && char === stringChar && prev !== '\\') {
    inString = false;
    stringChar = '';
  }
}

console.log(`Template literal backticks found: ${backtickCount} (should be even)`);
if (backtickCount % 2 !== 0) {
  issues.push('Unbalanced template literals (odd number of backticks)');
}

// Try to parse
try {
  new Function(js);
  console.log('✓ JavaScript syntax is valid');
} catch (e) {
  console.log(`✗ JavaScript syntax error: ${e.message}`);
  issues.push(e.message);

  // Try to find approximate location
  const lines = js.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Check for obvious issues
    if (line.includes('\\`')) {
      console.log(`  Possible issue at JS line ${i + 1}: escaped backtick`);
    }
    if (line.includes('\\${')) {
      console.log(`  Possible issue at JS line ${i + 1}: escaped template expression`);
    }
  }
}

console.log('\n=== Checking for other common issues ===');

// Check for unclosed strings
const unclosedStringPatterns = [
  /=\s*"[^"]*$/m,
  /=\s*'[^']*$/m,
];

// Check for mismatched brackets in onclick handlers
const onclickHandlers = html.match(/onclick="[^"]+"/g) || [];
let bracketIssues = 0;
onclickHandlers.forEach((handler, idx) => {
  const content = handler.replace(/^onclick="/, '').replace(/"$/, '');
  const open = (content.match(/\(/g) || []).length;
  const close = (content.match(/\)/g) || []).length;
  if (open !== close) {
    bracketIssues++;
    if (bracketIssues <= 5) {
      console.log(`  Mismatched parentheses in onclick: ${content.substring(0, 60)}...`);
    }
  }
});
if (bracketIssues === 0) {
  console.log('✓ All onclick handlers have balanced parentheses');
} else {
  console.log(`✗ Found ${bracketIssues} onclick handlers with mismatched parentheses`);
}

// Summary
console.log('\n=== Summary ===');
if (issues.length === 0) {
  console.log('✓ All syntax checks passed!');
  process.exit(0);
} else {
  console.log(`✗ Found ${issues.length} issue(s):`);
  issues.forEach(issue => console.log(`  - ${issue}`));
  process.exit(1);
}
