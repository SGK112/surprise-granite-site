/**
 * AI Routes
 * Handles all AI-powered endpoints: visualizer, video generation, blueprint analysis
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { handleApiError } = require('../utils/security');
const { aiRateLimiter } = require('../middleware/rateLimiter');
const { buildEstimate } = require('../lib/takeoff/estimator');
const { authenticateJWT } = require('../lib/auth/middleware');
const { createClient } = require('@supabase/supabase-js');

// Service-role Supabase client for backend writes (bypasses RLS for admin
// operations like recording an unauthenticated proposal acceptance).
let __sgServiceClient = null;
function getServiceClient() {
  if (__sgServiceClient) return __sgServiceClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  __sgServiceClient = createClient(url, key, { auth: { persistSession: false } });
  return __sgServiceClient;
}

// User-context client (uses caller's JWT so RLS applies). Pass in the access
// token from the Authorization header.
function getUserClient(accessToken) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey || !accessToken) return null;
  return createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

// ──────────────────────────────────────────────────────────────────────
// Service-or-JWT auth for read-only takeoff endpoints.
//
// VoiceNow's Aria backend reaches these endpoints server-to-server. Real
// per-user Supabase JWTs are 1-hour expiring, so a static env var is a
// non-starter. Instead we accept the same X-Aria-Service-Key pattern that
// requireAdmin already uses (api/middleware/adminAuth.js:67-78) — caller
// presents the shared secret + user_id query param, we scope the query
// using the service-role client.
//
// Read-only only. POST/DELETE on these routes intentionally still require
// a real user JWT — service-key writes have no audit trail per-user.
// ──────────────────────────────────────────────────────────────────────
function serviceOrJWT(req, res, next) {
  const serviceKey = process.env.ARIA_SERVICE_KEY;
  const presented = req.get('x-aria-service-key');
  if (serviceKey && presented && presented === serviceKey) {
    const userId = req.query.user_id || req.body?.user_id;
    if (!userId) {
      return res.status(400).json({ error: 'user_id query param required when using X-Aria-Service-Key' });
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return res.status(400).json({ error: 'invalid user_id (expected uuid)' });
    }
    req.user = { id: userId };
    req.isServiceCall = true;
    return next();
  }
  return authenticateJWT(req, res, next);
}

/**
 * Validate image data URL format for OpenAI Vision API.
 * Returns the data URL if supported, or throws with a helpful error for unsupported formats.
 */
function validateImageFormat(dataUrl) {
  if (/^data:image\/(jpeg|png|gif|webp)[;,]/.test(dataUrl)) return dataUrl;

  const mimeMatch = dataUrl.match(/^data:([^;,]+)/);
  const mime = mimeMatch ? mimeMatch[1] : 'unknown';

  if (/heic|heif/i.test(mime)) {
    throw new Error('HEIC/HEIF format is not supported by the AI vision system. Please convert to JPEG or PNG first, or use Safari which can auto-convert HEIC images.');
  }

  // For other unknown formats, let it through — OpenAI will give its own error
  return dataUrl;
}

// Import blueprint analyzer
const { analyzeBlueprint, parseBluebeamBAX } = require('../lib/takeoff/blueprint-analyzer');

// Shadow the global fetch in this module so every call gets a default abort timeout.
// Node's fetch silently ignores the `timeout` option — without this, a stuck
// Replicate/OpenAI call leaves the HTTP handler hanging until the client disconnects.
// Callers that pass their own `signal` are respected untouched.
const _nativeFetch = globalThis.fetch;
const DEFAULT_FETCH_TIMEOUT_MS = 90000;
async function fetch(url, options = {}) {
  if (options && options.signal) return _nativeFetch(url, options);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), DEFAULT_FETCH_TIMEOUT_MS);
  try {
    return await _nativeFetch(url, Object.assign({}, options || {}, { signal: controller.signal }));
  } finally {
    clearTimeout(t);
  }
}
// Back-compat alias for the two call sites that already explicitly request a short timeout.
async function fetchWithAbort(url, options, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await _nativeFetch(url, Object.assign({}, options || {}, { signal: controller.signal }));
  } finally {
    clearTimeout(t);
  }
}

// ============ AI VISUALIZER ============

/**
 * AI Visualize endpoint using Replicate - Powered by Remodely.ai
 * POST /api/ai/visualize
 */
router.post('/visualize', aiRateLimiter('ai_vision'), async (req, res) => {
  try {
    const { image, prompt, style, material } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Image is required' });
    }

    const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

    if (!REPLICATE_API_TOKEN) {
      logger.info('Replicate API not configured, returning demo mode');
      return res.json({
        success: true,
        demo: true,
        output: getDemoImage(style),
        message: 'Demo mode - API not configured'
      });
    }

    // Use Flux model for image-to-image transformation (30s cap on the initial call)
    const response = await fetchWithAbort('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: 'black-forest-labs/flux-1.1-pro',
        input: {
          prompt: prompt || `Transform this space with ${style} design style and ${material} countertops. Professional interior design, high quality, realistic.`,
          image: image,
          prompt_strength: 0.6,
          num_inference_steps: 28,
          guidance_scale: 3.5
        }
      })
    }, 30000);

    const prediction = await response.json();

    if (prediction.error) {
      logger.error('Replicate error:', prediction.error);
      return res.status(500).json({ error: prediction.error });
    }

    // Poll for completion
    let result = prediction;
    let attempts = 0;
    const maxAttempts = 60;

    while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 10s cap per poll — keep the loop responsive even if one request hangs.
      const pollResponse = await fetchWithAbort(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: {
          'Authorization': `Token ${REPLICATE_API_TOKEN}`
        }
      }, 10000);

      result = await pollResponse.json();
      attempts++;
    }

    if (result.status === 'failed') {
      logger.error('Prediction failed:', result.error);
      return res.status(500).json({ error: 'Image generation failed' });
    }

    if (result.status !== 'succeeded') {
      return res.status(504).json({ error: 'Generation timed out' });
    }

    res.json({
      success: true,
      output: Array.isArray(result.output) ? result.output[0] : result.output,
      prediction_id: prediction.id
    });

  } catch (error) {
    logger.error('Visualize error:', error);
    return handleApiError(res, error, 'Visualize');
  }
});

// ============ AI VIDEO GENERATION ============

/**
 * Generate AI video using Replicate (Luma, MiniMax, etc.)
 * POST /api/ai/video
 */
router.post('/video', aiRateLimiter('ai_video'), async (req, res) => {
  try {
    const {
      prompt,
      model = 'luma/ray',
      aspectRatio = '16:9',
      loop = true
    } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

    if (!REPLICATE_API_TOKEN) {
      return res.status(500).json({ error: 'Replicate API not configured' });
    }

    const modelInputs = { prompt };

    if (model === 'luma/ray') {
      modelInputs.aspect_ratio = aspectRatio;
      modelInputs.loop = loop;
    } else if (model === 'minimax/video-01') {
      modelInputs.prompt_optimizer = true;
    }

    logger.info(`[Video] Starting generation with ${model}`);
    logger.info(`[Video] Prompt: ${prompt.substring(0, 100)}...`);

    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        input: modelInputs
      })
    });

    const prediction = await response.json();

    if (prediction.error) {
      logger.error('[Video] Replicate error:', prediction.error);
      return res.status(500).json({ error: prediction.error });
    }

    res.json({
      success: true,
      predictionId: prediction.id,
      status: prediction.status,
      model: model,
      message: 'Video generation started. Poll /api/ai/video/status/:id for updates.'
    });

  } catch (error) {
    logger.error('[Video] Generation error:', error);
    return handleApiError(res, error, 'Video generation');
  }
});

/**
 * Poll video generation status
 * GET /api/ai/video/status/:id
 */
router.get('/video/status/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

    if (!REPLICATE_API_TOKEN) {
      return res.status(500).json({ error: 'Replicate API not configured' });
    }

    const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: {
        'Authorization': `Bearer ${REPLICATE_API_TOKEN}`
      }
    });

    const result = await response.json();

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      status: result.status,
      output: result.status === 'succeeded'
        ? (Array.isArray(result.output) ? result.output[0] : result.output)
        : null,
      logs: result.logs,
      metrics: result.metrics
    });

  } catch (error) {
    logger.error('[Video] Status check error:', error);
    return handleApiError(res, error, 'Video status');
  }
});

// ============ BLUEPRINT TAKEOFF ============

/**
 * Analyze blueprint using AI vision (GPT-4 Vision or Ollama)
 * POST /api/ai/blueprint
 * NOTE: Rate limiting temporarily disabled for testing multi-page PDFs
 */
router.post('/blueprint', async (req, res) => {
  try {
    const {
      image,
      projectType,
      blueprintUrl,
      baxFile,
      useOllama = false,
      laborRate,
      materialPricing,
      userContext = '' // User-provided context to help AI understand the drawing
    } = req.body;

    if (!image && !blueprintUrl && !baxFile) {
      return res.status(400).json({
        error: 'Blueprint image, URL, or Bluebeam BAX file is required'
      });
    }

    let analysisResults;

    // Handle Bluebeam BAX file (XML markup data)
    if (baxFile) {
      logger.info('Processing Bluebeam BAX file...');
      analysisResults = parseBluebeamBAX(baxFile);

    } else {
      let blueprintData = image;

      // Convert URL to base64 if needed
      if (blueprintUrl) {
        logger.info('Processing blueprint from URL:', blueprintUrl);
        try {
          const fetch = (await import('node-fetch')).default;
          const response = await fetch(blueprintUrl);
          const buffer = await response.buffer();
          const mimeType = response.headers.get('content-type') || 'image/png';
          blueprintData = `data:${mimeType};base64,${buffer.toString('base64')}`;
        } catch (urlError) {
          logger.error('Error fetching URL:', urlError);
          blueprintData = null;
        }
      }

      // BYOK: caller's key (header) wins over server's. Frontend forwards
      // the user's OpenAI key as x-user-openai-key when set.
      const userKey = (req.get('x-user-openai-key') || req.get('x-openai-key') || '').trim();
      const effectiveKey = userKey || process.env.OPENAI_API_KEY || '';
      const hasOpenAI = !!effectiveKey;
      const hasOllama = useOllama;

      if (blueprintData && (hasOpenAI || hasOllama)) {
        const provider = hasOllama ? 'ollama' : 'openai';
        logger.info(`Analyzing blueprint with ${provider}${userKey ? ' (BYOK)' : ''}...`);

        try {
          const aiResult = await analyzeBlueprint({
            image: blueprintData,
            projectType: projectType || 'full-home',
            provider: provider,
            apiKey: effectiveKey,
            rates: materialPricing,
            wasteFactor: 0.10,
            userContext: userContext // Pass user-provided context to enhance AI understanding
          });

          analysisResults = convertAIResultToLegacy(aiResult, projectType);
          analysisResults.mode = 'ai';
          analysisResults.provider = provider;

        } catch (aiError) {
          logger.error('AI analysis error, falling back to demo:', aiError);
          analysisResults = generateTakeoffAnalysis(projectType);
          analysisResults.mode = 'demo';
          analysisResults.aiError = aiError.message;
        }
      } else {
        logger.info('No AI configured, using demo analysis...');
        analysisResults = generateTakeoffAnalysis(projectType);
        analysisResults.mode = 'demo';

        if (!hasOpenAI && !hasOllama) {
          analysisResults.notice = 'Demo mode: Add OPENAI_API_KEY for real blueprint analysis';
        }
      }
    }

    // Add pricing calculations if labor rate provided
    if (laborRate && analysisResults.rooms) {
      analysisResults.laborEstimate = calculateLaborEstimate(analysisResults, laborRate);
    }

    res.json(analysisResults);

  } catch (error) {
    logger.error('Blueprint analysis error:', error);
    return handleApiError(res, error, 'Blueprint analysis');
  }
});

/**
 * Blueprint takeoff → estimate.
 * Accepts aggregated takeoff totals + extracted material specs, returns a
 * structured priced estimate (line items, subtotals, margin range, notes).
 * V1 uses industry-average rates only — no catalog matching yet. See
 * api/lib/takeoff/estimator.js for the rate table.
 */
router.post('/blueprint/estimate', async (req, res) => {
  try {
    const { takeoff, materials, projectType, options } = req.body || {};
    if (!takeoff || typeof takeoff !== 'object') {
      return res.status(400).json({ error: 'takeoff object is required' });
    }
    const estimate = buildEstimate({
      takeoff,
      materials: Array.isArray(materials) ? materials : [],
      projectType: projectType || 'commercial',
      options: options || {},
    });
    res.json(estimate);
  } catch (err) {
    logger.error('Blueprint estimate error:', err);
    return handleApiError(res, err, 'Blueprint estimate');
  }
});

/**
 * Vendor price-sheet parser.
 * Takes a vendor catalog page (rasterized to base64 image) and returns a
 * structured list of products: brand, line, color/pattern, size, finish,
 * sku, price, unit. Used to build per-tenant custom catalogs the estimator
 * can match material specs against — no scraping, no third-party APIs.
 */
router.post('/blueprint/catalog/parse', async (req, res) => {
  try {
    const { image, vendorHint } = req.body || {};
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'image (base64 data URL) is required' });
    }
    const headerKey = req.get('x-user-openai-key') || req.get('x-openai-key');
    const apiKey = ((req.body.userKey || headerKey || process.env.OPENAI_API_KEY) || '').trim();
    if (!apiKey) return res.status(400).json({ error: 'No OpenAI API key available — provide one via Settings (BYOK).' });

    const fetch = (await import('node-fetch')).default;
    const oai = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You read vendor price-sheet pages from material suppliers (tile, flooring, cabinets, stone, paint, etc.) and extract structured product data. Return ONLY a JSON object: {"vendor":"","category":"","products":[]}.

vendor: the supplier brand (e.g., "Daltile", "MSI Surfaces", "Mohawk", "Wilsonart", "Daltile Marazzi").
category: one of tile, flooring, cabinet, stone, paint, fixture, other.
products: array of {sku, name, line, color, size, finish, thickness, price, price_unit} — fields empty when not visible. price is a number (no $ sign). price_unit is sf, lf, each, box, slab, gallon, etc.

Rules:
- Read EVERY product row in the visible price list / catalog page.
- Use exact text from the page — never invent a sku or price.
- If multiple price tiers shown (e.g., per-box vs per-sf), prefer per-sf for tile/flooring, per-each for cabinets/fixtures.
- If the page is NOT a product price list (e.g., it's a marketing splash page), return {"vendor":"","category":"","products":[]} with no entries.
- Limit to first 50 products if the page is dense.`,
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Extract products from this catalog page.${vendorHint ? ' Vendor hint: ' + vendorHint : ''}` },
              { type: 'image_url', image_url: { url: image } },
            ],
          },
        ],
      }),
    });
    if (!oai.ok) {
      const errText = await oai.text();
      logger.error('Catalog parse OpenAI error:', oai.status, errText.slice(0, 300));
      return res.status(502).json({ error: `OpenAI ${oai.status}: ${errText.slice(0, 200)}` });
    }
    const data = await oai.json();
    let parsed = { vendor: '', category: '', products: [] };
    try { parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}'); }
    catch (_) { /* keep default */ }
    res.json({
      vendor: parsed.vendor || vendorHint || '',
      category: parsed.category || '',
      products: Array.isArray(parsed.products) ? parsed.products : [],
      key_source: headerKey || req.body.userKey ? 'user (BYOK)' : 'server',
    });
  } catch (err) {
    logger.error('Catalog parse error:', err);
    return handleApiError(res, err, 'Catalog parse');
  }
});

/**
 * Cover-sheet metadata extractor.
 * One vision call against the project's cover/title sheet. Returns the
 * project name, owner/customer, project address, GC and architect names.
 * Used to auto-fill the proposal customer/project fields.
 */
router.post('/blueprint/cover', async (req, res) => {
  try {
    const { image } = req.body || {};
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'image (base64 data URL) is required' });
    }
    const headerKey = req.get('x-user-openai-key') || req.get('x-openai-key');
    const apiKey = ((req.body.userKey || headerKey || process.env.OPENAI_API_KEY) || '').trim();
    if (!apiKey) return res.status(400).json({ error: 'No OpenAI API key available — provide one via Settings (BYOK) or configure OPENAI_API_KEY on the server.' });

    const fetch = (await import('node-fetch')).default;
    const oai = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0,
        max_tokens: 500,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              'You extract project metadata from the cover/title sheet of an architectural drawing set.',
              '',
              '══════════════════════════════════════════════════════════════',
              'ACCURACY OVER COMPLETENESS. The user would rather see "" empty',
              'than a plausible guess. Do NOT invent. Do NOT fill in city/state',
              'from a partial address. Do NOT guess project type from the look',
              'of the building. Do NOT name a generic GC ("ABC Construction")',
              'when none is listed. Empty fields are acceptable; fake data is not.',
              '══════════════════════════════════════════════════════════════',
              '',
              'Return ONLY a JSON object with this exact shape:',
              '{',
              '  "project_name": "exact text from the title block (e.g. \\"Better Buzz Coffee — Val Vista\\")",',
              '  "customer": "owner/client/tenant name as printed (e.g. \\"Better Buzz Coffee Roasters\\")",',
              '  "project_address": "full street address as printed, including city + state + zip if visible",',
              '  "gc": "general contractor company name, or empty string if not listed",',
              '  "architect": "design firm name as printed",',
              '  "date": "issue/permit date as printed (any format)",',
              '  "verbatim_sources": {',
              '    "project_name": "the literal page text you read this from",',
              '    "customer": "the literal page text you read this from",',
              '    "project_address": "the literal page text you read this from",',
              '    "gc": "the literal page text you read this from",',
              '    "architect": "the literal page text you read this from",',
              '    "date": "the literal page text you read this from"',
              '  }',
              '}',
              '',
              'For any field where you cannot point to specific page text, return',
              'an empty string. Never combine partial reads ("123 Main St" + your',
              'guess of city = fabrication). Verbatim_sources is required for any',
              'field you populate; if you cannot quote the source, leave the field empty.'
            ].join('\n'),
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract project metadata from this cover sheet.' },
              { type: 'image_url', image_url: { url: image } },
            ],
          },
        ],
      }),
    });
    if (!oai.ok) {
      const errText = await oai.text();
      logger.error('Cover extract OpenAI error:', oai.status, errText.slice(0, 300));
      return res.status(502).json({ error: `OpenAI ${oai.status}: ${errText.slice(0, 200)}` });
    }
    const data = await oai.json();
    let parsed = {};
    try { parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}'); }
    catch (_) { parsed = {}; }
    res.json({
      project_name: parsed.project_name || '',
      customer: parsed.customer || '',
      project_address: parsed.project_address || '',
      gc: parsed.gc || '',
      architect: parsed.architect || '',
      date: parsed.date || '',
      // Pass through the per-field verbatim source map so the frontend can
      // surface "this came from X on the page" tooltips, mirroring how
      // materials_called_out preserves verbatim_source per entry.
      verbatim_sources: (parsed.verbatim_sources && typeof parsed.verbatim_sources === 'object')
        ? parsed.verbatim_sources
        : {},
      key_source: headerKey || req.body.userKey ? 'user (BYOK)' : 'server',
    });
  } catch (err) {
    logger.error('Cover extract error:', err);
    return handleApiError(res, err, 'Cover extract');
  }
});

/**
 * Blueprint takeoff → AI-drafted proposal.
 * Takes the calculated estimate + customer/project context and generates
 * professional client-ready proposal markdown. The model NEVER invents
 * pricing — it narrates the deterministic numbers we feed it.
 */
router.post('/blueprint/proposal', async (req, res) => {
  try {
    const { estimate, customer = '', project = '', address = '', materials = [], confirmedScope = [], openQuestions = [], preparedBy = {}, bidMode = 'prime', userKey } = req.body || {};
    const isSubBid = bidMode === 'sub';
    if (!estimate || !estimate.line_items) {
      return res.status(400).json({ error: 'estimate object with line_items is required' });
    }

    // BYOK: caller's key wins over server key. We support TWO providers for
    // the proposal writer — Anthropic (Claude) is preferred when its key is
    // set since it tends to write tighter business prose. OpenAI is fallback.
    const headerKey       = req.get('x-user-openai-key') || req.get('x-openai-key');
    const anthropicHeader = req.get('x-user-anthropic-key') || req.get('x-anthropic-key');
    const userAnthKey     = req.body.userAnthKey || anthropicHeader || '';
    const userOpenAiKey   = userKey || headerKey || '';
    const useAnthropic    = !!userAnthKey;
    const apiKey = (useAnthropic ? userAnthKey : (userOpenAiKey || process.env.OPENAI_API_KEY) || '').trim();
    if (!apiKey) return res.status(400).json({ error: 'No AI key available — provide an OpenAI or Anthropic key via Settings (BYOK), or configure OPENAI_API_KEY on the server.' });

    const fmt = n => '$' + (Math.round(n) || 0).toLocaleString();
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // Compose the structured estimate as a compact JSON block the model can
    // read, plus a deterministic line-item table so it doesn't have to do math.
    const lineTable = estimate.line_items.map(li =>
      `${li.description} | qty ${li.qty} ${li.unit} | ${fmt(li.material_cost)} mat | ${fmt(li.labor_cost)} lab | ${fmt(li.total)} total${li.code ? ' | code ' + li.code : ''}`
    ).join('\n');

    const tradeLines = (estimate.trade_rollup || []).map(t =>
      `- ${t.trade}: ${fmt(t.total)} (${t.items} item${t.items>1?'s':''})`
    ).join('\n');

    const materialLines = materials.length
      ? materials.map(m => `- ${m.code || '—'} (${m.category}): ${m.spec || '(no spec)'}`).join('\n')
      : '(no materials extracted)';

    const confirmedScopeLines = (Array.isArray(confirmedScope) && confirmedScope.length)
      ? confirmedScope.map(c => `- [${c.kind || '?'}] ${c.location ? c.location + ': ' : ''}${c.question} → ${c.answer}`).join('\n')
      : '(none — all scope was clear from the drawings)';

    // Open AI-flagged questions (the GC didn't pre-answer them) ride into
    // the proposal as "Decisions Needed" so the customer sees them and can
    // reply with answers / accept the GC's suggested defaults. Beats the
    // back-and-forth of circling back mid-bid for clarifications.
    const openQuestionsLines = (Array.isArray(openQuestions) && openQuestions.length)
      ? openQuestions.map(q =>
          `- [${q.kind || '?'}] ${q.location ? q.location + ': ' : ''}${q.question}` +
          (q.suggested_answer ? `\n  Suggested default: ${q.suggested_answer}` : '')
        ).join('\n')
      : '(none — no open ambiguities)';

    const pb = preparedBy && typeof preparedBy === 'object' ? preparedBy : {};
    const preparedByLines = [
      pb.name     && `Company: ${pb.name}`,
      pb.contact  && `Contact: ${pb.contact}${pb.title ? ' (' + pb.title + ')' : ''}`,
      pb.email    && `Email: ${pb.email}`,
      pb.phone    && `Phone: ${pb.phone}`,
      pb.address  && `Address: ${pb.address}`,
      pb.license  && `License: ${pb.license}`,
      pb.website  && `Website: ${pb.website}`,
      pb.tagline  && `Tagline: ${pb.tagline}`,
    ].filter(Boolean).join('\n') || '(no company info provided — proposal will use a generic header)';

    const docTitle = isSubBid ? 'Subcontractor Bid' : 'Project Proposal';
    const recipientLabel = isSubBid ? 'Submitted to (prime contractor)' : 'Prepared for';
    const audienceNote = isSubBid
      ? 'This is a SUBCONTRACTOR BID being submitted to a Prime General Contractor for a single-trade scope. The recipient is the prime GC, not the end owner. Frame the doc accordingly: "subcontractor bid", "trade scope", refer to the prime as "the GC" or "Prime Contractor". Do NOT use language like "we will renovate your home". Make clear this is the sub bid for the trades listed; other trades are by others.'
      : 'This is a PROJECT PROPOSAL from a General Contractor to an end customer/owner covering all trades in scope. Frame as a complete project bid.';

    const systemPrompt = `You are an experienced construction estimator drafting a professional client-ready proposal for a general contractor. You write in clean, plain-English business prose — no marketing fluff, no exclamation marks.

AUDIENCE: ${audienceNote}

CRITICAL RULES:
1. NEVER invent or change any dollar amount, quantity, or material spec. Use ONLY the numbers in the line-item table provided.
2. NEVER guess prices for items not listed. If something is missing, omit it or note it in Exclusions.
3. Output Markdown only. Use ## headings, bullet lists, tables.
4. Tone: confident, concise, professional. Like a real GC estimator wrote it, not a marketing copywriter.
5. Length: 1-2 pages. Brevity is professional.

Return the proposal in this structure (use the docTitle and recipientLabel below — they vary by bid mode):

# ${docTitle} — {Project Name}

**Prepared by**
{Company name from preparedBy.name}
{Contact name}, {Title}
{Email}  ·  {Phone}
{License}
{Website — bare URL only, NO markdown link syntax, NEVER write [text](url)}
*{Tagline if any, italicized}*

**${recipientLabel}:** {Customer}
**Date:** {Today}
**Project address:** {address or "TBD"}

CRITICAL formatting rules for the Prepared by block:
- Each item on its OWN line (the lines above are literal — do not collapse them).
- Do NOT use [text](url) markdown link syntax for the website. Write the URL bare (e.g. \`www.example.com\`) — the renderer auto-links bare URLs.
- Skip any field that's empty in the source data. Don't write "Email: (none)" or similar — just omit that line.
- If preparedBy has no name at all, omit the entire Prepared by block (don't invent placeholders).

## Scope of Work
2-4 sentence overview of what the contractor is doing, derived from the trades present in the estimate.

## Materials & Specifications
A clean bulleted list of the material codes and their specs from the materials section. If specs are missing, write "to be selected from contractor allowance."

## Pricing Summary
A markdown table with columns: Trade | Description | Total. Use ONLY the line items provided.
After the trade rows, include these summary rows IN THIS ORDER so the math reconciles:
- "Subtotal (trade cost)" row showing the trade subtotal
- "Overhead & Profit (X%)" row showing the O&P amount
- "**Total Bid**" row showing the total bid amount
The trade rows MUST sum to the Subtotal row. Subtotal + O&P MUST equal Total Bid. Do not omit the O&P line — the customer needs to see the math.

## Inclusions
Bulleted list of what IS in the bid. Derive from the line items.

## Exclusions
Standard exclusions a GC would call out: permits, design fees, hazardous-material abatement, structural changes not shown, owner-supplied materials, items beyond the takeoff. List 4-7 typical items.

## Schedule & Payment
Standard 50% deposit / balance on substantial completion language. Mention typical lead times for slabs (2-3 weeks), tile (1-2 weeks), cabinets (4-8 weeks).

## Confirmed Scope (Q&A)
Bullet list of any "Q: …  A: …" pairs from the confirmed-scope facts. These are decisions the GC made on items the drawings left ambiguous (TBD specs, owner-supplied items, allowances, scope-edge calls). If none, omit this section entirely.

## Decisions Needed
Bullet list of OPEN items the AI flagged from the drawings that still need a customer/owner answer before we can lock the bid (TBD specs, allowance amounts, owner-supplied items, scope edges). Format each item as:
- **{Question or item description}** — where it came from (e.g. "T-3 row in finish schedule")
  Suggested default if we don't hear back: {the suggested_answer if provided}

Frame this as collaborative ("we'd like your input on the following before locking the scope") not as obstacles. The customer can accept the suggested defaults by signing as-is, or reply with corrections. If no open items, omit this section entirely.

## Assumptions
Any assumption notes from the estimate (waste %, GC overhead %, industry-avg vs catalog pricing). Be transparent.

## Acceptance
Standard signature/date block.`;

    const userPrompt = `Draft the proposal using these facts:

PREPARED BY (the contractor — appears in header):
${preparedByLines}

CUSTOMER: ${customer || '(not provided)'}
PROJECT: ${project || '(not provided)'}
ADDRESS: ${address || 'TBD'}
TODAY: ${today}

TRADE BREAKOUT:
${tradeLines || '(no trades)'}

LINE ITEMS (DO NOT CHANGE THESE NUMBERS):
${lineTable}

SUBTOTAL: ${fmt(estimate.subtotals?.subtotal)}
OVERHEAD & PROFIT (${Math.round((estimate.margin_factor||0)*100)}%): ${fmt(estimate.subtotals?.overhead)}
TOTAL BID: ${fmt(estimate.total)}
RANGE: ${fmt(estimate.margin_range?.low)} — ${fmt(estimate.margin_range?.high)}

WASTE STRATEGY: ${estimate.waste_strategy || 'per-category defaults'}
GC OVERHEAD: ${Math.round((estimate.gc_overhead_factor||0)*100)}%

MATERIALS SPECIFIED:
${materialLines}

CONFIRMED SCOPE (GC answers to AI-flagged ambiguities — include verbatim in the "Confirmed Scope" section):
${confirmedScopeLines}

OPEN QUESTIONS (AI-flagged items the GC has NOT answered — include in the "Decisions Needed" section so the customer sees them and can reply with answers / accept the suggested defaults):
${openQuestionsLines}

ASSUMPTION NOTES:
${(estimate.notes || []).map(n => '- ' + n).join('\n') || '(none)'}`;

    const fetch = (await import('node-fetch')).default;
    let markdown = '';
    let modelUsed = '';
    let provider = '';

    if (useAnthropic) {
      // Anthropic Messages API — system goes in a top-level field, not a role.
      provider = 'anthropic';
      modelUsed = 'claude-sonnet-4-5';
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: modelUsed,
          max_tokens: 2400,
          temperature: 0.4,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
      if (!r.ok) {
        const errText = await r.text();
        logger.error('Proposal Anthropic error:', r.status, errText.slice(0, 400));
        return res.status(502).json({ error: `Anthropic ${r.status}: ${errText.slice(0, 200)}` });
      }
      const data = await r.json();
      // Claude returns content as an array of blocks; concatenate text blocks.
      markdown = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    } else {
      provider = 'openai';
      modelUsed = 'gpt-4o';
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: modelUsed,
          temperature: 0.4,
          max_tokens: 2200,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });
      if (!r.ok) {
        const errText = await r.text();
        logger.error('Proposal OpenAI error:', r.status, errText.slice(0, 400));
        return res.status(502).json({ error: `OpenAI ${r.status}: ${errText.slice(0, 200)}` });
      }
      const data = await r.json();
      markdown = data.choices?.[0]?.message?.content || '';
    }

    res.json({
      markdown,
      generated_at: new Date().toISOString(),
      provider,
      model: modelUsed,
      key_source: useAnthropic
        ? 'user Anthropic (BYOK)'
        : (userOpenAiKey ? 'user OpenAI (BYOK)' : 'server'),
    });
  } catch (err) {
    logger.error('Proposal generation error:', err);
    return handleApiError(res, err, 'Proposal generation');
  }
});

/**
 * Record a proposal acceptance — signature + acceptor info + bid context.
 * Called by share.html after the customer signs and before redirecting to
 * Stripe. Best-effort; we log to file and email a notification to the
 * contractor so they have a paper trail even if downstream storage is offline.
 * V2 will write to a Supabase `proposal_acceptances` table.
 */
router.post('/blueprint/proposal/acceptance', express.json({ limit: '6mb' }), async (req, res) => {
  try {
    const { acceptedBy = {}, signaturePng = '', project = '', customer = '', total = 0, deposit = 0, preparedBy = {}, acceptedAt = '' } = req.body || {};
    if (!acceptedBy.name || !acceptedBy.email) {
      return res.status(400).json({ error: 'acceptedBy.name + acceptedBy.email required' });
    }

    const record = {
      acceptedAt: acceptedAt || new Date().toISOString(),
      acceptedBy,
      project, customer, total, deposit,
      preparedBy: { name: preparedBy.name, email: preparedBy.email, license: preparedBy.license },
      ip: req.ip || req.headers['x-forwarded-for'] || '',
      userAgent: req.get('user-agent') || '',
      signatureLen: signaturePng.length,
    };
    logger.info('Proposal accepted:', record);

    // Persist to Supabase if available — service-role write since the share
    // page is unauthenticated. user_id resolved by looking up the contractor
    // in auth.users by email when possible.
    let acceptanceId = null;
    try {
      const svc = getServiceClient();
      if (svc) {
        let userId = null;
        if (preparedBy.email) {
          const { data: profile } = await svc
            .from('sg_users')
            .select('id')
            .eq('email', preparedBy.email)
            .maybeSingle();
          userId = profile?.id || null;
        }
        const insertRow = {
          user_id: userId,
          prepared_by_email: preparedBy.email || null,
          accepted_by_name: acceptedBy.name,
          accepted_by_email: acceptedBy.email,
          project: project || null,
          customer: customer || null,
          total_bid: Number.isFinite(+total) ? Math.round(+total) : null,
          deposit: Number.isFinite(+deposit) ? Math.round(+deposit) : null,
          signature_png: signaturePng || null,
          ip_address: record.ip,
          user_agent: record.userAgent,
          accepted_at: record.acceptedAt,
        };
        const { data: inserted, error: insertErr } = await svc
          .from('proposal_acceptances')
          .insert(insertRow)
          .select('id')
          .single();
        if (insertErr) logger.warn('Acceptance Supabase insert failed (non-fatal):', insertErr.message);
        else acceptanceId = inserted?.id || null;
      }
    } catch (dbErr) {
      logger.warn('Acceptance DB write failed (non-fatal):', dbErr.message);
    }

    // Best-effort: email the contractor so they know a customer signed.
    if (preparedBy.email && process.env.SMTP_PASS) {
      try {
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT || '465', 10),
          secure: (process.env.SMTP_SECURE !== 'false'),
          auth: {
            user: process.env.SMTP_USER || process.env.GMAIL_USER || 'info@surprisegranite.com',
            pass: process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD,
          },
        });
        const fromEmail = process.env.SMTP_USER || process.env.GMAIL_USER || 'info@surprisegranite.com';
        const fmt = n => '$' + (Math.round(n)||0).toLocaleString();
        await transporter.sendMail({
          from: `"${preparedBy.name || 'Surprise Granite'}" <${fromEmail}>`,
          to: preparedBy.email,
          replyTo: acceptedBy.email,
          subject: `✓ ACCEPTED: ${project || 'proposal'} — ${acceptedBy.name}`,
          html: `
            <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a2e">
              <h2 style="color:#16a34a;font-family:'Space Grotesk',sans-serif">Proposal accepted</h2>
              <p><strong>${escapeHtmlServer(project)}</strong>${customer ? ' for ' + escapeHtmlServer(customer) : ''}</p>
              <table style="border-collapse:collapse;margin:16px 0">
                <tr><td style="padding:4px 12px 4px 0;color:#666">Accepted by:</td><td><strong>${escapeHtmlServer(acceptedBy.name)}</strong></td></tr>
                <tr><td style="padding:4px 12px 4px 0;color:#666">Email:</td><td><a href="mailto:${escapeHtmlServer(acceptedBy.email)}">${escapeHtmlServer(acceptedBy.email)}</a></td></tr>
                <tr><td style="padding:4px 12px 4px 0;color:#666">Total bid:</td><td><strong>${fmt(total)}</strong></td></tr>
                <tr><td style="padding:4px 12px 4px 0;color:#666">Deposit (50%):</td><td><strong>${fmt(deposit)}</strong> — Stripe payment in progress</td></tr>
                <tr><td style="padding:4px 12px 4px 0;color:#666">Time:</td><td>${escapeHtmlServer(record.acceptedAt)}</td></tr>
              </table>
              <p style="color:#666;font-size:13px">Signature is on file. You'll get a separate Stripe receipt when the deposit clears.</p>
              ${signaturePng && signaturePng.startsWith('data:image/png;base64,') ? `<p style="margin-top:16px"><strong>Signature:</strong></p><img src="${signaturePng}" alt="signature" style="border:1px solid #ddd;background:#fafafa;max-width:400px;padding:8px"/>` : ''}
            </div>
          `,
        });
      } catch (mailErr) {
        logger.warn('Acceptance notification email failed (non-fatal):', mailErr.message);
      }
    }

    res.json({ ok: true, recordedAt: record.acceptedAt, acceptanceId });
  } catch (err) {
    logger.error('Acceptance record error:', err);
    return handleApiError(res, err, 'Acceptance record');
  }
});

/**
 * Email a generated proposal to the customer.
 * Frontend supplies the rendered HTML body (it already has the md→html
 * converter for the on-screen view) plus the customer / project context.
 * We wrap it in a branded shell and send via the existing SMTP transporter.
 */
router.post('/blueprint/proposal/send', async (req, res) => {
  try {
    const { to, cc, customer = '', project = '', html_body, total, preparedBy = {} } = req.body || {};
    if (!to || typeof to !== 'string') return res.status(400).json({ error: 'to (recipient email) is required' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return res.status(400).json({ error: 'recipient email looks invalid' });
    if (!html_body) return res.status(400).json({ error: 'html_body is required' });

    // Reuse the SMTP transporter from the email router. We don't import it
    // directly to avoid coupling — instead require it lazily.
    let transporter;
    try {
      const path = require('path');
      const nodemailer = require('nodemailer');
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '465', 10),
        secure: (process.env.SMTP_SECURE !== 'false'),
        auth: {
          user: process.env.SMTP_USER || process.env.GMAIL_USER || 'info@surprisegranite.com',
          pass: process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD,
        },
      });
    } catch (e) {
      return res.status(503).json({ error: 'SMTP transport unavailable: ' + e.message });
    }
    if (!process.env.SMTP_PASS && !process.env.GMAIL_APP_PASSWORD) {
      return res.status(503).json({ error: 'SMTP_PASS / GMAIL_APP_PASSWORD not configured on server' });
    }

    const subject = `Proposal — ${project || 'your project'}${customer ? ' for ' + customer : ''}`;
    const totalLine = (total != null && Number.isFinite(+total))
      ? `<p style="font-size:20px;font-weight:700;color:#0f0f1a;margin:0 0 16px">Total bid: $${(+total).toLocaleString()}</p>`
      : '';

    // Use preparedBy for header + footer when provided; otherwise fall back to SG defaults.
    const pbName    = (preparedBy.name    || 'Surprise Granite').toString();
    const pbLicense = (preparedBy.license || 'AZ ROC #341113').toString();
    const pbAddress = (preparedBy.address || '15464 W Aster Dr, Surprise AZ 85379').toString();
    const pbPhone   = (preparedBy.phone   || '(602) 833-3189').toString();
    const pbWebsite = (preparedBy.website || 'surprisegranite.com').toString();
    const pbEmail   = (preparedBy.email   || '').toString();
    const pbContact = (preparedBy.contact || '').toString();
    const pbTitle   = (preparedBy.title   || '').toString();
    const phoneTel  = pbPhone.replace(/[^0-9+]/g,'');
    const websiteUrl = /^https?:\/\//.test(pbWebsite) ? pbWebsite : `https://${pbWebsite}`;

    const wrapped = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtmlServer(subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
  <div style="max-width:780px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
    <div style="background:#1a1a2e;padding:24px 32px;border-bottom:3px solid #f9cb00">
      <div style="color:#f9cb00;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px">${escapeHtmlServer(pbName)}${pbLicense ? ' · ' + escapeHtmlServer(pbLicense) : ''}</div>
      <div style="color:#fff;font-size:22px;font-weight:700;margin-top:4px;font-family:'Space Grotesk',sans-serif">Project Proposal</div>
    </div>
    <div style="padding:32px">
      ${customer ? `<p style="margin:0 0 4px;color:#0f0f1a"><strong>Prepared for:</strong> ${escapeHtmlServer(customer)}</p>` : ''}
      ${project  ? `<p style="margin:0 0 16px;color:#0f0f1a"><strong>Project:</strong> ${escapeHtmlServer(project)}</p>` : ''}
      ${totalLine}
      <hr style="border:none;border-top:1px solid #e5e5e5;margin:16px 0">
      ${html_body}
      <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0 16px">
      <p style="margin:0;color:#666;font-size:13px;line-height:1.6">
        Questions? Reply to this email${pbPhone ? ` or call <a href="tel:${escapeHtmlServer(phoneTel)}" style="color:#0f0f1a">${escapeHtmlServer(pbPhone)}</a>` : ''}.<br>
        <strong>${escapeHtmlServer(pbName)}</strong>${pbContact ? ' · ' + escapeHtmlServer(pbContact) + (pbTitle ? ', ' + escapeHtmlServer(pbTitle) : '') : ''}<br>
        ${pbAddress ? escapeHtmlServer(pbAddress) + ' · ' : ''}<a href="${escapeHtmlServer(websiteUrl)}" style="color:#0f0f1a">${escapeHtmlServer(pbWebsite)}</a>
      </p>
    </div>
  </div>
</body></html>`;

    const fromEmail = process.env.SMTP_USER || process.env.GMAIL_USER || 'info@surprisegranite.com';
    await transporter.sendMail({
      from: `"Surprise Granite" <${fromEmail}>`,
      to,
      cc: cc || undefined,
      replyTo: process.env.ADMIN_EMAIL || 'joshb@surprisegranite.com',
      subject,
      html: wrapped,
    });

    logger.info('Proposal emailed', { to, customer, project });
    res.json({ ok: true, sent_at: new Date().toISOString() });
  } catch (err) {
    logger.error('Proposal send error:', err);
    return handleApiError(res, err, 'Proposal send');
  }
});

function escapeHtmlServer(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/**
 * Blueprint takeoff project storage (cloud-primary, localStorage offline cache).
 * All routes require Supabase JWT auth — caller's token is forwarded so RLS
 * enforces per-user isolation.
 */
router.get('/blueprint/projects', serviceOrJWT, async (req, res) => {
  try {
    // Service calls use the service-role client + explicit user_id filter
    // (RLS bypassed — we already validated the service key). User calls go
    // through the JWT-scoped client (RLS enforces ownership).
    const client = req.isServiceCall ? getServiceClient() : getUserClient(req.accessToken);
    if (!client) return res.status(503).json({ error: 'Supabase not configured on server' });
    let query = client
      .from('takeoff_projects')
      .select('id, name, total_bid, source, stage, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(200);
    if (req.isServiceCall) {
      query = query.eq('user_id', req.user.id);
    }
    const { data, error } = await query;
    if (error) throw error;
    res.json({ projects: data || [] });
  } catch (err) {
    logger.error('List takeoff projects error:', err);
    return handleApiError(res, err, 'List projects');
  }
});

router.get('/blueprint/projects/:id', serviceOrJWT, async (req, res) => {
  try {
    const client = req.isServiceCall ? getServiceClient() : getUserClient(req.accessToken);
    if (!client) return res.status(503).json({ error: 'Supabase not configured on server' });
    let query = client
      .from('takeoff_projects')
      .select('*')
      .eq('id', req.params.id);
    if (req.isServiceCall) {
      // Ownership check at query time — service-role bypasses RLS, so we
      // enforce it explicitly to keep tenants from reading each other's
      // projects via service-key + a guessed project id.
      query = query.eq('user_id', req.user.id);
    }
    const { data, error } = await query.single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error('Get takeoff project error:', err);
    return handleApiError(res, err, 'Get project');
  }
});

// Upsert a project. Frontend sends { id?, name, payload, total_bid, source, stage }.
// If id is set we update, else we insert. user_id comes from auth context.
router.post('/blueprint/projects', authenticateJWT, express.json({ limit: '12mb' }), async (req, res) => {
  try {
    const client = getUserClient(req.accessToken);
    if (!client) return res.status(503).json({ error: 'Supabase not configured on server' });
    const { id, name, payload, total_bid, source, stage } = req.body || {};
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'payload object required' });
    }
    const row = {
      user_id: req.user.id,
      name: name || 'Untitled project',
      payload,
      total_bid: Number.isFinite(+total_bid) ? +total_bid : null,
      source: source || null,
      stage: stage || null,
    };
    if (id) row.id = id;
    const { data, error } = await client
      .from('takeoff_projects')
      .upsert(row, { onConflict: 'id' })
      .select('id, name, total_bid, source, stage, created_at, updated_at')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error('Save takeoff project error:', err);
    return handleApiError(res, err, 'Save project');
  }
});

router.delete('/blueprint/projects/:id', authenticateJWT, async (req, res) => {
  try {
    const client = getUserClient(req.accessToken);
    if (!client) return res.status(503).json({ error: 'Supabase not configured on server' });
    const { error } = await client
      .from('takeoff_projects')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    logger.error('Delete takeoff project error:', err);
    return handleApiError(res, err, 'Delete project');
  }
});

/**
 * Vendor catalogs — cloud sync of price-sheet imports per user. RLS keeps
 * each user's catalogs private; backend just forwards the JWT so the user's
 * own permissions apply. Mirrors the takeoff_projects shape.
 *
 * Frontend calls these when the user is signed in; falls back to
 * localStorage otherwise (offline-first design).
 */
router.get('/blueprint/catalogs', authenticateJWT, async (req, res) => {
  try {
    const client = getUserClient(req.accessToken);
    if (!client) return res.status(503).json({ error: 'Supabase not configured on server' });
    // Pull catalogs the user can read per RLS — own + any shared via org
    // membership. Include org_id + user_id so the frontend can label rows
    // as "personal", "shared by you", or "shared by teammate".
    const { data, error } = await client
      .from('vendor_catalogs')
      .select('id, user_id, org_id, vendor, category, products, enabled, source_filename, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    // Tag each row with is_owner so the frontend doesn't need to re-derive.
    const me = req.user.id;
    const tagged = (data || []).map(c => ({ ...c, is_owner: c.user_id === me }));
    res.json({ catalogs: tagged });
  } catch (err) {
    logger.error('List vendor catalogs error:', err);
    return handleApiError(res, err, 'List catalogs');
  }
});

router.post('/blueprint/catalogs', authenticateJWT, express.json({ limit: '6mb' }), async (req, res) => {
  try {
    const client = getUserClient(req.accessToken);
    if (!client) return res.status(503).json({ error: 'Supabase not configured on server' });
    const { id, vendor, category, products, enabled, source_filename, org_id } = req.body || {};
    if (!Array.isArray(products)) {
      return res.status(400).json({ error: 'products array required' });
    }
    const row = {
      user_id: req.user.id,
      vendor: vendor || 'Unknown',
      category: category || 'other',
      products,
      enabled: enabled !== false,
      source_filename: source_filename || null,
      org_id: org_id || null, // null = personal; UUID = shared with that org
    };
    if (id) row.id = id;
    const { data, error } = await client
      .from('vendor_catalogs')
      .upsert(row, { onConflict: 'id' })
      .select('id, user_id, org_id, vendor, category, products, enabled, source_filename, created_at, updated_at')
      .single();
    if (error) throw error;
    res.json({ ...data, is_owner: true });
  } catch (err) {
    logger.error('Save vendor catalog error:', err);
    return handleApiError(res, err, 'Save catalog');
  }
});

router.patch('/blueprint/catalogs/:id', authenticateJWT, express.json({ limit: '1mb' }), async (req, res) => {
  // Lightweight update — used for the on/off toggle without re-sending the
  // whole products array. Also handles the share-with-team toggle (org_id).
  // Accept any of {vendor, category, enabled, org_id}. org_id=null unshares.
  try {
    const client = getUserClient(req.accessToken);
    if (!client) return res.status(503).json({ error: 'Supabase not configured on server' });
    const patch = {};
    if (typeof req.body?.enabled === 'boolean') patch.enabled = req.body.enabled;
    if (typeof req.body?.vendor === 'string')   patch.vendor = req.body.vendor;
    if (typeof req.body?.category === 'string') patch.category = req.body.category;
    // org_id: explicit null means "unshare to personal"; UUID means "share with this org"
    if ('org_id' in (req.body || {})) {
      patch.org_id = req.body.org_id || null;
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'No fields to update' });
    const { data, error } = await client
      .from('vendor_catalogs')
      .update(patch)
      .eq('id', req.params.id)
      .select('id, user_id, org_id, vendor, category, enabled, updated_at')
      .single();
    if (error) throw error;
    res.json({ ...data, is_owner: data.user_id === req.user.id });
  } catch (err) {
    logger.error('Patch vendor catalog error:', err);
    return handleApiError(res, err, 'Patch catalog');
  }
});

router.delete('/blueprint/catalogs/:id', authenticateJWT, async (req, res) => {
  try {
    const client = getUserClient(req.accessToken);
    if (!client) return res.status(503).json({ error: 'Supabase not configured on server' });
    const { error } = await client
      .from('vendor_catalogs')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    logger.error('Delete vendor catalog error:', err);
    return handleApiError(res, err, 'Delete catalog');
  }
});

/**
 * Orgs / teams — for sharing vendor catalogs across multiple users on a
 * contractor's team. RLS handles the access enforcement (orgs_members
 * table determines who sees what); these endpoints just forward the
 * caller's JWT so policies apply naturally.
 *
 * Member-by-email add uses the service-role client because user lookup
 * by email requires admin access (not in standard RLS read scope).
 */
router.get('/blueprint/orgs', authenticateJWT, async (req, res) => {
  try {
    const client = getUserClient(req.accessToken);
    if (!client) return res.status(503).json({ error: 'Supabase not configured on server' });
    // Two queries merged: orgs the user owns + orgs they're a member of.
    // RLS on `orgs` already restricts to these — single SELECT * is enough.
    const { data, error } = await client
      .from('orgs')
      .select('id, name, owner_user_id, created_at, updated_at')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    const me = req.user.id;
    res.json({ orgs: (data || []).map(o => ({ ...o, is_owner: o.owner_user_id === me })) });
  } catch (err) {
    logger.error('List orgs error:', err);
    return handleApiError(res, err, 'List orgs');
  }
});

router.post('/blueprint/orgs', authenticateJWT, express.json({ limit: '4kb' }), async (req, res) => {
  // Create a new org. Caller becomes owner + first member automatically.
  try {
    const client = getUserClient(req.accessToken);
    if (!client) return res.status(503).json({ error: 'Supabase not configured on server' });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name required' });
    const { data: org, error: orgErr } = await client
      .from('orgs')
      .insert({ name, owner_user_id: req.user.id })
      .select('id, name, owner_user_id, created_at, updated_at')
      .single();
    if (orgErr) throw orgErr;
    // Add the owner as a member row too — keeps queries simple ("am I a
    // member of this org?" doesn't need to special-case ownership).
    const { error: memErr } = await client
      .from('org_members')
      .insert({ org_id: org.id, user_id: req.user.id, role: 'owner', invited_by: req.user.id });
    if (memErr && !/duplicate/i.test(memErr.message)) {
      logger.warn('Owner self-membership insert failed (non-fatal):', memErr.message);
    }
    res.json({ ...org, is_owner: true });
  } catch (err) {
    logger.error('Create org error:', err);
    return handleApiError(res, err, 'Create org');
  }
});

router.get('/blueprint/orgs/:id/members', authenticateJWT, async (req, res) => {
  try {
    const client = getUserClient(req.accessToken);
    if (!client) return res.status(503).json({ error: 'Supabase not configured on server' });
    // Need to join to auth.users for the email — that requires service role
    // (RLS doesn't expose auth.users to authenticated). Fetch member rows
    // first via the user client (RLS enforces visibility), then enrich
    // with emails via service role.
    const { data: members, error } = await client
      .from('org_members')
      .select('org_id, user_id, role, invited_by, created_at')
      .eq('org_id', req.params.id);
    if (error) throw error;
    const svc = getServiceClient();
    let emailById = {};
    if (svc && members?.length) {
      const ids = members.map(m => m.user_id);
      // sg_users has email; auth.users is the auth source but mirrored.
      const { data: profiles } = await svc
        .from('sg_users')
        .select('id, email')
        .in('id', ids);
      emailById = Object.fromEntries((profiles || []).map(p => [p.id, p.email]));
    }
    res.json({
      members: (members || []).map(m => ({
        ...m,
        email: emailById[m.user_id] || null,
        is_me: m.user_id === req.user.id,
      })),
    });
  } catch (err) {
    logger.error('List org members error:', err);
    return handleApiError(res, err, 'List members');
  }
});

router.post('/blueprint/orgs/:id/members', authenticateJWT, express.json({ limit: '4kb' }), async (req, res) => {
  // Add a member by email. Caller must be the org owner (RLS enforces this
  // on the insert). Service role looks up the email → user_id mapping.
  try {
    const client = getUserClient(req.accessToken);
    if (!client) return res.status(503).json({ error: 'Supabase not configured on server' });
    const email = String(req.body?.email || '').trim().toLowerCase();
    const role  = req.body?.role === 'admin' ? 'admin' : 'member';
    if (!email || !/.+@.+\..+/.test(email)) return res.status(400).json({ error: 'valid email required' });
    const svc = getServiceClient();
    if (!svc) return res.status(503).json({ error: 'Server not configured for member lookups' });
    // Resolve email → user_id from sg_users (mirror of auth.users)
    const { data: target, error: lookupErr } = await svc
      .from('sg_users')
      .select('id, email')
      .ilike('email', email)
      .maybeSingle();
    if (lookupErr) throw lookupErr;
    if (!target) {
      return res.status(404).json({ error: `No user with email ${email} — they need to sign up first.` });
    }
    // Insert via the user client so the RLS owner-check applies
    const { data, error } = await client
      .from('org_members')
      .insert({ org_id: req.params.id, user_id: target.id, role, invited_by: req.user.id })
      .select('org_id, user_id, role, created_at')
      .single();
    if (error) {
      if (/duplicate/i.test(error.message)) {
        return res.status(409).json({ error: `${email} is already on this team.` });
      }
      throw error;
    }
    res.json({ ...data, email: target.email });
  } catch (err) {
    logger.error('Add org member error:', err);
    return handleApiError(res, err, 'Add member');
  }
});

router.delete('/blueprint/orgs/:id/members/:userId', authenticateJWT, async (req, res) => {
  try {
    const client = getUserClient(req.accessToken);
    if (!client) return res.status(503).json({ error: 'Supabase not configured on server' });
    const { error } = await client
      .from('org_members')
      .delete()
      .eq('org_id', req.params.id)
      .eq('user_id', req.params.userId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    logger.error('Remove org member error:', err);
    return handleApiError(res, err, 'Remove member');
  }
});

// ============ AI ROOM SCANNER ============

/**
 * Universal room/countertop/sketch scanner using AI vision
 * POST /api/ai/room-scan
 * Handles: room photos, countertop photos, hand sketches, CAD drawings
 */
router.post('/room-scan', async (req, res) => {
  try {
    const {
      image,
      scanMode = 'room-photo', // room-photo, countertop, sketch, cad
      projectType = 'kitchen-remodel',
      userContext = '',
      extractMode = 'all', // all, cabinets, countertops, layout
      knownDimensions = null // { width: ft, depth: ft }
    } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Image is required' });
    }

    // Validate image format — HEIC not supported by OpenAI Vision
    const convertedImage = validateImageFormat(image);

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!OPENAI_API_KEY) {
      logger.info('OpenAI API not configured, returning demo mode');
      return res.json({
        success: true,
        mode: 'demo',
        rooms: [generateDemoRoomScan(scanMode, projectType)],
        confidence: 'demo',
        message: 'Demo mode - Configure OPENAI_API_KEY for real scanning'
      });
    }

    // Build the system prompt based on scan mode
    const systemPrompts = {
      'room-photo': `You are an expert at analyzing photographs of real rooms (kitchens, bathrooms, etc.) to extract cabinet layouts, countertops, and appliances for 3D modeling and quoting.

ANALYZE THE ROOM PHOTO AND EXTRACT:
1. Room dimensions - estimate based on standard cabinet/appliance sizes
2. All visible cabinets with their types and estimated dimensions
3. Countertop areas with estimated dimensions and material type if identifiable
4. Appliances with positions and sizes
5. Overall layout type (L-shape, U-shape, galley, single-wall, island)

SPATIAL ORDERING (CRITICAL):
- List cabinets LEFT-TO-RIGHT for top/bottom walls, TOP-TO-BOTTOM for left/right walls
- Assign each cabinet an orderIndex (0, 1, 2...) within its wall
- Note the gap (in inches) before each cabinet from the previous element or wall edge
- Identify what's adjacent on each side (adjacentLeft, adjacentRight)

MEASUREMENT CALIBRATION:
- Use visible appliances as measurement anchors: Range/Stove = 30" wide, Refrigerator = 36" wide, Dishwasher = 24" wide, Microwave = 30" wide
- Standard base cabinet height: 34.5", depth: 24"
- Standard wall cabinet height: 30-42", depth: 12"
- Counter depth including overhang: ~26"
- Count cabinet doors/drawers to estimate widths (standard door = 15-18", drawer bank = 12-36")
- Use these anchors to calibrate all other measurements

MATERIAL IDENTIFICATION:
- Identify countertop material if visible: granite (speckled/veined natural stone), quartz (uniform engineered), marble (prominent veining), laminate (solid color/pattern), butcher block (wood grain)
- Try to identify specific stone names if recognizable (e.g., "Giallo Ornamental", "Luna Pearl", "Calacatta")
- Note cabinet door style: shaker (recessed panel), raised panel, flat/slab, beaded, glass-front
- Note cabinet finish: wood-grain (natural), painted (solid color), thermofoil, laminate
- Identify cabinet color/wood species if possible

WALL-BY-WALL DESCRIPTION:
- Describe each wall separately (top/back, bottom/front, left, right)
- Start from one corner and work around the room
- Note transitions between walls (corners, fillers, end panels)`,

      'countertop': `You are an expert at analyzing photographs of countertops to estimate dimensions and identify materials for quoting purposes.

ANALYZE THE COUNTERTOP PHOTO AND EXTRACT:
1. Overall shape (L-shape, U-shape, straight, island, peninsula)
2. Estimated dimensions in inches (length, depth)
3. Material identification if possible (granite, quartz, marble, laminate, etc.)
4. Edge profile if visible
5. Number of sink cutouts visible
6. Any special features (waterfall edges, curved sections)

TIPS:
- Use visible objects for scale (phones ~6", mugs ~4", stove width 30")
- Standard counter depth is 25.5" from wall
- Standard overhang is 1.5" past cabinets`,

      'sketch': `You are an expert at interpreting hand-drawn sketches, napkin drawings, and rough diagrams of kitchen/bathroom layouts.

ANALYZE THE SKETCH AND EXTRACT:
1. Room shape and dimensions (use any labeled measurements)
2. Cabinet positions and approximate sizes
3. Appliance locations
4. Countertop runs
5. Any notes or labels on the sketch

INTERPRETATION TIPS:
- Look for dimension callouts (numbers with arrows or lines)
- Rectangles along walls are usually cabinets
- Circles often indicate sinks
- Large rectangles in center might be islands
- If no dimensions given, estimate based on typical room sizes`,

      'cad': `You are an expert at reading cabinet shop drawings from 2020 Design, Cabinet Vision, KCD, and similar CAD software.

EXTRACT PRECISE DATA FROM THE CAD DRAWING:
1. Room dimensions from title block or dimension lines
2. Every cabinet with exact dimensions (read labels/callouts)
3. Cabinet types (B=base, W=wall, SB=sink base, T=tall, etc.)
4. Wall assignments from the view shown
5. Appliance locations and sizes

READ DIMENSIONS EXACTLY as shown - do not estimate for CAD drawings.`
    };

    // Build the extraction prompt
    let extractionFocus = '';
    if (extractMode === 'cabinets') {
      extractionFocus = 'Focus ONLY on cabinet extraction. Ignore countertops and appliances.';
    } else if (extractMode === 'countertops') {
      extractionFocus = 'Focus ONLY on countertop extraction. Note cabinet positions only for counter placement context.';
    } else if (extractMode === 'layout') {
      extractionFocus = 'Focus on room layout and dimensions. Provide approximate cabinet runs without individual cabinet details.';
    }

    const knownDimsContext = knownDimensions
      ? `KNOWN DIMENSIONS: Room is ${knownDimensions.width || '?'}ft wide x ${knownDimensions.depth || '?'}ft deep. Use these to calibrate your estimates.`
      : '';

    const userPrompt = `Analyze this ${scanMode === 'room-photo' ? 'room photograph' : scanMode === 'countertop' ? 'countertop photograph' : scanMode === 'sketch' ? 'hand-drawn sketch' : 'CAD drawing'}.

${userContext ? `USER CONTEXT: "${userContext}"` : ''}
${knownDimsContext}
${extractionFocus}

PROJECT TYPE: ${projectType}

RETURN THIS EXACT JSON STRUCTURE:
{
  "rooms": [{
    "name": "Room name from image or 'Kitchen'/'Bathroom' based on type",
    "widthFt": estimated room width in feet,
    "depthFt": estimated room depth in feet,
    "layoutType": "L-shape|U-shape|galley|single-wall|island|peninsula",
    "cabinets": [
      {
        "label": "B1, B2, W1, etc. or descriptive label",
        "type": "base-cabinet|wall-cabinet|tall-cabinet|sink-base|drawer-base|corner-cabinet|island",
        "width": width in INCHES,
        "depth": depth in INCHES,
        "height": height in INCHES,
        "wall": "top|bottom|left|right|island",
        "material": "wood|painted|laminate|unknown",
        "orderIndex": position along wall (0=first from left/top),
        "gapBefore": gap in INCHES from previous element or wall edge,
        "adjacentLeft": "type of element to the left or null",
        "adjacentRight": "type of element to the right or null",
        "doorStyle": "shaker|raised|flat|slab|beaded|glass" or null,
        "finish": "wood-grain|painted|thermofoil|laminate" or null,
        "confidence": "high|medium|low"
      }
    ],
    "countertops": [
      {
        "width": width in INCHES,
        "depth": depth in INCHES,
        "material": "granite|quartz|marble|laminate|butcher-block|unknown",
        "materialName": "specific stone/material name if identifiable" or null,
        "wall": "top|bottom|left|right|island",
        "hasSink": true/false,
        "confidence": "high|medium|low"
      }
    ],
    "appliances": [
      {"type": "refrigerator|range|slide-in-range|cooktop|dishwasher|microwave|hood|oven|double-oven|wine-cooler|beverage-center|ice-maker|warming-drawer|trash-compactor", "width": inches, "wall": "position", "gapBefore": gap in INCHES from previous element, "confidence": "high|medium|low"}
    ]
  }],
  "confidence": "high|medium|low",
  "confidenceDetails": {
    "dimensions": "high|medium|low",
    "cabinetCount": "high|medium|low",
    "materials": "high|medium|low",
    "layout": "high|medium|low"
  },
  "measurementAnchors": ["list of appliances/objects used to calibrate measurements"],
  "notes": ["Any observations about image quality or uncertainty"]
}

Be thorough but realistic. If you can't determine something, use standard dimensions and note low confidence.`;

    logger.info(`[Room-Scan] Mode: ${scanMode}, Project: ${projectType}`);

    // Call GPT-4 Vision (60s cap — vision requests are slow, but must not hang forever)
    const response = await fetchWithAbort('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompts[scanMode] || systemPrompts['room-photo'] },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              {
                type: 'image_url',
                image_url: {
                  url: convertedImage,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 8192,
        temperature: 0.2
      })
    }, 60000);

    const data = await response.json();

    if (data.error) {
      logger.error('[Room-Scan] OpenAI error:', data.error);
      throw new Error(data.error.message);
    }

    // Parse the response
    if (!data.choices || !data.choices[0]) {
      return res.status(500).json({ error: 'AI returned empty response' });
    }
    const content = data.choices[0].message.content;
    logger.info(`[Room-Scan] Response length: ${content.length}`);

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);

        // Log summary
        const roomCount = parsed.rooms?.length || 0;
        const cabinetCount = parsed.rooms?.reduce((sum, r) => sum + (r.cabinets?.length || 0), 0) || 0;
        const counterCount = parsed.rooms?.reduce((sum, r) => sum + (r.countertops?.length || 0), 0) || 0;
        logger.info(`[Room-Scan] Parsed: ${roomCount} rooms, ${cabinetCount} cabinets, ${counterCount} countertops`);

        return res.json({
          success: true,
          mode: 'ai',
          scanMode: scanMode,
          ...parsed
        });

      } catch (parseError) {
        logger.error('[Room-Scan] JSON parse error:', parseError.message);
        return res.status(500).json({
          error: 'Failed to parse AI response',
          rawResponse: content.substring(0, 500)
        });
      }
    }

    return res.status(500).json({
      error: 'No valid JSON in AI response',
      rawResponse: content.substring(0, 500)
    });

  } catch (error) {
    logger.error('[Room-Scan] Error:', error);
    return handleApiError(res, error, 'Room scan');
  }
});

// ============ AI MULTI-IMAGE ROOM SCAN ============

/**
 * Multi-Image Room Scan - Analyze 2-4 photos and merge results
 * POST /api/ai/room-scan-multi
 * Parallel GPT-4o Vision calls + merge pass
 */
router.post('/room-scan-multi', async (req, res) => {
  try {
    const { images, projectType = 'residential-kitchen', userContext = '' } = req.body;

    if (!images || !Array.isArray(images) || images.length < 2) {
      return res.status(400).json({ error: 'At least 2 images are required (max 4)' });
    }
    if (images.length > 4) {
      return res.status(400).json({ error: 'Maximum 4 images allowed' });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    logger.info(`[Room-Scan-Multi] Analyzing ${images.length} images in SINGLE call`);

    // ============================================================
    // SINGLE-CALL APPROACH: Send ALL images to GPT-4o at once
    // GPT sees every angle simultaneously → much better accuracy
    // ============================================================

    const systemPrompt = `You are a kitchen designer analyzing photos to create a floor plan. Return ONLY valid JSON.

IMPORTANT: All dimensions must be in INCHES, not feet. A standard base cabinet is 36 inches wide, NOT 3.
Standard sizes: base cabinet=36"W x 24"D x 34"H, wall cabinet=36"W x 12"D x 30"H, fridge=36"W x 30"D x 70"H, range=30"W x 26"D x 36"H, dishwasher=24"W x 24"D x 34"H.
Use standard sizes unless you can clearly see the cabinet is a different size.`;

    const userPrompt = `Analyze ${images.length} photo(s) of this kitchen. ${userContext ? `Context: "${userContext}"` : ''}

WALLS (bird's-eye view): "top"=back wall, "bottom"=front, "left"=left side, "right"=right side.

For EACH wall that has cabinets, list what's on it LEFT to RIGHT (or TOP to BOTTOM for side walls):
- Each base cabinet (type "base-cabinet", standard 36"W unless clearly smaller/larger)
- The sink base (type "sink-base", usually 36"W, on wall with the window)
- Each wall/upper cabinet (type "wall-cabinet", standard 36"W)
- Each appliance with its wall

Use STANDARD widths: 36" for most base/wall cabinets, 30" for range, 36" for fridge, 24" for dishwasher.
Only use non-standard widths (12", 15", 18", 24") when you can clearly see a narrow cabinet.

ALL dimensions in INCHES. Room dimensions in FEET.

{
  "rooms": [{
    "name": "Kitchen",
    "widthFt": room_width_feet,
    "depthFt": room_depth_feet,
    "layoutType": "L-shape|U-shape|galley|single-wall",
    "cabinets": [
      {"label": "B1", "type": "base-cabinet", "width": 36, "depth": 24, "height": 34, "wall": "top", "orderIndex": 0}
    ],
    "appliances": [
      {"type": "refrigerator|range|dishwasher|microwave|hood", "width": 36, "depth": 30, "height": 70, "wall": "left", "orderIndex": 0}
    ]
  }],
  "confidence": "high|medium|low"
}`;

    // Build the content array: text prompt + all images
    // Validate image formats — HEIC not supported by OpenAI Vision
    const convertedImages = images.map(img => ({ ...img, data: validateImageFormat(img.data || img) }));

    const contentArray = [
      { type: 'text', text: userPrompt }
    ];

    convertedImages.forEach((img, idx) => {
      contentArray.push({
        type: 'image_url',
        image_url: {
          url: img.data || img,
          detail: 'auto'
        }
      });
    });

    // 25-second timeout so we respond before Render's 30s limit
    const gptController = new AbortController();
    const gptTimeout = setTimeout(() => gptController.abort(), 25000);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: contentArray }
        ],
        max_tokens: 4096,
        temperature: 0.2,
        response_format: { type: 'json_object' }
      }),
      signal: gptController.signal
    });
    clearTimeout(gptTimeout);

    const data = await response.json();

    if (data.error) {
      logger.error('[Room-Scan-Multi] GPT error:', data.error.message);
      return res.status(500).json({ error: 'AI analysis failed: ' + (data.error.message || 'Unknown error') });
    }

    const content = data.choices?.[0]?.message?.content || '';
    logger.info(`[Room-Scan-Multi] Response length: ${content.length} chars`);

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      // Fallback: try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (e2) {
          logger.error('[Room-Scan-Multi] JSON parse failed');
          return res.status(500).json({ error: 'Failed to parse AI response as JSON' });
        }
      } else {
        return res.status(500).json({ error: 'AI did not return valid JSON' });
      }
    }

    // Log summary
    const room = parsed.rooms?.[0];
    if (room) {
      const cabCount = (room.cabinets || []).length;
      const appCount = (room.appliances || []).length;
      const ctCount = (room.countertops || []).length;
      logger.info(`[Room-Scan-Multi] Result: ${room.layoutType} ${room.widthFt}'x${room.depthFt}', ${cabCount} cabinets, ${appCount} appliances, ${ctCount} countertops`);
    }

    return res.json({ success: true, mode: 'ai', scanMode: 'multi-image-unified', ...parsed });

  } catch (error) {
    logger.error('[Room-Scan-Multi] Error:', error);
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'AI analysis timed out — try with fewer images or simpler photos' });
    }
    return handleApiError(res, error, 'Multi-image room scan');
  }
});

// ============ TWO-PASS ROOM SCAN ============

/**
 * POST /api/ai/room-scan-two-pass
 * Pass 1: Structure detection (layout type, wall count, approximate dimensions)
 * Pass 2: Detailed counting (cabinets, appliances, countertops) with Pass 1 context
 */
router.post('/room-scan-two-pass', async (req, res) => {
  try {
    const { images, projectType = 'residential-kitchen', userContext = '' } = req.body;

    if (!images || !Array.isArray(images) || images.length < 1) {
      return res.status(400).json({ error: 'At least 1 image is required (max 4)' });
    }
    if (images.length > 4) {
      return res.status(400).json({ error: 'Maximum 4 images allowed' });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    logger.info(`[Room-Scan-TwoPass] Analyzing ${images.length} images`);

    // Build image content array (shared by both passes)
    const imageContent = images.map((img) => ({
      type: 'image_url',
      image_url: { url: img.data || img, detail: 'high' }
    }));

    // ========== PASS 1: Structure Detection ==========
    const pass1System = `You are an expert kitchen designer. Analyze the room photos to identify the overall structure ONLY. Do NOT count individual cabinets yet.
Return ONLY valid JSON — no markdown, no explanation.`;

    const pass1User = `Here are ${images.length} photo(s) of a kitchen. Identify the room structure.
${userContext ? `USER CONTEXT: "${userContext}"` : ''}

Determine:
1. Layout type (L-shape, U-shape, galley, single-wall, island, peninsula)
2. How many walls have cabinets
3. Approximate room dimensions in feet (use appliances as measurement anchors: fridge=36"W, range=30"W, dishwasher=24"W)
4. Brief description of what's on each wall (left-to-right or top-to-bottom)
5. List all visible appliances and which wall they're on

Return this JSON:
{
  "layoutType": "L-shape|U-shape|galley|single-wall|island|peninsula",
  "wallCount": number,
  "roomWidthFt": number,
  "roomDepthFt": number,
  "wallDescriptions": [
    { "wall": "top|bottom|left|right|island|peninsula", "description": "brief description of elements on this wall" }
  ],
  "appliancePositions": [
    { "type": "refrigerator|range|dishwasher|microwave|hood|oven|wine-cooler", "wall": "top|bottom|left|right" }
  ],
  "measurementAnchors": ["fridge 36in on left wall", "range 30in on top wall"]
}`;

    const pass1Response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: pass1System },
          { role: 'user', content: [{ type: 'text', text: pass1User }, ...imageContent] }
        ],
        max_tokens: 2048,
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });

    const pass1Data = await pass1Response.json();
    if (pass1Data.error) {
      logger.error('[Room-Scan-TwoPass] Pass 1 GPT error:', pass1Data.error.message);
      return res.status(500).json({ error: 'Pass 1 failed: ' + (pass1Data.error.message || 'Unknown error') });
    }

    let structure;
    try {
      structure = JSON.parse(pass1Data.choices?.[0]?.message?.content || '{}');
    } catch (e) {
      const match = (pass1Data.choices?.[0]?.message?.content || '').match(/\{[\s\S]*\}/);
      structure = match ? JSON.parse(match[0]) : {};
    }
    logger.info(`[Room-Scan-TwoPass] Pass 1 result: ${structure.layoutType}, ${structure.wallCount} walls, ${structure.roomWidthFt}'x${structure.roomDepthFt}'`);

    // ========== PASS 2: Detailed Counting ==========
    const wallDescs = (structure.wallDescriptions || [])
      .map(w => `${w.wall}: ${w.description}`).join('\n  ');
    const appPositions = (structure.appliancePositions || [])
      .map(a => `${a.type} on ${a.wall} wall`).join(', ');

    const pass2System = `You are an expert kitchen designer who counts cabinets with extreme precision. You already know the room structure from a prior analysis. Use that context to count every single cabinet on each wall.
Return ONLY valid JSON — no markdown, no explanation.`;

    const pass2User = `KNOWN ROOM STRUCTURE (from prior analysis):
- Layout: ${structure.layoutType || 'unknown'}
- ${structure.wallCount || '?'} walls with cabinets
- Room dimensions: ${structure.roomWidthFt || '?'}ft x ${structure.roomDepthFt || '?'}ft
- Walls:
  ${wallDescs || 'Not determined'}
- Appliances: ${appPositions || 'Not determined'}
- Measurement anchors: ${(structure.measurementAnchors || []).join(', ') || 'None'}
${userContext ? `USER CONTEXT: "${userContext}"` : ''}

Now look at the photos again and count EVERY cabinet on each wall precisely.

RULES:
- Count individual cabinet DOORS carefully. Each pair of doors = one cabinet. Single doors = 15-18" wide. Drawer banks = 12-36" wide.
- Count EVERY cabinet, even partially visible ones. Include spaces between appliances (those are cabinets too).
- Use the known appliance positions above — do NOT re-derive the layout.
- Use appliance dimensions as measurement anchors to calibrate all other measurements.

WALK THROUGH EACH WALL systematically:
1. ${(structure.wallDescriptions || []).map(w => w.wall + ' wall').join(', then ') || 'Each wall in order'}
2. For each wall: list base cabinets, then wall/upper cabinets, then appliances IN ORDER left-to-right

Return this JSON:
{
  "rooms": [{
    "name": "Kitchen",
    "widthFt": ${structure.roomWidthFt || 'room_width'},
    "depthFt": ${structure.roomDepthFt || 'room_depth'},
    "layoutType": "${structure.layoutType || 'unknown'}",
    "cabinets": [
      {
        "label": "B1",
        "type": "base-cabinet|wall-cabinet|tall-cabinet|sink-base|drawer-base|corner-cabinet|island",
        "width": width_inches,
        "depth": depth_inches,
        "height": height_inches,
        "wall": "top|bottom|left|right|island|peninsula",
        "orderIndex": 0,
        "gapBefore": gap_inches_from_previous_element_or_wall_edge,
        "doorStyle": "shaker|raised|flat|slab",
        "finish": "wood-grain|painted",
        "confidence": "high|medium|low"
      }
    ],
    "countertops": [
      {
        "width": total_run_width_inches,
        "depth": depth_inches,
        "material": "granite|quartz|marble|laminate|butcher-block",
        "materialName": "specific stone name or null",
        "wall": "top|bottom|left|right|island|peninsula",
        "hasSink": true_or_false,
        "confidence": "high|medium|low"
      }
    ],
    "appliances": [
      {
        "type": "refrigerator|range|slide-in-range|cooktop|dishwasher|microwave|hood|oven|double-oven|wine-cooler",
        "width": width_inches,
        "depth": depth_inches,
        "height": height_inches,
        "wall": "top|bottom|left|right",
        "orderIndex": position_in_wall_sequence,
        "gapBefore": gap_inches_from_previous_element
      }
    ]
  }],
  "confidence": "high|medium|low",
  "wallsCovered": [${(structure.wallDescriptions || []).map(w => `"${w.wall}"`).join(', ')}],
  "measurementAnchors": [${(structure.measurementAnchors || []).map(a => `"${a}"`).join(', ')}]
}`;

    const pass2Response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: pass2System },
          { role: 'user', content: [{ type: 'text', text: pass2User }, ...imageContent] }
        ],
        max_tokens: 8192,
        temperature: 0.2,
        response_format: { type: 'json_object' }
      })
    });

    const pass2Data = await pass2Response.json();
    if (pass2Data.error) {
      logger.error('[Room-Scan-TwoPass] Pass 2 GPT error:', pass2Data.error.message);
      return res.status(500).json({ error: 'Pass 2 failed: ' + (pass2Data.error.message || 'Unknown error') });
    }

    const pass2Content = pass2Data.choices?.[0]?.message?.content || '';
    logger.info(`[Room-Scan-TwoPass] Pass 2 response length: ${pass2Content.length} chars`);

    let parsed;
    try {
      parsed = JSON.parse(pass2Content);
    } catch (e) {
      const jsonMatch = pass2Content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (e2) {
          logger.error('[Room-Scan-TwoPass] JSON parse failed');
          return res.status(500).json({ error: 'Failed to parse AI response as JSON' });
        }
      } else {
        return res.status(500).json({ error: 'AI did not return valid JSON' });
      }
    }

    // Attach pass1 structure data for frontend correction UI
    parsed._pass1Structure = structure;

    const room = parsed.rooms?.[0];
    if (room) {
      const cabCount = (room.cabinets || []).length;
      const appCount = (room.appliances || []).length;
      const ctCount = (room.countertops || []).length;
      logger.info(`[Room-Scan-TwoPass] Result: ${room.layoutType} ${room.widthFt}'x${room.depthFt}', ${cabCount} cabinets, ${appCount} appliances, ${ctCount} countertops`);
    }

    return res.json({ success: true, mode: 'ai', scanMode: 'two-pass', ...parsed });

  } catch (error) {
    logger.error('[Room-Scan-TwoPass] Error:', error);
    return handleApiError(res, error, 'Two-pass room scan');
  }
});

// ============ AI DESIGN FROM REFERENCE ============

/**
 * Design from Reference Photo + Description
 * POST /api/ai/design-from-reference
 * Step 1: Analyze reference photo (reuse room-scan logic)
 * Step 2: Apply user's text modifications
 */
router.post('/design-from-reference', async (req, res) => {
  try {
    const { image, description, projectType = 'residential-kitchen' } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Reference image is required' });
    }

    // Validate image format — HEIC not supported by OpenAI Vision
    const convertedImage = validateImageFormat(image);

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    logger.info(`[Design-Reference] Starting with description: "${(description || '').substring(0, 100)}"`);

    // Step 1: Analyze the reference photo
    const analyzePrompt = `Analyze this reference kitchen/bathroom photo and extract the COMPLETE layout as JSON.

RETURN THIS EXACT JSON STRUCTURE:
{
  "rooms": [{
    "name": "Reference Kitchen",
    "widthFt": estimated width,
    "depthFt": estimated depth,
    "layoutType": "L-shape|U-shape|galley|single-wall|island|peninsula",
    "cabinets": [
      {
        "label": "descriptive label",
        "type": "base-cabinet|wall-cabinet|tall-cabinet|sink-base|drawer-base|corner-cabinet|island",
        "width": inches, "depth": inches, "height": inches,
        "wall": "top|bottom|left|right|island",
        "orderIndex": position,
        "gapBefore": gap in inches,
        "doorStyle": "shaker|raised|flat|slab" or null,
        "finish": "wood-grain|painted" or null,
        "confidence": "high|medium|low"
      }
    ],
    "countertops": [
      {"width": inches, "depth": inches, "material": "granite|quartz|marble|etc", "materialName": "specific name or null", "wall": "position", "hasSink": bool}
    ],
    "appliances": [
      {"type": "type", "width": inches, "wall": "position"}
    ]
  }],
  "confidence": "high|medium|low",
  "confidenceDetails": {"dimensions": "level", "cabinetCount": "level", "materials": "level", "layout": "level"},
  "measurementAnchors": ["list"]
}`;

    const step1Response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are an expert at analyzing room photographs for 3D modeling. Extract precise layouts.' },
          {
            role: 'user',
            content: [
              { type: 'text', text: analyzePrompt },
              { type: 'image_url', image_url: { url: convertedImage, detail: 'high' } }
            ]
          }
        ],
        max_tokens: 8192,
        temperature: 0.2
      })
    });

    const step1Data = await step1Response.json();
    if (step1Data.error) {
      throw new Error(step1Data.error.message);
    }

    if (!step1Data.choices || !step1Data.choices[0]) {
      throw new Error('AI returned empty response for reference analysis');
    }
    const step1Content = step1Data.choices[0].message.content;
    const step1Json = step1Content.match(/\{[\s\S]*\}/);
    let originalLayout;

    try {
      if (!step1Json) throw new Error('No JSON in AI response');
      originalLayout = JSON.parse(step1Json[0]);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to parse reference image analysis' });
    }

    // If no description, just return the original analysis
    if (!description || description.trim() === '') {
      return res.json({
        success: true,
        mode: 'reference',
        original: originalLayout,
        modified: originalLayout,
        changes: []
      });
    }

    // Step 2: Apply modifications based on user description
    const modifyPrompt = `You have a reference kitchen layout (JSON below). The user wants modifications.

ORIGINAL LAYOUT:
${JSON.stringify(originalLayout, null, 2)}

USER'S MODIFICATIONS: "${description}"

Apply the user's requested changes to the layout. Return:
{
  "modified": { ...the complete modified layout in same JSON format... },
  "changes": ["list of specific changes made, e.g. 'Changed cabinet finish from oak to white painted'", "Added waterfall island edge"]
}

Keep elements that weren't mentioned. Only change what the user asked for. Be specific about what changed.`;

    const step2Response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are an expert kitchen/bathroom designer. Modify layouts based on user descriptions while preserving the overall structure.' },
          { role: 'user', content: modifyPrompt }
        ],
        max_tokens: 8192,
        temperature: 0.3
      })
    });

    const step2Data = await step2Response.json();
    if (step2Data.error) {
      throw new Error(step2Data.error.message);
    }

    if (!step2Data.choices || !step2Data.choices[0]) {
      throw new Error('AI returned empty response for modification');
    }
    const step2Content = step2Data.choices[0].message.content;
    const step2Json = step2Content.match(/\{[\s\S]*\}/);

    let modResult;
    try {
      if (!step2Json) throw new Error('No JSON in AI response');
      modResult = JSON.parse(step2Json[0]);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to parse modification response' });
    }

    return res.json({
      success: true,
      mode: 'reference',
      original: originalLayout,
      modified: modResult.modified || originalLayout,
      changes: modResult.changes || []
    });

  } catch (error) {
    logger.error('[Design-Reference] Error:', error);
    return handleApiError(res, error, 'Design from reference');
  }
});

// ============ AI DESIGN CHAT ============

/**
 * AI Design Chat - Natural language room builder
 * POST /api/ai/design-chat
 * Takes user messages and returns design actions
 */
router.post('/design-chat', async (req, res) => {
  try {
    const { message, history = [], roomState = {} } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!OPENAI_API_KEY) {
      // Demo mode - return simple responses
      return res.json(generateDemoDesignResponse(message, roomState));
    }

    // System prompt for the AI designer
    const systemPrompt = `You are an expert kitchen and bathroom designer assistant integrated into a Room Designer Pro application. You help users create room layouts by understanding their requests and generating specific design actions.

CURRENT ROOM STATE:
- Room size: ${roomState.roomWidth || 12}' wide x ${roomState.roomDepth || 10}' deep
- Current elements: ${roomState.elementCount || 0} items
${roomState.elements?.length > 0 ? `- Elements: ${roomState.elements.slice(0, 10).map(e => e.label).join(', ')}${roomState.elements.length > 10 ? '...' : ''}` : ''}

YOUR CAPABILITIES - You can execute these actions:
1. SET_ROOM_SIZE - Change room dimensions (params: width, depth in feet)
2. CLEAR_ELEMENTS - Remove all items from the room
3. ADD_CABINET - Add a cabinet (params: type, wall, width, label)
   - Types: base-cabinet, wall-cabinet, tall-cabinet, sink-base, drawer-base, corner-cabinet
   - Walls: top (back), bottom (front), left, right
   - Width: in inches (12, 15, 18, 21, 24, 27, 30, 33, 36, 42, 48)
4. ADD_APPLIANCE - Add an appliance (params: type, wall, width)
   - Types: refrigerator, range, dishwasher, microwave, hood
5. ADD_COUNTERTOP - Add countertop over cabinets (params: wall or "all", material)
6. ADD_ISLAND - Add center island (params: width, depth in inches)
7. CREATE_LAYOUT - Create a complete kitchen layout (params: layoutType, width, depth)
   - Layout types: L-shape, U-shape, galley, single-wall, island
8. DELETE_ELEMENT - Remove an element by label (params: label)
9. SELECT_ELEMENT - Select an element (params: label)

RESPONSE FORMAT:
Always respond with a JSON object containing:
{
  "response": "Your conversational response to the user",
  "actions": [
    { "type": "ACTION_TYPE", "params": { ... } },
    ...
  ]
}

GUIDELINES:
- Be helpful and conversational in your responses
- When users ask to create or add something, include the appropriate actions
- Standard kitchen cabinet widths: 12", 15", 18", 21", 24", 27", 30", 33", 36", 42", 48"
- Standard base cabinet height: 34.5", depth: 24"
- Standard wall cabinet height: 30" or 36" or 42", depth: 12"
- When creating layouts, use appropriate room sizes (small: 10x8, medium: 12x10, large: 14x12)
- Always explain what you're doing in your response
- If the user's request is unclear, ask for clarification
- Multiple actions can be in one response (e.g., set room size AND add cabinets)`;

    // Build messages array
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-8).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message }
    ];

    logger.info(`[Design-Chat] Processing: "${message.substring(0, 50)}..."`);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
        temperature: 0.7,
        max_tokens: 1024,
        response_format: { type: 'json_object' }
      })
    });

    const data = await response.json();

    if (data.error) {
      logger.error('[Design-Chat] OpenAI error:', data.error);
      throw new Error(data.error.message);
    }
    if (!data.choices || !data.choices[0]) {
      throw new Error('AI returned empty response');
    }

    const content = data.choices[0].message.content;

    try {
      const parsed = JSON.parse(content);
      logger.info(`[Design-Chat] Actions: ${parsed.actions?.length || 0}`);

      return res.json({
        success: true,
        response: parsed.response || "I've processed your request.",
        actions: parsed.actions || []
      });
    } catch (parseError) {
      // If JSON parse fails, return the text as response
      return res.json({
        success: true,
        response: content,
        actions: []
      });
    }

  } catch (error) {
    logger.error('[Design-Chat] Error:', error);
    return handleApiError(res, error, 'Design chat');
  }
});

/**
 * Generate demo response for design chat (when no API key)
 */
function generateDemoDesignResponse(message, roomState) {
  const lowerMsg = message.toLowerCase();
  let response = '';
  let actions = [];

  if (lowerMsg.includes('l-shape') || lowerMsg.includes('l shape')) {
    response = "I'll create an L-shaped kitchen layout for you! This classic design provides great workflow with the work triangle.";
    actions = [{ type: 'CREATE_LAYOUT', params: { layoutType: 'L-shape', width: 12, depth: 10 } }];
  } else if (lowerMsg.includes('u-shape') || lowerMsg.includes('u shape')) {
    response = "Creating a U-shaped kitchen - perfect for maximizing storage and counter space!";
    actions = [{ type: 'CREATE_LAYOUT', params: { layoutType: 'U-shape', width: 14, depth: 12 } }];
  } else if (lowerMsg.includes('galley')) {
    response = "Setting up a galley kitchen layout - efficient and great for smaller spaces!";
    actions = [{ type: 'CREATE_LAYOUT', params: { layoutType: 'galley', width: 12, depth: 8 } }];
  } else if (lowerMsg.includes('island')) {
    if (lowerMsg.includes('add')) {
      response = "Adding a center island to your kitchen. Great for extra prep space and casual seating!";
      actions = [{ type: 'ADD_ISLAND', params: { width: 48, depth: 36 } }];
    } else {
      response = "Creating a kitchen with a center island!";
      actions = [{ type: 'CREATE_LAYOUT', params: { layoutType: 'island', width: 14, depth: 12 } }];
    }
  } else if (lowerMsg.includes('clear') || lowerMsg.includes('start fresh') || lowerMsg.includes('reset')) {
    response = "Clearing the room so we can start fresh. What would you like to create?";
    actions = [{ type: 'CLEAR_ELEMENTS', params: {} }];
  } else if (lowerMsg.includes('countertop') || lowerMsg.includes('counter')) {
    response = "Adding countertops over all the base cabinets with a nice granite finish!";
    actions = [{ type: 'ADD_COUNTERTOP', params: { wall: 'all', material: 'granite' } }];
  } else if (lowerMsg.includes('refrigerator') || lowerMsg.includes('fridge')) {
    response = "Adding a refrigerator to the kitchen.";
    actions = [{ type: 'ADD_APPLIANCE', params: { type: 'refrigerator', wall: 'right', width: 36 } }];
  } else if (lowerMsg.includes('range') || lowerMsg.includes('stove')) {
    response = "Adding a range/stove to your kitchen.";
    actions = [{ type: 'ADD_APPLIANCE', params: { type: 'range', wall: 'top', width: 30 } }];
  } else if (lowerMsg.includes('cabinet')) {
    const wallMatch = lowerMsg.match(/(back|front|left|right|top|bottom)/);
    const wall = wallMatch ? (wallMatch[1] === 'back' ? 'top' : wallMatch[1] === 'front' ? 'bottom' : wallMatch[1]) : 'top';
    const isWall = lowerMsg.includes('wall cabinet') || lowerMsg.includes('upper');
    const isSink = lowerMsg.includes('sink');

    response = `Adding a ${isWall ? 'wall' : isSink ? 'sink base' : 'base'} cabinet to the ${wall} wall.`;
    actions = [{
      type: 'ADD_CABINET',
      params: {
        type: isWall ? 'wall-cabinet' : isSink ? 'sink-base' : 'base-cabinet',
        wall: wall,
        width: 36
      }
    }];
  } else if (lowerMsg.includes('room') && (lowerMsg.includes('size') || lowerMsg.includes('dimension'))) {
    const numbers = lowerMsg.match(/\d+/g);
    if (numbers && numbers.length >= 2) {
      response = `Setting room dimensions to ${numbers[0]}' x ${numbers[1]}'.`;
      actions = [{ type: 'SET_ROOM_SIZE', params: { width: parseInt(numbers[0]), depth: parseInt(numbers[1]) } }];
    } else {
      response = "What size would you like the room? For example, '12 by 10 feet'.";
    }
  } else {
    response = "I can help you design your space! Try saying things like:\n• 'Create an L-shaped kitchen'\n• 'Add a 36-inch base cabinet on the back wall'\n• 'Add countertops'\n• 'Put a refrigerator on the right wall'\n\nWhat would you like to create?";
  }

  return { success: true, response, actions };
}

/**
 * Generate demo room scan data
 */
function generateDemoRoomScan(scanMode, projectType) {
  const demos = {
    'room-photo': {
      name: 'Kitchen (Demo)',
      widthFt: 14,
      depthFt: 12,
      layoutType: 'L-shape',
      cabinets: [
        { label: 'B1', type: 'base-cabinet', width: 36, depth: 24, height: 34.5, wall: 'top' },
        { label: 'B2', type: 'base-cabinet', width: 36, depth: 24, height: 34.5, wall: 'top' },
        { label: 'SB', type: 'sink-base', width: 36, depth: 24, height: 34.5, wall: 'top' },
        { label: 'B3', type: 'base-cabinet', width: 24, depth: 24, height: 34.5, wall: 'left' },
        { label: 'W1', type: 'wall-cabinet', width: 36, depth: 12, height: 30, wall: 'top' },
        { label: 'W2', type: 'wall-cabinet', width: 36, depth: 12, height: 30, wall: 'top' }
      ],
      countertops: [
        { width: 120, depth: 26, material: 'granite', wall: 'top', hasSink: true },
        { width: 48, depth: 26, material: 'granite', wall: 'left', hasSink: false }
      ],
      appliances: [
        { type: 'refrigerator', width: 36, wall: 'right' },
        { type: 'range', width: 30, wall: 'top' },
        { type: 'dishwasher', width: 24, wall: 'top' }
      ]
    },
    'countertop': {
      name: 'Countertop Scan (Demo)',
      widthFt: 10,
      depthFt: 2.5,
      layoutType: 'single-wall',
      cabinets: [],
      countertops: [
        { width: 120, depth: 26, material: 'quartz', wall: 'top', hasSink: true }
      ],
      appliances: []
    },
    'sketch': {
      name: 'From Sketch (Demo)',
      widthFt: 12,
      depthFt: 10,
      layoutType: 'U-shape',
      cabinets: [
        { label: '1', type: 'base-cabinet', width: 36, depth: 24, height: 34.5, wall: 'top' },
        { label: '2', type: 'sink-base', width: 36, depth: 24, height: 34.5, wall: 'top' },
        { label: '3', type: 'base-cabinet', width: 36, depth: 24, height: 34.5, wall: 'top' },
        { label: '4', type: 'base-cabinet', width: 24, depth: 24, height: 34.5, wall: 'left' },
        { label: '5', type: 'base-cabinet', width: 24, depth: 24, height: 34.5, wall: 'right' }
      ],
      countertops: [],
      appliances: [
        { type: 'range', width: 30, wall: 'top' }
      ]
    }
  };

  return demos[scanMode] || demos['room-photo'];
}

// ============ HELPER FUNCTIONS ============

/**
 * Convert AI result format to legacy frontend format
 * Preserves new cabinet-specific fields for Room Designer
 */
function convertAIResultToLegacy(aiResult, projectType) {
  if (!aiResult || !aiResult.takeoff) {
    return generateTakeoffAnalysis(projectType);
  }

  const takeoff = aiResult.takeoff;
  const totals = takeoff.totals || {};
  const rooms = takeoff.rooms || [];

  // Check if this is the new cabinet-specific format (has cabinets array)
  const hasNewFormat = rooms.some(r => Array.isArray(r.cabinets) && r.cabinets.length > 0);

  // materials_called_out lives at the top of the GPT response (Step 2 schema
  // includes it as a peer to rooms). Pass it through both branches so the
  // frontend aggregator can populate the Materials table — without this,
  // the field gets stripped here even if GPT returned it correctly.
  const materialsCalledOut = Array.isArray(takeoff.materials_called_out)
    ? takeoff.materials_called_out
    : [];
  // missing_or_unreadable enumerates schedule rows GPT could see but couldn't
  // confidently read. The frontend surfaces these so the user knows what
  // didn't make it into the bid (rather than silently dropping rows).
  const missingOrUnreadable = Array.isArray(takeoff.missing_or_unreadable)
    ? takeoff.missing_or_unreadable
    : [];

  if (hasNewFormat) {
    // New format: pass through cabinet data directly for Room Designer
    return {
      totalArea: totals.totalSF || rooms.reduce((sum, r) => sum + (r.sqft || 0), 0),
      countertopSqft: totals.countertops?.sqft || 0,
      flooringSqft: totals.flooring?.sqft || 0,
      tileSqft: totals.tile?.sqft || 0,
      // Preserve full room data including cabinets
      rooms: rooms.map(room => ({
        name: room.name || 'Unknown Room',
        dimensions: room.dimensions || 'N/A',
        sqft: room.sqft || 0,
        widthFt: room.widthFt || null,
        depthFt: room.depthFt || null,
        material: getMaterialTypes(room.materials),
        materials: room.materials || null,
        // NEW: Pass through cabinet-specific data
        cabinets: room.cabinets || [],
        appliances: room.appliances || [],
        island: room.island || null,
        layoutType: room.layoutType || null,
        notes: room.notes || null
      })),
      materials_called_out: materialsCalledOut,
      missing_or_unreadable: missingOrUnreadable,
      costs: aiResult.costs || null,
      // NEW: Pass through metadata
      pageType: takeoff.pageType || null,
      pageTitle: takeoff.pageTitle || null,
      confidence: takeoff.confidence || 'medium',
      notes: takeoff.notes || []
    };
  }

  // Legacy format: traditional takeoff data
  return {
    totalArea: totals.totalSF || rooms.reduce((sum, r) => sum + (r.sqft || 0), 0),
    countertopSqft: totals.countertops?.sqft || 0,
    flooringSqft: totals.flooring?.sqft || 0,
    tileSqft: totals.tile?.sqft || 0,
    rooms: rooms.map(room => ({
      name: room.name || 'Unknown Room',
      dimensions: room.dimensions || 'N/A',
      sqft: room.sqft || 0,
      material: getMaterialTypes(room.materials),
      materials: room.materials || null
    })),
    materials_called_out: materialsCalledOut,
    missing_or_unreadable: missingOrUnreadable,
    costs: aiResult.costs || null
  };
}

/**
 * Helper to get material type string from room materials
 */
function getMaterialTypes(materials) {
  if (!materials) return 'N/A';
  const types = [];
  if (materials.countertops?.sqft > 0) types.push('Countertop');
  if (materials.flooring?.sqft > 0) types.push('Flooring');
  if (materials.tile?.sqft > 0) types.push('Tile');
  if (materials.cabinets) types.push('Cabinets');
  return types.length > 0 ? types.join(' + ') : 'N/A';
}

/**
 * Calculate labor estimate based on analysis results
 */
function calculateLaborEstimate(analysis, laborRate) {
  const hourlyRate = parseFloat(laborRate) || 50;
  const estimates = {
    countertops: { hoursPerSqft: 0.5, sqft: analysis.countertopSqft || 0 },
    flooring: { hoursPerSqft: 0.15, sqft: analysis.flooringSqft || 0 },
    tile: { hoursPerSqft: 0.25, sqft: analysis.tileSqft || 0 }
  };

  let totalHours = 0;
  const breakdown = {};

  for (const [trade, data] of Object.entries(estimates)) {
    const hours = data.sqft * data.hoursPerSqft;
    totalHours += hours;
    breakdown[trade] = {
      sqft: data.sqft,
      hours: Math.round(hours * 10) / 10,
      cost: Math.round(hours * hourlyRate)
    };
  }

  return {
    totalHours: Math.round(totalHours * 10) / 10,
    totalLaborCost: Math.round(totalHours * hourlyRate),
    hourlyRate: hourlyRate,
    breakdown
  };
}

/**
 * Generate takeoff analysis (demo mode) - includes cabinet data for Room Designer
 */
function generateTakeoffAnalysis(projectType) {
  const analyses = {
    'kitchen-remodel': {
      totalArea: 180,
      countertopSqft: 45,
      flooringSqft: 120,
      tileSqft: 35,
      widthFt: 15,
      depthFt: 12,
      rooms: [
        {
          name: 'Kitchen',
          dimensions: "12' x 15'",
          sqft: 180,
          widthFt: 15,
          depthFt: 12,
          material: 'Cabinets + Countertop',
          cabinets: [
            { label: '1', type: 'base-cabinet', width: 36, depth: 24, height: 34.5, wall: 'top' },
            { label: '2', type: 'base-cabinet', width: 36, depth: 24, height: 34.5, wall: 'top' },
            { label: '3', type: 'sink-base', width: 36, depth: 24, height: 34.5, wall: 'top' },
            { label: '4', type: 'base-cabinet', width: 24, depth: 24, height: 34.5, wall: 'top' },
            { label: '5', type: 'wall-cabinet', width: 36, depth: 12, height: 30, wall: 'top' },
            { label: '6', type: 'wall-cabinet', width: 36, depth: 12, height: 30, wall: 'top' },
            { label: '7', type: 'wall-cabinet', width: 30, depth: 12, height: 30, wall: 'top' }
          ],
          appliances: [
            { type: 'refrigerator', width: 36, wall: 'right' },
            { type: 'range', width: 30, wall: 'top' }
          ]
        }
      ],
      confidence: 'demo'
    },
    'bathroom-remodel': {
      totalArea: 85,
      countertopSqft: 12,
      flooringSqft: 0,
      tileSqft: 120,
      rooms: [
        {
          name: 'Master Bath',
          dimensions: "8' x 10'",
          sqft: 80,
          widthFt: 10,
          depthFt: 8,
          material: 'Cabinets + Tile',
          cabinets: [
            { label: 'V1', type: 'base-cabinet', width: 36, depth: 21, height: 34.5, wall: 'top' },
            { label: 'V2', type: 'drawer-base', width: 24, depth: 21, height: 34.5, wall: 'top' }
          ]
        }
      ],
      confidence: 'demo'
    },
    'full-home': {
      totalArea: 2200,
      countertopSqft: 65,
      flooringSqft: 1800,
      tileSqft: 280,
      rooms: [
        {
          name: 'Kitchen',
          dimensions: "14' x 16'",
          sqft: 224,
          widthFt: 16,
          depthFt: 14,
          material: 'Cabinets + Countertop',
          cabinets: [
            { label: 'B1', type: 'base-cabinet', width: 36, depth: 24, height: 34.5, wall: 'top' },
            { label: 'B2', type: 'base-cabinet', width: 36, depth: 24, height: 34.5, wall: 'top' },
            { label: 'SB', type: 'sink-base', width: 36, depth: 24, height: 34.5, wall: 'top' },
            { label: 'DB', type: 'drawer-base', width: 24, depth: 24, height: 34.5, wall: 'right' },
            { label: 'W1', type: 'wall-cabinet', width: 36, depth: 12, height: 30, wall: 'top' },
            { label: 'W2', type: 'wall-cabinet', width: 30, depth: 12, height: 30, wall: 'top' },
            { label: 'T1', type: 'tall-cabinet', width: 24, depth: 24, height: 84, wall: 'right' }
          ]
        },
        { name: 'Living Room', dimensions: "20' x 18'", sqft: 360, widthFt: 20, depthFt: 18, material: 'Flooring', cabinets: [] },
        { name: 'Master Bedroom', dimensions: "16' x 14'", sqft: 224, widthFt: 16, depthFt: 14, material: 'Flooring', cabinets: [] }
      ],
      confidence: 'demo'
    },
    'flooring-only': {
      totalArea: 1500,
      countertopSqft: 0,
      flooringSqft: 1500,
      tileSqft: 0,
      rooms: [
        { name: 'Living Area', dimensions: "25' x 20'", sqft: 500, widthFt: 25, depthFt: 20, material: 'LVP Flooring', cabinets: [] },
        { name: 'Kitchen/Dining', dimensions: "20' x 18'", sqft: 360, widthFt: 20, depthFt: 18, material: 'LVP Flooring', cabinets: [] }
      ],
      confidence: 'demo'
    },
    'commercial': {
      totalArea: 5000,
      countertopSqft: 120,
      flooringSqft: 4500,
      tileSqft: 400,
      rooms: [
        {
          name: 'Break Room',
          dimensions: "15' x 12'",
          sqft: 180,
          widthFt: 15,
          depthFt: 12,
          material: 'Cabinets + Countertop',
          cabinets: [
            { label: '1', type: 'base-cabinet', width: 36, depth: 24, height: 32, wall: 'top' },
            { label: '2', type: 'base-cabinet', width: 36, depth: 24, height: 32, wall: 'top' },
            { label: '3', type: 'sink-base', width: 30, depth: 24, height: 32, wall: 'top' },
            { label: '4', type: 'wall-cabinet', width: 36, depth: 12, height: 30, wall: 'top' },
            { label: '5', type: 'wall-cabinet', width: 30, depth: 12, height: 30, wall: 'top' },
            { label: '6', type: 'tall-cabinet', width: 24, depth: 24, height: 84, wall: 'right' }
          ],
          appliances: [
            { type: 'refrigerator', width: 36, wall: 'right' },
            { type: 'microwave', width: 24, wall: 'top' }
          ]
        },
        {
          name: 'Reception Counter',
          dimensions: "12' x 3'",
          sqft: 36,
          widthFt: 12,
          depthFt: 6,
          material: 'Quartz Counter',
          cabinets: [
            { label: 'R1', type: 'base-cabinet', width: 36, depth: 24, height: 32, wall: 'top' },
            { label: 'R2', type: 'base-cabinet', width: 36, depth: 24, height: 32, wall: 'top' },
            { label: 'R3', type: 'drawer-base', width: 24, depth: 24, height: 32, wall: 'top' }
          ]
        }
      ],
      confidence: 'demo'
    },
    // Commercial cabinets project type - detailed cabinet data
    'commercial-cabinets': {
      totalArea: 800,
      countertopSqft: 80,
      rooms: [
        {
          name: 'Sample Room (Demo)',
          dimensions: "20' x 14'",
          sqft: 280,
          widthFt: 20,
          depthFt: 14,
          material: 'Cabinets',
          cabinets: [
            { label: '1', type: 'base-cabinet', width: 36, depth: 24, height: 32, wall: 'top' },
            { label: '2', type: 'base-cabinet', width: 36, depth: 24, height: 32, wall: 'top' },
            { label: '3', type: 'base-cabinet', width: 24, depth: 24, height: 32, wall: 'top' },
            { label: '4', type: 'sink-base', width: 36, depth: 24, height: 32, wall: 'top' },
            { label: '5', type: 'drawer-base', width: 18, depth: 24, height: 32, wall: 'top' },
            { label: '6', type: 'wall-cabinet', width: 36, depth: 12, height: 30, wall: 'top' },
            { label: '7', type: 'wall-cabinet', width: 30, depth: 12, height: 30, wall: 'top' },
            { label: '8', type: 'wall-cabinet', width: 24, depth: 12, height: 30, wall: 'top' }
          ],
          notes: 'Demo data - upload a blueprint for AI analysis'
        }
      ],
      confidence: 'demo',
      notes: ['This is demo data. Configure OPENAI_API_KEY for actual blueprint analysis.']
    }
  };

  return analyses[projectType] || analyses['commercial-cabinets'];
}

/**
 * Helper function for demo images
 */
function getDemoImage(style) {
  const demoImages = {
    modern: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80',
    traditional: 'https://images.unsplash.com/photo-1556909114-44e3e70034e2?w=800&q=80',
    farmhouse: 'https://images.unsplash.com/photo-1556909172-8c2f041fca1e?w=800&q=80',
    industrial: 'https://images.unsplash.com/photo-1556909114-4d02e86f5c5a?w=800&q=80',
    minimalist: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80',
    luxury: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&q=80'
  };
  return demoImages[style] || demoImages.modern;
}

// ============ MULTI-SURFACE VISUALIZER ============

/**
 * Surface Detection - GPT-4o Vision
 * POST /api/ai/surface-detect
 * Analyzes a room photo and identifies swappable surfaces
 */
router.post('/surface-detect', aiRateLimiter('ai_visualizer'), async (req, res) => {
  try {
    const { image, roomType = 'kitchen' } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Image (base64) is required' });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      logger.info('OpenAI API not configured, returning demo surface detection');
      return res.json({
        surfaces: [
          { id: 'countertop', label: 'Countertops', description: 'Current countertop surface', currentColor: 'unknown', swappableWith: ['countertops'] },
          { id: 'backsplash', label: 'Backsplash', description: 'Current backsplash', currentColor: 'unknown', swappableWith: ['tile'] },
          { id: 'floor', label: 'Floor', description: 'Current flooring', currentColor: 'unknown', swappableWith: ['flooring', 'tile'] }
        ],
        layoutDescription: 'Demo mode — configure OPENAI_API_KEY for real surface detection',
        demo: true
      });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are an expert interior design analyst for Surprise Granite, a countertop and stone company. Analyze room photos and identify all swappable surfaces.

For each surface found, provide:
- id: lowercase identifier (countertop, backsplash, floor, wall, island, bar_top, vanity)
- label: human-readable name
- description: brief description of current material/appearance
- currentColor: primary color of current surface
- swappableWith: array of material categories this surface can be swapped with. Categories: "countertops" (granite, quartz, marble, quartzite), "tile" (backsplash tile, wall tile, floor tile), "flooring" (LVT, vinyl, hardwood)

Also provide a layoutDescription summarizing the room layout, cabinet style, appliances, and overall design.

Respond ONLY in valid JSON with keys: surfaces (array), layoutDescription (string).`
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Analyze this ${roomType} photo and identify all surfaces that could be swapped with new materials:` },
              { type: 'image_url', image_url: { url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}` } }
            ]
          }
        ],
        max_tokens: 800,
        response_format: { type: 'json_object' }
      })
    });

    const data = await response.json();

    if (data.error) {
      logger.error('OpenAI surface-detect error:', data.error);
      return res.status(500).json({ error: data.error.message || 'Surface detection failed' });
    }
    if (!data.choices || !data.choices[0]) {
      return res.status(500).json({ error: 'AI returned empty response for surface detection' });
    }

    const result = JSON.parse(data.choices[0].message.content);
    logger.info(`[Surface Detect] Found ${result.surfaces?.length || 0} surfaces in ${roomType}`);
    res.json(result);

  } catch (error) {
    logger.error('Surface detect error:', error);
    return handleApiError(res, error, 'Surface Detect');
  }
});

/**
 * Surface Swap - OpenAI gpt-image-1
 * POST /api/ai/surface-swap
 * Replaces a specific surface in the photo with a new material
 */
router.post('/surface-swap', aiRateLimiter('ai_visualizer'), async (req, res) => {
  try {
    const { image, surface, material, roomType = 'kitchen', layoutDescription = '' } = req.body;

    if (!image || !surface || !material) {
      return res.status(400).json({ error: 'image, surface, and material are required' });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(503).json({ error: 'AI service not configured. Add OPENAI_API_KEY.' });
    }

    const materialDesc = [
      material.name,
      material.type ? `(${material.type})` : '',
      material.color ? `- ${material.color}` : '',
      material.style ? `with ${material.style} pattern` : ''
    ].filter(Boolean).join(' ');

    const prompt = `In this ${roomType} photo, replace ONLY the ${surface} surfaces with ${materialDesc}. The new material should have a polished, realistic finish. Keep everything else EXACTLY the same — cabinets, appliances, other surfaces, lighting, perspective, wall color. ${layoutDescription ? `Room context: ${layoutDescription}.` : ''} Realistic interior design photography, photorealistic material texture.`;

    // Strip data URI prefix if present for raw base64
    const rawBase64 = image.replace(/^data:image\/\w+;base64,/, '');

    // Try gpt-image-1 edit first
    try {
      const imageBuffer = Buffer.from(rawBase64, 'base64');
      const blob = new Blob([imageBuffer], { type: 'image/jpeg' });

      const formData = new FormData();
      formData.append('model', 'gpt-image-1');
      formData.append('image', blob, 'photo.jpg');
      formData.append('prompt', prompt);
      formData.append('size', '1024x1024');
      formData.append('quality', 'high');

      const editResponse = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        body: formData
      });

      const editData = await editResponse.json();

      if (editData.data && editData.data[0]) {
        const outputBase64 = editData.data[0].b64_json || null;
        const outputUrl = editData.data[0].url || null;

        if (outputBase64) {
          logger.info(`[Surface Swap] gpt-image-1 edit success for ${surface}`);
          return res.json({ image: outputBase64, method: 'gpt-image-1' });
        } else if (outputUrl) {
          // Fetch the URL and convert to base64
          const imgResp = await fetch(outputUrl);
          const imgBuf = Buffer.from(await imgResp.arrayBuffer());
          logger.info(`[Surface Swap] gpt-image-1 edit success (url) for ${surface}`);
          return res.json({ image: imgBuf.toString('base64'), method: 'gpt-image-1' });
        }
      }

      // If we got an error, throw to fall through
      if (editData.error) throw new Error(editData.error.message);
      throw new Error('No output from gpt-image-1 edit');

    } catch (editError) {
      logger.warn(`gpt-image-1 edit failed for ${surface}, trying generate fallback:`, editError.message);
    }

    // Fallback: gpt-image-1 generate
    try {
      const genResponse = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-image-1',
          prompt: `Photorealistic interior ${roomType} photo. ${prompt}`,
          n: 1,
          size: '1024x1024',
          quality: 'high',
          response_format: 'b64_json'
        })
      });

      const genData = await genResponse.json();

      if (genData.data && genData.data[0]?.b64_json) {
        logger.info(`[Surface Swap] gpt-image-1 generate fallback success for ${surface}`);
        return res.json({ image: genData.data[0].b64_json, method: 'gpt-image-1-generate' });
      }

      if (genData.error) throw new Error(genData.error.message);
      throw new Error('No output from gpt-image-1 generate');

    } catch (genError) {
      logger.warn(`gpt-image-1 generate failed for ${surface}, trying dall-e-3:`, genError.message);
    }

    // Final fallback: dall-e-3
    const dalleResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: `Photorealistic interior ${roomType} photo showing ${materialDesc} on the ${surface}. ${layoutDescription}. Professional interior design photography.`,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
        response_format: 'b64_json'
      })
    });

    const dalleData = await dalleResponse.json();

    if (dalleData.data && dalleData.data[0]?.b64_json) {
      logger.info(`[Surface Swap] dall-e-3 fallback success for ${surface}`);
      return res.json({ image: dalleData.data[0].b64_json, method: 'dall-e-3-fallback' });
    }

    if (dalleData.error) {
      return res.status(500).json({ error: dalleData.error.message || 'Image generation failed' });
    }

    return res.status(500).json({ error: 'All image generation methods failed' });

  } catch (error) {
    logger.error('Surface swap error:', error);
    return handleApiError(res, error, 'Surface Swap');
  }
});

module.exports = router;
