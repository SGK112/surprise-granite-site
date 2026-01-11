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
// GPT-4 VISION ANALYSIS
// ============================================

/**
 * Analyze blueprint image using GPT-4 Vision
 * @param {string} imageBase64 - Base64 encoded image or URL
 * @param {string} projectType - Type of project (kitchen, bathroom, etc.)
 * @param {string} apiKey - OpenAI API key
 * @returns {Promise<Object>} Takeoff analysis results
 */
async function analyzeWithGPT4Vision(imageBase64, projectType, apiKey) {
  const systemPrompt = `You are an expert construction estimator and quantity surveyor.
Analyze the provided blueprint/floor plan image and extract detailed takeoff information.

For each room or area you identify, provide:
1. Room name and dimensions (length x width in feet)
2. Square footage calculation
3. Materials needed by trade:
   - COUNTERTOPS: Linear feet and square feet (use 25.5" depth for standard)
   - FLOORING: Square footage by room
   - TILE: Square footage for floors and walls, linear feet for trim
   - CABINETS: Linear feet of upper and lower cabinets
   - PLUMBING: Count of fixtures (sinks, toilets, showers, etc.)

Look for:
- Scale indicators on the drawing
- Dimension callouts and annotations
- Room labels
- Fixture symbols (sinks, toilets, appliances)
- Cabinet layouts
- Counter/island shapes

Return your analysis in this exact JSON format:
{
  "scale": "1/4\" = 1'-0\"",
  "totalArea": 0,
  "rooms": [
    {
      "name": "Kitchen",
      "dimensions": "12' x 15'",
      "sqft": 180,
      "materials": {
        "countertops": { "sqft": 45, "linearFt": 22 },
        "flooring": { "sqft": 180 },
        "tile": { "sqft": 30, "linearFt": 15 },
        "cabinets": { "upperLF": 18, "lowerLF": 24 },
        "plumbing": { "sinks": 1, "dishwasher": 1 }
      }
    }
  ],
  "totals": {
    "countertops": { "sqft": 0, "linearFt": 0 },
    "flooring": { "sqft": 0 },
    "tile": { "sqft": 0, "linearFt": 0 },
    "cabinets": { "upperLF": 0, "lowerLF": 0 },
    "plumbing": { "fixtures": 0 }
  },
  "notes": ["Any observations about the drawing quality or missing information"]
}`;

  const userPrompt = `Analyze this ${projectType} blueprint and provide a detailed construction takeoff.
Extract all measurable quantities for countertops, flooring, tile, cabinets, and plumbing fixtures.
If dimensions are not clearly marked, estimate based on typical room sizes and the drawing scale.`;

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

    // Extract JSON from the response (might be wrapped in markdown)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // If no JSON found, return structured error
    return {
      error: 'Could not parse blueprint analysis',
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
    wasteFactor = 0.10
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
        takeoffData = await analyzeWithGPT4Vision(imageData, projectType, apiKey);
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
