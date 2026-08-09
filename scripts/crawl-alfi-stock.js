#!/usr/bin/env node
/**
 * Read live stock for Alfi Trade products off alfitrade.com.
 *
 * Alfi has no portal and no feed, but their storefront runs Amasty stock-status, so every
 * product page carries schema.org availability plus a badge with a restock date
 * ("Back Order, will ship out by 02/15/2026"). A 404 means they no longer list it.
 *
 * Their site rate-limits: a concurrency-8 run got 429 on 1,060 of 1,252 pages after ~190
 * requests. Hence the slow default and the backoff. Rows already crawled today are skipped,
 * so an interrupted run resumes instead of starting over.
 *
 * Replaces rebuild-alfi-catalog.js, which reads a 2026-07-06 snapshot from a scratch dir that
 * no longer exists. That data rotted — 5 of 10 SKUs it called "Out of Stock" were live In Stock.
 *
 * Usage: node scripts/crawl-alfi-stock.js [--write] [--limit N] [--concurrency N] [--force]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const WRITE = process.argv.includes('--write');
const FORCE = process.argv.includes('--force');
const arg = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? parseInt(process.argv[i + 1], 10) : dflt;
};
const LIMIT = arg('--limit', Infinity);
const CONCURRENCY = arg('--concurrency', 2);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const TODAY = new Date().toISOString().slice(0, 10);

for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL missing from .env.local'); process.exit(1); }

// psql on the session pooler; <ref>.supabase.co doesn't resolve here. -A defaults to '|'.
const psql = (sql) => execFileSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-tA', '-c', sql],
  { maxBuffer: 1 << 28 }).toString();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const get = (url) => new Promise((resolve) => {
  execFile('curl', ['-sL', '-m', '35', '-A', UA, '-w', '\n__HTTP__%{http_code}', url],
    { maxBuffer: 1 << 26 }, (err, stdout) => {
      const s = String(stdout || '');
      const i = s.lastIndexOf('\n__HTTP__');
      if (i === -1) return resolve({ status: err ? 0 : 200, body: s });
      resolve({ status: parseInt(s.slice(i + 9), 10) || 0, body: s.slice(0, i) });
    });
});

// Back off on 429 rather than hammering through it — a blocked crawl reads as "unknown",
// and unknown must never change what we publish.
async function fetchPage(url) {
  let wait = 4000;
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await get(url);
    if (r.status !== 429) return r;
    await sleep(wait);
    wait *= 2;
  }
  return { status: 429, body: '' };
}

const SELLABLE = new Set(['InStock', 'LimitedAvailability', 'PreOrder']);

function readStock(html) {
  const schema = /"availability"\s*:\s*"?https?:\/\/schema\.org\/(\w+)/.exec(html);
  const amasty = /amstockstatus_icon"[^>]*\balt="([^"]+)"/.exec(html)
    || /\balt="([^"]*(?:Back Order|In Stock|Out of Stock|Special Order)[^"]*)"/i.exec(html);
  const label = amasty ? amasty[1].trim() : null;
  const eta = label && /ship out by\s*([0-9/\-]+)/i.exec(label);
  let state = schema ? schema[1] : null;
  // The badge is more specific than the schema tag and wins when they disagree.
  if (label && /out of stock/i.test(label)) state = 'OutOfStock';
  else if (label && /back ?order/i.test(label)) state = 'BackOrder';
  return { state, label, eta: eta ? eta[1] : null };
}

const freshFilter = FORCE ? '' : `and coalesce(specs->>'crawled_at','') <> '${TODAY}'`;
const rows = psql(
  `select id, coalesce(sku,''), vendor_url, coalesce(in_stock,false)
     from catalog_products
    where vendor_id = 'alfi-trade' and vendor_url is not null and vendor_url <> '' ${freshFilter}
    order by sku`
).trim().split('\n').filter(Boolean).map((l) => {
  const [id, sku, url, in_stock] = l.split('|');
  return { id, sku, url, in_stock: in_stock === 't' };
}).slice(0, LIMIT);

async function main() {
  if (!rows.length) { console.log(`nothing to crawl — all rows already carry crawled_at=${TODAY} (use --force)`); return; }
  console.log(`crawling ${rows.length} pages, concurrency ${CONCURRENCY}\n`);

  const results = [];
  let cursor = 0;
  let done = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= rows.length) return;
      const r = rows[i];
      const { status, body } = await fetchPage(r.url);
      let state = null, label = null, eta = null;
      if (status === 404 || status === 410) { state = 'Delisted'; label = 'not on vendor site'; }
      else if (status === 200) ({ state, label, eta } = readStock(body));
      else label = `http ${status}`;
      results.push({ ...r, status, state, label, eta });
      if (++done % 100 === 0) console.log(`  ${done}/${rows.length}`);
      await sleep(400);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const by = {};
  for (const r of results) by[r.state || `unreadable(${r.status})`] = (by[r.state || `unreadable(${r.status})`] || 0) + 1;
  console.log('\nlive stock:');
  for (const [k, v] of Object.entries(by).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);

  // Act only on readable pages. One blocked crawl must not delist the catalogue.
  const decided = results.filter((r) => r.state);
  const changes = decided.filter((r) => SELLABLE.has(r.state) !== r.in_stock);
  console.log(`\nreadable ${decided.length}/${results.length} · changes ${changes.length} ` +
    `(${changes.filter((c) => c.in_stock).length} off sale, ${changes.filter((c) => !c.in_stock).length} back on)`);
  for (const c of changes.slice(0, 12)) {
    console.log(`   ${c.sku.padEnd(16)} -> ${SELLABLE.has(c.state) ? 'in stock' : 'unavailable'}  (${c.label || c.state})`);
  }

  const out = path.join(require('os').tmpdir(), `alfi-stock-${Date.now()}.json`);
  fs.writeFileSync(out, JSON.stringify(results, null, 1));
  console.log(`\nresults: ${out}`);
  if (!WRITE) { console.log('Dry run — nothing written.'); return; }
  if (!decided.length) { console.log('nothing readable to write'); return; }

  const esc = (v) => String(v == null ? '' : v).replace(/'/g, "''");
  const vals = decided.map((r) =>
    `('${esc(r.id)}'::uuid, ${SELLABLE.has(r.state)}, '${esc(r.state)}', '${esc(r.label)}', ${r.eta ? `'${esc(r.eta)}'` : 'null'})`
  ).join(',\n    ');
  const f = path.join(require('os').tmpdir(), `alfi-stock-${Date.now()}.sql`);
  fs.writeFileSync(f, `begin;
update catalog_products c
   set in_stock = v.sellable,
       specs = coalesce(c.specs,'{}'::jsonb) || jsonb_build_object(
         'alfi_stock', v.state, 'alfi_stock_label', v.label,
         'alfi_stock_eta', v.eta, 'crawled_at', '${TODAY}'),
       updated_at = now()
  from (values
    ${vals}
  ) as v(id, sellable, state, label, eta)
 where c.id = v.id;
commit;`);
  execFileSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-f', f], { stdio: 'inherit' });
  console.log(`updated ${decided.length} rows`);
}

// An unhandled rejection here would exit 0 and look like success on a script that writes
// production data. Fail loudly instead.
main().catch((err) => {
  console.error('crawl failed:', err && err.message ? err.message : err);
  process.exit(1);
});
