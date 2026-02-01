#!/usr/bin/env node
/**
 * Add wholesale costs to tile.json based on pricing-config.js rules
 */

const fs = require('fs');
const path = require('path');

// Bravo Tile wholesale costs from pricing-config.js
const BRAVO_COSTS = {
  // Porcelain - Wood Look
  porcelain_wood: {
    'listone-noce': 2.99,
    'listone-iroko': 2.99,
    'amalfi-gris': 4.25,
    'rango-americano': 4.25,
    'avana-brown': 4.25,
    'bianca-sabbia': 4.25,
    'montana-marrone': 4.25,
    'sequoia-white': 4.25,
    'sequoia-nut': 4.25,
    'sequoia-brown': 4.25,
    '_default': 3.99
  },

  // Porcelain - Stone/Concrete Look (24x48)
  porcelain_large: {
    'antique-white-polished': 5.49,
    'antique-white-matte': 4.99,
    'attitude-white': 5.99,
    'attitude-grey': 5.99,
    'azuma-white': 5.25,
    'azuma-taupe': 5.25,
    'azuma-ivory': 5.25,
    'bruges': 4.99,
    'breccia-venezia': 2.89,
    'bellagio': 4.99,
    'calacatta-extra-polished': 5.25,
    'calacatta-extra-matte': 4.99,
    'calacatta-green': 5.25,
    'lakestone': 4.75,
    'marmo-marfil': 4.75,
    'marmo-white': 4.75,
    'medici': 4.99,
    'newbury': 4.99,
    'statuario-qua': 3.99,
    'super-calacatta': 4.99,
    '_default': 4.99
  },

  // Porcelain - 12x24
  porcelain_medium: {
    'living': 3.99,
    'lakestone-12x24': 3.25,
    'marmo-12x24': 2.99,
    'mood-ivory': 2.49,
    'pietra': 3.49,
    'pure': 3.99,
    'star': 2.99,
    'tessuto': 2.49,
    '_default': 3.49
  },

  // Travertine Collections
  travertine: {
    'autumn-leaves-tumbled': 4.99,
    'autumn-leaves-filled': 5.25,
    'autumn-leaves-versailles': 5.69,
    'noce-tumbled': 4.49,
    'noce-filled': 4.49,
    'noce-versailles': 4.99,
    'crema-classico-tumbled': 4.65,
    'crema-classico-filled': 4.65,
    'crema-classico-versailles': 4.99,
    'ivory-platinum': 4.99,
    'silver': 5.49,
    'gold': 5.25,
    'walnut': 4.99,
    '_default': 4.99
  },

  // Travertine Pavers (3cm)
  travertine_paver: {
    'autumn-leaves-paver': 7.25,
    'noce-paver': 6.75,
    'crema-classico-paver': 6.49,
    'silver-paver': 7.99,
    'walnut-paver': 6.99,
    '_default': 6.99
  },

  // Pool Coping
  pool_coping_3cm: { '_default': 10.49 },
  pool_coping_5cm: { '_default': 13.49 },

  // Marble
  marble: {
    'white-carrara': 8.49,
    'crema-marfil-select': 9.10,
    'crema-marfil-classic': 8.54,
    'botticino-beige': 7.10,
    'cappuccino': 6.39,
    'thassos': 17.99,
    'calacatta-gold': 17.99,
    'emperador-light': 7.99,
    'emperador-dark': 9.99,
    'statuary': 23.50,
    'diana-royal': 7.99,
    'nero-marquina': 7.74,
    '_default': 8.99
  },

  // Marble Mosaics (per piece)
  mosaic_marble: {
    'white-carrara-mosaic': 9.75,
    'calacatta-gold-mosaic': 16.00,
    'crema-marfil-mosaic': 9.95,
    'thassos-mosaic': 15.99,
    'emperador-mosaic': 10.25,
    '_default': 9.99
  },

  // Travertine Mosaics
  mosaic_travertine: { '_default': 7.00 },

  // Glass Mosaics
  mosaic_glass: { '_default': 12.49 },

  // Ledger Panels
  ledger: {
    'alaska-grey': 6.49,
    'arctic-white': 6.49,
    'autumn-leaves': 6.49,
    'crema-classico': 6.00,
    'noce': 6.00,
    'silver': 5.99,
    'golden-honey': 6.50,
    'sierra-blue': 7.25,
    '_default': 6.49
  }
};

// MSI Tile wholesale costs
const MSI_COSTS = {
  porcelain: { '_default': 4.99 },
  ceramic: { '_default': 3.99 },
  marble: { '_default': 7.99 },
  travertine: { '_default': 5.99 },
  mosaic: { '_default': 8.99 },
  encaustic: { '_default': 9.99 },
  subway: { '_default': 4.49 },
  '_default': 5.99
};

function getWholesaleCost(tile) {
  const vendor = (tile.vendor || '').toLowerCase();
  const title = (tile.title || '').toLowerCase();
  const handle = (tile.handle || '').toLowerCase();
  const tags = (tile.tags || []).join(' ').toLowerCase();
  const material = (tile.specs?.material || '').toLowerCase();
  const style = (tile.specs?.style || '').toLowerCase();

  // Bravo Tile
  if (vendor.includes('bravo')) {
    // Check for specific product matches first
    for (const category of Object.keys(BRAVO_COSTS)) {
      const costs = BRAVO_COSTS[category];
      for (const key of Object.keys(costs)) {
        if (key !== '_default' && (handle.includes(key) || title.includes(key.replace(/-/g, ' ')))) {
          return costs[key];
        }
      }
    }

    // Category-based matching
    if (tags.includes('travertine') || title.includes('travertine') || material.includes('travertine')) {
      if (tags.includes('paver') || title.includes('paver')) {
        return BRAVO_COSTS.travertine_paver._default;
      }
      if (tags.includes('coping') || title.includes('coping')) {
        return title.includes('5cm') ? 13.49 : 10.49;
      }
      return BRAVO_COSTS.travertine._default;
    }

    if (tags.includes('marble') || title.includes('marble') || material.includes('marble')) {
      if (tags.includes('mosaic') || title.includes('mosaic') || style.includes('mosaic')) {
        return BRAVO_COSTS.mosaic_marble._default;
      }
      return BRAVO_COSTS.marble._default;
    }

    if (tags.includes('mosaic') || title.includes('mosaic') || style.includes('mosaic')) {
      if (tags.includes('glass') || title.includes('glass')) {
        return BRAVO_COSTS.mosaic_glass._default;
      }
      return BRAVO_COSTS.mosaic_marble._default;
    }

    if (tags.includes('ledger') || title.includes('ledger')) {
      return BRAVO_COSTS.ledger._default;
    }

    if (tags.includes('wood') || title.includes('wood') || style.includes('wood')) {
      return BRAVO_COSTS.porcelain_wood._default;
    }

    // Default to porcelain medium
    return BRAVO_COSTS.porcelain_medium._default;
  }

  // MSI Tile
  if (vendor.includes('msi')) {
    if (tags.includes('marble') || material.includes('marble')) {
      return MSI_COSTS.marble._default;
    }
    if (tags.includes('mosaic') || style.includes('mosaic')) {
      return MSI_COSTS.mosaic._default;
    }
    if (tags.includes('encaustic') || style.includes('encaustic')) {
      return MSI_COSTS.encaustic._default;
    }
    if (tags.includes('subway') || style.includes('subway')) {
      return MSI_COSTS.subway._default;
    }
    if (tags.includes('travertine') || material.includes('travertine')) {
      return MSI_COSTS.travertine._default;
    }
    if (tags.includes('ceramic') || material.includes('ceramic')) {
      return MSI_COSTS.ceramic._default;
    }
    return MSI_COSTS._default;
  }

  // Generic fallback
  return 5.99;
}

// Main
const tilesPath = path.join(__dirname, '..', 'data', 'tile.json');
const tiles = JSON.parse(fs.readFileSync(tilesPath, 'utf8'));

let bravoCount = 0;
let msiCount = 0;

tiles.forEach(tile => {
  tile.wholesaleCost = getWholesaleCost(tile);

  if (tile.vendor === 'Bravo Tile') bravoCount++;
  if (tile.vendor === 'MSI') msiCount++;
});

fs.writeFileSync(tilesPath, JSON.stringify(tiles, null, 2));

console.log(`Updated ${tiles.length} tiles with wholesale costs`);
console.log(`  - Bravo Tile: ${bravoCount}`);
console.log(`  - MSI: ${msiCount}`);

// Show sample output
console.log('\nSample tiles with wholesale costs:');
tiles.slice(0, 3).forEach(t => {
  console.log(`  ${t.title} (${t.vendor}): $${t.wholesaleCost}`);
});
