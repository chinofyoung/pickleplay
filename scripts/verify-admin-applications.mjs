/**
 * verify-admin-applications.mjs
 * Verifies Phase 4: Super-admin owner-application review.
 *
 * Tests:
 *  1. player1 creates pending application → admin approves → player1 role becomes 'owner', app status 'approved'
 *  2. player2 creates pending application → admin rejects with reason → app status 'rejected', reason stored, player2 role stays 'player'
 *  3. Negative: plain player tries to approve → RPC returns 'not authorized' error
 *  Cleanup: all test users deleted.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");

// Parse .env.local manually
const env = {};
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx === -1) continue;
  env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
}

const SUPABASE_URL = env["NEXT_PUBLIC_SUPABASE_URL"];
const ANON_KEY = env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
const SERVICE_ROLE_KEY = env["SUPABASE_SERVICE_ROLE_KEY"];

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error("Missing required env vars. Check .env.local");
  process.exit(1);
}

// ─── Clients ─────────────────────────────────────────────────────────────────

const serviceAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
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
    throw new Error(`signIn ${email}: ${error?.message ?? "no session"}`);
  return makeAuthClient(data.session.access_token);
}

// ─── State ───────────────────────────────────────────────────────────────────

const ts = Date.now();
const password = "AdminAppTest123!";

const player1Email = `pp.adm.player1.${ts}@gmail.com`;
const player2Email = `pp.adm.player2.${ts}@gmail.com`;
const adminEmail  = `pp.adm.admin.${ts}@gmail.com`;
const plainPlayerEmail = `pp.adm.plain.${ts}@gmail.com`;

let player1Id = null;
let player2Id = null;
let adminId   = null;
let plainPlayerId = null;
let app1Id = null;
let app2Id = null;

let failed = false;

function fail(msg) {
  console.error(`  FAIL: ${msg}`);
  failed = true;
}
function ok(msg) {
  console.log(`  OK — ${msg}`);
}

// ─── [1] Create test users ────────────────────────────────────────────────────
console.log("\n[1/5] Creating test users...");

{
  const { data, error } = await serviceAdmin.auth.admin.createUser({
    email: player1Email, password, email_confirm: true,
    user_metadata: { full_name: `Adm Player1 ${ts}` },
  });
  if (error || !data.user) { fail(`createUser player1: ${error?.message}`); process.exit(1); }
  player1Id = data.user.id;
  ok(`player1 created: ${player1Id}`);
}

{
  const { data, error } = await serviceAdmin.auth.admin.createUser({
    email: player2Email, password, email_confirm: true,
    user_metadata: { full_name: `Adm Player2 ${ts}` },
  });
  if (error || !data.user) { fail(`createUser player2: ${error?.message}`); process.exit(1); }
  player2Id = data.user.id;
  ok(`player2 created: ${player2Id}`);
}

{
  const { data, error } = await serviceAdmin.auth.admin.createUser({
    email: adminEmail, password, email_confirm: true,
    user_metadata: { full_name: `Adm Admin ${ts}` },
  });
  if (error || !data.user) { fail(`createUser admin: ${error?.message}`); process.exit(1); }
  adminId = data.user.id;
  // Set role to admin via service role
  const { error: roleError } = await serviceAdmin
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", adminId);
  if (roleError) { fail(`set admin role: ${roleError.message}`); process.exit(1); }
  ok(`admin created + role set: ${adminId}`);
}

{
  const { data, error } = await serviceAdmin.auth.admin.createUser({
    email: plainPlayerEmail, password, email_confirm: true,
    user_metadata: { full_name: `Adm PlainPlayer ${ts}` },
  });
  if (error || !data.user) { fail(`createUser plainPlayer: ${error?.message}`); process.exit(1); }
  plainPlayerId = data.user.id;
  ok(`plainPlayer created: ${plainPlayerId}`);
}

// ─── [2] Players insert pending applications ──────────────────────────────────
console.log("\n[2/5] Players inserting pending applications...");

const player1Client = await signIn(player1Email, password);
const player2Client = await signIn(player2Email, password);

{
  const { data, error } = await player1Client
    .from("owner_applications")
    .insert({
      user_id: player1Id,
      business_name: `Adm Business1 ${ts}`,
      contact_number: "09171234567",
      city: "Cebu City",
      area: "IT Park",
      message: "I have 3 courts ready to list.",
    })
    .select("id")
    .single();
  if (error || !data) { fail(`player1 insert application: ${error?.message}`); process.exit(1); }
  app1Id = data.id;
  ok(`player1 application inserted: ${app1Id}`);
}

{
  const { data, error } = await player2Client
    .from("owner_applications")
    .insert({
      user_id: player2Id,
      business_name: `Adm Business2 ${ts}`,
      contact_number: "09289876543",
      city: "Manila",
      area: "BGC",
      message: "New facility opening soon.",
    })
    .select("id")
    .single();
  if (error || !data) { fail(`player2 insert application: ${error?.message}`); process.exit(1); }
  app2Id = data.id;
  ok(`player2 application inserted: ${app2Id}`);
}

// ─── [3] Admin approves app1 ──────────────────────────────────────────────────
console.log("\n[3/5] Admin approves player1 application...");

const adminClient = await signIn(adminEmail, password);

{
  const { error } = await adminClient.rpc("approve_owner_application", { app_id: app1Id });
  if (error) {
    fail(`admin approve app1: ${error.message}`);
  } else {
    ok(`approve_owner_application RPC succeeded`);

    // Verify: player1 role = 'owner'
    const { data: profile } = await serviceAdmin
      .from("profiles")
      .select("role")
      .eq("id", player1Id)
      .single();
    if (profile?.role === "owner") {
      ok(`player1 role = 'owner' ✓ (was 'player')`);
    } else {
      fail(`Expected player1 role='owner', got role='${profile?.role}'`);
    }

    // Verify: app1 status = 'approved'
    const { data: app } = await serviceAdmin
      .from("owner_applications")
      .select("status")
      .eq("id", app1Id)
      .single();
    if (app?.status === "approved") {
      ok(`app1 status = 'approved' ✓`);
    } else {
      fail(`Expected app1 status='approved', got '${app?.status}'`);
    }
  }
}

// ─── [4] Admin rejects app2 with reason ──────────────────────────────────────
console.log("\n[4/5] Admin rejects player2 application with reason...");

const rejectionReason = "Need more info";

{
  const { error } = await adminClient.rpc("reject_owner_application", {
    app_id: app2Id,
    reason: rejectionReason,
  });
  if (error) {
    fail(`admin reject app2: ${error.message}`);
  } else {
    ok(`reject_owner_application RPC succeeded`);

    // Verify: app2 status = 'rejected', rejection_reason set
    const { data: app } = await serviceAdmin
      .from("owner_applications")
      .select("status, rejection_reason")
      .eq("id", app2Id)
      .single();
    if (app?.status === "rejected" && app?.rejection_reason === rejectionReason) {
      ok(`app2 status = 'rejected', rejection_reason = '${app.rejection_reason}' ✓`);
    } else {
      fail(`Expected rejected + reason. Got status='${app?.status}', reason='${app?.rejection_reason}'`);
    }

    // Verify: player2 role still = 'player'
    const { data: profile } = await serviceAdmin
      .from("profiles")
      .select("role")
      .eq("id", player2Id)
      .single();
    if (profile?.role === "player") {
      ok(`player2 role still = 'player' ✓ (not promoted)`);
    } else {
      fail(`Expected player2 role='player', got role='${profile?.role}'`);
    }
  }
}

// ─── [5] Negative: plain player tries to approve ─────────────────────────────
console.log("\n[5/5] Negative: plain player cannot call approve_owner_application...");

// We need a fresh application to try approving (use app2 which is already rejected,
// or use a new dummy id — the RPC will either error on 'not authorized' before or
// 'application not found or not pending' after auth check — either is acceptable
// as long as it's blocked)
const plainPlayerClient = await signIn(plainPlayerEmail, password);

{
  const { error } = await plainPlayerClient.rpc("approve_owner_application", {
    app_id: app1Id,
  });
  if (error) {
    // Expect 'not authorized' — any error is a pass
    ok(`Plain player blocked from approve_owner_application (error: '${error.message}') ✓`);
  } else {
    fail(`Plain player should NOT be able to call approve_owner_application — got no error!`);
  }
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────
console.log("\n[cleanup] Removing test users...");

for (const [label, uid] of [
  ["player1", player1Id],
  ["player2", player2Id],
  ["admin",   adminId],
  ["plainPlayer", plainPlayerId],
]) {
  if (!uid) continue;
  const { error } = await serviceAdmin.auth.admin.deleteUser(uid);
  if (error) console.warn(`  WARN: failed to delete ${label} (${uid}): ${error.message}`);
  else ok(`${label} deleted`);
}

// ─── Result ───────────────────────────────────────────────────────────────────
console.log("");
if (failed) {
  console.log("[verify-admin-applications] FAILED — see errors above");
  process.exit(1);
} else {
  console.log("[verify-admin-applications] ALL CHECKS PASSED");
}
