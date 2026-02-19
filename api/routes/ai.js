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

    // Call GPT-4 Vision
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
                  url: image,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 8192,
        temperature: 0.2
      })
    });

    const data = await response.json();

    if (data.error) {
      logger.error('[Room-Scan] OpenAI error:', data.error);
      throw new Error(data.error.message);
    }

    // Parse the response
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

    const systemPrompt = `You are an expert kitchen designer who analyzes room photographs to extract precise cabinet layouts for 3D modeling.

You will receive ${images.length} photos of the SAME kitchen taken from different angles. Analyze ALL photos together to build ONE complete, accurate layout. Cross-reference between photos — an appliance or cabinet visible in multiple photos is the SAME item, not duplicates.

RULES:
- Count individual cabinet DOORS carefully. Each pair of doors = one cabinet. Single doors = 15-18" wide. Drawer banks = 12-36" wide.
- Count EVERY cabinet, even partially visible ones. Include the spaces between appliances (those are cabinets too).
- NEVER miss appliances: refrigerator, range/stove, dishwasher, microwave, hood.
- Identify peninsulas (counter extending FROM a wall into the room, open on 2-3 sides) vs islands (freestanding, not connected to any wall).
- Use appliance dimensions as measurement anchors to calibrate all other measurements.
- Return ONLY valid JSON — no markdown, no explanation, just the JSON object.`;

    const userPrompt = `Here are ${images.length} photos of the same kitchen from different angles. Analyze them ALL together to extract the complete room layout.

${userContext ? `USER CONTEXT: "${userContext}"` : ''}
PROJECT TYPE: ${projectType}

WALL MAPPING (bird's-eye view of the floor plan):
- "top" = back wall (the wall you'd face when entering the room)
- "bottom" = front wall (behind you when entering)
- "left" = left wall when facing the back wall
- "right" = right wall when facing the back wall
- "island" = freestanding counter in the middle (NOT connected to any wall)
- "peninsula" = counter extending FROM a wall into the room (connected on one end, open on other sides — often has a sink or breakfast bar)

MEASUREMENT ANCHORS — use these to calibrate all dimensions:
- Refrigerator = 36" wide x 30" deep x 70" tall
- Range/Stove = 30" wide x 26" deep x 36" tall
- Dishwasher = 24" wide x 24" deep x 34" tall
- Microwave (over range) = 30" wide x 16" deep x 18" tall
- Base cabinet depth = 24", height = 34.5" (widths: 12", 15", 18", 21", 24", 30", 33", 36")
- Wall/upper cabinet depth = 12", height = 30-42"

WALK THROUGH EACH WALL systematically:
1. Start at one corner of the back wall ("top") and list every element left-to-right
2. Then the left wall top-to-bottom
3. Then the right wall top-to-bottom
4. Then any island or peninsula
5. For each wall: list base cabinets, then wall/upper cabinets above them, then appliances IN ORDER

RETURN this exact JSON structure:
{
  "rooms": [{
    "name": "Kitchen",
    "widthFt": room_width_in_feet,
    "depthFt": room_depth_in_feet,
    "layoutType": "L-shape|U-shape|galley|single-wall|island|peninsula",
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
        "materialName": "specific stone name if identifiable or null",
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
  "wallsCovered": ["top", "left", "right"],
  "measurementAnchors": ["fridge 36in on left wall", "range 30in on top wall"]
}`;

    // Build the content array: text prompt + all images
    const contentArray = [
      { type: 'text', text: userPrompt }
    ];

    images.forEach((img, idx) => {
      contentArray.push({
        type: 'image_url',
        image_url: {
          url: img.data || img,
          detail: 'high'
        }
      });
    });

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
        max_tokens: 8192,
        temperature: 0.2,
        response_format: { type: 'json_object' }
      })
    });

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
              { type: 'image_url', image_url: { url: image, detail: 'high' } }
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

    const step1Content = step1Data.choices[0].message.content;
    const step1Json = step1Content.match(/\{[\s\S]*\}/);
    let originalLayout;

    try {
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

    const step2Content = step2Data.choices[0].message.content;
    const step2Json = step2Content.match(/\{[\s\S]*\}/);

    let modResult;
    try {
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
