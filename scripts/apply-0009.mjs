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

const MIGRATION_FILE = path.join(__dirname, '..', 'supabase', 'migrations', '0009_owner_role_via_trigger.sql');

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
  console.log('Applying 0009_owner_role_via_trigger.sql...');

  try {
    await client.query(sql);
    console.log('  ✓ 0009_owner_role_via_trigger.sql applied successfully.');
  } catch (err) {
    console.error('  ✗ Migration FAILED:', err.message);
    console.error('  Full error:', err);
    await client.end();
    process.exit(1);
  }

  // Verify the function was updated
  console.log('\nVerifying handle_new_user function...');
  try {
    const result = await client.query(`
      SELECT proname, prosecdef, proconfig, prosrc
      FROM pg_proc
      WHERE proname = 'handle_new_user';
    `);
    if (result.rows.length > 0) {
      const fn = result.rows[0];
      console.log(`  ✓ Function found: ${fn.proname}`);
      console.log(`    security definer: ${fn.prosecdef}`);
      const hasRoleLogic = fn.prosrc && fn.prosrc.includes('desired_role');
      console.log(`    contains role logic: ${hasRoleLogic}`);
    } else {
      console.warn('  ⚠ Function handle_new_user not found.');
    }
  } catch (err) {
    console.warn('  Could not verify function:', err.message);
  }

  await client.end();
  console.log('\nDone.');
}

applyMigration().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
