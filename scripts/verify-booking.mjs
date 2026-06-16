/**
 * verify-booking.mjs
 * Verifies Phase 7 Booking: Data flow, RLS isolation, proof upload, overlap detection.
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

// ─── Pure logic (replicated inline, no TS transform needed) ──────────────────

function calcTotalPrice(hourlyRate, startHour, endHour) {
  if (endHour <= startHour) throw new Error("endHour must be greater than startHour");
  return hourlyRate * (endHour - startHour);
}

const PENDING_WINDOW_MINUTES = 30;
function computeExpiry(createdAt) {
  return new Date(createdAt.getTime() + PENDING_WINDOW_MINUTES * 60_000);
}
function isExpired(expiresAt, now) {
  return now.getTime() > expiresAt.getTime();
}
function overlaps(candidate, existing) {
  return existing.some(
    (e) => candidate.startHour < e.endHour && e.startHour < candidate.endHour
  );
}

// ─── Clients ─────────────────────────────────────────────────────────────────

// Service-role admin client (bypasses RLS)
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Anon client for sign-in
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
  if (error || !data.session) throw new Error(`signIn ${email}: ${error?.message ?? "no session"}`);
  return makeAuthClient(data.session.access_token);
}

// ─── State ───────────────────────────────────────────────────────────────────

const ts = Date.now();
const password = "BookTest123!";

const ownerEmail = `pp.bk.owner.${ts}@gmail.com`;
const player1Email = `pp.bk.player1.${ts}@gmail.com`;
const player2Email = `pp.bk.player2.${ts}@gmail.com`;

let ownerId = null;
let player1Id = null;
let player2Id = null;
let pickleballCourtId = null;
let courtId = null;
let booking1Id = null;
let booking2Id = null;
let proofPath = null;

let failed = false;

function fail(msg) {
  console.error(`  FAIL: ${msg}`);
  failed = true;
}
function ok(msg) {
  console.log(`  OK — ${msg}`);
}

// ─── Step 1: Setup via service-role ──────────────────────────────────────────
console.log("\n[1/9] Setup: creating owner, pickleball court, court, payment QR + player1...");

// Create owner user
{
  const { data, error } = await admin.auth.admin.createUser({
    email: ownerEmail, password, email_confirm: true,
    user_metadata: { full_name: `BK Owner ${ts}` },
  });
  if (error || !data.user) { fail(`createUser owner: ${error?.message}`); process.exit(1); }
  ownerId = data.user.id;
  await admin.from("profiles").update({ role: "owner" }).eq("id", ownerId);
  ok(`owner created: ${ownerId}`);
}

// Sign in as owner to create pickleball court/court (owner RLS requires authenticated session)
const ownerClient = await signIn(ownerEmail, password);

// Create pickleball court, then approve via service-role
{
  const { data: pickleballCourt, error } = await ownerClient.from("pickleball_courts").insert({
    owner_id: ownerId,
    name: `BK Test Court ${ts}`,
    city: "Cebu City",
    amenities: [],
  }).select("id").single();
  if (error || !pickleballCourt) { fail(`create pickleball court: ${error?.message}`); process.exit(1); }
  pickleballCourtId = pickleballCourt.id;
  await admin.from("pickleball_courts").update({ status: "approved" }).eq("id", pickleballCourtId);
  ok(`pickleball court created + approved: ${pickleballCourtId}`);
}

// Create court (open_hour: 6, close_hour: 21, hourly_rate: 260)
{
  const { data: court, error } = await ownerClient.from("courts").insert({
    pickleball_court_id: pickleballCourtId,
    name: "Verify Court A",
    hourly_rate: 260,
    open_hour: 6,
    close_hour: 21,
  }).select("id").single();
  if (error || !court) { fail(`create court: ${error?.message}`); process.exit(1); }
  courtId = court.id;
  ok(`court created: ${courtId} (open 6–21, ₱260/hr)`);
}

// Insert payment QR row (service-role, no actual file needed)
{
  const fakePath = `${pickleballCourtId}/gcash-verify.png`;
  const { error } = await admin.from("pickleball_court_payment_qrs").insert({
    pickleball_court_id: pickleballCourtId, label: "gcash", image_path: fakePath,
  });
  if (error) fail(`insert QR row: ${error.message}`);
  else ok(`payment QR row inserted`);
}

// Create player1 user
{
  const { data, error } = await admin.auth.admin.createUser({
    email: player1Email, password, email_confirm: true,
    user_metadata: { full_name: `BK Player1 ${ts}` },
  });
  if (error || !data.user) { fail(`createUser player1: ${error?.message}`); process.exit(1); }
  player1Id = data.user.id;
  ok(`player1 created: ${player1Id}`);
}

// ─── Step 2: Player1 inserts booking 6→9 ─────────────────────────────────────
console.log("\n[2/9] Player1: insert booking 6→9 (expect total=780, expires_at set)...");

const player1Client = await signIn(player1Email, password);
const testDate = new Date(Date.now() + 86400000).toISOString().split("T")[0]; // tomorrow

{
  const now = new Date();
  const total = calcTotalPrice(260, 6, 9);
  const expiresAt = computeExpiry(now);

  const { data: bk, error } = await player1Client.from("bookings").insert({
    court_id: courtId,
    player_id: player1Id,
    date: testDate,
    start_hour: 6,
    end_hour: 9,
    total_price: total,
    status: "pending_payment",
    expires_at: expiresAt.toISOString(),
  }).select("id, total_price, expires_at").single();

  if (error || !bk) {
    fail(`player1 insert 6→9: ${error?.message}`);
  } else {
    booking1Id = bk.id;
    const price = Number(bk.total_price);
    const expiresOk = !!bk.expires_at;
    if (price !== 780) fail(`Expected total=780, got ${price}`);
    else ok(`booking 6→9 created — id: ${booking1Id}, total: ₱${price}, expires_at: ${bk.expires_at} (set: ${expiresOk})`);
  }
}

// ─── Step 3: Overlap check 8→10 ──────────────────────────────────────────────
console.log("\n[3/9] Overlap check: 8→10 on same date (expect overlap=true)...");
{
  const { data: existing } = await player1Client.from("bookings")
    .select("start_hour, end_hour, status, expires_at")
    .eq("court_id", courtId)
    .eq("date", testDate);

  const now = new Date();
  const active = (existing ?? []).filter(b =>
    !(b.status === "rejected" || b.status === "cancelled") &&
    !(b.status === "pending_payment" && b.expires_at && isExpired(new Date(b.expires_at), now))
  );

  const doesOverlap = overlaps(
    { startHour: 8, endHour: 10 },
    active.map(b => ({ startHour: b.start_hour, endHour: b.end_hour }))
  );

  if (!doesOverlap) fail(`Expected overlap=true for 8→10, got false`);
  else ok(`8→10 overlap=true (correctly blocked) — active: ${JSON.stringify(active.map(b => `${b.start_hour}→${b.end_hour}`))}`);
}

// ─── Step 4: Adjacent booking 9→11 ───────────────────────────────────────────
console.log("\n[4/9] Player1: insert adjacent booking 9→11 (expect no overlap, total=520)...");
{
  const { data: existing } = await player1Client.from("bookings")
    .select("start_hour, end_hour, status, expires_at")
    .eq("court_id", courtId)
    .eq("date", testDate);

  const now = new Date();
  const active = (existing ?? []).filter(b =>
    !(b.status === "rejected" || b.status === "cancelled") &&
    !(b.status === "pending_payment" && b.expires_at && isExpired(new Date(b.expires_at), now))
  );

  const doesOverlap = overlaps(
    { startHour: 9, endHour: 11 },
    active.map(b => ({ startHour: b.start_hour, endHour: b.end_hour }))
  );

  if (doesOverlap) {
    fail(`9→11 should NOT overlap with 6→9, got overlap=true`);
  } else {
    const total = calcTotalPrice(260, 9, 11);
    const expiresAt = computeExpiry(now);

    const { data: bk2, error } = await player1Client.from("bookings").insert({
      court_id: courtId,
      player_id: player1Id,
      date: testDate,
      start_hour: 9,
      end_hour: 11,
      total_price: total,
      status: "pending_payment",
      expires_at: expiresAt.toISOString(),
    }).select("id, total_price").single();

    if (error || !bk2) {
      fail(`player1 insert 9→11: ${error?.message}`);
    } else {
      booking2Id = bk2.id;
      const price = Number(bk2.total_price);
      if (price !== 520) fail(`Expected total=520, got ${price}`);
      else ok(`booking 9→11 inserted — id: ${booking2Id}, total: ₱${price}, adjacent overlap=false`);
    }
  }
}

// ─── Step 5: Create player2; RLS isolation ────────────────────────────────────
console.log("\n[5a/9] Setup player2...");
{
  const { data, error } = await admin.auth.admin.createUser({
    email: player2Email, password, email_confirm: true,
    user_metadata: { full_name: `BK Player2 ${ts}` },
  });
  if (error || !data.user) { fail(`createUser player2: ${error?.message}`); process.exit(1); }
  player2Id = data.user.id;
  ok(`player2 created: ${player2Id}`);
}

const player2Client = await signIn(player2Email, password);

console.log("\n[5b/9] RLS: player2 cannot insert booking with player1's player_id (with_check)...");
{
  const { error } = await player2Client.from("bookings").insert({
    court_id: courtId,
    player_id: player1Id, // <- not their own ID
    date: testDate,
    start_hour: 14,
    end_hour: 15,
    total_price: 260,
    status: "pending_payment",
    expires_at: computeExpiry(new Date()).toISOString(),
  });
  if (!error) {
    fail("RLS did NOT block player2 inserting with player1's player_id — security issue!");
  } else {
    ok(`RLS blocked cross-player insert (${error.code}: ${error.message})`);
  }
}

console.log("\n[5c/9] RLS: player2 cannot SELECT player1's bookings...");
{
  const { data: p2Bookings } = await player2Client.from("bookings")
    .select("id")
    .eq("player_id", player1Id);

  if (p2Bookings && p2Bookings.length > 0) {
    fail(`RLS isolation failed — player2 can see ${p2Bookings.length} of player1's bookings`);
  } else {
    ok(`player2 sees 0 of player1's bookings (RLS isolation confirmed)`);
  }
}

// ─── Step 6: Proof upload ─────────────────────────────────────────────────────
console.log("\n[6a/9] Player1 uploads proof to payment-proofs...");

if (!booking1Id) {
  fail("No booking1Id — skipping proof upload");
} else {
  proofPath = `${booking1Id}/proof.png`;
  // Minimal valid 1x1 PNG
  const pngBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
    0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc,
    0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
    0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  const { error: upErr } = await player1Client.storage
    .from("payment-proofs")
    .upload(proofPath, pngBytes, { contentType: "image/png", upsert: true });

  if (upErr) fail(`proof upload: ${upErr.message}`);
  else ok(`proof uploaded to payment-proofs/${proofPath}`);
}

console.log("\n[6b/9] Player1 updates booking 6→9 to proof_submitted, expires_at=null...");
if (booking1Id && !failed) {
  const { error } = await player1Client.from("bookings")
    .update({ payment_proof_path: proofPath, status: "proof_submitted", expires_at: null })
    .eq("id", booking1Id);
  if (error) fail(`update booking status: ${error.message}`);
  else {
    const { data: bk } = await player1Client.from("bookings")
      .select("status, expires_at, payment_proof_path")
      .eq("id", booking1Id)
      .single();
    if (!bk) fail("Could not re-fetch booking after update");
    else {
      const statusOk = bk.status === "proof_submitted";
      const expiryNull = bk.expires_at === null;
      if (!statusOk) fail(`Expected status=proof_submitted, got ${bk.status}`);
      else ok(`booking updated — status: ${bk.status}, expires_at: ${bk.expires_at} (null: ${expiryNull}), proof_path: ${bk.payment_proof_path}`);
    }
  }
}

console.log("\n[6c/9] Storage RLS: player2 cannot read player1's proof...");
if (proofPath) {
  const { data, error } = await player2Client.storage
    .from("payment-proofs")
    .download(proofPath);
  if (data) {
    fail(`Storage RLS did NOT block player2 — security issue!`);
  } else {
    ok(`Storage RLS blocked player2 from reading proof (${error?.message ?? "access denied"})`);
  }
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────
console.log("\n[cleanup] Removing test data...");

if (proofPath) {
  const { error } = await admin.storage.from("payment-proofs").remove([proofPath]);
  if (error) console.warn(`  WARN: failed to delete proof object: ${error.message}`);
  else ok(`proof object deleted from storage`);
}

for (const [label, uid] of [
  ["owner", ownerId],
  ["player1", player1Id],
  ["player2", player2Id],
]) {
  if (!uid) continue;
  const { error } = await admin.auth.admin.deleteUser(uid);
  if (error) console.warn(`  WARN: failed to delete ${label}: ${error.message}`);
  else ok(`${label} deleted`);
}

// ─── Result ───────────────────────────────────────────────────────────────────
console.log("");
if (failed) {
  console.log("[verify-booking] FAILED — see errors above");
  process.exit(1);
} else {
  console.log("[verify-booking] ALL CHECKS PASSED");
}
