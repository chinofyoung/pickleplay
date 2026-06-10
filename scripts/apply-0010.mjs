import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read DATABASE_URL from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
if (!match) {
  console.error('DATABASE_URL not found in .env.local');
  process.exit(1);
}
const DATABASE_URL = match[1].trim();

const MIGRATION_FILE = path.join(__dirname, '..', 'supabase', 'migrations', '0010_owner_applications.sql');

async function applyMigration() {
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
    console.error('Connection failed:', err.message);
    process.exit(1);
  }

  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
  console.log('Applying 0010_owner_applications.sql...');

  try {
    await client.query(sql);
    console.log('  ✓ 0010_owner_applications.sql applied successfully.');
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('already exists') || err.code === '42710' || err.code === '42P07') {
      console.warn(`  ⚠ Migration skipped (already exists / idempotency): ${msg}`);
    } else {
      console.error('  ✗ Migration FAILED:', msg);
      console.error('  Full error:', err);
      await client.end();
      process.exit(1);
    }
  }

  // Verify the table was created
  console.log('\nVerifying owner_applications table...');
  try {
    const result = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'owner_applications';
    `);
    if (result.rows.length > 0) {
      console.log('  ✓ owner_applications table exists.');
    } else {
      console.error('  ✗ owner_applications table NOT found.');
    }
  } catch (err) {
    console.warn('  Could not verify table:', err.message);
  }

  // Verify the functions exist
  console.log('\nVerifying approve_owner_application and reject_owner_application functions...');
  try {
    const result = await client.query(`
      SELECT proname FROM pg_proc
      WHERE proname IN ('approve_owner_application', 'reject_owner_application');
    `);
    const names = result.rows.map(r => r.proname);
    if (names.includes('approve_owner_application')) {
      console.log('  ✓ approve_owner_application function exists.');
    } else {
      console.error('  ✗ approve_owner_application function NOT found.');
    }
    if (names.includes('reject_owner_application')) {
      console.log('  ✓ reject_owner_application function exists.');
    } else {
      console.error('  ✗ reject_owner_application function NOT found.');
    }
  } catch (err) {
    console.warn('  Could not verify functions:', err.message);
  }

  await client.end();
  console.log('\nDone.');
}

applyMigration().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
