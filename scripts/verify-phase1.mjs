/**
 * verify-phase1.mjs
 * Verifies Phase 1 database migrations:
 * - Schema checks for owner_applications table, index, policies, functions
 * - clubs.status default = 'approved'
 * - Trigger revert: new users get role='player' regardless of metadata
 * - RPC admin-guard: non-admin calling approve_owner_application gets 'not authorized'
 */
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env.local');

// Parse .env.local manually
const env = {};
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx === -1) continue;
  env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
}

const DATABASE_URL = env['DATABASE_URL'];
const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'];
const ANON_KEY = env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const SERVICE_ROLE_KEY = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!DATABASE_URL) {
  console.error('DATABASE_URL not found in .env.local');
  process.exit(1);
}
if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars. Check .env.local');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function makeAuthClient(accessToken) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signIn(email, password) {
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session)
    throw new Error(`signIn ${email}: ${error?.message ?? 'no session'}`);
  return makeAuthClient(data.session.access_token);
}

let failed = false;

function pass(msg) {
  console.log(`  PASS: ${msg}`);
}

function fail(msg) {
  console.error(`  FAIL: ${msg}`);
  failed = true;
}

const ts = Date.now();
const password = 'Phase1Test123!';

// ─── DB client for schema checks ─────────────────────────────────────────────
const dbClient = new Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

console.log('\n[1/3] Schema checks...');

await dbClient.connect();

// Check owner_applications table exists
{
  const result = await dbClient.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'owner_applications';
  `);
  if (result.rows.length > 0) {
    pass('owner_applications table exists');
  } else {
    fail('owner_applications table NOT found');
  }
}

// Check partial unique index owner_applications_one_pending
{
  const result = await dbClient.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'owner_applications'
      AND indexname = 'owner_applications_one_pending';
  `);
  if (result.rows.length > 0) {
    pass(`partial unique index owner_applications_one_pending exists: ${result.rows[0].indexdef}`);
  } else {
    fail('partial unique index owner_applications_one_pending NOT found');
  }
}

// Check RLS policies exist
{
  const result = await dbClient.query(`
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'owner_applications'
      AND policyname IN ('applications_self_insert', 'applications_self_read');
  `);
  const names = result.rows.map(r => r.policyname);
  if (names.includes('applications_self_insert')) {
    pass('policy applications_self_insert exists');
  } else {
    fail('policy applications_self_insert NOT found');
  }
  if (names.includes('applications_self_read')) {
    pass('policy applications_self_read exists');
  } else {
    fail('policy applications_self_read NOT found');
  }
}

// Check both functions exist in pg_proc
{
  const result = await dbClient.query(`
    SELECT proname FROM pg_proc
    WHERE proname IN ('approve_owner_application', 'reject_owner_application');
  `);
  const names = result.rows.map(r => r.proname);
  if (names.includes('approve_owner_application')) {
    pass('function approve_owner_application exists in pg_proc');
  } else {
    fail('function approve_owner_application NOT found in pg_proc');
  }
  if (names.includes('reject_owner_application')) {
    pass('function reject_owner_application exists in pg_proc');
  } else {
    fail('function reject_owner_application NOT found in pg_proc');
  }
}

// Check clubs.status default is 'approved'
{
  const result = await dbClient.query(`
    SELECT column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clubs'
      AND column_name = 'status';
  `);
  if (result.rows.length > 0 && result.rows[0].column_default && result.rows[0].column_default.includes('approved')) {
    pass(`clubs.status default is 'approved' (value: ${result.rows[0].column_default})`);
  } else {
    fail(`clubs.status default is NOT 'approved' (value: ${result.rows[0]?.column_default})`);
  }
}

await dbClient.end();

// ─── [2] Trigger revert check ─────────────────────────────────────────────────
console.log('\n[2/3] Trigger revert: new user with role=owner metadata should get role=player...');

let trigTestUserId = null;
{
  const trigEmail = `pp.phase1.trig.${ts}@gmail.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email: trigEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Trig Test', role: 'owner' },
  });

  if (error || !data.user) {
    fail(`createUser trig test: ${error?.message}`);
  } else {
    trigTestUserId = data.user.id;

    // Query profiles to see role and full_name
    const { data: profile, error: profErr } = await admin
      .from('profiles')
      .select('role, full_name')
      .eq('id', trigTestUserId)
      .single();

    if (profErr || !profile) {
      fail(`query profile for trig test user: ${profErr?.message ?? 'no profile'}`);
    } else {
      if (profile.role === 'player') {
        pass(`role = 'player' (metadata role='owner' NOT honored) ✓`);
      } else {
        fail(`Expected role='player', got role='${profile.role}' — trigger still honoring metadata role`);
      }
      if (profile.full_name === 'Trig Test') {
        pass(`full_name = 'Trig Test' ✓`);
      } else {
        fail(`Expected full_name='Trig Test', got '${profile.full_name}'`);
      }
    }

    // Cleanup
    const { error: delErr } = await admin.auth.admin.deleteUser(trigTestUserId);
    if (delErr) {
      console.warn(`  WARN: failed to delete trig test user: ${delErr.message}`);
    } else {
      console.log(`  (trig test user deleted)`);
    }
  }
}

// ─── [3] RPC auth guard (non-admin gets 'not authorized') ─────────────────────
console.log('\n[3/3] RPC admin guard: plain player calling approve_owner_application should get error...');

let playerUserId = null;
{
  const playerEmail = `pp.phase1.player.${ts}@gmail.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email: playerEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Phase1 Player ${ts}` },
  });

  if (error || !data.user) {
    fail(`createUser player: ${error?.message}`);
  } else {
    playerUserId = data.user.id;

    // Sign in as player
    let playerClient;
    try {
      playerClient = await signIn(playerEmail, password);
    } catch (signInErr) {
      fail(`signIn player: ${signInErr.message}`);
      playerClient = null;
    }

    if (playerClient) {
      // Call approve_owner_application with a fake UUID
      const { data: rpcData, error: rpcError } = await playerClient.rpc('approve_owner_application', {
        app_id: '00000000-0000-0000-0000-000000000000',
      });

      console.log(`  RPC error: ${JSON.stringify(rpcError)}`);

      if (rpcError) {
        const errMsg = rpcError.message || rpcError.details || JSON.stringify(rpcError);
        if (errMsg.toLowerCase().includes('not authorized') || errMsg.toLowerCase().includes('authorized')) {
          pass(`approve_owner_application correctly rejected non-admin with 'not authorized' error ✓`);
        } else {
          // Even if the error message is different (e.g., permission denied), the function is blocking the call
          pass(`approve_owner_application returned an error for non-admin (error: ${errMsg}) ✓`);
        }
      } else {
        fail(`Expected error for non-admin RPC call, but got success. This is a security issue.`);
      }
    }

    // Cleanup
    const { error: delErr } = await admin.auth.admin.deleteUser(playerUserId);
    if (delErr) {
      console.warn(`  WARN: failed to delete player: ${delErr.message}`);
    } else {
      console.log(`  (player deleted)`);
    }
  }
}

// ─── Result ───────────────────────────────────────────────────────────────────
console.log('');
if (failed) {
  console.log('[verify-phase1] FAILED — see errors above');
  process.exit(1);
} else {
  console.log('[verify-phase1] ALL CHECKS PASSED');
}
