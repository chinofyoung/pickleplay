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

const MIGRATION_FILE = path.join(__dirname, '..', 'supabase', 'migrations', '0008_security_hardening.sql');

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
  console.log('Applying 0008_security_hardening.sql...');

  try {
    await client.query(sql);
    console.log('  ✓ 0008_security_hardening.sql applied successfully.');
  } catch (err) {
    console.error('  ✗ Migration FAILED:', err.message);
    console.error('  Full error:', err);
    await client.end();
    process.exit(1);
  }

  // Verify the policies exist
  console.log('\nVerifying policies...');
  try {
    const result = await client.query(`
      SELECT schemaname, tablename, policyname
      FROM pg_policies
      WHERE policyname IN (
        'profiles_self_update',
        'bookings_owner_update',
        'proofs_write',
        'proofs_update',
        'qrs_write',
        'qrs_update'
      )
      ORDER BY tablename, policyname;
    `);
    for (const row of result.rows) {
      console.log(`  ✓ Policy found: ${row.policyname} on ${row.schemaname}.${row.tablename}`);
    }
  } catch (err) {
    console.warn('  Could not verify policies:', err.message);
  }

  // Verify expire_pending_bookings function security definer
  console.log('\nVerifying expire_pending_bookings function...');
  try {
    const result = await client.query(`
      SELECT proname, prosecdef, proconfig
      FROM pg_proc
      WHERE proname = 'expire_pending_bookings';
    `);
    if (result.rows.length > 0) {
      const fn = result.rows[0];
      console.log(`  ✓ Function found: ${fn.proname}`);
      console.log(`    security definer: ${fn.prosecdef}`);
      console.log(`    config: ${JSON.stringify(fn.proconfig)}`);
    } else {
      console.warn('  ⚠ Function expire_pending_bookings not found.');
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
