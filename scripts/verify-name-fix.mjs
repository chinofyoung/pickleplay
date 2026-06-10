import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read credentials from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

function getEnvVar(content, key) {
  const match = content.match(new RegExp(`^${key}=(.+)$`, 'm'));
  if (!match) throw new Error(`${key} not found in .env.local`);
  return match[1].trim();
}

const SUPABASE_URL = getEnvVar(envContent, 'NEXT_PUBLIC_SUPABASE_URL');
const SERVICE_ROLE_KEY = getEnvVar(envContent, 'SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const ts = Date.now();
const testUsers = [];

async function getFullName(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .single();
  if (error) throw new Error(`Profile query failed: ${error.message}`);
  return data?.full_name ?? null;
}

async function cleanup(users) {
  console.log('\nCleaning up test users...');
  for (const user of users) {
    try {
      const { error } = await supabase.auth.admin.deleteUser(user.id);
      if (error) {
        console.warn(`  ⚠ Could not delete user ${user.email}: ${error.message}`);
      } else {
        console.log(`  ✓ Deleted ${user.email}`);
      }
    } catch (err) {
      console.warn(`  ⚠ Error deleting ${user.email}: ${err.message}`);
    }
  }
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  // ── Case 1: OAuth-style — only `name` in metadata ──────────────────────────
  console.log('\n── Case 1: OAuth-style (only `name` in user_metadata) ──');
  const email1 = `testpp-oauth-${ts}@gmail.com`;
  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email: email1,
      user_metadata: { name: 'Google Person' },
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    testUsers.push({ id: data.user.id, email: email1 });

    const fullName = await getFullName(data.user.id);
    const expected = 'Google Person';
    if (fullName === expected) {
      console.log(`  PASS — full_name = "${fullName}"`);
      passed++;
    } else {
      console.log(`  FAIL — expected "${expected}", got "${fullName}"`);
      failed++;
    }
  } catch (err) {
    console.log(`  FAIL — Error: ${err.message}`);
    failed++;
  }

  // ── Case 2: full_name wins over name ────────────────────────────────────────
  console.log('\n── Case 2: `full_name` wins over `name` ──');
  const email2 = `testpp-fullname-${ts}@gmail.com`;
  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email: email2,
      user_metadata: { full_name: 'Real Name', name: 'Other' },
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    testUsers.push({ id: data.user.id, email: email2 });

    const fullName = await getFullName(data.user.id);
    const expected = 'Real Name';
    if (fullName === expected) {
      console.log(`  PASS — full_name = "${fullName}"`);
      passed++;
    } else {
      console.log(`  FAIL — expected "${expected}", got "${fullName}"`);
      failed++;
    }
  } catch (err) {
    console.log(`  FAIL — Error: ${err.message}`);
    failed++;
  }

  // ── Case 3: email fallback — empty metadata ─────────────────────────────────
  console.log('\n── Case 3: Email fallback (empty user_metadata) ──');
  const localPart = `testpp-fallback${ts}`;
  const email3 = `${localPart}@gmail.com`;
  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email: email3,
      user_metadata: {},
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    testUsers.push({ id: data.user.id, email: email3 });

    const fullName = await getFullName(data.user.id);
    const expected = localPart;
    if (fullName === expected) {
      console.log(`  PASS — full_name = "${fullName}"`);
      passed++;
    } else {
      console.log(`  FAIL — expected "${expected}", got "${fullName}"`);
      failed++;
    }
  } catch (err) {
    console.log(`  FAIL — Error: ${err.message}`);
    failed++;
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n══════════════════════════════════════`);
  console.log(`Results: ${passed} PASS, ${failed} FAIL`);
  console.log(`══════════════════════════════════════`);

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  await cleanup(testUsers);

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Unexpected error:', err);
  cleanup(testUsers).finally(() => process.exit(1));
});
