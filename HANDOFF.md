# Handoff — Vendor Pricing Learner (Surprise Granite)

Launch a new terminal in bypass mode and paste the prompt below:

```bash
cd /Users/homepc/surprise-granite-site && claude --dangerously-skip-permissions
```

---

**Continue the vendor pricing-learner work for Surprise Granite.** Context from the prior session:

## What's done & verified
- Rebuilt the always-on price learner `voiceNow-crm/backend/services/vendorPriceLearningService.js`. It was corrupting prices (LLM grabbed the sqft *qty* as price → MSI Miraggio Cove showed "$220"; ingested surcharge lines as products). Now:
  - `extractChunk` classifies each line (material vs surcharge/tax/shipping/discount/total).
  - `normalizePrice` derives a true **per-sqft** cost (explicit $/sqft, else slab price ÷ slab sqft from dims), skips samples, prefers L×W for slab area, plausibility-gates slab $/sqft to $2–120.
  - Input gating skips shipment/packing/cc-auth/statement emails + files (the qty-as-price source).
  - Exports: `extractAndStore(userId, vendor, text)`, `extractNormalized(text)` (dry-run, no writes).
- Backfilled the live library. **Verified: MSI Calacatta Miraggio Cove = $23.99/sqft base (invoice IN00331615), +7% MSI surcharge, slab 126×63 = 55 sqft (~$1,322/slab).** Arizona Tile per-slab correctly converts to per-sqft (Bianco Tiza $9.65/2cm, $12.29/3cm). Samples now $5/each; surcharge/tax junk purged.

## ~~Remaining task~~ DONE (2026-07-04) — deterministic ASG + Daltile price-book parsers
Shipped in `vendorPriceLearningService.js` (commits `13e00107` + `638e45dc`): `deterministicPriceBookItems(text)` recognizes both books by text signature and bypasses the LLM entirely.
- **ASG** `Pricelist by Group` (PentalQuartz): per_sqft = SingleSlab ÷ SqFt, dims + bookmatched captured, thickness from the header → names like `Bianco Aspen 2cm  $14.15/sqft`. 39/39 rows verified in the library (incl. Mystique via the Group→$/SF legend).
- **Daltile** `CTF Pricebook`: one entry per priced thickness (1.6/2/3cm) for natural stone + One Quartz/Purevana → 254 slab entries (LLM used to find ZERO slabs — only shower panels). Verified Absolute Black Dual $14.20/2cm $18.40/3cm, Taj Mahal Leathered $38.80/3cm.
- **Newest book wins:** backfill sorts docs by `Effective:`/`Current as of` date; email miners process oldest→newest. `price-backfill-cached.mjs` now takes vendor args (`node scripts/price-backfill-cached.mjs ASG Daltile`).
- Purged stale LLM rows: 43 ASG slab-$-as-each, 60 Daltile panel variants, 13 stray-`Y` names, 2 `Enchented` typos (backup: session scratchpad `purged-rows-backup.json`).
- **Gotcha for future parsers:** the cron's pdf-parse **v2** emits different text than local **1.1.4** (columns separated vs glued) — the parsers accept both; test against v2 text (`new PDFParse({data}).getText()`) before deploying.

## Round 2 (same day) — Bolder Image parsers + cleanup
- **Bolder Image** sheets now deterministic (commit `88a32eb7`): Natural Stone (per-sqft + per-row dims, rows self-verify against the printed slab total) → 82 entries; Quartz (per-slab ÷ header sqft, collection kept in name) → 114 entries. Clearance/super-sale flyers now skipped everywhere (expiring lot prices ≠ replacement cost).
- Purged remaining LLM junk (all backed up in session scratchpad): 122 Bolder each-rows, 118 ASG natural-stone each-rows (per-sqft prices stored as "each", unverifiable).
- ~~BLOCKED: ASG Natural Stone price book~~ **SOLVED**: Gmail was never broken — the msi-lookup-worker cron env was missing `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, so token *refresh* failed (`invalid_request`) whenever the API's hourly refresh wasn't fresh. Both vars are now set on the cron (via Render API). The scripts use the direct Google OAuth (`gmailPushService.getOAuth2Client` → `integrations` collection, service `google`), NOT Composio — Composio is Aria's tool layer only. Fetched the 4.4MB book with `scripts/fetch-vendor-doc.mjs 19f1afbdaf925dd7 ASG`, parsed it deterministically (commit `b81fd9f5`): **109 natural-stone colors, explicit $/sqft** (Amazonite Quartzite $135 → deterministic rows carry `trusted:true`, widening the per-sqft cap to $300; LLM rows keep $120).
- Render job args split on spaces — backfill vendor filter is substring match now (`… price-backfill-cached.mjs Bolder`, not `Bolder Image`).
- Cost library after cleanup: **1,596 entries / 15 vendors**, 553 clean per-sqft slab costs. Master price list (`catalog_products` in Supabase): 5,440 products, 1,380 with cost+margin — slab per-sqft costs intentionally do NOT attach to sample products (guardrail rejects cost ≥ retail); slabs feed the quote engine via LineItemLibrary instead.

## Infra / how to run
- **Mongo:** db `voiceflow-crm`, collection `lineitemlibraries`. Run node scripts from `/Users/homepc/surprise-granite-site/api` (has `mongodb` + `pdf-parse@1.1.4`) with `require('dotenv').config({path:'/Users/homepc/voiceNow-crm/.env'})`. The CRM repo has **no local node_modules**.
- **Cached PDFs already in Mongo** (no Gmail needed — its OAuth token is currently flaky, `invalid_request`):
  - `_vendor_docs` — all vendors' invoices/price-lists, base64 in `dataB64`, plus `vendor`/`filename`/`mimeType`.
  - `_msi_invoice_pdfs` — MSI invoices (`.pdfs[]` with `dataB64`).
  - Parse locally with pdf-parse 1.1.4: `const pdf=require('pdf-parse'); (await pdf(Buffer.from(b64,'base64url'))).text`.
- **Browser/LLM/Gmail work runs on the msi-lookup-worker cron** `crn-d943gkt7vvec73e4cib0` (auto-deploys from `main`; env group has `MONGODB_URI`, `ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`). Trigger one-off jobs via Render API:
  - `POST https://api.render.com/v1/services/{cron}/jobs` body `{"startCommand":"node scripts/X.mjs"}` — **execs WITHOUT a shell, so no `VAR=x` prefixes**.
  - `RENDER_API_KEY` is in `voiceNow-crm/.env` (the local `~/.env` one is stale/401). Deploys take ~2–3 min; poll `GET /v1/services/{cron}/deploys?limit=1` for `live`, then poll the job for `succeeded`.
- **Existing CRM `scripts/`:** `price-backfill-cached.mjs` (reprocess cached PDFs → library, bypasses Gmail), `test-price-learn.mjs` (dry-run), `msi-invoice-fetch.mjs` / `vendor-invoice-fetch.mjs` (Gmail fetch, if token recovers). USER = `6913b021776947444de0638e`.

## Josh's rules (must hold)
- Materials are priced per-sqft but **sold by the whole slab**.
- Per-slab vendors (Bolder Image, Gila, Arizona Tile, ASG, Aracruz) → divide slab price by slab sqft to get $/sqft.
- **Verify cost from actual invoice PDFs, not payment receipts** (a receipt gave a wrong $27.28 vs the invoice's $23.99; the order was invoiced in 3 shipments).
- Watch for decimal misreads (`.00` → `00.00`).
- MSI surcharge is a steady **7%** — keep it a separate model field, never a product.

## Read first
`~/.claude/projects/-Users-homepc-surprise-granite-site/memory/msi-pricing-and-surcharge.md`
(also `countertop-pricing-model.md` for the quote engine).

**Start by writing + running the ASG and Daltile deterministic parsers, then verify the slabs land as clean $/sqft.**
