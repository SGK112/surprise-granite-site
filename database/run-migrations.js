#!/usr/bin/env node
/**
 * Database Migration Runner
 * Runs SQL migrations against Supabase using the service role key
 *
 * Usage: node database/run-migrations.js
 *
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables from api/.env
const path = require('path');
try {
  require('dotenv').config({ path: path.join(__dirname, '../api/.env') });
} catch (e) {
  console.log('Note: dotenv not available, using existing environment');
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ypeypgwsycxcagncgdur.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY environment variable is required');
  console.error('\nTo run migrations, set the environment variable:');
  console.error('  export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"');
  console.error('  node database/run-migrations.js');
  console.error('\nOr run directly in Supabase SQL Editor:');
  console.error('  1. Go to https://supabase.com/dashboard/project/ypeypgwsycxcagncgdur/sql');
  console.error('  2. Copy contents of database/run-all-new-migrations.sql');
  console.error('  3. Click "Run"');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Migration files to run in order
const migrations = [
  'general-collaborators-migration.sql',
  'calendar-events-migration.sql',
  'automation-sequences-migration.sql'
];

async function runMigration(filename) {
  const filepath = path.join(__dirname, filename);

  if (!fs.existsSync(filepath)) {
    console.error(`Migration file not found: ${filepath}`);
    return false;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running migration: ${filename}`);
  console.log('='.repeat(60));

  const sql = fs.readFileSync(filepath, 'utf8');

  // Split SQL into individual statements (simple split on semicolons followed by newlines)
  // This is a simplified approach - complex SQL might need better parsing
  const statements = sql
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  let successCount = 0;
  let errorCount = 0;

  for (const statement of statements) {
    if (!statement || statement.startsWith('--')) continue;

    // Skip COMMENT statements as they often have issues with the API
    if (statement.toUpperCase().startsWith('COMMENT ON')) {
      console.log('  Skipping COMMENT statement');
      continue;
    }

    try {
      const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' }).single();

      if (error) {
        // Try direct query for DDL statements
        const { error: directError } = await supabase.from('_exec').select('*').limit(0);

        // If the table/object already exists, that's usually OK
        if (error.message && error.message.includes('already exists')) {
          console.log(`  [SKIP] Object already exists`);
          successCount++;
        } else {
          console.error(`  [ERROR] ${error.message || error}`);
          errorCount++;
        }
      } else {
        successCount++;
      }
    } catch (err) {
      // For DDL statements, we may need to use the SQL Editor
      if (err.message && err.message.includes('already exists')) {
        console.log(`  [SKIP] Object already exists`);
        successCount++;
      } else {
        console.log(`  [INFO] Statement may need manual execution: ${statement.substring(0, 50)}...`);
      }
    }
  }

  console.log(`\nMigration ${filename}: ${successCount} succeeded, ${errorCount} errors`);
  return errorCount === 0;
}

async function verifyTables() {
  console.log('\n' + '='.repeat(60));
  console.log('Verifying created tables...');
  console.log('='.repeat(60));

  const tablesToCheck = [
    'general_collaborators',
    'calendar_events',
    'calendar_event_participants',
    'automation_sequences',
    'automation_enrollments',
    'automation_templates',
    'automation_logs'
  ];

  for (const table of tablesToCheck) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.log(`  [MISSING] ${table}: ${error.message}`);
      } else {
        console.log(`  [OK] ${table} exists (${count || 0} rows)`);
      }
    } catch (err) {
      console.log(`  [MISSING] ${table}: ${err.message}`);
    }
  }
}

async function main() {
  console.log('Database Migration Runner');
  console.log('Supabase Project:', SUPABASE_URL);
  console.log('');

  // Run migrations
  let allSuccess = true;
  for (const migration of migrations) {
    const success = await runMigration(migration);
    if (!success) allSuccess = false;
  }

  // Verify tables
  await verifyTables();

  console.log('\n' + '='.repeat(60));
  if (allSuccess) {
    console.log('All migrations completed!');
  } else {
    console.log('Some migrations had errors. Check output above.');
    console.log('\nFor manual execution, use the Supabase SQL Editor:');
    console.log('https://supabase.com/dashboard/project/ypeypgwsycxcagncgdur/sql');
  }
  console.log('='.repeat(60));
}

main().catch(console.error);
