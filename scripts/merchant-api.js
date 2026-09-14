#!/usr/bin/env node
/**
 * merchant-api.js — talk to Google Merchant Center from the command line.
 *
 * WHY. Merchant Center account 666338555 is still wired to the retired Shopify data
 * source: 611 items disapproved as "Product page unavailable" because their links
 * point at store.surprisegranite.com/products/*, which returns 410 Gone. 34 of them
 * are furniture the business does not sell. Meanwhile /merchant-feed.xml — the real
 * catalogue — has never been added as a data source. Fixing that through the UI is
 * four clicks; doing it here means it is repeatable, reviewable and scriptable.
 *
 *   node scripts/merchant-api.js whoami
 *   node scripts/merchant-api.js sources                 # list data sources
 *   node scripts/merchant-api.js add-feed                # add /merchant-feed.xml (daily fetch)
 *   node scripts/merchant-api.js fetch-now <name>        # trigger an immediate fetch
 *   node scripts/merchant-api.js delete-source <name>    # remove the stale Shopify source
 *   node scripts/merchant-api.js issues [limit]          # per-product issues
 *
 * AUTH — service account, which is what Google documents for managing your OWN
 * Merchant Center account (OAuth is for third parties managing clients):
 *   1. Google Cloud Console -> APIs & Services -> Credentials -> create a service
 *      account, then create a JSON key for it.
 *   2. Enable the Merchant API on that project.
 *   3. Merchant Center -> Settings -> People and access -> add the service account's
 *      email (…@….iam.gserviceaccount.com) as a user with ADMIN access.
 *   4. Save the key OUTSIDE this repo and point the env var at it:
 *        export GOOGLE_APPLICATION_CREDENTIALS=~/.config/surprise-granite/merchant-sa.json
 *        export MERCHANT_ACCOUNT_ID=666338555
 *
 * ⚠️ THIS REPO IS PUBLIC. Never save the key inside it. .gitignore now blocks the
 * usual filenames, but the only safe place is outside the working tree.
 *
 * No external dependencies: the JWT is signed with node's crypto, so this runs
 * without adding googleapis to the project.
 *
 * ⚠️ THE REQUEST SHAPES BELOW ARE TAKEN FROM GOOGLE'S DISCOVERY DOCUMENT, NOT FROM
 * MEMORY. Verify against it before "correcting" them — an automated review proposed
 * three changes that the discovery document contradicts:
 *   curl 'https://merchantapi.googleapis.com/$discovery/rest?version=datasources_v1beta'
 *   curl 'https://merchantapi.googleapis.com/$discovery/rest?version=products_v1beta'
 * Specifically, and all three were checked on 2026-09-13:
 *   - channel IS 'ONLINE_PRODUCTS'. The enum is
 *     [CHANNEL_UNSPECIFIED, ONLINE_PRODUCTS, LOCAL_PRODUCTS, PRODUCTS]. Plain 'ONLINE'
 *     is the OLD Content API value and is rejected here.
 *   - the fetch field IS 'frequency', not 'fetchFrequency'.
 *   - there is NO productStatuses resource. accounts has only {productInputs,
 *     products}; itemLevelIssues lives on the ProductStatus schema reached via
 *     products.list -> product.productStatus. Calling /productStatuses 404s.
 * Also note fileInputType is OUTPUT ONLY — sending it is an error.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const ACCOUNT = process.env.MERCHANT_ACCOUNT_ID;
const SCOPE = 'https://www.googleapis.com/auth/content';
const FEED_URL = 'https://www.surprisegranite.com/merchant-feed.xml';

function die(msg) { console.error(msg); process.exit(1); }

if (!KEY_PATH || !fs.existsSync(KEY_PATH)) {
  die('Set GOOGLE_APPLICATION_CREDENTIALS to the service-account JSON key.\n'
    + 'See the header of this file for how to create one.');
}
if (!ACCOUNT) die('Set MERCHANT_ACCOUNT_ID (the Merchant Center account id, e.g. 666338555).');

const key = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));

const b64 = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o))
  .toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Signed JWT -> access token. Google's documented service-account flow. */
async function token() {
  const now = Math.floor(Date.now() / 1000);
  const claim = { iss: key.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now };
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claim)}`;
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(key.private_key)
    .toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  });
  const j = await res.json();
  if (!j.access_token) die(`token request failed: ${JSON.stringify(j)}`);
  return j.access_token;
}

async function api(pathname, { method = 'GET', body, version = 'datasources/v1beta' } = {}) {
  const t = await token();
  const url = pathname.startsWith('http') ? pathname
    : `https://merchantapi.googleapis.com/${version}/accounts/${ACCOUNT}${pathname}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }
  if (!res.ok) {
    console.error(`HTTP ${res.status} on ${url}`);
    console.error(JSON.stringify(json, null, 2).slice(0, 1500));
    process.exit(1);
  }
  return json;
}

const cmd = process.argv[2] || 'whoami';

(async () => {
  if (cmd === 'whoami') {
    console.log(`service account : ${key.client_email}`);
    console.log(`merchant account: ${ACCOUNT}`);
    const t = await token();
    console.log(`token           : acquired (${t.slice(0, 12)}…)`);
    // A token proves the KEY is valid, nothing more — it is issued by Google's OAuth
    // endpoint without Merchant Center ever being consulted. So whoami used to report
    // success for a service account that had never been added to the account, which
    // is the single most likely setup mistake. Make a real account-scoped call.
    const acct = await api(`https://merchantapi.googleapis.com/accounts/v1beta/accounts/${ACCOUNT}`);
    console.log(`account access  : VERIFIED — "${acct.accountName || acct.name}"`);
    return;
  }

  if (cmd === 'sources') {
    const j = await api('/dataSources');
    const list = j.dataSources || [];
    console.log(`data sources: ${list.length}\n`);
    for (const d of list) {
      const kind = d.primaryProductDataSource ? 'primary-product'
        : d.supplementalProductDataSource ? 'supplemental'
          : Object.keys(d).find(k => k.endsWith('DataSource')) || '?';
      const feed = d.fileInput?.fetchSettings?.fetchUri || d.fileInput?.fileName || '(api/push)';
      console.log(`  ${d.displayName}`);
      console.log(`     name : ${d.name}`);
      console.log(`     kind : ${kind}`);
      console.log(`     input: ${feed}\n`);
    }
    console.log('To remove the stale Shopify source:');
    console.log('  node scripts/merchant-api.js delete-source <the name: field above>');
    return;
  }

  if (cmd === 'add-feed') {
    // Point Merchant Center at a URL only after confirming it actually serves a feed.
    // A data source whose scheduled fetch fails looks identical in the UI to one that
    // is merely empty, and it quietly advertises nothing until someone digs in.
    process.stdout.write(`checking ${FEED_URL} … `);
    const probe = await fetch(FEED_URL);
    const xmlText = probe.ok ? await probe.text() : '';
    const itemCount = (xmlText.match(/<item>/g) || []).length;
    if (!probe.ok || itemCount < 1) {
      die(`\nfeed is not servable (HTTP ${probe.status}, ${itemCount} items). `
        + 'Run `node scripts/build-merchant-feed.js --write`, deploy, then retry.');
    }
    console.log(`OK — HTTP ${probe.status}, ${itemCount} items`);

    const body = {
      displayName: 'surprisegranite.com product feed',
      primaryProductDataSource: { channel: 'ONLINE_PRODUCTS', countries: ['US'], contentLanguage: 'en', feedLabel: 'US' },
      fileInput: {
        fetchSettings: {
          enabled: true, fetchUri: FEED_URL, frequency: 'FREQUENCY_DAILY',
          timeZone: 'America/Phoenix', dayOfMonth: 0, dayOfWeek: 'DAY_OF_WEEK_UNSPECIFIED', timeOfDay: { hours: 6, minutes: 0 },
        },
      },
    };
    const j = await api('/dataSources', { method: 'POST', body });
    console.log('created:\n' + JSON.stringify(j, null, 2).slice(0, 1200));
    return;
  }

  if (cmd === 'fetch-now') {
    const name = process.argv[3];
    if (!name) die('usage: fetch-now accounts/<id>/dataSources/<id>   (from `sources`)');
    // Otherwise the first pull waits for tomorrow's 6am schedule.
    await api(`https://merchantapi.googleapis.com/datasources/v1beta/${name}:fetch`, { method: 'POST', body: {} });
    console.log('fetch requested. Processing takes a few minutes; then run `issues`.');
    return;
  }

  if (cmd === 'delete-source') {
    const name = process.argv[3];
    if (!name) die('usage: delete-source accounts/<id>/dataSources/<id>   (from `sources`)');
    // Destructive and not undoable from here — say exactly what is going.
    console.log(`deleting ${name} …`);
    await api(`https://merchantapi.googleapis.com/datasources/v1beta/${name}`, { method: 'DELETE' });
    console.log('deleted. Re-run `sources` to confirm.');
    return;
  }

  if (cmd === 'issues') {
    const limit = Number(process.argv[3] || 50);
    const j = await api(`/products?pageSize=${Math.min(limit, 250)}`, { version: 'products/v1beta' });
    const ps = j.products || [];
    const tally = new Map();
    for (const p of ps) {
      for (const d of (p.productStatus?.itemLevelIssues || [])) {
        const k = `${d.severity || '?'} — ${d.description || d.code}`;
        tally.set(k, (tally.get(k) || 0) + 1);
      }
    }
    console.log(`sampled ${ps.length} products\n`);
    for (const [k, v] of [...tally].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);
    if (!tally.size) console.log('  no item-level issues in this page');
    return;
  }

  die(`unknown command "${cmd}" — see the header for usage.`);
})();
