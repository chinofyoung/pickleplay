import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

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

const MIGRATION_FILE = path.join(__dirname, '..', 'supabase', 'migrations', '0006_profile_name_fix.sql');

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
  console.log('Applying 0006_profile_name_fix.sql...');
  console.log('SQL:\n', sql);

  try {
    await client.query(sql);
    console.log('  ✓ 0006_profile_name_fix.sql applied successfully.');
  } catch (err) {
    console.error('  ✗ Migration FAILED:', err.message);
    console.error('  Full error:', err);
    await client.end();
    process.exit(1);
  }

  // Verify the function body was updated
  console.log('\nVerifying updated function definition...');
  try {
    const result = await client.query(`
      SELECT prosrc
      FROM pg_proc
      WHERE proname = 'handle_new_user'
    `);
    if (result.rows.length > 0) {
      console.log('Function source:\n', result.rows[0].prosrc);
      if (result.rows[0].prosrc.includes('coalesce')) {
        console.log('\n  ✓ Function contains coalesce fallback — migration verified.');
      } else {
        console.warn('\n  ⚠ Function does NOT contain coalesce — check migration applied to correct DB.');
      }
    }
  } catch (err) {
    console.warn('Could not verify function:', err.message);
  }

  await client.end();
  console.log('\nDone.');
}

applyMigration().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
