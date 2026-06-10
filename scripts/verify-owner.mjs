/**
 * verify-owner.mjs
 * Verifies Phase 4 Owner: Clubs, Courts, Payment QRs
 *
 * Checks:
 *  1. Owner1 can sign up and get role='owner' via service-role update
 *  2. Owner1 can create a club (status='pending')
 *  3. Owner1 can add a court to their club
 *  4. Owner1 can insert a club_payment_qrs row
 *  5. Owner2 CANNOT insert a court into Owner1's club (RLS blocks it)
 *  6. Clean up both test users
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

const ts = Date.now();
const owner1Email = `pp.owner1.${ts}@gmail.com`;
const owner2Email = `pp.owner2.${ts}@gmail.com`;
const password = "OwnerTest123!";

let owner1Id = null;
let owner2Id = null;
let clubId = null;
let failed = false;

function fail(msg) {
  console.error(`  FAIL: ${msg}`);
  failed = true;
}

function ok(msg) {
  console.log(`  OK — ${msg}`);
}

// Admin client (service role)
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Anon client (for sign-up / sign-in)
const anon = createClient(SUPABASE_URL, ANON_KEY);

// ─── Step 1: Create Owner 1 via admin API (bypasses email rate limits) ────────
console.log("\n[1/6] Creating Owner 1...");
{
  const { data, error } = await admin.auth.admin.createUser({
    email: owner1Email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Owner One ${ts}` },
  });
  if (error || !data.user) {
    fail(`createUser owner1: ${error?.message ?? "no user returned"}`);
    process.exit(1);
  }
  owner1Id = data.user.id;
  ok(`owner1 created — id: ${owner1Id}`);

  // Set role to 'owner' via service role
  const { error: roleErr } = await admin
    .from("profiles")
    .update({ role: "owner" })
    .eq("id", owner1Id);
  if (roleErr) fail(`set owner1 role: ${roleErr.message}`);
  else ok(`owner1 role set to 'owner'`);
}

// ─── Step 2: Create Owner 2 via admin API ────────────────────────────────────
console.log("\n[2/6] Creating Owner 2...");
{
  const { data, error } = await admin.auth.admin.createUser({
    email: owner2Email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Owner Two ${ts}` },
  });
  if (error || !data.user) {
    fail(`createUser owner2: ${error?.message ?? "no user returned"}`);
    process.exit(1);
  }
  owner2Id = data.user.id;
  ok(`owner2 created — id: ${owner2Id}`);

  const { error: roleErr } = await admin
    .from("profiles")
    .update({ role: "owner" })
    .eq("id", owner2Id);
  if (roleErr) fail(`set owner2 role: ${roleErr.message}`);
  else ok(`owner2 role set to 'owner'`);
}

// ─── Step 3: Owner1 signs in and creates a club ───────────────────────────────
console.log("\n[3/6] Owner1: sign in and create club...");
{
  const { data: signInData, error: signInErr } =
    await anon.auth.signInWithPassword({ email: owner1Email, password });
  if (signInErr || !signInData.session) {
    fail(`owner1 signIn: ${signInErr?.message ?? "no session"}`);
    process.exit(1);
  }
  ok(`owner1 signed in`);

  // Authenticated client for owner1
  const owner1Client = createClient(SUPABASE_URL, ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${signInData.session.access_token}`,
      },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: club, error: clubErr } = await owner1Client
    .from("clubs")
    .insert({
      owner_id: owner1Id,
      name: `Test Club ${ts}`,
      city: "Cebu City",
      amenities: [],
    })
    .select("id, status")
    .single();

  if (clubErr || !club) {
    fail(`owner1 create club: ${clubErr?.message ?? "no club returned"}`);
    process.exit(1);
  }
  clubId = club.id;

  if (club.status !== "pending") {
    fail(`Expected status='pending', got '${club.status}'`);
  } else {
    ok(`club created with id: ${clubId} and status='pending'`);
  }

  // ─── Step 4: Owner1 adds a court ──────────────────────────────────────────
  console.log("\n[4/6] Owner1: add court...");
  const { error: courtErr } = await owner1Client.from("courts").insert({
    club_id: clubId,
    name: "Court A",
    hourly_rate: 500,
    open_hour: 6,
    close_hour: 22,
  });

  if (courtErr) fail(`owner1 add court: ${courtErr.message}`);
  else ok(`court added to club`);

  // ─── Step 5: Owner1 inserts a payment QR row (no real file, just DB row) ──
  console.log("\n[5/6] Owner1: insert payment QR row...");
  const fakePath = `${clubId}/gcash-test.png`;
  const { error: qrErr } = await owner1Client
    .from("club_payment_qrs")
    .insert({ club_id: clubId, label: "gcash", image_path: fakePath });

  if (qrErr) fail(`owner1 insert QR row: ${qrErr.message}`);
  else ok(`QR row inserted`);
}

// ─── Step 6: Owner2 tries to insert a court into Owner1's club (must fail) ───
console.log("\n[6/6] Owner2: attempt cross-owner court insert (must be blocked)...");
{
  const { data: signInData, error: signInErr } =
    await anon.auth.signInWithPassword({ email: owner2Email, password });
  if (signInErr || !signInData.session) {
    fail(`owner2 signIn: ${signInErr?.message ?? "no session"}`);
  } else {
    ok(`owner2 signed in`);

    const owner2Client = createClient(SUPABASE_URL, ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${signInData.session.access_token}`,
        },
      },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: crossErr } = await owner2Client.from("courts").insert({
      club_id: clubId,
      name: "Rogue Court",
      hourly_rate: 999,
      open_hour: 0,
      close_hour: 24,
    });

    if (!crossErr) {
      fail(
        "RLS did NOT block owner2 from inserting into owner1's club — security issue!"
      );
    } else {
      ok(
        `RLS blocked cross-owner court insert as expected (${crossErr.code}: ${crossErr.message})`
      );
    }
  }
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────
console.log("\n[cleanup] Deleting test users...");
for (const [label, uid] of [
  ["owner1", owner1Id],
  ["owner2", owner2Id],
]) {
  if (!uid) continue;
  const { error } = await admin.auth.admin.deleteUser(uid);
  if (error) console.warn(`  WARN: failed to delete ${label}: ${error.message}`);
  else ok(`${label} deleted`);
}

// ─── Result ───────────────────────────────────────────────────────────────────
if (failed) {
  console.log("\n[verify-owner] FAILED — see errors above");
  process.exit(1);
} else {
  console.log("\n[verify-owner] ALL CHECKS PASSED");
}
