#!/usr/bin/env node
/**
 * Generate missing countertop pages from JSON data
 */

const fs = require('fs');
const path = require('path');

// Read countertops JSON
const countertopsData = JSON.parse(fs.readFileSync('data/countertops.json', 'utf8'));
const countertops = countertopsData.countertops;

// Read template
const templatePath = 'countertops/calacatta-classique-quartz/index.html';
const template = fs.readFileSync(templatePath, 'utf8');

// Read missing slugs
const missingSlugs = fs.readFileSync('/tmp/missing.txt', 'utf8').trim().split('\n');

// Brand name mapping
const brandNames = {
  'msi-quartz': 'MSI Surfaces',
  'cambria': 'Cambria',
  'caesarstone': 'Caesarstone',
  'silestone': 'Silestone',
  'hanstone': 'Hanstone',
  'vicostone': 'Vicostone',
  'pentalquartz': 'Pental Quartz',
  'lx-hausys': 'LX Hausys',
  'radianz-quartz': 'Radianz Quartz',
  'daltile-quartz': 'Daltile',
  'arizona-tile': 'Arizona Tile',
  'polarstone': 'Polarstone',
  'sensa': 'Sensa',
  'classic-quartz': 'Classic Quartz',
  'bolder-image-stone': 'Bolder Image Stone'
};

function formatName(slug) {
  return slug.split('-').map(word => {
    if (word === 'quartz' || word === 'granite' || word === 'marble' || word === 'porcelain') {
      return word.charAt(0).toUpperCase() + word.slice(1);
    }
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
}

function generatePage(countertop) {
  const slug = countertop.slug;
  const name = countertop.name || formatName(slug);
  const brand = brandNames[countertop.brand] || countertop.brand || 'Surprise Granite';
  const type = countertop.type || 'Quartz';
  const primaryImage = countertop.primaryImage || '';
  const secondaryImage = countertop.secondaryImage || primaryImage;
  const color = countertop.primaryColor || 'White';
  const style = countertop.style || 'Modern';

  // Generate description
  const description = `${name} ${type} countertops from ${brand}. Beautiful ${color.toLowerCase()} ${type.toLowerCase()} with ${style.toLowerCase()} design. Available at Surprise Granite Arizona.`;

  // Replace template values
  let page = template
    // Replace names
    .replace(/Calacatta Classique/g, name)
    .replace(/calacatta-classique-quartz/g, slug)
    .replace(/calacatta-classique/g, slug.replace('-quartz', '').replace('-granite', '').replace('-marble', ''))

    // Replace brand
    .replace(/MSI Surfaces/g, brand)

    // Replace type
    .replace(/Quartz Countertops/g, `${type} Countertops`)
    .replace(/"material": "Quartz"/g, `"material": "${type}"`)

    // Replace images - use the actual images from JSON
    .replace(/https:\/\/uploads-ssl\.webflow\.com\/6456ce4476abb2d4f9fbad10\/6456ce4576abb273bdfbc69b[^"]+/g, primaryImage)
    .replace(/https:\/\/uploads-ssl\.webflow\.com\/6456ce4476abb2d4f9fbad10\/6456ce4576abb20d3efbc69c[^"]+/g, secondaryImage)

    // Replace description
    .replace(/Exquisite and unique,Calacatta Classique Quartz stuns the senses with its clean whites and striking through-body marble look veining\. /g, description);

  return page;
}

// Generate each missing page
let created = 0;
let errors = [];

missingSlugs.forEach(slug => {
  const countertop = countertops.find(c => c.slug === slug);

  if (!countertop) {
    errors.push(`No data found for: ${slug}`);
    return;
  }

  const dirPath = `countertops/${slug}`;
  const filePath = `${dirPath}/index.html`;

  try {
    // Create directory
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Generate and write page
    const page = generatePage(countertop);
    fs.writeFileSync(filePath, page);
    created++;
    console.log(`Created: ${slug}`);
  } catch (err) {
    errors.push(`Error creating ${slug}: ${err.message}`);
  }
});

console.log(`\nCreated ${created} pages`);
if (errors.length > 0) {
  console.log(`\nErrors:`);
  errors.forEach(e => console.log(`  - ${e}`));
}
