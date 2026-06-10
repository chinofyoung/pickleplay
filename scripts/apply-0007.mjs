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

const MIGRATION_FILE = path.join(__dirname, '..', 'supabase', 'migrations', '0007_booking_overlap_constraint.sql');

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
  console.log('Applying 0007_booking_overlap_constraint.sql...');
  console.log('SQL:\n', sql);

  try {
    await client.query(sql);
    console.log('  ✓ 0007_booking_overlap_constraint.sql applied successfully.');
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('already exists') || err.code === '42710' || err.code === '42P07') {
      console.warn(`  ⚠ Migration skipped (already exists / idempotency): ${msg}`);
    } else if (msg.includes('overlapping')) {
      console.error('  ✗ BLOCKED: Pre-existing overlapping rows prevent adding the constraint.');
      console.error('  ERROR:', msg);
      console.error('  ACTION: Clean up overlapping active bookings and re-run.');
      await client.end();
      process.exit(1);
    } else {
      console.error('  ✗ Migration FAILED:', msg);
      console.error('  Full error:', err);
      await client.end();
      process.exit(1);
    }
  }

  // Verify btree_gist extension exists
  console.log('\nVerifying btree_gist extension...');
  try {
    const extResult = await client.query(`
      SELECT extname FROM pg_extension WHERE extname = 'btree_gist';
    `);
    if (extResult.rows.length > 0) {
      console.log('  ✓ btree_gist extension confirmed.');
    } else {
      console.warn('  ⚠ btree_gist extension not found — constraint may not work correctly.');
    }
  } catch (err) {
    console.warn('  Could not verify extension:', err.message);
  }

  // Verify the constraint exists
  console.log('\nVerifying bookings_no_overlap constraint...');
  try {
    const result = await client.query(`
      SELECT conname, contype
      FROM pg_constraint
      WHERE conname = 'bookings_no_overlap';
    `);
    if (result.rows.length > 0) {
      const con = result.rows[0];
      console.log(`  ✓ Constraint found: ${con.conname} (type: ${con.contype === 'x' ? 'EXCLUSION' : con.contype})`);
    } else {
      console.error('  ✗ Constraint bookings_no_overlap NOT FOUND in pg_constraint.');
    }
  } catch (err) {
    console.error('  Could not verify constraint:', err.message);
  }

  await client.end();
  console.log('\nDone.');
}

applyMigration().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
