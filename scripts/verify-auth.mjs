/**
 * verify-auth.mjs
 * Verifies Phase 3 Auth & Roles:
 *  1. Signs up a unique test player via anon key
 *  2. Uses service-role key to confirm the DB trigger created a profiles row
 *     with role='player' and correct full_name
 *  3. Cleans up the test auth user via admin API
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");

// Parse .env.local manually (no dotenv dependency needed)
const env = {};
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx === -1) continue;
  const key = trimmed.slice(0, idx).trim();
  const value = trimmed.slice(idx + 1).trim();
  env[key] = value;
}

const SUPABASE_URL = env["NEXT_PUBLIC_SUPABASE_URL"];
const ANON_KEY = env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
const SERVICE_ROLE_KEY = env["SUPABASE_SERVICE_ROLE_KEY"];

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error("Missing required env vars. Check .env.local");
  process.exit(1);
}

const timestamp = Date.now();
const testEmail = `pickleplay.test.${timestamp}@gmail.com`;
const testPassword = "PickleTest123!";
const testFullName = `Test Player ${timestamp}`;

console.log(`\n[verify-auth] Starting verification...`);
console.log(`[verify-auth] Test email: ${testEmail}`);

// --- Step 1: Sign up via anon client ---
const anonClient = createClient(SUPABASE_URL, ANON_KEY);
console.log(`\n[1/3] Signing up test user...`);
const { data: signUpData, error: signUpError } = await anonClient.auth.signUp({
  email: testEmail,
  password: testPassword,
  options: { data: { full_name: testFullName } },
});

if (signUpError) {
  console.error(`FAIL: signUp error: ${signUpError.message}`);
  process.exit(1);
}

const userId = signUpData.user?.id;
if (!userId) {
  console.error("FAIL: No user ID returned from signUp");
  process.exit(1);
}

console.log(`  OK — user created with id: ${userId}`);

// --- Step 2: Check profiles row via service-role client ---
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`\n[2/3] Checking profiles row via service-role client...`);

// Give the trigger a moment to fire (it's synchronous but just in case)
await new Promise((r) => setTimeout(r, 1000));

const { data: profile, error: profileError } = await adminClient
  .from("profiles")
  .select("id, role, full_name")
  .eq("id", userId)
  .single();

if (profileError) {
  console.error(`FAIL: profiles query error: ${profileError.message}`);
  // Still try to clean up
} else if (!profile) {
  console.error(`FAIL: No profiles row found for user ${userId}`);
} else {
  console.log(`  Found profile:`, profile);

  let passed = true;

  if (profile.role !== "player") {
    console.error(`FAIL: Expected role='player', got '${profile.role}'`);
    passed = false;
  } else {
    console.log(`  OK — role = '${profile.role}' (expected 'player')`);
  }

  if (profile.full_name !== testFullName) {
    console.error(
      `FAIL: Expected full_name='${testFullName}', got '${profile.full_name}'`
    );
    passed = false;
  } else {
    console.log(`  OK — full_name = '${profile.full_name}'`);
  }

  if (!passed) {
    process.exitCode = 1;
  }
}

// --- Step 3: Clean up test auth user ---
console.log(`\n[3/3] Cleaning up test user...`);
const { error: deleteError } =
  await adminClient.auth.admin.deleteUser(userId);

if (deleteError) {
  console.error(`WARN: Failed to delete test user: ${deleteError.message}`);
} else {
  console.log(`  OK — test user deleted`);
}

if (process.exitCode === 1) {
  console.log(`\n[verify-auth] FAILED — see errors above`);
} else {
  console.log(`\n[verify-auth] ALL CHECKS PASSED`);
}
