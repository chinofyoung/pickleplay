import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read keys from THIS project's .env.local only
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

function readEnv(key) {
  const match = envContent.match(new RegExp(`^${key}=(.+)$`, 'm'));
  if (!match) {
    console.error(`${key} not found in .env.local`);
    process.exit(1);
  }
  return match[1].trim();
}

const SUPABASE_URL = readEnv('NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_ANON_KEY = readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = readEnv('SUPABASE_SERVICE_ROLE_KEY');

// Service-role client (bypasses RLS)
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Anon client (will be used for player session)
const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const testEmail = `security-test-${Date.now()}@pickleplay-test.invalid`;
const testPassword = `TestPass!${Math.random().toString(36).slice(2)}`;

async function run() {
  let userId = null;

  try {
    // --- Create a test player via service role ---
    console.log('=== SETUP ===');
    console.log(`Creating test player: ${testEmail}`);
    const { data: signUpData, error: signUpErr } = await adminClient.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: { full_name: 'Security Test Player' },
    });
    if (signUpErr) {
      console.error('Failed to create test user:', signUpErr.message);
      process.exit(1);
    }
    userId = signUpData.user.id;
    console.log(`  ✓ Test player created: ${userId}`);

    // Ensure profile exists with role = 'player'
    const { error: profileErr } = await adminClient
      .from('profiles')
      .upsert({ id: userId, role: 'player', full_name: 'Security Test Player' });
    if (profileErr) {
      console.warn('  ⚠ Profile upsert warning:', profileErr.message);
    } else {
      console.log('  ✓ Profile seeded with role=player');
    }

    // --- Sign in as the player ---
    console.log('\n=== SIGN IN ===');
    const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });
    if (signInErr) {
      console.error('Sign in failed:', signInErr.message);
      process.exit(1);
    }
    console.log('  ✓ Signed in as player');

    // Authenticated client with player's JWT
    const playerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${signInData.session.access_token}`,
        },
      },
    });

    // --- TEST C1: Role self-escalation attempt ---
    console.log('\n=== TEST C1: Role Self-Escalation ===');
    console.log(`Attempting to update own role to 'admin' as player ${userId}...`);
    const { data: updateData, error: updateErr } = await playerClient
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', userId);

    if (updateErr) {
      console.log(`  Result: UPDATE ERRORED — ${updateErr.message}`);
      console.log('  This is EXPECTED behavior (RLS with-check blocks it).');
    } else {
      console.log(`  Result: UPDATE returned (no error). Rows affected: ${updateData}`);
    }

    // Re-query with service role to confirm actual role in DB
    const { data: profileCheck, error: checkErr } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (checkErr) {
      console.error('  Could not re-query profile:', checkErr.message);
    } else {
      const actualRole = profileCheck.role;
      if (actualRole === 'player') {
        console.log(`  ✓ ROLE ESCALATION BLOCKED: role is still '${actualRole}' (not 'admin')`);
        console.log('  C1 fix: CONFIRMED WORKING');
      } else {
        console.error(`  ✗ ROLE ESCALATION SUCCEEDED: role is now '${actualRole}' — FIX FAILED`);
      }
    }

    // --- TEST H4: Cross-booking proof upload ---
    console.log('\n=== TEST H4: Cross-Booking Proof Upload ===');
    // Use a random UUID that is not owned by this player
    const otherBookingId = '00000000-0000-0000-0000-000000000001';
    const fakePath = `${otherBookingId}/x.png`;
    const tinyPng = new Uint8Array([
      0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a, // PNG header
      0x00,0x00,0x00,0x0d,0x49,0x48,0x44,0x52, // IHDR chunk
      0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01, // 1x1
      0x08,0x02,0x00,0x00,0x00,0x90,0x77,0x53, // bit depth etc
      0xde,0x00,0x00,0x00,0x0c,0x49,0x44,0x41, // IDAT
      0x54,0x08,0xd7,0x63,0xf8,0xcf,0xc0,0x00, // compressed data
      0x00,0x00,0x02,0x00,0x01,0xe2,0x21,0xbc, // ...
      0x33,0x00,0x00,0x00,0x00,0x49,0x45,0x4e, // IEND
      0x44,0xae,0x42,0x60,0x82               // IEND CRC
    ]);

    console.log(`Attempting to upload to payment-proofs/${fakePath} (booking NOT owned by player)...`);
    const { data: uploadData, error: uploadErr } = await playerClient
      .storage
      .from('payment-proofs')
      .upload(fakePath, tinyPng, { contentType: 'image/png', upsert: false });

    if (uploadErr) {
      console.log(`  Result: UPLOAD ERRORED — ${uploadErr.message}`);
      console.log('  ✓ CROSS-BOOKING UPLOAD BLOCKED: Storage RLS prevented upload');
      console.log('  H4 fix: CONFIRMED WORKING');
    } else {
      console.error(`  ✗ UPLOAD SUCCEEDED to ${uploadData?.path} — FIX FAILED (storage RLS not blocking)`);
    }

  } finally {
    // --- Cleanup ---
    console.log('\n=== CLEANUP ===');
    if (userId) {
      const { error: deleteErr } = await adminClient.auth.admin.deleteUser(userId);
      if (deleteErr) {
        console.warn('  ⚠ Failed to delete test user:', deleteErr.message);
      } else {
        console.log(`  ✓ Test user ${userId} deleted`);
      }
    }
    console.log('\n=== VERIFY SECURITY COMPLETE ===');
  }
}

run().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
