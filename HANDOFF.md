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

## Remaining task — deterministic table parsers for two price-BOOK vendors
Pure-LLM extraction is inconsistent on these (varies run-to-run); their columns are perfectly regular, so parse deterministically:
- **ASG** (`PQ 2cm - Arizona` PDF): rows are `SKU  COLOR  <L>X<W>  <SqFt>  $<SingleSlab>` → per_sqft = SingleSlab ÷ SqFt.
  - e.g. `PQ2005 BIANCO ASPEN 130X79 71.32 $1,009` → **$14.15/sqft**.
- **Daltile** (`CTF Pricebook` PDF): rows are `<Type><SKU><Color><Finish>$<2cm>$<3cm>` (both columns are per-sqft); emit one entry per thickness, skip `-`.
  - e.g. `Granite G771 Absolute Black Dual $14.20 $18.40` → two entries (2cm $14.20, 3cm $18.40).

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
