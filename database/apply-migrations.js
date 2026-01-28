#!/usr/bin/env node
/**
 * Apply Database Migrations via Supabase REST API
 *
 * This script attempts to create tables using the Supabase REST API.
 * For complex DDL, use the Supabase SQL Editor.
 */

const fs = require('fs');
const path = require('path');

// Load environment from api/.env
const apiPath = path.join(__dirname, '../api');
try {
  // Try to require dotenv from api/node_modules
  const dotenv = require(path.join(apiPath, 'node_modules/dotenv'));
  dotenv.config({ path: path.join(apiPath, '.env') });
} catch (e) {
  // Fallback - try to read .env manually
  try {
    const envContent = fs.readFileSync(path.join(apiPath, '.env'), 'utf8');
    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && !key.startsWith('#')) {
        process.env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      }
    });
  } catch (err) {
    console.log('Warning: Could not load .env file');
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ypeypgwsycxcagncgdur.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('ERROR: No Supabase service key found in environment.');
  console.error('');
  console.error('Please run migrations manually in Supabase SQL Editor:');
  console.error('  1. Go to: https://supabase.com/dashboard/project/ypeypgwsycxcagncgdur/sql/new');
  console.error('  2. Copy the contents of each migration file:');
  console.error('     - database/general-collaborators-migration.sql');
  console.error('     - database/calendar-events-migration.sql');
  console.error('     - database/automation-sequences-migration.sql');
  console.error('  3. Paste and click "Run"');
  process.exit(1);
}

async function checkTableExists(tableName) {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?select=count&limit=0`, {
      method: 'HEAD',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      }
    });
    return response.ok || response.status === 200 || response.status === 416;
  } catch (e) {
    return false;
  }
}

async function checkAllTables() {
  console.log('Checking if tables already exist...\n');

  const tables = [
    'general_collaborators',
    'calendar_events',
    'calendar_event_participants',
    'automation_sequences',
    'automation_enrollments',
    'automation_templates',
    'automation_logs'
  ];

  const results = [];
  for (const table of tables) {
    const exists = await checkTableExists(table);
    results.push({ table, exists });
    console.log(`  ${exists ? '[EXISTS]' : '[MISSING]'} ${table}`);
  }

  return results;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Supabase Migration Status Checker');
  console.log('Project:', SUPABASE_URL);
  console.log('='.repeat(60));
  console.log('');

  const results = await checkAllTables();

  const missing = results.filter(r => !r.exists);
  const existing = results.filter(r => r.exists);

  console.log('');
  console.log('='.repeat(60));

  if (missing.length === 0) {
    console.log('All tables already exist! Migrations may have already been applied.');
  } else {
    console.log(`${missing.length} table(s) need to be created.`);
    console.log('');
    console.log('To apply migrations, please use the Supabase SQL Editor:');
    console.log('');
    console.log('  1. Open: https://supabase.com/dashboard/project/ypeypgwsycxcagncgdur/sql/new');
    console.log('');
    console.log('  2. Run migrations in this order:');

    if (missing.some(m => m.table === 'general_collaborators')) {
      console.log('     a) database/general-collaborators-migration.sql');
    }
    if (missing.some(m => ['calendar_events', 'calendar_event_participants'].includes(m.table))) {
      console.log('     b) database/calendar-events-migration.sql');
    }
    if (missing.some(m => ['automation_sequences', 'automation_enrollments', 'automation_templates', 'automation_logs'].includes(m.table))) {
      console.log('     c) database/automation-sequences-migration.sql');
    }

    console.log('');
    console.log('  3. Or run the combined file:');
    console.log('     database/run-all-new-migrations.sql');
  }

  console.log('='.repeat(60));
}

main().catch(console.error);
