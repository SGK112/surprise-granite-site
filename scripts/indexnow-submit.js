#!/usr/bin/env node
/**
 * Submit URLs to IndexNow → instant crawl signal to Bing, Yandex, Seznam, Naver
 * (Google does NOT consume IndexNow — it still uses the sitemap/GSC).
 *
 * The key file must be live first: https://www.surprisegranite.com/<key>.txt (content = key).
 *
 *   node scripts/indexnow-submit.js                 # submit the key landing pages
 *   node scripts/indexnow-submit.js /some/page/ ... # submit specific paths/URLs
 *   node scripts/indexnow-submit.js --sitemap X.xml # submit every <loc> in a sitemap
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const HOST = 'www.surprisegranite.com';
const SITE = 'https://' + HOST;
const ROOT = path.join(__dirname, '..');
// The key IS the hosted file's basename (public by design — it lives at /<key>.txt).
const keyFile = fs.readdirSync(ROOT).find(f => /^[a-f0-9]{16,64}\.txt$/.test(f));
if (!keyFile) throw new Error('IndexNow key file (<hex>.txt) not found at repo root');
const KEY = keyFile.replace(/\.txt$/, '');

// High-value landing pages — the ones worth an instant re-crawl after edits.
const DEFAULT = [
  '/', '/marketplace/', '/materials/all-countertops/', '/materials/flooring/', '/materials/all-tile/',
  '/materials/countertops/granite-countertops/', '/materials/countertops/quartz-countertops/',
  '/materials/countertops/marble-countertops/', '/materials/countertops/quartzite-countertops/',
  '/materials/countertops/porcelain-countertops/', '/materials/countertops/dekton-countertops/',
  '/marketplace/sinks/', '/marketplace/faucets/', '/marketplace/kitchen-accessories/',
  '/marketplace/bathroom/', '/marketplace/remnants/', '/stone-yards/',
];

function fromSitemap(file) {
  const xml = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
}

const args = process.argv.slice(2);
let urls;
if (args[0] === '--sitemap') urls = fromSitemap(args[1]);
else if (args[0] === '--file') urls = fs.readFileSync(args[1], 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
else if (args.length) urls = args.map(u => (u.startsWith('http') ? u : SITE + u));
else urls = DEFAULT.map(u => SITE + u);

if (!urls.length) { console.log('no URLs to submit — nothing to do'); process.exit(0); }

// IndexNow accepts up to 10,000 URLs per request.
const batches = [];
for (let i = 0; i < urls.length; i += 10000) batches.push(urls.slice(i, i + 10000));

(async function () {
  for (const [i, batch] of batches.entries()) {
    const body = JSON.stringify({ host: HOST, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList: batch });
    await new Promise((resolve) => {
      const req = https.request('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) },
      }, (res) => {
        let d = ''; res.on('data', (c) => (d += c));
        res.on('end', () => {
          // 200/202 = accepted · 400 = bad body · 403 = key not found/invalid · 422 = URL/host mismatch · 429 = rate-limited
          console.log(`batch ${i + 1}/${batches.length} (${batch.length} urls) → ${res.statusCode} ${d || '(accepted)'}`);
          resolve();
        });
      });
      req.on('error', (e) => { console.error('IndexNow error:', e.message); resolve(); });
      req.write(body); req.end();
    });
  }
  console.log(`\nsubmitted ${urls.length} URLs to IndexNow (Bing/Yandex/Seznam/Naver)`);
})();
