/**
 * Arizona Tile 2024 Price List Import Script
 * Converts Arizona Tile pricing data to the tile.json format
 * Effective: January 1, 2024
 */

const fs = require('fs');
const path = require('path');

// Markup percentages for different customer tiers (based on existing flooring pricing)
const MARKUP = {
  guest: 1.55,       // 55% markup
  homeowner: 1.50,   // 50% markup
  pro: 1.35,         // 35% markup
  contractor: 1.25,  // 25% markup
  fabricator: 1.15   // 15% markup
};

// Helper to generate slug
function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// Helper to generate ID
function generateId(name) {
  return `arizona-tile-${generateSlug(name)}`;
}

// Calculate tiered pricing from wholesale cost
function calculateTieredPricing(wholesaleCost) {
  return {
    guest: parseFloat((wholesaleCost * MARKUP.guest).toFixed(2)),
    homeowner: parseFloat((wholesaleCost * MARKUP.homeowner).toFixed(2)),
    pro: parseFloat((wholesaleCost * MARKUP.pro).toFixed(2)),
    contractor: parseFloat((wholesaleCost * MARKUP.contractor).toFixed(2)),
    fabricator: parseFloat((wholesaleCost * MARKUP.fabricator).toFixed(2))
  };
}

// Arizona Tile Products Data extracted from 2024 Price List
const arizonaTileProducts = [
  // 3D Series Wall Tile (Ceramic White Body, Rectified)
  { name: "3D White Blade Matte 12x22", series: "3D Series", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 4.42, size: "12x22", finish: "Matte" },
  { name: "3D White Matte 12x22", series: "3D Series", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 4.31, size: "12x22", finish: "Matte" },
  { name: "3D White Ribbon Matte 12x22", series: "3D Series", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 4.42, size: "12x22", finish: "Matte" },
  { name: "3D White Twist Matte 12x22", series: "3D Series", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 4.42, size: "12x22", finish: "Matte" },
  { name: "3D White Wave Matte 12x22", series: "3D Series", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 4.42, size: "12x22", finish: "Matte" },

  // Aequa Series (Wood Look Porcelain)
  { name: "Aequa Castor 12x48", series: "Aequa", material: "Porcelain", type: "Wood Look", unit: "SF", price: 4.89, size: "12x48", pei: 4 },
  { name: "Aequa Castor 8x32", series: "Aequa", material: "Porcelain", type: "Wood Look", unit: "SF", price: 4.42, size: "8x32", pei: 4 },
  { name: "Aequa Cirrus 12x48", series: "Aequa", material: "Porcelain", type: "Wood Look", unit: "SF", price: 4.89, size: "12x48", pei: 4 },
  { name: "Aequa Cirrus 8x32", series: "Aequa", material: "Porcelain", type: "Wood Look", unit: "SF", price: 4.42, size: "8x32", pei: 4 },
  { name: "Aequa Nix 12x48", series: "Aequa", material: "Porcelain", type: "Wood Look", unit: "SF", price: 4.89, size: "12x48", pei: 4 },
  { name: "Aequa Nix 8x32", series: "Aequa", material: "Porcelain", type: "Wood Look", unit: "SF", price: 4.42, size: "8x32", pei: 4 },
  { name: "Aequa Silva 12x48", series: "Aequa", material: "Porcelain", type: "Wood Look", unit: "SF", price: 4.89, size: "12x48", pei: 4 },
  { name: "Aequa Silva 8x32", series: "Aequa", material: "Porcelain", type: "Wood Look", unit: "SF", price: 4.42, size: "8x32", pei: 4 },
  { name: "Aequa Tur 12x48", series: "Aequa", material: "Porcelain", type: "Wood Look", unit: "SF", price: 4.89, size: "12x48", pei: 4 },
  { name: "Aequa Tur 8x32", series: "Aequa", material: "Porcelain", type: "Wood Look", unit: "SF", price: 4.42, size: "8x32", pei: 4 },

  // Alpi Series (Wood Look Porcelain)
  { name: "Alpi Avana 6x36", series: "Alpi", material: "Porcelain", type: "Wood Look", unit: "SF", price: 3.10, size: "6x36" },
  { name: "Alpi Avana 8x48", series: "Alpi", material: "Porcelain", type: "Wood Look", unit: "SF", price: 3.32, size: "8x48" },
  { name: "Alpi Chiaro 6x36", series: "Alpi", material: "Porcelain", type: "Wood Look", unit: "SF", price: 3.10, size: "6x36" },
  { name: "Alpi Chiaro 8x48", series: "Alpi", material: "Porcelain", type: "Wood Look", unit: "SF", price: 3.32, size: "8x48" },
  { name: "Alpi Crema 6x36", series: "Alpi", material: "Porcelain", type: "Wood Look", unit: "SF", price: 3.10, size: "6x36" },
  { name: "Alpi Crema 8x48", series: "Alpi", material: "Porcelain", type: "Wood Look", unit: "SF", price: 3.32, size: "8x48" },
  { name: "Alpi Perla 6x36", series: "Alpi", material: "Porcelain", type: "Wood Look", unit: "SF", price: 3.10, size: "6x36" },
  { name: "Alpi Perla 8x48", series: "Alpi", material: "Porcelain", type: "Wood Look", unit: "SF", price: 3.32, size: "8x48" },
  { name: "Alpi Scuro 6x36", series: "Alpi", material: "Porcelain", type: "Wood Look", unit: "SF", price: 3.10, size: "6x36" },
  { name: "Alpi Scuro 8x48", series: "Alpi", material: "Porcelain", type: "Wood Look", unit: "SF", price: 3.32, size: "8x48" },

  // Anthea Series (Porcelain Through Body)
  { name: "Anthea Dark 12x24", series: "Anthea", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24" },
  { name: "Anthea Dark 24x48", series: "Anthea", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "24x48" },
  { name: "Anthea Earth 12x24", series: "Anthea", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24" },
  { name: "Anthea Earth 24x48", series: "Anthea", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "24x48" },
  { name: "Anthea Gray 12x24", series: "Anthea", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24" },
  { name: "Anthea Gray 24x48", series: "Anthea", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "24x48" },
  { name: "Anthea White 12x24", series: "Anthea", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24" },
  { name: "Anthea White 24x48", series: "Anthea", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "24x48" },

  // Ardesia Series (Porcelain Color Body)
  { name: "Ardesia Ash 12x24", series: "Ardesia", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.32, size: "12x24", pei: 4 },
  { name: "Ardesia Ash 24x48", series: "Ardesia", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.88, size: "24x48", pei: 4 },
  { name: "Ardesia Black 12x24", series: "Ardesia", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.32, size: "12x24", pei: 3 },
  { name: "Ardesia Black 24x48", series: "Ardesia", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.88, size: "24x48", pei: 3 },
  { name: "Ardesia Grey 12x24", series: "Ardesia", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.32, size: "12x24", pei: 4 },
  { name: "Ardesia Grey 24x48", series: "Ardesia", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.88, size: "24x48", pei: 4 },
  { name: "Ardesia Light 12x24", series: "Ardesia", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.32, size: "12x24" },
  { name: "Ardesia Light 24x48", series: "Ardesia", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.88, size: "24x48" },

  // Arte Series Wall Tile (Ceramic White Body)
  { name: "Arte Bone Glossy 4x16", series: "Arte", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 1.66, size: "4x16", finish: "Glossy" },
  { name: "Arte Cool Glossy 4x16", series: "Arte", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 1.66, size: "4x16", finish: "Glossy" },
  { name: "Arte Warm Glossy 4x16", series: "Arte", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 1.66, size: "4x16", finish: "Glossy" },
  { name: "Arte White Glossy 3x12", series: "Arte", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 1.66, size: "3x12", finish: "Glossy" },
  { name: "Arte White Glossy 3x6", series: "Arte", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 1.66, size: "3x6", finish: "Glossy" },
  { name: "Arte White Glossy 4x16", series: "Arte", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 1.66, size: "4x16", finish: "Glossy" },

  // Bio Attitude Series (Wood Look Glazed Porcelain)
  { name: "Bio Attitude Almond 8x48", series: "Bio Attitude", material: "Porcelain", type: "Wood Look", unit: "SF", price: 3.88, size: "8x48" },
  { name: "Bio Attitude Amber 8x48", series: "Bio Attitude", material: "Porcelain", type: "Wood Look", unit: "SF", price: 3.88, size: "8x48" },
  { name: "Bio Attitude Barrel 8x48", series: "Bio Attitude", material: "Porcelain", type: "Wood Look", unit: "SF", price: 3.88, size: "8x48" },
  { name: "Bio Attitude Cortex 8x48", series: "Bio Attitude", material: "Porcelain", type: "Wood Look", unit: "SF", price: 3.88, size: "8x48" },
  { name: "Bio Attitude Cotton 8x48", series: "Bio Attitude", material: "Porcelain", type: "Wood Look", unit: "SF", price: 3.88, size: "8x48" },

  // Borgo Series (Porcelain Color Body)
  { name: "Borgo Bronzo 12x24", series: "Borgo", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.32, size: "12x24", pei: 4 },
  { name: "Borgo Bronzo 24x48", series: "Borgo", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.88, size: "24x48", pei: 4 },
  { name: "Borgo Caldo 12x24", series: "Borgo", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.32, size: "12x24", pei: 4 },
  { name: "Borgo Caldo 24x48", series: "Borgo", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.88, size: "24x48", pei: 4 },
  { name: "Borgo Luce 12x24", series: "Borgo", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.32, size: "12x24", pei: 4 },
  { name: "Borgo Luce 24x48", series: "Borgo", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.88, size: "24x48", pei: 4 },
  { name: "Borgo Ombra 12x24", series: "Borgo", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.32, size: "12x24", pei: 4 },
  { name: "Borgo Ombra 24x48", series: "Borgo", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.88, size: "24x48", pei: 4 },

  // Brillo Series Wall Tile (Ceramic White Body)
  { name: "Brillo Blanco Glossy 12x24", series: "Brillo", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 2.56, size: "12x24", finish: "Glossy" },
  { name: "Brillo Perla Glossy 12x24", series: "Brillo", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 2.56, size: "12x24", finish: "Glossy" },

  // Cala Series (Glazed Porcelain)
  { name: "Cala Lenci Polished 12x24", series: "Cala", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.72, size: "12x24", finish: "Polished", pei: 4 },
  { name: "Cala Tresana Polished 12x24", series: "Cala", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.72, size: "12x24", finish: "Polished", pei: 4 },

  // Castle Brick Series (Porcelain)
  { name: "Castle Brick Brown 2.5x10", series: "Castle Brick", material: "Porcelain", type: "Brick Look", unit: "SF", price: 4.66, size: "2.5x10", pei: 4 },
  { name: "Castle Brick Grey 2.5x10", series: "Castle Brick", material: "Porcelain", type: "Brick Look", unit: "SF", price: 4.66, size: "2.5x10", pei: 4 },
  { name: "Castle Brick Multi 2.5x10", series: "Castle Brick", material: "Porcelain", type: "Brick Look", unit: "SF", price: 4.66, size: "2.5x10", pei: 4 },
  { name: "Castle Brick Red 2.5x10", series: "Castle Brick", material: "Porcelain", type: "Brick Look", unit: "SF", price: 4.66, size: "2.5x10", pei: 4 },
  { name: "Castle Brick White 2.5x10", series: "Castle Brick", material: "Porcelain", type: "Brick Look", unit: "SF", price: 4.66, size: "2.5x10", pei: 4 },

  // Cementine Series (Glazed Porcelain Pattern)
  { name: "Cementine B&W 1 8x8", series: "Cementine B&W", material: "Porcelain", type: "Pattern", unit: "EA", price: 4.66, size: "8x8", pei: 4 },
  { name: "Cementine B&W 2 8x8", series: "Cementine B&W", material: "Porcelain", type: "Pattern", unit: "EA", price: 4.66, size: "8x8", pei: 4 },
  { name: "Cementine B&W 3 8x8", series: "Cementine B&W", material: "Porcelain", type: "Pattern", unit: "EA", price: 4.66, size: "8x8", pei: 4 },
  { name: "Cementine B&W 4 8x8", series: "Cementine B&W", material: "Porcelain", type: "Pattern", unit: "EA", price: 4.66, size: "8x8", pei: 4 },
  { name: "Cementine B&W 5 8x8", series: "Cementine B&W", material: "Porcelain", type: "Pattern", unit: "EA", price: 4.66, size: "8x8", pei: 4 },
  { name: "Cementine Evo 1 8x8", series: "Cementine Evo", material: "Porcelain", type: "Pattern", unit: "EA", price: 4.66, size: "8x8", pei: 4 },
  { name: "Cementine Evo 2 8x8", series: "Cementine Evo", material: "Porcelain", type: "Pattern", unit: "EA", price: 4.66, size: "8x8", pei: 4 },
  { name: "Cementine Evo 3 8x8", series: "Cementine Evo", material: "Porcelain", type: "Pattern", unit: "EA", price: 4.66, size: "8x8", pei: 4 },
  { name: "Cementine Evo 4 8x8", series: "Cementine Evo", material: "Porcelain", type: "Pattern", unit: "EA", price: 4.66, size: "8x8", pei: 4 },
  { name: "Cementine Evo 5 8x8", series: "Cementine Evo", material: "Porcelain", type: "Pattern", unit: "EA", price: 4.66, size: "8x8", pei: 4 },
  { name: "Cementine Posa 1 8x8", series: "Cementine Posa", material: "Porcelain", type: "Pattern", unit: "EA", price: 4.66, size: "8x8", pei: 4 },
  { name: "Cementine Posa 2 8x8", series: "Cementine Posa", material: "Porcelain", type: "Pattern", unit: "EA", price: 4.66, size: "8x8", pei: 4 },
  { name: "Cementine Posa 3 8x8", series: "Cementine Posa", material: "Porcelain", type: "Pattern", unit: "EA", price: 4.66, size: "8x8", pei: 4 },
  { name: "Cementine Posa 4 8x8", series: "Cementine Posa", material: "Porcelain", type: "Pattern", unit: "EA", price: 4.66, size: "8x8", pei: 4 },
  { name: "Cementine Posa 5 8x8", series: "Cementine Posa", material: "Porcelain", type: "Pattern", unit: "EA", price: 4.66, size: "8x8", pei: 4 },
  { name: "Cementine Retro 1 8x8", series: "Cementine Retro", material: "Porcelain", type: "Pattern", unit: "EA", price: 4.66, size: "8x8", pei: 4 },
  { name: "Cementine Retro 2 8x8", series: "Cementine Retro", material: "Porcelain", type: "Pattern", unit: "EA", price: 4.66, size: "8x8", pei: 4 },
  { name: "Cementine Retro 3 8x8", series: "Cementine Retro", material: "Porcelain", type: "Pattern", unit: "EA", price: 4.66, size: "8x8", pei: 4 },

  // Cemento Cassero Series (Porcelain Color Body)
  { name: "Cemento Cassero Antracite 12x24", series: "Cemento Cassero", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.49, size: "12x24", pei: 4 },
  { name: "Cemento Cassero Beige 12x24", series: "Cemento Cassero", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.49, size: "12x24", pei: 4 },
  { name: "Cemento Cassero Bianco 12x24", series: "Cemento Cassero", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.49, size: "12x24", pei: 4 },
  { name: "Cemento Cassero Grigio 12x24", series: "Cemento Cassero", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.49, size: "12x24", pei: 4 },

  // Cemento Rasato Series (Porcelain Color Body)
  { name: "Cemento Rasato Antracite 12x24", series: "Cemento Rasato", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.49, size: "12x24", pei: 4 },
  { name: "Cemento Rasato Beige 12x24", series: "Cemento Rasato", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.49, size: "12x24", pei: 4 },
  { name: "Cemento Rasato Bianco 12x24", series: "Cemento Rasato", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.49, size: "12x24", pei: 4 },
  { name: "Cemento Rasato Grigio 12x24", series: "Cemento Rasato", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.49, size: "12x24", pei: 4 },

  // Citylife Series (Porcelain Color Body)
  { name: "Citylife Ash 12x24", series: "Citylife", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24", pei: 4 },
  { name: "Citylife Ash 24x48", series: "Citylife", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "24x48", pei: 4 },
  { name: "Citylife Ash 36x36", series: "Citylife", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.89, size: "36x36", pei: 4 },
  { name: "Citylife Beige 12x24", series: "Citylife", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24", pei: 4 },
  { name: "Citylife Beige 24x48", series: "Citylife", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "24x48", pei: 4 },
  { name: "Citylife Beige 36x36", series: "Citylife", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.89, size: "36x36", pei: 4 },
  { name: "Citylife Sand 12x24", series: "Citylife", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24", pei: 4 },
  { name: "Citylife Sand 24x48", series: "Citylife", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "24x48", pei: 4 },
  { name: "Citylife Sand 36x36", series: "Citylife", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.89, size: "36x36", pei: 4 },
  { name: "Citylife Tin 12x24", series: "Citylife", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24", pei: 4 },
  { name: "Citylife Tin 24x48", series: "Citylife", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "24x48", pei: 4 },
  { name: "Citylife Tin 36x36", series: "Citylife", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.89, size: "36x36", pei: 4 },

  // Concerto Series (Glazed Porcelain)
  { name: "Concerto Black Glossy 2.25x9.75", series: "Concerto", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "2.25x9.75", finish: "Glossy", pei: 4 },
  { name: "Concerto Clay Glossy 2.25x9.75", series: "Concerto", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "2.25x9.75", finish: "Glossy", pei: 4 },
  { name: "Concerto Cocoa Glossy 2.25x9.75", series: "Concerto", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "2.25x9.75", finish: "Glossy", pei: 4 },
  { name: "Concerto Greige Glossy 2.25x9.75", series: "Concerto", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "2.25x9.75", finish: "Glossy", pei: 4 },
  { name: "Concerto Pearl Glossy 2.25x9.75", series: "Concerto", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "2.25x9.75", finish: "Glossy", pei: 4 },
  { name: "Concerto Sand Glossy 2.25x9.75", series: "Concerto", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "2.25x9.75", finish: "Glossy", pei: 4 },
  { name: "Concerto White Glossy 2.25x9.75", series: "Concerto", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "2.25x9.75", finish: "Glossy", pei: 4 },
  { name: "Concerto Black Matte 2.25x9.75", series: "Concerto", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "2.25x9.75", finish: "Matte", pei: 4 },
  { name: "Concerto Clay Matte 2.25x9.75", series: "Concerto", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "2.25x9.75", finish: "Matte", pei: 4 },
  { name: "Concerto Cocoa Matte 2.25x9.75", series: "Concerto", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "2.25x9.75", finish: "Matte", pei: 4 },
  { name: "Concerto Greige Matte 2.25x9.75", series: "Concerto", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "2.25x9.75", finish: "Matte", pei: 4 },
  { name: "Concerto Pearl Matte 2.25x9.75", series: "Concerto", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "2.25x9.75", finish: "Matte", pei: 4 },
  { name: "Concerto Sand Matte 2.25x9.75", series: "Concerto", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "2.25x9.75", finish: "Matte", pei: 4 },
  { name: "Concerto White Matte 2.25x9.75", series: "Concerto", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "2.25x9.75", finish: "Matte", pei: 4 },

  // Cosmic Series (Glazed Porcelain)
  { name: "Cosmic Black 12x24", series: "Cosmic", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24", pei: 4 },
  { name: "Cosmic Black 24x48", series: "Cosmic", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 5.24, size: "24x48", pei: 4 },
  { name: "Cosmic Grey 12x24", series: "Cosmic", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24", pei: 4 },
  { name: "Cosmic Grey 24x48", series: "Cosmic", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 5.24, size: "24x48", pei: 4 },
  { name: "Cosmic Ivory 12x24", series: "Cosmic", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24", pei: 4 },
  { name: "Cosmic Ivory 24x48", series: "Cosmic", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 5.24, size: "24x48", pei: 4 },
  { name: "Cosmic White 12x24", series: "Cosmic", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24", pei: 4 },
  { name: "Cosmic White 24x48", series: "Cosmic", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 5.24, size: "24x48", pei: 4 },

  // Davenport Series (Glazed Porcelain)
  { name: "Davenport Ash 12x24", series: "Davenport", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 2.67, size: "12x24", pei: 4 },
  { name: "Davenport Ash 16x32", series: "Davenport", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.15, size: "16x32", pei: 4 },
  { name: "Davenport Earth 12x24", series: "Davenport", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 2.67, size: "12x24", pei: 4 },
  { name: "Davenport Earth 16x32", series: "Davenport", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.15, size: "16x32", pei: 4 },
  { name: "Davenport Ice 12x24", series: "Davenport", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 2.67, size: "12x24", pei: 4 },
  { name: "Davenport Ice 16x32", series: "Davenport", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.15, size: "16x32", pei: 4 },

  // Digitalart Series (Glazed Porcelain)
  { name: "Digitalart Bianco 12x24", series: "Digitalart", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "12x24", pei: 4 },
  { name: "Digitalart Denim 12x24", series: "Digitalart", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "12x24", pei: 4 },
  { name: "Digitalart Ecru 12x24", series: "Digitalart", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "12x24", pei: 4 },
  { name: "Digitalart Grey 12x24", series: "Digitalart", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "12x24", pei: 4 },
  { name: "Digitalart Night 12x24", series: "Digitalart", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "12x24", pei: 4 },

  // Dunes Glass Series Wall Tile
  { name: "Dunes Denim 3x12 Flat", series: "Dunes Glass", material: "Glass", type: "Wall Tile", unit: "SF", price: 9.92, size: "3x12", finish: "Flat" },
  { name: "Dunes Denim 3x12 Wave", series: "Dunes Glass", material: "Glass", type: "Wall Tile", unit: "SF", price: 10.44, size: "3x12", finish: "Wave" },
  { name: "Dunes Ivory 3x12 Flat", series: "Dunes Glass", material: "Glass", type: "Wall Tile", unit: "SF", price: 9.92, size: "3x12", finish: "Flat" },
  { name: "Dunes Ivory 3x12 Wave", series: "Dunes Glass", material: "Glass", type: "Wall Tile", unit: "SF", price: 10.44, size: "3x12", finish: "Wave" },
  { name: "Dunes Pearl 3x12 Flat", series: "Dunes Glass", material: "Glass", type: "Wall Tile", unit: "SF", price: 9.92, size: "3x12", finish: "Flat" },
  { name: "Dunes Pearl 3x12 Wave", series: "Dunes Glass", material: "Glass", type: "Wall Tile", unit: "SF", price: 10.44, size: "3x12", finish: "Wave" },
  { name: "Dunes Pewter 3x12 Flat", series: "Dunes Glass", material: "Glass", type: "Wall Tile", unit: "SF", price: 9.92, size: "3x12", finish: "Flat" },
  { name: "Dunes Pewter 3x12 Wave", series: "Dunes Glass", material: "Glass", type: "Wall Tile", unit: "SF", price: 10.44, size: "3x12", finish: "Wave" },
  { name: "Dunes Platinum 3x12 Flat", series: "Dunes Glass", material: "Glass", type: "Wall Tile", unit: "SF", price: 9.92, size: "3x12", finish: "Flat" },
  { name: "Dunes Platinum 3x12 Wave", series: "Dunes Glass", material: "Glass", type: "Wall Tile", unit: "SF", price: 10.44, size: "3x12", finish: "Wave" },
  { name: "Dunes Sand 3x12 Flat", series: "Dunes Glass", material: "Glass", type: "Wall Tile", unit: "SF", price: 9.92, size: "3x12", finish: "Flat" },
  { name: "Dunes Sand 3x12 Wave", series: "Dunes Glass", material: "Glass", type: "Wall Tile", unit: "SF", price: 10.44, size: "3x12", finish: "Wave" },

  // Essence Series (Wood Look Porcelain)
  { name: "Essence Brown 8x48", series: "Essence", material: "Porcelain", type: "Wood Look", unit: "SF", price: 4.66, size: "8x48", pei: 4 },
  { name: "Essence Cream 8x48", series: "Essence", material: "Porcelain", type: "Wood Look", unit: "SF", price: 4.66, size: "8x48", pei: 4 },
  { name: "Essence Grey 8x48", series: "Essence", material: "Porcelain", type: "Wood Look", unit: "SF", price: 4.66, size: "8x48", pei: 4 },
  { name: "Essence Mahogany 8x48", series: "Essence", material: "Porcelain", type: "Wood Look", unit: "SF", price: 4.66, size: "8x48", pei: 4 },

  // Faro Series (Glazed Porcelain)
  { name: "Faro Beige 12x24", series: "Faro", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.49, size: "12x24", pei: 4 },
  { name: "Faro Beige 24x48", series: "Faro", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "24x48", pei: 4 },
  { name: "Faro Bianco 12x24", series: "Faro", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.49, size: "12x24", pei: 4 },
  { name: "Faro Bianco 24x48", series: "Faro", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "24x48", pei: 4 },
  { name: "Faro Silver 12x24", series: "Faro", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.49, size: "12x24", pei: 4 },
  { name: "Faro Silver 24x48", series: "Faro", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "24x48", pei: 4 },
  { name: "Faro Taupe Grey 12x24", series: "Faro", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.49, size: "12x24", pei: 4 },
  { name: "Faro Taupe Grey 24x48", series: "Faro", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "24x48", pei: 4 },

  // Fragment Series (Porcelain Color Body)
  { name: "Fragment Black 12x24", series: "Fragment", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.32, size: "12x24", pei: 4 },
  { name: "Fragment Gray 12x24", series: "Fragment", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.32, size: "12x24", pei: 4 },
  { name: "Fragment Ivory 12x24", series: "Fragment", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.32, size: "12x24", pei: 4 },
  { name: "Fragment Sand 12x24", series: "Fragment", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.32, size: "12x24", pei: 4 },
  { name: "Fragment White 12x24", series: "Fragment", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.32, size: "12x24", pei: 4 },

  // Futura Series (Porcelain Color Body)
  { name: "Futura Beige 12x24", series: "Futura", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.32, size: "12x24", pei: 4 },
  { name: "Futura Beige 24x48", series: "Futura", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.88, size: "24x48", pei: 4 },
  { name: "Futura Greige 12x24", series: "Futura", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.32, size: "12x24", pei: 4 },
  { name: "Futura Greige 24x48", series: "Futura", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.88, size: "24x48", pei: 4 },
  { name: "Futura Ivory 12x24", series: "Futura", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.32, size: "12x24", pei: 4 },
  { name: "Futura Ivory 24x48", series: "Futura", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.88, size: "24x48", pei: 4 },
  { name: "Futura Silver 12x24", series: "Futura", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.32, size: "12x24", pei: 4 },
  { name: "Futura Silver 24x48", series: "Futura", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.88, size: "24x48", pei: 4 },

  // Gioia Series Wall Tile (Low Fired Porcelain)
  { name: "Gioia Aqua 4x16", series: "Gioia", material: "Porcelain", type: "Wall Tile", unit: "SF", price: 4.42, size: "4x16" },
  { name: "Gioia Ash 4x16", series: "Gioia", material: "Porcelain", type: "Wall Tile", unit: "SF", price: 4.42, size: "4x16" },
  { name: "Gioia Avocado 4x16", series: "Gioia", material: "Porcelain", type: "Wall Tile", unit: "SF", price: 4.42, size: "4x16" },
  { name: "Gioia Azure 4x16", series: "Gioia", material: "Porcelain", type: "Wall Tile", unit: "SF", price: 4.42, size: "4x16" },
  { name: "Gioia Bone 4x16", series: "Gioia", material: "Porcelain", type: "Wall Tile", unit: "SF", price: 4.42, size: "4x16" },
  { name: "Gioia Greige 4x16", series: "Gioia", material: "Porcelain", type: "Wall Tile", unit: "SF", price: 4.42, size: "4x16" },
  { name: "Gioia Lava 4x16", series: "Gioia", material: "Porcelain", type: "Wall Tile", unit: "SF", price: 4.42, size: "4x16" },
  { name: "Gioia Lime 4x16", series: "Gioia", material: "Porcelain", type: "Wall Tile", unit: "SF", price: 4.42, size: "4x16" },
  { name: "Gioia Mango 4x16", series: "Gioia", material: "Porcelain", type: "Wall Tile", unit: "SF", price: 4.42, size: "4x16" },
  { name: "Gioia Milk 4x16", series: "Gioia", material: "Porcelain", type: "Wall Tile", unit: "SF", price: 4.42, size: "4x16" },
  { name: "Gioia Navy 4x16", series: "Gioia", material: "Porcelain", type: "Wall Tile", unit: "SF", price: 4.42, size: "4x16" },
  { name: "Gioia Papaya 4x16", series: "Gioia", material: "Porcelain", type: "Wall Tile", unit: "SF", price: 4.42, size: "4x16" },
  { name: "Gioia Rosso 4x16", series: "Gioia", material: "Porcelain", type: "Wall Tile", unit: "SF", price: 4.42, size: "4x16" },
  { name: "Gioia Sky 4x16", series: "Gioia", material: "Porcelain", type: "Wall Tile", unit: "SF", price: 4.42, size: "4x16" },
  { name: "Gioia Steel 4x16", series: "Gioia", material: "Porcelain", type: "Wall Tile", unit: "SF", price: 4.42, size: "4x16" },
  { name: "Gioia Turquoise 4x16", series: "Gioia", material: "Porcelain", type: "Wall Tile", unit: "SF", price: 4.42, size: "4x16" },

  // Icon Series (Porcelain Color Body)
  { name: "Icon Black Matte 12x24", series: "Icon", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.49, size: "12x24", finish: "Matte", pei: 4 },
  { name: "Icon Silver Matte 12x24", series: "Icon", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.49, size: "12x24", finish: "Matte", pei: 4 },
  { name: "Icon Smoke Matte 12x24", series: "Icon", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.49, size: "12x24", finish: "Matte", pei: 4 },
  { name: "Icon Black Matte 24x48", series: "Icon", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.31, size: "24x48", finish: "Matte", pei: 4 },
  { name: "Icon Silver Matte 24x48", series: "Icon", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.31, size: "24x48", finish: "Matte", pei: 4 },
  { name: "Icon Smoke Matte 24x48", series: "Icon", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.31, size: "24x48", finish: "Matte", pei: 4 },

  // Konkrete Series (Porcelain Color Body)
  { name: "Konkrete Beige Matte 12x24", series: "Konkrete", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24", finish: "Matte", pei: 4 },
  { name: "Konkrete Beige Matte 24x48", series: "Konkrete", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "24x48", finish: "Matte", pei: 4 },
  { name: "Konkrete Bianco Matte 12x24", series: "Konkrete", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24", finish: "Matte", pei: 4 },
  { name: "Konkrete Bianco Matte 24x48", series: "Konkrete", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "24x48", finish: "Matte", pei: 4 },
  { name: "Konkrete Cenere Matte 12x24", series: "Konkrete", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24", finish: "Matte", pei: 4 },
  { name: "Konkrete Cenere Matte 24x48", series: "Konkrete", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "24x48", finish: "Matte", pei: 4 },
  { name: "Konkrete Grigio Matte 12x24", series: "Konkrete", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24", finish: "Matte", pei: 4 },
  { name: "Konkrete Grigio Matte 24x48", series: "Konkrete", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "24x48", finish: "Matte", pei: 4 },

  // Lagos Series (Porcelain Color Body)
  { name: "Lagos Concrete 12x24", series: "Lagos", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24", pei: 4 },
  { name: "Lagos Concrete 24x48", series: "Lagos", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 5.24, size: "24x48", pei: 4 },
  { name: "Lagos Ivory 12x24", series: "Lagos", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24", pei: 4 },
  { name: "Lagos Ivory 24x48", series: "Lagos", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 5.24, size: "24x48", pei: 4 },
  { name: "Lagos Light Grey 12x24", series: "Lagos", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24", pei: 4 },
  { name: "Lagos Light Grey 24x48", series: "Lagos", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 5.24, size: "24x48", pei: 4 },
  { name: "Lagos Mud 12x24", series: "Lagos", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24", pei: 4 },
  { name: "Lagos Mud 24x48", series: "Lagos", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 5.24, size: "24x48", pei: 4 },
  { name: "Lagos Sand 12x24", series: "Lagos", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24", pei: 4 },
  { name: "Lagos Sand 24x48", series: "Lagos", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 5.24, size: "24x48", pei: 4 },

  // Legno Series (Wood Look Porcelain)
  { name: "Legno Beige 8x40", series: "Legno", material: "Porcelain", type: "Wood Look", unit: "SF", price: 4.66, size: "8x40", pei: 4 },
  { name: "Legno Grey 8x40", series: "Legno", material: "Porcelain", type: "Wood Look", unit: "SF", price: 4.66, size: "8x40", pei: 4 },
  { name: "Legno Ivory 8x40", series: "Legno", material: "Porcelain", type: "Wood Look", unit: "SF", price: 4.66, size: "8x40", pei: 4 },
  { name: "Legno Walnut 8x40", series: "Legno", material: "Porcelain", type: "Wood Look", unit: "SF", price: 4.66, size: "8x40", pei: 4 },

  // Marvel Series (Porcelain Color Body - Marble Look)
  { name: "Marvel Black Atlantis 12x24", series: "Marvel", material: "Porcelain", type: "Marble Look", unit: "SF", price: 3.54, size: "12x24" },
  { name: "Marvel Black Atlantis 24x24", series: "Marvel", material: "Porcelain", type: "Marble Look", unit: "SF", price: 3.88, size: "24x24" },
  { name: "Marvel Black Atlantis 24x48", series: "Marvel", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.43, size: "24x48" },
  { name: "Marvel Black Atlantis Polished 12x24", series: "Marvel", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.43, size: "12x24", finish: "Polished" },
  { name: "Marvel Black Atlantis Polished 24x24", series: "Marvel", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.66, size: "24x24", finish: "Polished" },
  { name: "Marvel Black Atlantis Polished 24x48", series: "Marvel", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.99, size: "24x48", finish: "Polished" },
  { name: "Marvel Calacatta Apuano 12x24", series: "Marvel", material: "Porcelain", type: "Marble Look", unit: "SF", price: 3.54, size: "12x24" },
  { name: "Marvel Calacatta Apuano 24x24", series: "Marvel", material: "Porcelain", type: "Marble Look", unit: "SF", price: 3.88, size: "24x24" },
  { name: "Marvel Calacatta Apuano 24x48", series: "Marvel", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.43, size: "24x48" },
  { name: "Marvel Calacatta Extra 12x24", series: "Marvel", material: "Porcelain", type: "Marble Look", unit: "SF", price: 3.54, size: "12x24" },
  { name: "Marvel Calacatta Extra 24x24", series: "Marvel", material: "Porcelain", type: "Marble Look", unit: "SF", price: 3.88, size: "24x24" },
  { name: "Marvel Calacatta Extra 24x48", series: "Marvel", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.43, size: "24x48" },
  { name: "Marvel Calacatta Prestigio 12x24", series: "Marvel", material: "Porcelain", type: "Marble Look", unit: "SF", price: 3.54, size: "12x24" },
  { name: "Marvel Calacatta Prestigio 24x24", series: "Marvel", material: "Porcelain", type: "Marble Look", unit: "SF", price: 3.88, size: "24x24" },
  { name: "Marvel Calacatta Prestigio 24x48", series: "Marvel", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.43, size: "24x48" },
  { name: "Marvel Fior di Bosco 12x24", series: "Marvel", material: "Porcelain", type: "Marble Look", unit: "SF", price: 3.54, size: "12x24" },
  { name: "Marvel Fior di Bosco 24x24", series: "Marvel", material: "Porcelain", type: "Marble Look", unit: "SF", price: 3.88, size: "24x24" },
  { name: "Marvel Fior di Bosco 24x48", series: "Marvel", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.43, size: "24x48" },
  { name: "Marvel Statuario Supremo 12x24", series: "Marvel", material: "Porcelain", type: "Marble Look", unit: "SF", price: 3.54, size: "12x24" },
  { name: "Marvel Statuario Supremo 24x24", series: "Marvel", material: "Porcelain", type: "Marble Look", unit: "SF", price: 3.88, size: "24x24" },
  { name: "Marvel Statuario Supremo 24x48", series: "Marvel", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.43, size: "24x48" },

  // More Wood Series (Wood Look Porcelain)
  { name: "More Wood Ciliegio 8x32", series: "More Wood", material: "Porcelain", type: "Wood Look", unit: "SF", price: 4.42, size: "8x32", pei: 4 },
  { name: "More Wood Ciliegio 8x48", series: "More Wood", material: "Porcelain", type: "Wood Look", unit: "SF", price: 4.89, size: "8x48", pei: 4 },
  { name: "More Wood Grigio 8x32", series: "More Wood", material: "Porcelain", type: "Wood Look", unit: "SF", price: 4.42, size: "8x32", pei: 4 },
  { name: "More Wood Grigio 8x48", series: "More Wood", material: "Porcelain", type: "Wood Look", unit: "SF", price: 4.89, size: "8x48", pei: 4 },
  { name: "More Wood Miele 8x32", series: "More Wood", material: "Porcelain", type: "Wood Look", unit: "SF", price: 4.42, size: "8x32", pei: 4 },
  { name: "More Wood Miele 8x48", series: "More Wood", material: "Porcelain", type: "Wood Look", unit: "SF", price: 4.89, size: "8x48", pei: 4 },
  { name: "More Wood Noce 8x32", series: "More Wood", material: "Porcelain", type: "Wood Look", unit: "SF", price: 4.42, size: "8x32", pei: 4 },
  { name: "More Wood Noce 8x48", series: "More Wood", material: "Porcelain", type: "Wood Look", unit: "SF", price: 4.89, size: "8x48", pei: 4 },

  // Paloma Series Wall Tile (Ceramic White Body)
  { name: "Paloma Alabaster Glossy 3x6", series: "Paloma", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 3.49, size: "3x6", finish: "Glossy" },
  { name: "Paloma Alabaster Glossy 4x16", series: "Paloma", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 3.49, size: "4x16", finish: "Glossy" },
  { name: "Paloma Alabaster Matte 3x6", series: "Paloma", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 3.49, size: "3x6", finish: "Matte" },
  { name: "Paloma Alabaster Matte 4x16", series: "Paloma", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 3.49, size: "4x16", finish: "Matte" },
  { name: "Paloma Cotton Glossy 3x6", series: "Paloma", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 3.49, size: "3x6", finish: "Glossy" },
  { name: "Paloma Cotton Glossy 4x16", series: "Paloma", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 3.49, size: "4x16", finish: "Glossy" },
  { name: "Paloma Cotton Matte 3x6", series: "Paloma", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 3.49, size: "3x6", finish: "Matte" },
  { name: "Paloma Cotton Matte 4x16", series: "Paloma", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 3.49, size: "4x16", finish: "Matte" },
  { name: "Paloma Camel Glossy 3x6", series: "Paloma", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 3.49, size: "3x6", finish: "Glossy" },
  { name: "Paloma Camel Glossy 4x16", series: "Paloma", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 3.49, size: "4x16", finish: "Glossy" },
  { name: "Paloma Cloud Glossy 3x6", series: "Paloma", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 3.49, size: "3x6", finish: "Glossy" },
  { name: "Paloma Cloud Glossy 4x16", series: "Paloma", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 3.49, size: "4x16", finish: "Glossy" },
  { name: "Paloma Denim Glossy 3x6", series: "Paloma", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 3.49, size: "3x6", finish: "Glossy" },
  { name: "Paloma Denim Glossy 4x16", series: "Paloma", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 3.49, size: "4x16", finish: "Glossy" },
  { name: "Paloma Pumice Glossy 3x6", series: "Paloma", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 3.49, size: "3x6", finish: "Glossy" },
  { name: "Paloma Pumice Glossy 4x16", series: "Paloma", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 3.49, size: "4x16", finish: "Glossy" },
  { name: "Paloma Steel Glossy 3x6", series: "Paloma", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 3.49, size: "3x6", finish: "Glossy" },
  { name: "Paloma Steel Glossy 4x16", series: "Paloma", material: "Ceramic", type: "Wall Tile", unit: "SF", price: 3.49, size: "4x16", finish: "Glossy" },

  // Pave Series (Porcelain Color Body)
  { name: "Pave Ash 12x24", series: "Pave", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 2.91, size: "12x24", pei: 4 },
  { name: "Pave Grigio 12x24", series: "Pave", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 2.91, size: "12x24", pei: 4 },
  { name: "Pave Ivory 12x24", series: "Pave", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 2.91, size: "12x24", pei: 4 },
  { name: "Pave Moka 12x24", series: "Pave", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 2.91, size: "12x24", pei: 4 },
  { name: "Pave Nero 12x24", series: "Pave", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 2.91, size: "12x24", pei: 4 },

  // Pietra Italia Series (Porcelain Through Body)
  { name: "Pietra Italia Beige 12x24", series: "Pietra Italia", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.31, size: "12x24", pei: 4 },
  { name: "Pietra Italia Beige 24x24", series: "Pietra Italia", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "24x24", pei: 4 },
  { name: "Pietra Italia Beige 24x48", series: "Pietra Italia", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 5.24, size: "24x48", pei: 4 },
  { name: "Pietra Italia Black 12x24", series: "Pietra Italia", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.31, size: "12x24", pei: 4 },
  { name: "Pietra Italia Black 24x24", series: "Pietra Italia", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "24x24", pei: 4 },
  { name: "Pietra Italia Black 24x48", series: "Pietra Italia", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 5.24, size: "24x48", pei: 4 },
  { name: "Pietra Italia Grey 12x24", series: "Pietra Italia", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.31, size: "12x24", pei: 4 },
  { name: "Pietra Italia Grey 24x24", series: "Pietra Italia", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "24x24", pei: 4 },
  { name: "Pietra Italia Grey 24x48", series: "Pietra Italia", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 5.24, size: "24x48", pei: 4 },
  { name: "Pietra Italia White 12x24", series: "Pietra Italia", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.31, size: "12x24", pei: 4 },
  { name: "Pietra Italia White 24x24", series: "Pietra Italia", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "24x24", pei: 4 },
  { name: "Pietra Italia White 24x48", series: "Pietra Italia", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 5.24, size: "24x48", pei: 4 },

  // Reflexion Series (Porcelain Color Body)
  { name: "Reflexion Bright 12x24", series: "Reflexion", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.32, size: "12x24", pei: 4 },
  { name: "Reflexion Bright 24x48", series: "Reflexion", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.43, size: "24x48", pei: 4 },
  { name: "Reflexion Mercury 12x24", series: "Reflexion", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.32, size: "12x24", pei: 4 },
  { name: "Reflexion Mercury 24x48", series: "Reflexion", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.43, size: "24x48", pei: 4 },
  { name: "Reflexion Night 12x24", series: "Reflexion", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.32, size: "12x24", pei: 4 },
  { name: "Reflexion Night 24x48", series: "Reflexion", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.43, size: "24x48", pei: 4 },
  { name: "Reflexion Titanium 12x24", series: "Reflexion", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.32, size: "12x24", pei: 4 },
  { name: "Reflexion Titanium 24x48", series: "Reflexion", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.43, size: "24x48", pei: 4 },

  // Reside USA Series (Porcelain Color Body)
  { name: "Reside Ash USA 12x24", series: "Reside USA", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.54, size: "12x24", pei: 4 },
  { name: "Reside Ash USA 24x24", series: "Reside USA", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.88, size: "24x24", pei: 4 },
  { name: "Reside Ash USA 24x48", series: "Reside USA", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.43, size: "24x48", pei: 4 },
  { name: "Reside Beige USA 12x24", series: "Reside USA", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.54, size: "12x24", pei: 4 },
  { name: "Reside Beige USA 24x24", series: "Reside USA", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.88, size: "24x24", pei: 4 },
  { name: "Reside Beige USA 24x48", series: "Reside USA", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.43, size: "24x48", pei: 4 },
  { name: "Reside Black USA 12x24", series: "Reside USA", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.54, size: "12x24", pei: 4 },
  { name: "Reside Black USA 24x24", series: "Reside USA", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.88, size: "24x24", pei: 4 },
  { name: "Reside Black USA 24x48", series: "Reside USA", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.43, size: "24x48", pei: 4 },
  { name: "Reside Brown USA 12x24", series: "Reside USA", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.54, size: "12x24", pei: 4 },
  { name: "Reside Brown USA 24x24", series: "Reside USA", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.88, size: "24x24", pei: 4 },
  { name: "Reside Brown USA 24x48", series: "Reside USA", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.43, size: "24x48", pei: 4 },

  // Reverie Series (Glazed Porcelain Pattern)
  { name: "Reverie Decor 1 8x8", series: "Reverie", material: "Porcelain", type: "Pattern", unit: "SF", price: 5.24, size: "8x8", pei: 4 },
  { name: "Reverie Decor 2 8x8", series: "Reverie", material: "Porcelain", type: "Pattern", unit: "SF", price: 5.24, size: "8x8", pei: 4 },
  { name: "Reverie Decor 3 8x8", series: "Reverie", material: "Porcelain", type: "Pattern", unit: "SF", price: 5.24, size: "8x8", pei: 4 },
  { name: "Reverie Blanc 8x8", series: "Reverie", material: "Porcelain", type: "Pattern", unit: "SF", price: 5.24, size: "8x8", pei: 4 },
  { name: "Reverie Bleu 8x8", series: "Reverie", material: "Porcelain", type: "Pattern", unit: "SF", price: 5.24, size: "8x8", pei: 4 },
  { name: "Reverie Gris 8x8", series: "Reverie", material: "Porcelain", type: "Pattern", unit: "SF", price: 5.24, size: "8x8", pei: 4 },
  { name: "Reverie Noir 8x8", series: "Reverie", material: "Porcelain", type: "Pattern", unit: "SF", price: 5.24, size: "8x8", pei: 4 },

  // Sav Wood Series (Wood Look Glazed Porcelain)
  { name: "Sav Wood Bianco 8x32", series: "Sav Wood", material: "Porcelain", type: "Wood Look", unit: "SF", price: 3.49, size: "8x32", pei: 4 },
  { name: "Sav Wood Grigio 8x32", series: "Sav Wood", material: "Porcelain", type: "Wood Look", unit: "SF", price: 3.49, size: "8x32", pei: 4 },
  { name: "Sav Wood Iroko 8x32", series: "Sav Wood", material: "Porcelain", type: "Wood Look", unit: "SF", price: 3.49, size: "8x32", pei: 4 },
  { name: "Sav Wood Miele 8x32", series: "Sav Wood", material: "Porcelain", type: "Wood Look", unit: "SF", price: 3.49, size: "8x32", pei: 4 },
  { name: "Sav Wood Tortora 8x32", series: "Sav Wood", material: "Porcelain", type: "Wood Look", unit: "SF", price: 3.49, size: "8x32", pei: 4 },

  // Savannah Series (Wood Look Porcelain)
  { name: "Savannah Coffee 8x40", series: "Savannah", material: "Porcelain", type: "Wood Look", unit: "SF", price: 5.36, size: "8x40", pei: 4 },
  { name: "Savannah Cream 8x40", series: "Savannah", material: "Porcelain", type: "Wood Look", unit: "SF", price: 5.36, size: "8x40", pei: 4 },
  { name: "Savannah Dust 8x40", series: "Savannah", material: "Porcelain", type: "Wood Look", unit: "SF", price: 5.36, size: "8x40", pei: 4 },
  { name: "Savannah Honey 8x40", series: "Savannah", material: "Porcelain", type: "Wood Look", unit: "SF", price: 5.36, size: "8x40", pei: 4 },
  { name: "Savannah Milk 8x40", series: "Savannah", material: "Porcelain", type: "Wood Look", unit: "SF", price: 5.36, size: "8x40", pei: 4 },
  { name: "Savannah Sepia 8x40", series: "Savannah", material: "Porcelain", type: "Wood Look", unit: "SF", price: 5.36, size: "8x40", pei: 4 },

  // Shibusa Series (Porcelain Color Body)
  { name: "Shibusa Bianco 12x24", series: "Shibusa", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24", pei: 4 },
  { name: "Shibusa Bianco 24x48", series: "Shibusa", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "24x48", pei: 4 },
  { name: "Shibusa Crema 12x24", series: "Shibusa", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24", pei: 4 },
  { name: "Shibusa Crema 24x48", series: "Shibusa", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "24x48", pei: 4 },
  { name: "Shibusa Grigio 12x24", series: "Shibusa", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24", pei: 4 },
  { name: "Shibusa Grigio 24x48", series: "Shibusa", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "24x48", pei: 4 },
  { name: "Shibusa Tortora 12x24", series: "Shibusa", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24", pei: 4 },
  { name: "Shibusa Tortora 24x48", series: "Shibusa", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "24x48", pei: 4 },
  { name: "Shibusa Wenge 12x24", series: "Shibusa", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24", pei: 4 },
  { name: "Shibusa Wenge 24x48", series: "Shibusa", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "24x48", pei: 4 },

  // Terrazzo Series (Porcelain Color Body)
  { name: "Terrazzo Black 24x24", series: "Terrazzo", material: "Porcelain", type: "Terrazzo Look", unit: "SF", price: 4.66, size: "24x24", pei: 4 },
  { name: "Terrazzo Cream 24x24", series: "Terrazzo", material: "Porcelain", type: "Terrazzo Look", unit: "SF", price: 4.66, size: "24x24", pei: 4 },
  { name: "Terrazzo Grey 24x24", series: "Terrazzo", material: "Porcelain", type: "Terrazzo Look", unit: "SF", price: 4.66, size: "24x24", pei: 4 },
  { name: "Terrazzo Pearl 24x24", series: "Terrazzo", material: "Porcelain", type: "Terrazzo Look", unit: "SF", price: 4.66, size: "24x24", pei: 4 },
  { name: "Terrazzo White 24x24", series: "Terrazzo", material: "Porcelain", type: "Terrazzo Look", unit: "SF", price: 4.66, size: "24x24", pei: 4 },

  // Themar Series (Glazed Porcelain - Marble Look)
  { name: "Themar Bianco Lasa Matte 12x24", series: "Themar", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.42, size: "12x24", finish: "Matte", pei: 5 },
  { name: "Themar Bianco Lasa Matte 24x24", series: "Themar", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.66, size: "24x24", finish: "Matte", pei: 5 },
  { name: "Themar Bianco Lasa Polished 12x24", series: "Themar", material: "Porcelain", type: "Marble Look", unit: "SF", price: 5.24, size: "12x24", finish: "Polished", pei: 4 },
  { name: "Themar Bianco Lasa Polished 24x24", series: "Themar", material: "Porcelain", type: "Marble Look", unit: "SF", price: 5.47, size: "24x24", finish: "Polished", pei: 4 },
  { name: "Themar Crema Marfil Matte 12x24", series: "Themar", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.42, size: "12x24", finish: "Matte", pei: 5 },
  { name: "Themar Crema Marfil Matte 24x24", series: "Themar", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.66, size: "24x24", finish: "Matte", pei: 5 },
  { name: "Themar Crema Marfil Polished 12x24", series: "Themar", material: "Porcelain", type: "Marble Look", unit: "SF", price: 5.24, size: "12x24", finish: "Polished", pei: 4 },
  { name: "Themar Crema Marfil Polished 24x24", series: "Themar", material: "Porcelain", type: "Marble Look", unit: "SF", price: 5.47, size: "24x24", finish: "Polished", pei: 4 },
  { name: "Themar Grigio Savoia Matte 12x24", series: "Themar", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.42, size: "12x24", finish: "Matte", pei: 5 },
  { name: "Themar Grigio Savoia Matte 24x24", series: "Themar", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.66, size: "24x24", finish: "Matte", pei: 5 },
  { name: "Themar Statuario V Matte 12x24", series: "Themar", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.42, size: "12x24", finish: "Matte", pei: 5 },
  { name: "Themar Statuario V Matte 24x24", series: "Themar", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.66, size: "24x24", finish: "Matte", pei: 5 },
  { name: "Themar Venato Gold Matte 12x24", series: "Themar", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.42, size: "12x24", finish: "Matte", pei: 5 },
  { name: "Themar Venato Gold Matte 24x24", series: "Themar", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.66, size: "24x24", finish: "Matte", pei: 5 },

  // Tivoli Series (Porcelain Color Body)
  { name: "Tivoli Beige 12x24", series: "Tivoli", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24", pei: 5 },
  { name: "Tivoli Beige 18x36", series: "Tivoli", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "18x36", pei: 5 },
  { name: "Tivoli Bianco 12x24", series: "Tivoli", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24", pei: 5 },
  { name: "Tivoli Bianco 18x36", series: "Tivoli", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "18x36", pei: 5 },
  { name: "Tivoli Grigio 12x24", series: "Tivoli", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24", pei: 5 },
  { name: "Tivoli Grigio 18x36", series: "Tivoli", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "18x36", pei: 5 },
  { name: "Tivoli Nero 12x24", series: "Tivoli", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24", pei: 5 },
  { name: "Tivoli Nero 18x36", series: "Tivoli", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "18x36", pei: 5 },
  { name: "Tivoli Noce 12x24", series: "Tivoli", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.07, size: "12x24", pei: 5 },
  { name: "Tivoli Noce 18x36", series: "Tivoli", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "18x36", pei: 5 },

  // Touch Series (Glazed Porcelain - Made in USA)
  { name: "Touch Glow 12x24", series: "Touch", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.72, size: "12x24", pei: 4, madeIn: "USA" },
  { name: "Touch Pearl 12x24", series: "Touch", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.72, size: "12x24", pei: 4, madeIn: "USA" },
  { name: "Touch Snow 12x24", series: "Touch", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.72, size: "12x24", pei: 4, madeIn: "USA" },
  { name: "Touch Summer 12x24", series: "Touch", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.72, size: "12x24", pei: 4, madeIn: "USA" },
  { name: "Touch Sunset 12x24", series: "Touch", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 3.72, size: "12x24", pei: 4, madeIn: "USA" },

  // Trav Series (Glazed Porcelain - Travertine Look)
  { name: "Trav Grey Matte 12x24", series: "Trav", material: "Porcelain", type: "Travertine Look", unit: "SF", price: 1.88, size: "12x24", finish: "Matte" },
  { name: "Trav Ivory Matte 12x24", series: "Trav", material: "Porcelain", type: "Travertine Look", unit: "SF", price: 1.88, size: "12x24", finish: "Matte" },
  { name: "Trav Sand Matte 12x24", series: "Trav", material: "Porcelain", type: "Travertine Look", unit: "SF", price: 1.88, size: "12x24", finish: "Matte" },

  // Tru Marmi Series (Glazed Porcelain - Marble Look)
  { name: "Tru Marmi Arabescato Matte 12x24", series: "Tru Marmi", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.42, size: "12x24", finish: "Matte", pei: 4 },
  { name: "Tru Marmi Arabescato Matte 24x48", series: "Tru Marmi", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.89, size: "24x48", finish: "Matte", pei: 4 },
  { name: "Tru Marmi Arabescato Polished 12x24", series: "Tru Marmi", material: "Porcelain", type: "Marble Look", unit: "SF", price: 5.24, size: "12x24", finish: "Polished" },
  { name: "Tru Marmi Arabescato Polished 24x48", series: "Tru Marmi", material: "Porcelain", type: "Marble Look", unit: "SF", price: 5.82, size: "24x48", finish: "Polished" },
  { name: "Tru Marmi Extra Matte 12x24", series: "Tru Marmi", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.42, size: "12x24", finish: "Matte", pei: 4 },
  { name: "Tru Marmi Extra Matte 24x48", series: "Tru Marmi", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.89, size: "24x48", finish: "Matte", pei: 4 },
  { name: "Tru Marmi Gold Matte 12x24", series: "Tru Marmi", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.42, size: "12x24", finish: "Matte", pei: 4 },
  { name: "Tru Marmi Gold Matte 24x48", series: "Tru Marmi", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.89, size: "24x48", finish: "Matte", pei: 4 },
  { name: "Tru Marmi Silver Matte 12x24", series: "Tru Marmi", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.42, size: "12x24", finish: "Matte", pei: 4 },
  { name: "Tru Marmi Silver Matte 24x48", series: "Tru Marmi", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.89, size: "24x48", finish: "Matte", pei: 4 },
  { name: "Tru Marmi Venatino Matte 12x24", series: "Tru Marmi", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.42, size: "12x24", finish: "Matte", pei: 4 },
  { name: "Tru Marmi Venatino Matte 24x48", series: "Tru Marmi", material: "Porcelain", type: "Marble Look", unit: "SF", price: 4.89, size: "24x48", finish: "Matte", pei: 4 },

  // Unica Series (Porcelain Through Body)
  { name: "Unica Carbon Matte 12x24", series: "Unica", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.31, size: "12x24", finish: "Matte", pei: 4 },
  { name: "Unica Carbon Matte 24x48", series: "Unica", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "24x48", finish: "Matte", pei: 4 },
  { name: "Unica Desert Matte 12x24", series: "Unica", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.31, size: "12x24", finish: "Matte", pei: 4 },
  { name: "Unica Desert Matte 24x48", series: "Unica", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "24x48", finish: "Matte", pei: 4 },
  { name: "Unica Moon Matte 12x24", series: "Unica", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.31, size: "12x24", finish: "Matte", pei: 4 },
  { name: "Unica Moon Matte 24x48", series: "Unica", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "24x48", finish: "Matte", pei: 4 },
  { name: "Unica Stone Matte 12x24", series: "Unica", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.31, size: "12x24", finish: "Matte", pei: 4 },
  { name: "Unica Stone Matte 24x48", series: "Unica", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 4.66, size: "24x48", finish: "Matte", pei: 4 },

  // Vetri Series (Glazed Porcelain)
  { name: "Vetri Acqua 24x24", series: "Vetri", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 6.06, size: "24x24", pei: 4 },
  { name: "Vetri Acqua 4x12", series: "Vetri", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 7.57, size: "4x12", pei: 4 },
  { name: "Vetri Acqua 8x24", series: "Vetri", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 6.41, size: "8x24", pei: 4 },
  { name: "Vetri Bianco 24x24", series: "Vetri", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 6.06, size: "24x24", pei: 4 },
  { name: "Vetri Bianco 4x12", series: "Vetri", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 7.57, size: "4x12", pei: 4 },
  { name: "Vetri Bianco 8x24", series: "Vetri", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 6.41, size: "8x24", pei: 4 },
  { name: "Vetri Bronzo 24x24", series: "Vetri", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 6.06, size: "24x24", pei: 4 },
  { name: "Vetri Bronzo 4x12", series: "Vetri", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 7.57, size: "4x12", pei: 4 },
  { name: "Vetri Bronzo 8x24", series: "Vetri", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 6.41, size: "8x24", pei: 4 },
  { name: "Vetri Fume 24x24", series: "Vetri", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 6.06, size: "24x24", pei: 4 },
  { name: "Vetri Fume 4x12", series: "Vetri", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 7.57, size: "4x12", pei: 4 },
  { name: "Vetri Fume 8x24", series: "Vetri", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 6.41, size: "8x24", pei: 4 },
  { name: "Vetri Naturale 24x24", series: "Vetri", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 6.06, size: "24x24", pei: 4 },
  { name: "Vetri Naturale 4x12", series: "Vetri", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 7.57, size: "4x12", pei: 4 },
  { name: "Vetri Naturale 8x24", series: "Vetri", material: "Porcelain", type: "Floor Tile", unit: "SF", price: 6.41, size: "8x24", pei: 4 },

  // Natural Stone - Basalt
  { name: "Basalt Honed 12x24", series: "Basalt", material: "Natural Stone", type: "Basalt", unit: "SF", price: 9.94, size: "12x24", finish: "Honed" },
  { name: "Basalt Honed 4x16", series: "Basalt", material: "Natural Stone", type: "Basalt", unit: "SF", price: 9.44, size: "4x16", finish: "Honed" },
  { name: "Basalt Honed 8in Hex", series: "Basalt", material: "Natural Stone", type: "Basalt", unit: "SF", price: 10.56, size: "8in Hex", finish: "Honed" },

  // Natural Stone - Limestone
  { name: "Chellah Grey Honed 12x24", series: "Limestone", material: "Natural Stone", type: "Limestone", unit: "SF", price: 11.60, size: "12x24", finish: "Honed" },
  { name: "Classic Limestone Brushed 12x24", series: "Limestone", material: "Natural Stone", type: "Limestone", unit: "SF", price: 6.57, size: "12x24", finish: "Brushed" },
  { name: "Classic Limestone Honed 12x24", series: "Limestone", material: "Natural Stone", type: "Limestone", unit: "SF", price: 6.57, size: "12x24", finish: "Honed" },
  { name: "Classic Limestone Honed 18x18", series: "Limestone", material: "Natural Stone", type: "Limestone", unit: "SF", price: 6.57, size: "18x18", finish: "Honed" },
  { name: "Gobi Limestone Honed 12x24", series: "Limestone", material: "Natural Stone", type: "Limestone", unit: "SF", price: 6.85, size: "12x24", finish: "Honed" },
  { name: "Salem Grey Renaissance 12x24", series: "Limestone", material: "Natural Stone", type: "Limestone", unit: "SF", price: 7.18, size: "12x24" },
  { name: "Salem Grey Renaissance 18x36", series: "Limestone", material: "Natural Stone", type: "Limestone", unit: "SF", price: 8.78, size: "18x36" },

  // Natural Stone - Marble
  { name: "Bianco Carrara Honed 12x12", series: "Marble", material: "Natural Stone", type: "Marble", unit: "SF", price: 8.29, size: "12x12", finish: "Honed" },
  { name: "Bianco Carrara Honed 12x24", series: "Marble", material: "Natural Stone", type: "Marble", unit: "SF", price: 8.78, size: "12x24", finish: "Honed" },
  { name: "Bianco Carrara Honed 24x24", series: "Marble", material: "Natural Stone", type: "Marble", unit: "SF", price: 8.78, size: "24x24", finish: "Honed" },
  { name: "Bianco Carrara Honed 24x48", series: "Marble", material: "Natural Stone", type: "Marble", unit: "SF", price: 10.99, size: "24x48", finish: "Honed" },
  { name: "Bianco Carrara Polished 12x12", series: "Marble", material: "Natural Stone", type: "Marble", unit: "SF", price: 8.29, size: "12x12", finish: "Polished" },
  { name: "Bianco Carrara Polished 12x24", series: "Marble", material: "Natural Stone", type: "Marble", unit: "SF", price: 8.78, size: "12x24", finish: "Polished" },
  { name: "Bianco Carrara Polished 24x24", series: "Marble", material: "Natural Stone", type: "Marble", unit: "SF", price: 8.78, size: "24x24", finish: "Polished" },
  { name: "Bianco Carrara Polished 24x48", series: "Marble", material: "Natural Stone", type: "Marble", unit: "SF", price: 10.99, size: "24x48", finish: "Polished" },
  { name: "Calacatta Umber Honed 12x24", series: "Marble", material: "Natural Stone", type: "Marble", unit: "SF", price: 8.78, size: "12x24", finish: "Honed" },
  { name: "Calacatta Umber Polished 12x24", series: "Marble", material: "Natural Stone", type: "Marble", unit: "SF", price: 8.78, size: "12x24", finish: "Polished" },
  { name: "Negro Marquina Polished 12x24", series: "Marble", material: "Natural Stone", type: "Marble", unit: "SF", price: 10.99, size: "12x24", finish: "Polished" },

  // Natural Stone - Travertine
  { name: "Ankara Filled Honed 18x18", series: "Travertine", material: "Natural Stone", type: "Travertine", unit: "SF", price: 5.47, size: "18x18", finish: "Filled & Honed" },
  { name: "Antalya Filled Honed 18x18", series: "Travertine", material: "Natural Stone", type: "Travertine", unit: "SF", price: 4.97, size: "18x18", finish: "Filled & Honed" },
  { name: "Torreon Stone Filled Honed 18x18", series: "Travertine", material: "Natural Stone", type: "Travertine", unit: "SF", price: 6.35, size: "18x18", finish: "Filled & Honed" },

  // Natural Stone - Granite
  { name: "Galaxy Black 12x12", series: "Granite", material: "Natural Stone", type: "Granite", unit: "SF", price: 10.50, size: "12x12" },
  { name: "Indian Premium Black Honed 12x12", series: "Granite", material: "Natural Stone", type: "Granite", unit: "SF", price: 7.04, size: "12x12", finish: "Honed" },
  { name: "Indian Premium Black 12x12", series: "Granite", material: "Natural Stone", type: "Granite", unit: "SF", price: 7.18, size: "12x12" },
];

// Convert product data to tile.json format
function convertToTileFormat(product) {
  const tieredPricing = calculateTieredPricing(product.price);
  const retailPrice = tieredPricing.guest.toFixed(2);

  const tags = [
    product.material,
    product.type,
    product.series,
    "arizona-tile"
  ];

  if (product.finish) tags.push(product.finish);
  if (product.pei) tags.push(`PEI-${product.pei}`);

  return {
    id: generateId(product.name),
    title: product.name,
    handle: generateSlug(product.name),
    vendor: "Arizona Tile",
    brandDisplay: "Arizona Tile",
    brandTier: "premium",
    productType: "Tile",
    category: "tile",
    description: `${product.series} Series - ${product.material} ${product.type}${product.finish ? `, ${product.finish} finish` : ''}. Size: ${product.size}${product.pei ? `. PEI Rating: ${product.pei}` : ''}`,
    tags: tags.filter(t => t),
    available: true,
    price: retailPrice,
    currency: "USD",
    images: [],
    variants: [
      {
        id: `variant-${generateSlug(product.name)}`,
        title: "Default",
        price: retailPrice,
        available: true
      }
    ],
    specs: {
      material: product.material,
      style: product.type,
      series: product.series,
      size: product.size,
      finish: product.finish || "",
      pei: product.pei || null
    },
    wholesaleCost: product.price,
    price_sf: tieredPricing,
    unit: product.unit,
    price_updated_at: new Date().toISOString()
  };
}

// Main execution
async function main() {
  try {
    // Read existing tile.json
    const tileJsonPath = path.join(__dirname, '..', 'data', 'tile.json');
    const existingData = JSON.parse(fs.readFileSync(tileJsonPath, 'utf8'));

    console.log(`Existing products: ${existingData.length}`);

    // Convert Arizona Tile products
    const arizonaTileConverted = arizonaTileProducts.map(convertToTileFormat);
    console.log(`Arizona Tile products to add: ${arizonaTileConverted.length}`);

    // Check for duplicates by ID
    const existingIds = new Set(existingData.map(p => p.id));
    const newProducts = arizonaTileConverted.filter(p => !existingIds.has(p.id));

    console.log(`New products (no duplicates): ${newProducts.length}`);

    // Combine existing and new products
    const combinedData = [...existingData, ...newProducts];

    console.log(`Total products