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

ESTIMATION TIPS:
- Standard base cabinet height: 34.5", depth: 24"
- Standard wall cabinet height: 30-42", depth: 12"
- Refrigerator width: 30-36", Range: 30", Dishwasher: 24"
- Counter depth including overhang: ~26"
- Use these to estimate room size from visible elements`,

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
        "material": "wood|painted|laminate|unknown" if identifiable
      }
    ],
    "countertops": [
      {
        "width": width in INCHES,
        "depth": depth in INCHES,
        "material": "granite|quartz|marble|laminate|butcher-block|unknown",
        "wall": "top|bottom|left|right|island",
        "hasSink": true/false
      }
    ],
    "appliances": [
      {"type": "refrigerator|range|dishwasher|microwave|hood", "width": inches, "wall": "position"}
    ]
  }],
  "confidence": "high|medium|low",
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
        max_tokens: 4096,
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
