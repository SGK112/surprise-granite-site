#!/usr/bin/env node
/**
 * Update tile.json with Bravo Tile image paths
 */

const fs = require('fs');
const path = require('path');

const TILE_JSON = path.join(__dirname, '../data/tile.json');

// Image mappings for Bravo Tile products
const imageMap = {
  // Porcelain - Wood Look
  'listone-noce': '/images/vendors/bravo-tile/noce-1-x1.jpg',
  'listone-iroko': '/images/vendors/bravo-tile/sequoia-nut.jpg',
  'amalfi-gris': '/images/vendors/bravo-tile/amalfi-gris.jpg',
  'rango-americano': '/images/vendors/bravo-tile/rango-americano.jpg',
  'avana-brown': '/images/vendors/bravo-tile/avana-brown.jpg',
  'bianca-sabbia': '/images/vendors/bravo-tile/bianca-sabbia.jpg',
  'montana-marrone': '/images/vendors/bravo-tile/montana-morrone-8-48.jpg',
  'sequoia-white': '/images/vendors/bravo-tile/sequoia-white.jpg',
  'sequoia-nut': '/images/vendors/bravo-tile/sequoia-nut.jpg',
  'sequoia-brown': '/images/vendors/bravo-tile/sequoia-brown.jpg',

  // Porcelain - Stone & Concrete Look
  'antique-white-polished': '/images/vendors/bravo-tile/antique-white.jpg',
  'antique-white-matte': '/images/vendors/bravo-tile/antique-white.jpg',
  'calacatta-extra-polished': '/images/vendors/bravo-tile/super-calacata-white.jpg',
  'calacatta-extra-matte': '/images/vendors/bravo-tile/super-calacata-white.jpg',
  'bellagio-polished': '/images/vendors/bravo-tile/bellagio.jpg',
  'lakestone-grey': '/images/vendors/bravo-tile/lakestone-grey.jpg',
  'lakestone-beige': '/images/vendors/bravo-tile/lakestone-beige.jpg',
  'lakestone-white': '/images/vendors/bravo-tile/lakestone-white.jpg',
  'medici-blue-polished': '/images/vendors/bravo-tile/medici-blue.jpg',
  'medici-gold-polished': '/images/vendors/bravo-tile/medici-gold.jpg',
  'medici-white-polished': '/images/vendors/bravo-tile/medici-white.jpg',
  'statuario-qua-polished': '/images/vendors/bravo-tile/statuario-qua.jpg',
  'pure-covelano-polished': '/images/vendors/bravo-tile/pure-covelano.jpg',
  'noir-laurent-lux': '/images/vendors/bravo-tile/noir-laurent.jpg',
  'verde-alpine-polished': '/images/vendors/bravo-tile/verde-alpine.jpg',

  // Travertine
  'autumn-leaves-12x12-tumbled': '/images/vendors/bravo-tile/antica-crema-18-x18.jpg',
  'autumn-leaves-18x18-tumbled': '/images/vendors/bravo-tile/antica-crema-18-x18.jpg',
  'autumn-leaves-versailles': '/images/vendors/bravo-tile/antica-crema-versailles-pattern.jpg',
  'autumn-leaves-paver-16x24': '/images/vendors/bravo-tile/antica-crema-18-x18.jpg',
  'autumn-leaves-pool-coping-12x24-3cm': '/images/vendors/bravo-tile/noce-pool-coping.jpg',
  'noce-12x12-tumbled': '/images/vendors/bravo-tile/noce-1-x1.jpg',
  'noce-18x18-tumbled': '/images/vendors/bravo-tile/noce-1-x1.jpg',
  'noce-versailles': '/images/vendors/bravo-tile/noce-versailles-pattern.jpg',
  'crema-classico-12x12-tumbled': '/images/vendors/bravo-tile/crema-classico-filled-honed.jpg',
  'crema-classico-versailles': '/images/vendors/bravo-tile/crema-classico-versailles-pattern.jpg',
  'ivory-platinum-12x12-honed': '/images/vendors/bravo-tile/ivory-platinum-filled-honed.jpg',
  'ivory-platinum-18x18-honed': '/images/vendors/bravo-tile/ivory-platinum-filled-honed.jpg',
  'silver-12x12-tumbled': '/images/vendors/bravo-tile/silver-tumbled-1-x2.jpg',
  'silver-versailles': '/images/vendors/bravo-tile/silver-versailles-pattern.jpg',
  'gold-12x12-tumbled': '/images/vendors/bravo-tile/gold-tumbled-1-x2.jpg',
  'walnut-versailles': '/images/vendors/bravo-tile/walnut-versailles-pattern.jpg',

  // Marble
  'white-carrara-12x12-polished': '/images/vendors/bravo-tile/white-carrera-18-x18.jpg',
  'white-carrara-18x18-polished': '/images/vendors/bravo-tile/white-carrera-18-x18.jpg',
  'white-carrara-12x24-polished': '/images/vendors/bravo-tile/white-carrera-12-x24.jpg',
  'crema-marfil-select-12x12': '/images/vendors/bravo-tile/crema-marfil-18-x18.jpg',
  'crema-marfil-select-18x18': '/images/vendors/bravo-tile/crema-marfil-18-x18.jpg',
  'calacatta-gold-12x12-polished': '/images/vendors/bravo-tile/calacata-gold-12-x24.jpg',
  'calacatta-gold-12x24-polished': '/images/vendors/bravo-tile/calacata-gold-12-x24.jpg',
  'thassos-12x12-polished': '/images/vendors/bravo-tile/thassos-1-x2.jpg',
  'emperador-dark-12x12-polished': '/images/vendors/bravo-tile/emperador-dark.jpg',
  'emperador-light-12x12-polished': '/images/vendors/bravo-tile/emperador-light.jpg',
  'diana-royal-12x12-polished': '/images/vendors/bravo-tile/diana-royal.jpg',
  'tundra-grey-12x12-polished': '/images/vendors/bravo-tile/tundra-grey.jpg',
  'statuary-12x12-polished': '/images/vendors/bravo-tile/statuary.jpg',
  'cappuccino-12x12-polished': '/images/vendors/bravo-tile/cappuccino-18-x18.jpg',

  // Limestone
  'desert-pearl-12x12-honed': '/images/vendors/bravo-tile/desert-pearl-18-x18.jpg',
  'desert-pearl-18x18-honed': '/images/vendors/bravo-tile/desert-pearl-18-x18.jpg',
  'haisa-light-12x24-honed': '/images/vendors/bravo-tile/haisa-light-2-x2.jpg',
  'lagos-blue-12x24-honed': '/images/vendors/bravo-tile/lagos-blue.jpg',
  'black-basalt-french-pattern': '/images/vendors/bravo-tile/basalt.jpg',

  // Mosaics
  'white-carrara-2x2-mosaic': '/images/vendors/bravo-tile/white-carrera-2-x2.jpg',
  'white-carrara-herringbone-mosaic': '/images/vendors/bravo-tile/white-carrera-mini-pattern.jpg',
  'white-carrara-hexagon-mosaic': '/images/vendors/bravo-tile/white-carrera-2-x2-hexagon.jpg',
  'white-carrara-basketweave-mosaic': '/images/vendors/bravo-tile/white-carrera-basket-weave.jpg',
  'white-carrara-penny-round-mosaic': '/images/vendors/bravo-tile/white-carrera-penny-round.jpg',
  'calacatta-gold-2x2-mosaic': '/images/vendors/bravo-tile/calacata-gold-2-x2.jpg',
  'thassos-white-hexagon-mosaic': '/images/vendors/bravo-tile/thassos-2-x2-hexagon.jpg',
  'crema-classico-2x2-mosaic': '/images/vendors/bravo-tile/crema-classico-2-x2.jpg',
  'noce-2x2-mosaic': '/images/vendors/bravo-tile/noce-2-x2.jpg',

  // Ledger Panels
  'alaska-grey-ledger-panel': '/images/vendors/bravo-tile/alaska-grey-6-x24-ledger-panel.jpg',
  'arctic-white-ledger-panel': '/images/vendors/bravo-tile/arctic-white.jpg',
  'autumn-leaves-ledger-panel': '/images/vendors/bravo-tile/california-blend-6-x24-ledger-panel.jpg',
  'coal-canyon-ledger-panel': '/images/vendors/bravo-tile/coal-canyon.jpg',
  'golden-honey-ledger-panel': '/images/vendors/bravo-tile/golden-honey.jpg',
  'sierra-blue-ledger-panel': '/images/vendors/bravo-tile/sierra-blue.jpg',

  // Pavers
  'quartz-bone-paver-24x24': '/images/vendors/bravo-tile/quartz-white.jpg',
  'quartz-grey-paver-24x24': '/images/vendors/bravo-tile/quartz-grey.jpg',
  'manhattan-beige-paver-24x24': '/images/vendors/bravo-tile/manhattan-beige.jpg',

  // Moldings
  'autumn-leaves-pencil-molding': '/images/vendors/bravo-tile/antica-crema-18-x18.jpg',
  'white-carrara-pencil-molding': '/images/vendors/bravo-tile/white-carrera-pencil-3-4-x-12.jpg',
  'white-carrara-chair-rail-molding': '/images/vendors/bravo-tile/white-carrera-chair-rail.jpg',
  'calacatta-gold-chair-rail-molding': '/images/vendors/bravo-tile/calacata-gold-chair-rail.jpg',
};

// Load tile.json
const tileData = JSON.parse(fs.readFileSync(TILE_JSON, 'utf8'));

// Update images for Bravo Tile products
let updatedCount = 0;
for (const tile of tileData.tile) {
  if (tile.brand === 'bravo-tile' && imageMap[tile.slug]) {
    tile.primaryImage = imageMap[tile.slug];
    updatedCount++;
  }
}

// Save updated file
fs.writeFileSync(TILE_JSON, JSON.stringify(tileData, null, 2));

console.log(`Updated ${updatedCount} Bravo Tile products with images`);
console.log(`Tile.json saved to: ${TILE_JSON}`);
