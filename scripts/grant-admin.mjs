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

const TARGET_EMAIL = 'chinofyoung@gmail.com';

async function grantAdmin() {
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

  // Step 1: Check current role BEFORE update
  console.log(`Checking current role for: ${TARGET_EMAIL}`);
  let currentRole = null;
  let userId = null;
  try {
    const preResult = await client.query(`
      SELECT p.id, p.role
      FROM profiles p
      JOIN auth.users u ON u.id = p.id
      WHERE lower(u.email) = lower($1)
    `, [TARGET_EMAIL]);

    if (preResult.rows.length === 0) {
      console.log(`\nNo profile found for email: ${TARGET_EMAIL}`);
      console.log('Checking if the user exists in auth.users at all...');

      const authCheck = await client.query(`
        SELECT id, email FROM auth.users WHERE lower(email) = lower($1)
      `, [TARGET_EMAIL]);

      if (authCheck.rows.length === 0) {
        console.log('\n--- RESULT: USER NOT FOUND ---');
        console.log(`The email "${TARGET_EMAIL}" is not registered in auth.users.`);
        console.log('The user must sign up at /register (or via Google) first, then re-run this script.');
        await client.end();
        process.exit(0);
      } else {
        console.log(`User exists in auth.users (id: ${authCheck.rows[0].id}) but has no profiles row.`);
        userId = authCheck.rows[0].id;
        currentRole = '(no profile row)';
      }
    } else {
      userId = preResult.rows[0].id;
      currentRole = preResult.rows[0].role;
      console.log(`  Before update — id: ${userId}, role: ${currentRole}`);
    }
  } catch (err) {
    console.error('Pre-check query failed:', err.message);
    await client.end();
    process.exit(1);
  }

  // Step 2: Run the update
  console.log('\nRunning UPDATE...');
  try {
    const updateResult = await client.query(`
      UPDATE profiles
      SET role = 'admin'
      WHERE id = (
        SELECT id FROM auth.users WHERE lower(email) = lower($1)
      )
      RETURNING id, role
    `, [TARGET_EMAIL]);

    if (updateResult.rows.length === 0) {
      console.log('\n--- RESULT: 0 ROWS UPDATED ---');
      console.log(`No profile row was updated for "${TARGET_EMAIL}".`);
      if (userId) {
        console.log(`The user exists in auth.users (id: ${userId}) but has no matching row in the profiles table.`);
        console.log('The profile may need to be created first (usually happens on first login).');
        console.log('Have the user sign in at least once, then re-run this script.');
      } else {
        console.log(`The email "${TARGET_EMAIL}" must sign up at /register (or via Google) first, then re-run this script.`);
      }
      await client.end();
      process.exit(0);
    }

    const updatedRow = updateResult.rows[0];
    console.log('\n--- RESULT: SUCCESS ---');
    console.log(`  Role transition: "${currentRole}" → "${updatedRow.role}"`);
    console.log(`  User id: ${updatedRow.id}`);
    console.log(`  New role: ${updatedRow.role}`);

    // Step 3: Confirmation re-query
    console.log('\nConfirmation re-query...');
    const confirmResult = await client.query(`
      SELECT p.id, p.role, u.email
      FROM profiles p
      JOIN auth.users u ON u.id = p.id
      WHERE p.id = $1
    `, [updatedRow.id]);

    if (confirmResult.rows.length > 0) {
      const confirmed = confirmResult.rows[0];
      console.log(`  Confirmed — email: ${confirmed.email}, id: ${confirmed.id}, role: ${confirmed.role}`);
      if (confirmed.role === 'admin') {
        console.log('\nAdmin rights successfully granted and confirmed.');
      } else {
        console.error(`\nWARNING: Confirmation shows role="${confirmed.role}", expected "admin".`);
      }
    } else {
      console.warn('  Could not find the row in confirmation query (unexpected).');
    }
  } catch (err) {
    console.error('UPDATE failed:', err.message);
    console.error('Full error:', err);
    await client.end();
    process.exit(1);
  }

  await client.end();
  console.log('\nDone.');
}

grantAdmin().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
