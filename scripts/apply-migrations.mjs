import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

// Read DATABASE_URL from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envMatch = envContent.match(/^DATABASE_URL=(.+)$/m);
if (!envMatch) {
  console.error('DATABASE_URL not found in .env.local');
  process.exit(1);
}
const DATABASE_URL = envMatch[1].trim();

async function applyMigrations() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  console.log('Connecting to database...');
  try {
    await client.connect();
    console.log('Connected successfully.\n');
  } catch (err) {
    console.error('BLOCKED: Connection failed.');
    console.error('Error:', err.message);
    process.exit(1);
  }

  // Apply migrations 0001–0004 in order
  const migrations = [
    '0001_core_schema.sql',
    '0002_profile_trigger.sql',
    '0003_rls.sql',
    '0004_storage.sql',
  ];

  for (const filename of migrations) {
    const filepath = path.join(MIGRATIONS_DIR, filename);
    const sql = fs.readFileSync(filepath, 'utf8');
    console.log(`Applying ${filename}...`);
    try {
      await client.query(sql);
      console.log(`  ✓ ${filename} applied successfully.\n`);
    } catch (err) {
      const msg = err.message || '';
      // If objects already exist, log but continue
      if (
        msg.includes('already exists') ||
        msg.includes('duplicate') ||
        err.code === '42P07' || // duplicate_table
        err.code === '42710' || // duplicate_object
        err.code === '42P16'    // invalid_table_definition (already exists variant)
      ) {
        console.warn(`  ⚠ ${filename} skipped (already exists / idempotency): ${msg}\n`);
      } else {
        console.error(`  ✗ ${filename} FAILED: ${msg}\n`);
        console.error('  Full error:', err);
      }
    }
  }

  // Migration 0005: pg_cron — attempt extension creation first
  console.log('Attempting to create pg_cron extension...');
  try {
    await client.query('create extension if not exists pg_cron;');
    console.log('  ✓ pg_cron extension created/already exists.\n');

    // Now apply the cron migration
    const cronFile = path.join(MIGRATIONS_DIR, '0005_expire_cron.sql');
    const cronSql = fs.readFileSync(cronFile, 'utf8');
    console.log('Applying 0005_expire_cron.sql...');
    try {
      await client.query(cronSql);
      console.log('  ✓ 0005_expire_cron.sql applied successfully.\n');
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('already exists') || msg.includes('duplicate')) {
        console.warn(`  ⚠ 0005_expire_cron.sql skipped (already exists / idempotency): ${msg}\n`);
      } else {
        console.error(`  ✗ 0005_expire_cron.sql FAILED: ${msg}\n`);
      }
    }
  } catch (err) {
    console.warn('  ⚠ WARNING: Could not create pg_cron extension.');
    console.warn('    Error:', err.message);
    console.warn('    ACTION REQUIRED: Enable pg_cron via the Supabase dashboard:');
    console.warn('    Database → Extensions → search "pg_cron" → Enable');
    console.warn('    Then re-run this script to apply 0005_expire_cron.sql.\n');
  }

  await client.end();
  console.log('Migration script complete.');
}

applyMigrations().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
