/**
 * verify-application.mjs
 * Verifies Phase 3 owner_applications table:
 *  1. Create two confirmed players via admin API
 *  2. Sign in as player 1 (authenticated anon client)
 *  3. Insert an owner_application (status defaults pending) → success
 *  4. Insert a SECOND application for the same user (still pending) → expect blocked by partial unique index (23505)
 *  5. Sign in as player 2; attempt to insert application with user_id = player 1's id → expect RLS block
 *  6. Clean up both users
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");

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

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const timestamp = Date.now();
const player1Email = `pickleplay.apptest1.${timestamp}@gmail.com`;
const player2Email = `pickleplay.apptest2.${timestamp}@gmail.com`;
const testPassword = "PickleTest123!";

console.log("\n[verify-application] Starting verification...");
console.log(`[verify-application] Player 1: ${player1Email}`);
console.log(`[verify-application] Player 2: ${player2Email}`);

let player1Id = null;
let player2Id = null;
let overallPassed = true;

// --- Step 1: Create player 1 via admin API (email_confirm: true) ---
console.log("\n[1/6] Creating player 1 via admin API (email pre-confirmed)...");
const { data: adminUser1, error: createErr1 } = await adminClient.auth.admin.createUser({
  email: player1Email,
  password: testPassword,
  email_confirm: true,
  user_metadata: { full_name: "Test Player 1" },
});
if (createErr1 || !adminUser1.user) {
  console.error(`FAIL: Player 1 creation error: ${createErr1?.message}`);
  process.exit(1);
}
player1Id = adminUser1.user.id;
console.log(`  OK — player 1 created: ${player1Id}`);

// Give DB trigger time to create profiles row
await new Promise((r) => setTimeout(r, 1000));

// --- Sign in as player 1 with anon client ---
const anonClient1 = createClient(SUPABASE_URL, ANON_KEY);
const { error: signInErr1 } = await anonClient1.auth.signInWithPassword({
  email: player1Email,
  password: testPassword,
});
if (signInErr1) {
  console.error(`FAIL: Player 1 sign in error: ${signInErr1.message}`);
  process.exit(1);
}
console.log(`  OK — player 1 signed in`);

// --- Step 2: Insert first owner_application as player 1 ---
console.log("\n[2/6] Inserting first owner application as player 1 (should succeed)...");
const { data: app1, error: appErr1 } = await anonClient1.from("owner_applications").insert({
  user_id: player1Id,
  business_name: "Test Court One",
  contact_number: "+63 917 000 0001",
  city: "Manila",
}).select().single();

if (appErr1) {
  console.error(`FAIL: First application insert failed: ${appErr1.message} (code: ${appErr1.code})`);
  overallPassed = false;
} else {
  console.log(`  OK — first application inserted, id: ${app1.id}, status: ${app1.status}`);
}

// --- Step 3: Insert SECOND application for same user (still pending) → expect 23505 ---
console.log("\n[3/6] Inserting second owner application for same player 1 (should be blocked by partial unique index)...");
const { data: app2, error: appErr2 } = await anonClient1.from("owner_applications").insert({
  user_id: player1Id,
  business_name: "Test Court Two",
  contact_number: "+63 917 000 0002",
  city: "Cebu",
}).select().single();

if (appErr2) {
  console.log(`  OK — second insert blocked. Code: ${appErr2.code}, Message: ${appErr2.message}`);
  if (appErr2.code === "23505") {
    console.log(`  OK — confirmed unique constraint violation (23505) as expected`);
  } else {
    console.warn(`  WARN — blocked but with unexpected code: ${appErr2.code} (expected 23505)`);
  }
} else {
  console.error(`  FAIL: Second application insert should have been blocked but succeeded (id: ${app2?.id})`);
  overallPassed = false;
}

// --- Step 4: Create player 2 via admin API ---
console.log("\n[4/6] Creating player 2 via admin API (email pre-confirmed)...");
const { data: adminUser2, error: createErr2 } = await adminClient.auth.admin.createUser({
  email: player2Email,
  password: testPassword,
  email_confirm: true,
  user_metadata: { full_name: "Test Player 2" },
});
if (createErr2 || !adminUser2.user) {
  console.error(`FAIL: Player 2 creation error: ${createErr2?.message}`);
  overallPassed = false;
} else {
  player2Id = adminUser2.user.id;
  console.log(`  OK — player 2 created: ${player2Id}`);

  await new Promise((r) => setTimeout(r, 500));

  // Sign in as player 2
  const anonClient2 = createClient(SUPABASE_URL, ANON_KEY);
  const { error: signInErr2 } = await anonClient2.auth.signInWithPassword({
    email: player2Email,
    password: testPassword,
  });
  if (signInErr2) {
    console.error(`FAIL: Player 2 sign in error: ${signInErr2.message}`);
    overallPassed = false;
  } else {
    console.log(`  OK — player 2 signed in`);

    // --- Step 5: Attempt RLS violation — player 2 inserts with player 1's user_id ---
    console.log("\n[5/6] Player 2 attempts to insert with player 1's user_id (should be blocked by RLS)...");
    const { data: rlsApp, error: rlsErr } = await anonClient2.from("owner_applications").insert({
      user_id: player1Id,  // deliberately wrong user_id
      business_name: "Spoofed Court",
      contact_number: "+63 917 999 9999",
      city: "Davao",
    }).select().single();

    if (rlsErr) {
      console.log(`  OK — RLS blocked the insert. Code: ${rlsErr.code}, Message: ${rlsErr.message}`);
    } else {
      console.error(`  FAIL: RLS should have blocked inserting with another user's user_id, but it succeeded (id: ${rlsApp?.id})`);
      overallPassed = false;
    }
  }
}

// --- Step 6: Clean up both users ---
console.log("\n[6/6] Cleaning up test users...");
if (player1Id) {
  const { error: del1 } = await adminClient.auth.admin.deleteUser(player1Id);
  if (del1) {
    console.warn(`  WARN: Failed to delete player 1: ${del1.message}`);
  } else {
    console.log(`  OK — player 1 deleted`);
  }
}
if (player2Id) {
  const { error: del2 } = await adminClient.auth.admin.deleteUser(player2Id);
  if (del2) {
    console.warn(`  WARN: Failed to delete player 2: ${del2.message}`);
  } else {
    console.log(`  OK — player 2 deleted`);
  }
}

if (overallPassed) {
  console.log("\n[verify-application] ALL CHECKS PASSED");
} else {
  console.error("\n[verify-application] FAILED — see errors above");
  process.exit(1);
}
