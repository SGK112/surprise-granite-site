/**
 * Blueprint Analyzer - AI-Powered Construction Takeoff Engine
 *
 * Supports:
 * - GPT-4 Vision for blueprint image analysis
 * - Ollama for self-hosted AI (LLaVA, Bakllava models)
 * - Bluebeam BAX/PDF markup file parsing
 * - Automatic extraction of construction quantities
 *
 * @author Surprise Granite
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  // OpenAI GPT-4 Vision
  openai: {
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o', // gpt-4-vision-preview or gpt-4o
    maxTokens: 4096
  },

  // Ollama (self-hosted)
  ollama: {
    apiUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'llava:13b', // or bakllava, llava:34b
  },

  // Trade categories for extraction
  trades: {
    countertops: {
      keywords: ['counter', 'countertop', 'granite', 'quartz', 'marble', 'island', 'vanity top', 'bar top'],
      units: ['SF', 'LF'],
      defaultDepth: 25.5 // inches
    },
    flooring: {
      keywords: ['floor', 'flooring', 'lvp', 'lvt', 'hardwood', 'laminate', 'carpet', 'vinyl'],
      units: ['SF'],
      wasteFactors: { standard: 0.10, diagonal: 0.15, carpet: 0.20 }
    },
    tile: {
      keywords: ['tile', 'backsplash', 'shower', 'tub surround', 'floor tile', 'wall tile', 'mosaic'],
      units: ['SF', 'LF'],
      wasteFactors: { standard: 0.10, mosaic: 0.15 }
    },
    cabinets: {
      keywords: ['cabinet', 'upper', 'lower', 'base cabinet', 'wall cabinet', 'pantry'],
      units: ['LF', 'EA']
    },
    plumbing: {
      keywords: ['sink', 'faucet', 'toilet', 'shower', 'tub', 'water heater', 'drain'],
      units: ['EA', 'LF']
    }
  }
};

// ============================================
// FABRIC-STYLE PATTERNS FOR CABINET ANALYSIS
// Multi-step structured prompts for accurate extraction
// ============================================

/**
 * PATTERN 1: identify_drawing_type
 * Determines what type of drawing we're analyzing
 */
const PATTERN_IDENTIFY_DRAWING = {
  identity: `You are an expert at identifying cabinet and kitchen drawing types from 2020 Design, Cabinet Vision, KCD, and similar CAD software.`,

  task: `Analyze this image and identify EXACTLY what type of drawing it is. This is critical for correct cabinet extraction.`,

  output_format: `Return ONLY valid JSON:
{
  "drawingType": "elevation|plan|schedule|perspective|mixed",
  "wallShown": "top|bottom|left|right|multiple|unknown",
  "wallLabel": "Original label if visible (e.g., 'Wall A', 'North Wall', 'Wall 1')",
  "roomName": "Room name if visible",
  "layoutType": "L-shape|U-shape|galley|single-wall|island|unknown",
  "cabinetCount": approximate number of cabinets visible,
  "hasWallCabinets": true/false,
  "hasBaseCabinets": true/false,
  "hasTallCabinets": true/false,
  "confidence": "high|medium|low",
  "notes": "Any relevant observations"
}`,

  rules: `
CRITICAL RULES FOR DRAWING TYPE:

1. ELEVATION VIEW (side/front view of ONE wall):
   - You see cabinets from the FRONT, doors/drawers facing you
   - Base cabinets at BOTTOM, wall cabinets at TOP
   - ALL cabinets are on the SAME WALL
   - Often labeled "Wall A", "Wall 1", "North Wall", etc.
   - Set wallShown to the wall being viewed

2. PLAN VIEW (top-down/bird's eye):
   - You see cabinets from ABOVE
   - Cabinets appear as rectangles along room edges
   - Can see multiple walls
   - Set wallShown to "multiple"

3. CABINET SCHEDULE (table/list):
   - Text-based list of cabinets with specs
   - Usually has columns: Qty, Description, Size
   - Set wallShown to "unknown" (need to infer)

4. PERSPECTIVE/3D VIEW:
   - 3D rendered view of the room
   - Can see depth and multiple walls
   - Set wallShown to "multiple"

5. MIXED (multiple views on one page):
   - Contains both elevation and plan views
   - Set drawingType to "mixed"
`
};

/**
 * PATTERN 2: extract_cabinets
 * Extracts cabinet data using context from Pattern 1
 */
const PATTERN_EXTRACT_CABINETS = {
  identity: `You are an expert cabinet data extractor specializing in 2020 Design and CAD software output.`,

  getTask: (drawingContext) => `
Extract ALL cabinet data from this ${drawingContext.drawingType} view.

CRITICAL CONTEXT FROM STEP 1:
- Drawing Type: ${drawingContext.drawingType}
- Wall Shown: ${drawingContext.wallShown}
- Wall Label: ${drawingContext.wallLabel || 'Not specified'}
- Room: ${drawingContext.roomName || 'Unknown'}
- Layout: ${drawingContext.layoutType}

${drawingContext.drawingType === 'elevation' ? `
⚠️ THIS IS AN ELEVATION VIEW - ALL CABINETS GO ON THE "${drawingContext.wallShown.toUpperCase()}" WALL
Do NOT assign cabinets to different walls. Every cabinet in this view is on wall: "${drawingContext.wallShown}"
` : ''}

${drawingContext.drawingType === 'schedule' ? `
⚠️ THIS IS A CABINET SCHEDULE - Infer wall positions from cabinet names/notes if possible.
If a cabinet says "Wall A" or "North", map it: Wall A/North = "top", Wall B/South = "bottom", Wall C/East = "right", Wall D/West = "left"
` : ''}
`,

  output_format: `Return ONLY valid JSON:
{
  "rooms": [{
    "name": "Room name",
    "widthFt": estimated room width in feet,
    "depthFt": estimated room depth in feet,
    "layoutType": "L-shape|U-shape|galley|single-wall|island",
    "cabinets": [
      {
        "label": "Cabinet code (B36, W3030, etc.)",
        "type": "base-cabinet|wall-cabinet|tall-cabinet|sink-base|corner-cabinet|island|drawer-base",
        "width": width in inches,
        "depth": depth in inches,
        "height": height in inches,
        "wall": "top|bottom|left|right|island"
      }
    ],
    "appliances": [
      {"type": "refrigerator|range|dishwasher|microwave", "width": inches, "wall": "position"}
    ],
    "island": {"width": inches, "depth": inches} or null
  }],
  "confidence": "high|medium|low"
}`,

  rules: `
EXTRACTION RULES:

1. DIMENSIONS - Be precise:
   - Read dimensions EXACTLY as shown
   - Standard base: 24" deep, 34.5" tall
   - Standard wall: 12" deep, 30/36/42" tall
   - Standard tall: 24" deep, 84/90/96" tall

2. CABINET TYPES - Identify correctly:
   - "B" prefix = base cabinet
   - "W" prefix = wall cabinet
   - "SB" = sink base
   - "DB" = drawer base
   - "TB" or "TP" = tall pantry
   - Numbers after = width (B36 = 36" base)

3. WALL ASSIGNMENT - Follow drawing context:
   - ELEVATION: All cabinets → same wall from context
   - PLAN: Assign based on position in drawing
   - SCHEDULE: Use notes/labels to determine wall

4. CABINET SEQUENCE - Maintain order:
   - Extract cabinets left-to-right as they appear
   - This preserves the layout sequence
`
};

/**
 * PATTERN 3: validate_layout
 * Validates and corrects the extracted data
 */
const PATTERN_VALIDATE_LAYOUT = {
  identity: `You are a cabinet layout validator ensuring extracted data is logically correct.`,

  getTask: (extractedData, drawingContext) => `
Validate this cabinet extraction and FIX any issues:

Drawing Type: ${drawingContext.drawingType}
Wall Shown: ${drawingContext.wallShown}

Extracted Data:
${JSON.stringify(extractedData, null, 2)}
`,

  rules: `
VALIDATION RULES:

1. If drawingType is "elevation" - ALL cabinets must be on the SAME wall
   - If cabinets are on different walls, FIX by setting all to wallShown value

2. Wall cabinets should align with base cabinets below them
   - Same wall position for paired base/wall cabinets

3. Typical layouts:
   - L-shape: cabinets on 2 adjacent walls (top+left OR top+right)
   - U-shape: cabinets on 3 walls (top+left+right)
   - Galley: cabinets on 2 parallel walls (top+bottom)
   - Single-wall: all on one wall

4. Fix any dimension anomalies:
   - Base cabinet depth > 30" → set to 24"
   - Wall cabinet depth > 15" → set to 12"
   - Width < 6" or > 60" → likely error
`,

  output_format: `Return the CORRECTED JSON with same structure as input, fixing any issues found.`
};

// ============================================
// GPT-4 VISION ANALYSIS WITH FABRIC PATTERNS
// ============================================

/**
 * Analyze blueprint image using GPT-4 Vision with Fabric-style multi-step patterns
 * @param {string} imageBase64 - Base64 encoded image or URL
 * @param {string} projectType - Type of project (kitchen, bathroom, etc.)
 * @param {string} apiKey - OpenAI API key
 * @param {string} userContext - User-provided context about the drawing
 * @returns {Promise<Object>} Takeoff analysis results
 */
async function analyzeWithGPT4Vision(imageBase64, projectType, apiKey, userContext = '') {

  console.log('=== FABRIC PATTERN ANALYSIS START ===');

  // ============================================
  // STEP 1: Identify Drawing Type
  // ============================================
  console.log('Step 1: Identifying drawing type...');

  const step1Prompt = `${PATTERN_IDENTIFY_DRAWING.task}

${userContext ? `USER CONTEXT: "${userContext}"` : ''}

${PATTERN_IDENTIFY_DRAWING.rules}

${PATTERN_IDENTIFY_DRAWING.output_format}`;

  let drawingContext;
  try {
    const step1Response = await callGPT4Vision(apiKey, PATTERN_IDENTIFY_DRAWING.identity, step1Prompt, imageBase64);
    drawingContext = parseJSONResponse(step1Response);
    console.log('Drawing type identified:', drawingContext.drawingType, '| Wall:', drawingContext.wallShown);
  } catch (err) {
    console.warn('Step 1 failed, using defaults:', err.message);
    drawingContext = {
      drawingType: 'elevation',
      wallShown: 'top',
      layoutType: 'unknown',
      confidence: 'low'
    };
  }

  // Apply user context overrides
  if (userContext) {
    const ctx = userContext.toLowerCase();
    if (ctx.includes('wall 1') || ctx.includes('wall a') || ctx.includes('north') || ctx.includes('top wall')) {
      drawingContext.wallShown = 'top';
    } else if (ctx.includes('wall 2') || ctx.includes('wall b') || ctx.includes('south') || ctx.includes('bottom wall')) {
      drawingContext.wallShown = 'bottom';
    } else if (ctx.includes('wall 3') || ctx.includes('wall c') || ctx.includes('east') || ctx.includes('right wall')) {
      drawingContext.wallShown = 'right';
    } else if (ctx.includes('wall 4') || ctx.includes('wall d') || ctx.includes('west') || ctx.includes('left wall')) {
      drawingContext.wallShown = 'left';
    }

    if (ctx.includes('l-shape') || ctx.includes('l shape')) drawingContext.layoutType = 'L-shape';
    if (ctx.includes('u-shape') || ctx.includes('u shape')) drawingContext.layoutType = 'U-shape';
    if (ctx.includes('galley')) drawingContext.layoutType = 'galley';
    if (ctx.includes('single wall') || ctx.includes('one wall')) drawingContext.layoutType = 'single-wall';
  }

  // ============================================
  // STEP 2: Extract Cabinets with Context
  // ============================================
  console.log('Step 2: Extracting cabinets with context...');

  const step2Prompt = `${PATTERN_EXTRACT_CABINETS.getTask(drawingContext)}

${userContext ? `USER CONTEXT: "${userContext}"` : ''}

${PATTERN_EXTRACT_CABINETS.rules}

${PATTERN_EXTRACT_CABINETS.output_format}`;

  let extractedData;
  try {
    const step2Response = await callGPT4Vision(apiKey, PATTERN_EXTRACT_CABINETS.identity, step2Prompt, imageBase64);
    extractedData = parseJSONResponse(step2Response);
    console.log('Cabinets extracted:', extractedData.rooms?.[0]?.cabinets?.length || 0);
  } catch (err) {
    console.error('Step 2 failed:', err.message);
    throw new Error('Failed to extract cabinet data: ' + err.message);
  }

  // ============================================
  // STEP 3: Validate and Correct
  // ============================================
  console.log('Step 3: Validating layout...');

  // Quick validation without another API call
  if (extractedData.rooms) {
    extractedData.rooms.forEach(room => {
      // If elevation view, force all cabinets to same wall
      if (drawingContext.drawingType === 'elevation' && drawingContext.wallShown !== 'multiple') {
        const targetWall = drawingContext.wallShown || 'top';
        console.log(`Elevation view detected - forcing all cabinets to "${targetWall}" wall`);

        room.cabinets?.forEach(cab => {
          if (cab.wall !== 'island') {
            cab.wall = targetWall;
          }
        });

        room.appliances?.forEach(app => {
          if (app.wall !== 'island') {
            app.wall = targetWall;
          }
        });
      }

      // Validate dimensions
      room.cabinets?.forEach(cab => {
        // Fix unrealistic depths
        if (cab.depth > 30 && cab.type !== 'tall-cabinet') cab.depth = 24;
        if (cab.type === 'wall-cabinet' && cab.depth > 15) cab.depth = 12;

        // Fix unrealistic widths
        if (cab.width < 6) cab.width = 12;
        if (cab.width > 60) cab.width = 48;

        // Ensure wall is valid
        if (!['top', 'bottom', 'left', 'right', 'island'].includes(cab.wall)) {
          cab.wall = drawingContext.wallShown || 'top';
        }
      });

      // Set layout type from context if not specified
      if (!room.layoutType || room.layoutType === 'unknown') {
        room.layoutType = drawingContext.layoutType || 'single-wall';
      }
    });
  }

  console.log('=== FABRIC PATTERN ANALYSIS COMPLETE ===');

  return extractedData;
}

/**
 * Helper: Call GPT-4 Vision API
 */
async function callGPT4Vision(apiKey, systemPrompt, userPrompt, imageBase64) {
  const response = await fetch(CONFIG.openai.apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: CONFIG.openai.model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            {
              type: 'image_url',
              image_url: {
                url: imageBase64.startsWith('http') ? imageBase64 : imageBase64,
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: CONFIG.openai.maxTokens,
      temperature: 0.1  // Lower temperature for more consistent extraction
    })
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  return data.choices[0].message.content;
}

/**
 * Helper: Parse JSON from GPT response (handles markdown wrapping)
 */
function parseJSONResponse(content) {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  throw new Error('No valid JSON found in response');
}

// ============================================
// LEGACY SINGLE-PROMPT ANALYSIS (kept for reference)
// ============================================

/**
 * Legacy single-prompt analysis - kept for fallback
 */
async function analyzeWithGPT4VisionLegacy(imageBase64, projectType, apiKey, userContext = '') {
  const systemPrompt = `You are an expert at reading cabinet shop drawings, especially from 2020 Design software and similar CAD programs.

YOUR MISSION: Extract PRECISE cabinet data with CORRECT WALL POSITIONS to create an accurate 3D virtual room.

COMMON SOFTWARE FORMATS TO RECOGNIZE:
- 2020 Design: Cabinet schedules with SKU codes (B36, W3030, SB36, etc.)
- Cabinet Vision: Detailed elevation views with dimension callouts
- KCD Software: Plan and elevation views
- AutoCAD: Architectural cabinet layouts

STEP 1 - IDENTIFY DRAWING TYPE:
- CABINET SCHEDULE/LEGEND: Table listing all cabinets with dimensions
- ELEVATION VIEW: Front view of ONE wall showing cabinet arrangement (cabinets appear flat, stacked vertically with base below and wall cabinets above)
- PLAN VIEW (TOP-DOWN): Bird's eye view showing cabinet layout along room perimeter
- PERSPECTIVE/3D VIEW: 3D rendering of the space

STEP 2 - UNDERSTAND MULTI-VIEW DRAWINGS:
2020 Design and similar CAD programs typically show multiple views:

A) PLAN VIEW (top-down, looking DOWN at the floor):
   - Cabinets appear as rectangles along room walls
   - You see cabinet WIDTHS and DEPTHS
   - Use this to determine which wall each cabinet is on:
     * Cabinets at TOP of drawing = "top" wall
     * Cabinets at BOTTOM of drawing = "bottom" wall
     * Cabinets on LEFT side = "left" wall
     * Cabinets on RIGHT side = "right" wall
     * Cabinets in CENTER (not touching walls) = "island"

B) ELEVATION VIEWS (front view of a single wall):
   - Title usually says "Wall 1", "Wall A", "North Elevation", etc.
   - You see cabinet WIDTHS and HEIGHTS (not depths)
   - Base cabinets at bottom, wall/upper cabinets at top
   - MAP the wall name to position:
     * "Wall 1" or "Wall A" or "North" → "top"
     * "Wall 2" or "Wall B" or "South" → "bottom"
     * "Wall 3" or "Wall C" or "East" → "right"
     * "Wall 4" or "Wall D" or "West" → "left"

C) CABINET SCHEDULE/LEGEND:
   - Lists all cabinets with SKU, dimensions, sometimes wall assignment
   - Cross-reference with plan or elevation to get wall positions

STEP 3 - EXTRACT ROOM INFO:
- Room/Area name from title block or header
- Overall room dimensions if shown (width x depth in feet)
- Identify all walls that have cabinets

STEP 4 - READ EACH CABINET PRECISELY:

For 2020 Design SKU CODES:
- B = Base cabinet (B36 = Base 36")
- W = Wall cabinet (W3030 = Wall 30"W x 30"H)
- SB = Sink Base
- DB = Drawer Base
- BC = Blind Corner
- LS = Lazy Susan
- T = Tall/Pantry
- V = Vanity
- Numbers typically = Width in inches

For DIMENSION STRINGS:
- Read exact measurements: 36", 24", 18.5", etc.
- W x D x H format is common
- May show fractional inches (36-3/4")

For EACH CABINET, extract:
- "label": The cabinet number/tag EXACTLY as shown (1, 2, B36, W3030, etc.)
- "type": base-cabinet, wall-cabinet, sink-base, drawer-base, corner-cabinet, tall-cabinet, lazy-susan, appliance-cabinet, filler, end-panel
- "width": Width in INCHES (e.g., 36, 18, 24)
- "depth": Depth in INCHES (e.g., 24 for base, 12 for wall)
- "height": Height in INCHES (e.g., 34.5 for base, 30 or 42 for wall, 84-96 for tall)
- "wall": CRITICAL - Which wall: "top", "bottom", "left", "right", or "island"

WALL POSITION IS CRITICAL FOR 3D LAYOUT:
- Analyze the drawing to determine which wall each cabinet belongs to
- If viewing an elevation, identify which wall it represents
- If viewing a plan, position based on which edge cabinets are near
- L-shaped layouts: Cabinets typically on "top" AND "left" OR "top" AND "right"
- U-shaped layouts: Cabinets on "top", "left", AND "right"
- Galley layouts: Cabinets on "top" AND "bottom" (parallel walls)
- Peninsula: "top" wall cabinets with island extending into room

RETURN THIS JSON:
{
  "rooms": [
    {
      "name": "EXACT ROOM/AREA NAME",
      "widthFt": 14,
      "depthFt": 12,
      "layoutType": "L-shape|U-shape|galley|single-wall|island",
      "cabinets": [
        { "label": "B36", "type": "base-cabinet", "width": 36, "depth": 24, "height": 34.5, "wall": "top" },
        { "label": "SB36", "type": "sink-base", "width": 36, "depth": 24, "height": 34.5, "wall": "top" },
        { "label": "W3030", "type": "wall-cabinet", "width": 30, "depth": 12, "height": 30, "wall": "top" },
        { "label": "B24-L", "type": "base-cabinet", "width": 24, "depth": 24, "height": 34.5, "wall": "left" }
      ],
      "appliances": [
        { "type": "refrigerator", "width": 36, "wall": "right" },
        { "type": "range", "width": 30, "wall": "top" },
        { "type": "dishwasher", "width": 24, "wall": "top" }
      ],
      "island": {
        "width": 48,
        "depth": 36,
        "hasSink": false
      },
      "notes": "L-shaped kitchen with cabinets on top and left walls"
    }
  ],
  "pageType": "schedule|elevation|plan|perspective",
  "pageTitle": "Title from drawing",
  "confidence": "high|medium|low",
  "notes": ["Observations about drawing quality or unclear elements"]
}

CRITICAL ACCURACY RULES:
1. READ dimensions EXACTLY - 36.75" means 36.75, not 36 or 37
2. Use the EXACT label/number shown on drawing
3. All dimensions must be in INCHES
4. ALWAYS specify wall position - never leave it blank or default everything to "top"
5. Base cabinets: typically 24" deep, 34.5" tall
6. Wall cabinets: typically 12" deep, 30" or 36" or 42" tall
7. Tall cabinets: typically 24" deep, 84" or 90" or 96" tall
8. Corner cabinets go at wall intersections - assign to the primary wall
9. Include ALL cabinets - fillers, panels, appliance garages, etc.
10. Note appliance locations with their wall position
11. If you can't read a dimension clearly, use type-appropriate defaults but note low confidence
12. If viewing only ONE elevation, still try to infer layout from title or notes`;

  // Build user prompt with optional user context
  let userPromptText = `Analyze this ${projectType || 'cabinet'} drawing for 3D room creation.

IMPORTANT: I need ACCURATE WALL POSITIONS for each cabinet to build a correct 3D layout.`;

  // Add user context if provided - this helps the AI understand specific details about the drawing
  if (userContext && userContext.trim()) {
    userPromptText += `

=== USER-PROVIDED CONTEXT ===
The user has provided the following additional information about this drawing:
"${userContext.trim()}"

Please use this context to guide your analysis. For example:
- If the user says "this is Wall 3 (right wall)", assign all cabinets to the "right" wall
- If the user says "L-shaped kitchen", expect cabinets on two adjacent walls
- If the user says "focus on base cabinets only", prioritize base cabinet extraction
- If the user specifies a room type like "wet bar", use that as the room name
=== END USER CONTEXT ===`;
  }

  userPromptText += `

EXTRACT ALL DATA NEEDED TO BUILD AN ACCURATE 3D MODEL:

1. DRAWING TYPE: Is this a schedule, elevation, plan view, or 3D perspective?

2. ROOM IDENTIFICATION:
   - What room/area is this? (Kitchen, Wet Bar, Pantry, etc.)
   - If elevation view: Which wall is shown? (Wall 1 = top, Wall 2 = bottom, Wall 3 = right, Wall 4 = left)
   - What is the overall layout? (L-shape, U-shape, galley, single-wall, island)

3. ROOM DIMENSIONS:
   - If visible, what are the room dimensions in feet?
   - Estimate from cabinet run lengths if not explicitly shown

4. CABINET INVENTORY - For EVERY cabinet visible:
   - Cabinet label/number (B36, 1, W3030, etc.)
   - EXACT width in inches
   - EXACT depth in inches
   - EXACT height in inches
   - Cabinet type (base, wall, sink, drawer, tall, corner, etc.)
   - WALL POSITION: "top", "bottom", "left", "right", or "island"

5. APPLIANCES - Note with wall positions:
   - Refrigerator location, width, and WALL
   - Range/cooktop location, width, and WALL
   - Dishwasher, microwave, hood with WALL positions

6. ISLAND (if present):
   - Width and depth in inches
   - Whether it has a sink or cooktop

7. SPECIAL ITEMS:
   - Fillers, panels, moldings (with wall positions)
   - TV niches, wine racks, appliance garages

Return complete JSON with all cabinets, their PRECISE dimensions, and CORRECT WALL POSITIONS for 3D rendering.`;

  const userPrompt = userPromptText;

  try {
    const response = await fetch(CONFIG.openai.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: CONFIG.openai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              {
                type: 'image_url',
                image_url: {
                  url: imageBase64.startsWith('http') ? imageBase64 : imageBase64,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: CONFIG.openai.maxTokens,
        temperature: 0.2
      })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    // Parse the JSON response from GPT-4
    const content = data.choices[0].message.content;
    console.log('GPT-4 Vision raw response length:', content.length);

    // Extract JSON from the response (might be wrapped in markdown)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);

        // Log summary for debugging
        const roomCount = parsed.rooms?.length || 0;
        const cabinetCount = parsed.rooms?.reduce((sum, r) => sum + (r.cabinets?.length || 0), 0) || 0;
        console.log(`GPT-4 Vision parsed: ${roomCount} rooms, ${cabinetCount} cabinets, confidence: ${parsed.confidence || 'unknown'}`);

        // Validate response has expected structure
        if (!parsed.rooms || !Array.isArray(parsed.rooms)) {
          console.warn('GPT-4 response missing rooms array, wrapping content');
          return {
            rooms: [{ name: 'Unknown', cabinets: [], notes: content }],
            pageType: 'unknown',
            confidence: 'low',
            notes: ['Response did not contain expected room structure']
          };
        }

        return parsed;
      } catch (parseError) {
        console.error('JSON parse error:', parseError.message);
        console.log('Failed JSON snippet:', jsonMatch[0].substring(0, 500));
        return {
          error: 'JSON parse error',
          rawResponse: content,
          parseError: parseError.message
        };
      }
    }

    // If no JSON found, return structured error
    console.warn('No JSON found in GPT-4 response');
    return {
      error: 'Could not parse blueprint analysis - no JSON in response',
      rawResponse: content
    };

  } catch (error) {
    console.error('GPT-4 Vision error:', error);
    throw error;
  }
}

// ============================================
// OLLAMA (SELF-HOSTED) ANALYSIS
// ============================================

/**
 * Analyze blueprint using Ollama with LLaVA model
 * @param {string} imageBase64 - Base64 encoded image
 * @param {string} projectType - Type of project
 * @returns {Promise<Object>} Takeoff analysis results
 */
async function analyzeWithOllama(imageBase64, projectType) {
  const prompt = `You are an expert construction estimator. Analyze this ${projectType} blueprint image.

Extract and calculate:
1. Room dimensions (length x width in feet)
2. Total square footage
3. Countertop measurements (SF and linear feet)
4. Flooring area (SF per room)
5. Tile areas (SF for backsplash, bathroom walls/floors)
6. Cabinet linear feet (upper and lower)
7. Plumbing fixture counts

Respond in JSON format with rooms array and totals object.`;

  try {
    // Remove data URL prefix if present
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const response = await fetch(`${CONFIG.ollama.apiUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CONFIG.ollama.model,
        prompt: prompt,
        images: [base64Data],
        stream: false,
        options: {
          temperature: 0.2,
          num_predict: 2048
        }
      })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    // Parse JSON from response
    const jsonMatch = data.response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return {
      error: 'Could not parse Ollama response',
      rawResponse: data.response
    };

  } catch (error) {
    console.error('Ollama error:', error);
    throw error;
  }
}

// ============================================
// BLUEBEAM BAX FILE PARSER
// ============================================

/**
 * Parse Bluebeam BAX (XML) markup file
 * @param {string} baxContent - BAX file content (XML)
 * @returns {Object} Parsed markup data
 */
function parseBluebeamBAX(baxContent) {
  // BAX files are XML-based
  const markups = [];

  // Simple regex-based extraction (for production, use proper XML parser)
  const subjectMatches = baxContent.matchAll(/<Subj>([^<]+)<\/Subj>/g);
  const labelMatches = baxContent.matchAll(/<Label>([^<]+)<\/Label>/g);
  const measureMatches = baxContent.matchAll(/<Measurement>([^<]+)<\/Measurement>/g);

  // Extract all matches
  const subjects = [...subjectMatches].map(m => m[1]);
  const labels = [...labelMatches].map(m => m[1]);
  const measurements = [...measureMatches].map(m => parseFloat(m[1]) || 0);

  // Combine into markup objects
  for (let i = 0; i < subjects.length; i++) {
    markups.push({
      subject: subjects[i] || 'Unknown',
      label: labels[i] || '',
      measurement: measurements[i] || 0,
      unit: detectUnit(subjects[i], labels[i])
    });
  }

  return categorizeMarkups(markups);
}

/**
 * Detect measurement unit from subject/label
 */
function detectUnit(subject, label) {
  const text = `${subject} ${label}`.toLowerCase();
  if (text.includes('sf') || text.includes('sq ft') || text.includes('area')) return 'SF';
  if (text.includes('lf') || text.includes('linear') || text.includes('length')) return 'LF';
  if (text.includes('ea') || text.includes('count') || text.includes('qty')) return 'EA';
  if (text.includes('cf') || text.includes('cubic') || text.includes('volume')) return 'CF';
  return 'SF'; // Default
}

/**
 * Categorize markups by trade
 */
function categorizeMarkups(markups) {
  const result = {
    countertops: { items: [], totalSF: 0, totalLF: 0 },
    flooring: { items: [], totalSF: 0 },
    tile: { items: [], totalSF: 0, totalLF: 0 },
    cabinets: { items: [], totalLF: 0, count: 0 },
    plumbing: { items: [], count: 0 },
    other: { items: [] }
  };

  for (const markup of markups) {
    const text = `${markup.subject} ${markup.label}`.toLowerCase();
    let categorized = false;

    for (const [trade, config] of Object.entries(CONFIG.trades)) {
      for (const keyword of config.keywords) {
        if (text.includes(keyword)) {
          result[trade].items.push(markup);

          if (markup.unit === 'SF') {
            result[trade].totalSF = (result[trade].totalSF || 0) + markup.measurement;
          } else if (markup.unit === 'LF') {
            result[trade].totalLF = (result[trade].totalLF || 0) + markup.measurement;
          } else if (markup.unit === 'EA') {
            result[trade].count = (result[trade].count || 0) + markup.measurement;
          }

          categorized = true;
          break;
        }
      }
      if (categorized) break;
    }

    if (!categorized) {
      result.other.items.push(markup);
    }
  }

  return result;
}

// ============================================
// COST CALCULATION
// ============================================

/**
 * Calculate costs from takeoff quantities
 * @param {Object} takeoff - Takeoff data with quantities
 * @param {Object} rates - Price rates per unit
 * @param {number} wasteFactor - Waste factor percentage
 * @returns {Object} Cost breakdown
 */
function calculateCosts(takeoff, rates = {}, wasteFactor = 0.10) {
  const defaultRates = {
    countertops: { perSF: 65, perLF: 0 },
    flooring: { perSF: 8 },
    tile: { perSF: 15, perLF: 8 },
    cabinets: { perLF: 250 },
    plumbing: { perFixture: 350 }
  };

  const mergedRates = { ...defaultRates, ...rates };
  const costs = {};
  let totalCost = 0;

  // Countertops
  if (takeoff.totals?.countertops || takeoff.countertops) {
    const data = takeoff.totals?.countertops || takeoff.countertops;
    const sqft = Math.ceil((data.sqft || data.totalSF || 0) * (1 + wasteFactor));
    costs.countertops = {
      sqft,
      cost: sqft * mergedRates.countertops.perSF
    };
    totalCost += costs.countertops.cost;
  }

  // Flooring
  if (takeoff.totals?.flooring || takeoff.flooring) {
    const data = takeoff.totals?.flooring || takeoff.flooring;
    const sqft = Math.ceil((data.sqft || data.totalSF || 0) * (1 + wasteFactor));
    costs.flooring = {
      sqft,
      cost: sqft * mergedRates.flooring.perSF
    };
    totalCost += costs.flooring.cost;
  }

  // Tile
  if (takeoff.totals?.tile || takeoff.tile) {
    const data = takeoff.totals?.tile || takeoff.tile;
    const sqft = Math.ceil((data.sqft || data.totalSF || 0) * (1 + wasteFactor));
    const lf = Math.ceil((data.linearFt || data.totalLF || 0) * (1 + wasteFactor));
    costs.tile = {
      sqft,
      linearFt: lf,
      cost: (sqft * mergedRates.tile.perSF) + (lf * mergedRates.tile.perLF)
    };
    totalCost += costs.tile.cost;
  }

  // Cabinets
  if (takeoff.totals?.cabinets || takeoff.cabinets) {
    const data = takeoff.totals?.cabinets || takeoff.cabinets;
    const lf = (data.upperLF || 0) + (data.lowerLF || 0) + (data.totalLF || 0);
    costs.cabinets = {
      linearFt: lf,
      cost: lf * mergedRates.cabinets.perLF
    };
    totalCost += costs.cabinets.cost;
  }

  // Plumbing
  if (takeoff.totals?.plumbing || takeoff.plumbing) {
    const data = takeoff.totals?.plumbing || takeoff.plumbing;
    const fixtures = data.fixtures || data.count ||
      (data.sinks || 0) + (data.toilets || 0) + (data.showers || 0) + (data.tubs || 0);
    costs.plumbing = {
      fixtures,
      cost: fixtures * mergedRates.plumbing.perFixture
    };
    totalCost += costs.plumbing.cost;
  }

  costs.total = totalCost;

  return costs;
}

// ============================================
// MAIN ANALYSIS FUNCTION
// ============================================

/**
 * Main blueprint analysis function
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Complete takeoff analysis
 */
async function analyzeBlueprint(options) {
  const {
    image,
    imageUrl,
    baxFile,
    projectType = 'kitchen-remodel',
    provider = 'openai', // 'openai', 'ollama', 'demo'
    apiKey,
    rates,
    wasteFactor = 0.10,
    userContext = '' // User-provided context to help AI understand the drawing
  } = options;

  let takeoffData;

  // 1. If BAX file provided, parse it directly
  if (baxFile) {
    takeoffData = parseBluebeamBAX(baxFile);
  }
  // 2. If image provided, use AI vision
  else if (image || imageUrl) {
    const imageData = imageUrl || image;

    switch (provider) {
      case 'openai':
        if (!apiKey) throw new Error('OpenAI API key required');
        takeoffData = await analyzeWithGPT4Vision(imageData, projectType, apiKey, userContext);
        break;

      case 'ollama':
        takeoffData = await analyzeWithOllama(imageData, projectType);
        break;

      case 'demo':
      default:
        takeoffData = generateDemoTakeoff(projectType);
        break;
    }
  } else {
    throw new Error('No image, URL, or BAX file provided');
  }

  // 3. Calculate costs
  const costs = calculateCosts(takeoffData, rates, wasteFactor);

  // 4. Return complete analysis
  return {
    success: true,
    provider,
    projectType,
    takeoff: takeoffData,
    costs,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Generate demo takeoff data for testing
 */
function generateDemoTakeoff(projectType) {
  const demos = {
    'kitchen-remodel': {
      scale: '1/4" = 1\'-0"',
      totalArea: 180,
      rooms: [
        {
          name: 'Kitchen',
          dimensions: "12' x 15'",
          sqft: 180,
          materials: {
            countertops: { sqft: 45, linearFt: 22 },
            flooring: { sqft: 180 },
            tile: { sqft: 30, linearFt: 15 },
            cabinets: { upperLF: 18, lowerLF: 24 },
            plumbing: { sinks: 1, dishwasher: 1, disposal: 1 }
          }
        },
        {
          name: 'Kitchen Island',
          dimensions: "4' x 8'",
          sqft: 32,
          materials: {
            countertops: { sqft: 32, linearFt: 24 }
          }
        }
      ],
      totals: {
        countertops: { sqft: 77, linearFt: 46 },
        flooring: { sqft: 180 },
        tile: { sqft: 30, linearFt: 15 },
        cabinets: { upperLF: 18, lowerLF: 24 },
        plumbing: { fixtures: 3, sinks: 1, dishwasher: 1, disposal: 1 }
      }
    },
    'bathroom-remodel': {
      scale: '1/4" = 1\'-0"',
      totalArea: 85,
      rooms: [
        {
          name: 'Master Bathroom',
          dimensions: "8' x 10'",
          sqft: 80,
          materials: {
            countertops: { sqft: 12, linearFt: 6 },
            tile: { sqft: 180, linearFt: 45 },
            cabinets: { lowerLF: 6 },
            plumbing: { sinks: 2, toilet: 1, shower: 1 }
          }
        }
      ],
      totals: {
        countertops: { sqft: 12, linearFt: 6 },
        flooring: { sqft: 0 },
        tile: { sqft: 180, linearFt: 45 },
        cabinets: { upperLF: 0, lowerLF: 6 },
        plumbing: { fixtures: 4, sinks: 2, toilets: 1, showers: 1 }
      }
    },
    'full-home': {
      scale: '1/8" = 1\'-0"',
      totalArea: 2200,
      rooms: [
        { name: 'Living Room', dimensions: "20' x 18'", sqft: 360, materials: { flooring: { sqft: 360 } } },
        { name: 'Kitchen', dimensions: "14' x 16'", sqft: 224, materials: {
          countertops: { sqft: 55, linearFt: 28 },
          flooring: { sqft: 224 },
          tile: { sqft: 35, linearFt: 18 },
          cabinets: { upperLF: 20, lowerLF: 28 },
          plumbing: { sinks: 1, dishwasher: 1 }
        }},
        { name: 'Master Bedroom', dimensions: "16' x 14'", sqft: 224, materials: { flooring: { sqft: 224 } } },
        { name: 'Bedroom 2', dimensions: "12' x 12'", sqft: 144, materials: { flooring: { sqft: 144 } } },
        { name: 'Bedroom 3', dimensions: "11' x 12'", sqft: 132, materials: { flooring: { sqft: 132 } } },
        { name: 'Master Bath', dimensions: "10' x 12'", sqft: 120, materials: {
          countertops: { sqft: 15, linearFt: 8 },
          tile: { sqft: 200, linearFt: 50 },
          cabinets: { lowerLF: 8 },
          plumbing: { sinks: 2, toilet: 1, shower: 1, tub: 1 }
        }},
        { name: 'Guest Bath', dimensions: "8' x 8'", sqft: 64, materials: {
          countertops: { sqft: 8, linearFt: 4 },
          tile: { sqft: 100, linearFt: 30 },
          cabinets: { lowerLF: 4 },
          plumbing: { sink: 1, toilet: 1, shower: 1 }
        }}
      ],
      totals: {
        countertops: { sqft: 78, linearFt: 40 },
        flooring: { sqft: 1084 },
        tile: { sqft: 335, linearFt: 98 },
        cabinets: { upperLF: 20, lowerLF: 40 },
        plumbing: { fixtures: 12 }
      }
    }
  };

  return demos[projectType] || demos['kitchen-remodel'];
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  analyzeBlueprint,
  analyzeWithGPT4Vision,
  analyzeWithOllama,
  parseBluebeamBAX,
  calculateCosts,
  generateDemoTakeoff,
  CONFIG
};
