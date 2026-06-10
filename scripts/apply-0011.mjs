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

const MIGRATION_FILE = path.join(__dirname, '..', 'supabase', 'migrations', '0011_clubs_default_approved.sql');

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
  console.log('Applying 0011_clubs_default_approved.sql...');

  try {
    await client.query(sql);
    console.log('  ✓ 0011_clubs_default_approved.sql applied successfully.');
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

  // Verify the default was updated
  console.log('\nVerifying clubs.status default...');
  try {
    const result = await client.query(`
      SELECT column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'clubs'
        AND column_name = 'status';
    `);
    if (result.rows.length > 0) {
      console.log(`  clubs.status default: ${result.rows[0].column_default}`);
      if (result.rows[0].column_default && result.rows[0].column_default.includes('approved')) {
        console.log('  ✓ clubs.status default is approved.');
      } else {
        console.warn('  ⚠ clubs.status default may not be approved — check manually.');
      }
    } else {
      console.warn('  Could not find clubs.status column info.');
    }
  } catch (err) {
    console.warn('  Could not verify default:', err.message);
  }

  await client.end();
  console.log('\nDone.');
}

applyMigration().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
