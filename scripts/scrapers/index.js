#!/usr/bin/env node

/**
 * Vendor Scraper CLI
 * Run scrapers for vendor product data
 *
 * Usage:
 *   node scripts/scrapers/index.js --vendor=msi
 *   node scripts/scrapers/index.js --vendor=all
 *   node scripts/scrapers/index.js --list
 */

require('dotenv').config();

const path = require('path');
const fs = require('fs');

// Available scrapers
const SCRAPERS = {
  msi: {
    name: 'MSI Surfaces',
    class: require('./vendors/msi')
  }
  // Add more scrapers as they're implemented:
  // 'arizona-tile': { name: 'Arizona Tile', class: require('./vendors/arizona-tile') },
  // 'cambria': { name: 'Cambria', class: require('./vendors/cambria') },
};

function printUsage() {
  console.log(`
Vendor Scraper CLI
==================

Usage:
  node scripts/scrapers/index.js [options]

Options:
  --vendor=<id>     Run scraper for specific vendor (or 'all')
  --list            List available scrapers
  --dry-run         Run without saving to database
  --help            Show this help message

Available vendors:
${Object.entries(SCRAPERS).map(([id, s]) => `  ${id.padEnd(20)} ${s.name}`).join('\n')}

Examples:
  node scripts/scrapers/index.js --vendor=msi
  node scripts/scrapers/index.js --vendor=all
  node scripts/scrapers/index.js --list
`);
}

function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      args[key] = value || true;
    }
  });
  return args;
}

async function runScraper(vendorId, options = {}) {
  const scraperConfig = SCRAPERS[vendorId];
  if (!scraperConfig) {
    console.error(`Unknown vendor: ${vendorId}`);
    console.log(`Available vendors: ${Object.keys(SCRAPERS).join(', ')}`);
    return null;
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Starting scraper: ${scraperConfig.name}`);
  console.log(`${'='.repeat(50)}\n`);

  const ScraperClass = scraperConfig.class;
  const scraper = new ScraperClass();

  if (options.dryRun) {
    scraper.supabase = null; // Disable database operations
    console.log('[DRY RUN] Database operations disabled');
  }

  try {
    const result = await scraper.run();
    return result;
  } catch (err) {
    console.error(`Scraper failed: ${err.message}`);
    return null;
  }
}

async function runAllScrapers(options = {}) {
  const results = {};

  for (const vendorId of Object.keys(SCRAPERS)) {
    results[vendorId] = await runScraper(vendorId, options);

    // Wait between scrapers
    if (Object.keys(SCRAPERS).indexOf(vendorId) < Object.keys(SCRAPERS).length - 1) {
      console.log('\nWaiting 10 seconds before next scraper...\n');
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('ALL SCRAPERS COMPLETE');
  console.log('='.repeat(50));
  console.log('\nResults:');

  for (const [vendorId, result] of Object.entries(results)) {
    if (result) {
      console.log(`  ${vendorId}: ${result.stats.total_scraped} scraped, ${result.stats.new_products} new, ${result.stats.updated_products} updated`);
    } else {
      console.log(`  ${vendorId}: FAILED`);
    }
  }

  return results;
}

async function main() {
  const args = parseArgs();

  if (args.help || Object.keys(args).length === 0) {
    printUsage();
    return;
  }

  if (args.list) {
    console.log('\nAvailable Scrapers:');
    console.log('-------------------');
    for (const [id, config] of Object.entries(SCRAPERS)) {
      console.log(`  ${id.padEnd(20)} ${config.name}`);
    }
    console.log('');
    return;
  }

  if (args.vendor) {
    const options = {
      dryRun: args['dry-run']
    };

    if (args.vendor === 'all') {
      await runAllScrapers(options);
    } else {
      await runScraper(args.vendor, options);
    }
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { runScraper, runAllScrapers, SCRAPERS };
