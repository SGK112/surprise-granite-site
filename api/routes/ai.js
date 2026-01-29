/**
 * AI Routes
 * Handles all AI-powered endpoints: visualizer, video generation, blueprint analysis
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { handleApiError } = require('../utils/security');
const { aiRateLimiter } = require('../middleware/rateLimiter');

// Import blueprint analyzer
const { analyzeBlueprint, parseBluebeamBAX } = require('../lib/takeoff/blueprint-analyzer');

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

    // Use Flux model for image-to-image transformation
    const response = await fetch('https://api.replicate.com/v1/predictions', {
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
    });

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

      const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: {
          'Authorization': `Token ${REPLICATE_API_TOKEN}`
        }
      });

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
 */
router.post('/blueprint', aiRateLimiter('ai_blueprint'), async (req, res) => {
  try {
    const {
      image,
      projectType,
      blueprintUrl,
      baxFile,
      useOllama = false,
      laborRate,
      materialPricing
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

      const hasOpenAI = !!process.env.OPENAI_API_KEY;
      const hasOllama = useOllama;

      if (blueprintData && (hasOpenAI || hasOllama)) {
        const provider = hasOllama ? 'ollama' : 'openai';
        logger.info(`Analyzing blueprint with ${provider}...`);

        try {
          const aiResult = await analyzeBlueprint({
            image: blueprintData,
            projectType: projectType || 'full-home',
            provider: provider,
            apiKey: process.env.OPENAI_API_KEY,
            rates: materialPricing,
            wasteFactor: 0.10
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

module.exports = router;
