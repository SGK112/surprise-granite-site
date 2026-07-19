#!/usr/bin/env node
/**
 * Map a list of changed repo file paths → public URLs for IndexNow.
 * Reads paths from an arg file (or stdin), one per line; prints deduped URLs.
 * Only emits index.html-derived clean URLs (standalone/legacy/tooling paths are skipped
 * so we never ping IndexNow with a 404).
 *
 *   git diff --name-only A B | node scripts/changed-to-urls.js
 *   node scripts/changed-to-urls.js /tmp/changed.txt
 */
const fs = require('fs');
const SITE = 'https://www.surprisegranite.com';
const SKIP = /(^|\/)(node_modules|scripts|templates|api|\.github|supabase|css|js|images|migrated)\//i;
const SKIP_NAME = /index-legacy|home-v2\/|home-preview\/|\.new$/i;

const raw = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : fs.readFileSync(0, 'utf8');
const urls = new Set();
for (const line of raw.split('\n')) {
  const f = line.trim();
  if (!f || !f.endsWith('.html') || SKIP.test(f) || SKIP_NAME.test(f)) continue;
  if (f === 'index.html') urls.add(SITE + '/');
  else if (f.endsWith('/index.html')) urls.add(SITE + '/' + f.slice(0, -'index.html'.length));
  // non-index .html files are skipped — their live routing is ambiguous
}
process.stdout.write([...urls].join('\n') + (urls.size ? '\n' : ''));
