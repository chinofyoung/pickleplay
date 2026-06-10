import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read env vars from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

function getEnv(key) {
  const match = envContent.match(new RegExp(`^${key}=(.+)$`, 'm'));
  if (!match) throw new Error(`${key} not found in .env.local`);
  return match[1].trim();
}

const SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL');
const SERVICE_ROLE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY');

const adminHeaders = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'apikey': SERVICE_ROLE_KEY,
};

async function createUser(email, password, metadata) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ email, password, user_metadata: metadata, email_confirm: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Create user failed: ${JSON.stringify(data)}`);
  return data;
}

async function deleteUser(userId) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: adminHeaders,
  });
  if (!res.ok) {
    const data = await res.json();
    console.warn(`  ⚠ Could not delete user ${userId}: ${JSON.stringify(data)}`);
  }
}

async function getProfile(userId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=id,role,full_name`, {
    headers: adminHeaders,
  });
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  return data[0];
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== verify-fixes.mjs: Owner Role via Trigger ===\n');

  const suffix = Date.now();
  const users = [];

  // Test 1: owner role via metadata
  console.log('Test 1: user with role:"owner" in metadata → expect role=owner');
  try {
    const user = await createUser(
      `verify-owner-${suffix}@test.com`,
      'TestPass123!',
      { full_name: 'Owner X', role: 'owner' }
    );
    users.push(user.id);
    await sleep(1500); // allow trigger to fire
    const profile = await getProfile(user.id);
    if (!profile) {
      console.log('  ✗ FAIL: profile not found');
    } else if (profile.role === 'owner') {
      console.log(`  ✓ PASS: role=${profile.role} (expected owner)`);
    } else {
      console.log(`  ✗ FAIL: role=${profile.role} (expected owner)`);
    }
  } catch (err) {
    console.error('  ✗ ERROR:', err.message);
  }

  // Test 2: admin role in metadata → must fall back to player
  console.log('\nTest 2: user with role:"admin" in metadata → expect role=player (admin NOT honored)');
  try {
    const user = await createUser(
      `verify-notadmin-${suffix}@test.com`,
      'TestPass123!',
      { full_name: 'Not Admin', role: 'admin' }
    );
    users.push(user.id);
    await sleep(1500);
    const profile = await getProfile(user.id);
    if (!profile) {
      console.log('  ✗ FAIL: profile not found');
    } else if (profile.role === 'player') {
      console.log(`  ✓ PASS: role=${profile.role} (admin not honored, falls back to player)`);
    } else {
      console.log(`  ✗ FAIL: role=${profile.role} (expected player — admin must NOT be honored)`);
    }
  } catch (err) {
    console.error('  ✗ ERROR:', err.message);
  }

  // Test 3: no role in metadata → player
  console.log('\nTest 3: user with no role in metadata → expect role=player');
  try {
    const user = await createUser(
      `verify-player-${suffix}@test.com`,
      'TestPass123!',
      { full_name: 'Plain Player' }
    );
    users.push(user.id);
    await sleep(1500);
    const profile = await getProfile(user.id);
    if (!profile) {
      console.log('  ✗ FAIL: profile not found');
    } else if (profile.role === 'player') {
      console.log(`  ✓ PASS: role=${profile.role} (expected player)`);
    } else {
      console.log(`  ✗ FAIL: role=${profile.role} (expected player)`);
    }
  } catch (err) {
    console.error('  ✗ ERROR:', err.message);
  }

  // Cleanup
  console.log('\nCleaning up test users...');
  for (const id of users) {
    await deleteUser(id);
    console.log(`  ✓ Deleted user ${id}`);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
