/**
 * verify-overlap-constraint.mjs
 * Verifies the bookings_no_overlap DB exclusion constraint (migration 0007).
 *
 * Cases:
 *   A) Insert booking A 10→13 (confirmed) → success
 *   B) Insert booking B 12→14 (overlaps A) → DB blocks with 23P01
 *   C) Insert booking C 13→15 (adjacent, no overlap) → success
 *   D) Set A to cancelled; insert booking D 10→13 (same slot) → success
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");

// Parse .env.local
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

// Service-role admin client (bypasses RLS for setup)
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
  if (error || !data.session)
    throw new Error(`signIn ${email}: ${error?.message ?? "no session"}`);
  return makeAuthClient(data.session.access_token);
}

// ── State ────────────────────────────────────────────────────────────────────

const ts = Date.now();
const password = "OvlTest123!";
const ownerEmail = `pp.ovl.owner.${ts}@test.com`;
const playerEmail = `pp.ovl.player.${ts}@test.com`;

let ownerId = null;
let playerId = null;
let clubId = null;
let courtId = null;
let bookingAId = null;
let bookingCId = null;

let failCount = 0;

function pass(label, detail = "") {
  console.log(`  PASS — ${label}${detail ? " | " + detail : ""}`);
}
function fail(label, detail = "") {
  console.error(`  FAIL — ${label}${detail ? " | " + detail : ""}`);
  failCount++;
}

// Use a future date to avoid past-date constraints
const testDate = new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];

// ── Setup ─────────────────────────────────────────────────────────────────────

console.log("\n[Setup] Creating owner, club, court, player...");

// Create owner
{
  const { data, error } = await admin.auth.admin.createUser({
    email: ownerEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: `OVL Owner ${ts}` },
  });
  if (error || !data.user) {
    console.error("FATAL: createUser owner:", error?.message);
    process.exit(1);
  }
  ownerId = data.user.id;
  await admin.from("profiles").update({ role: "owner" }).eq("id", ownerId);
  console.log(`  owner: ${ownerId}`);
}

// Sign in as owner to create club/court
const ownerClient = await signIn(ownerEmail, password);

// Create club
{
  const { data: club, error } = await ownerClient
    .from("clubs")
    .insert({ owner_id: ownerId, name: `OVL Club ${ts}`, city: "Cebu City", amenities: [] })
    .select("id")
    .single();
  if (error || !club) {
    console.error("FATAL: create club:", error?.message);
    process.exit(1);
  }
  clubId = club.id;
  await admin.from("clubs").update({ status: "approved" }).eq("id", clubId);
  console.log(`  club: ${clubId}`);
}

// Create court (open 6–21, ₱260/hr)
{
  const { data: court, error } = await ownerClient
    .from("courts")
    .insert({ club_id: clubId, name: "OVL Court", hourly_rate: 260, open_hour: 6, close_hour: 21 })
    .select("id")
    .single();
  if (error || !court) {
    console.error("FATAL: create court:", error?.message);
    process.exit(1);
  }
  courtId = court.id;
  console.log(`  court: ${courtId} (6–21, ₱260)`);
}

// Create player
{
  const { data, error } = await admin.auth.admin.createUser({
    email: playerEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: `OVL Player ${ts}` },
  });
  if (error || !data.user) {
    console.error("FATAL: createUser player:", error?.message);
    process.exit(1);
  }
  playerId = data.user.id;
  console.log(`  player: ${playerId}`);
}

const playerClient = await signIn(playerEmail, password);

// ── Case A: Insert booking A 10→13 (confirmed) → success ─────────────────────

console.log("\n[Case A] Insert booking A 10→13 with status=confirmed — expect SUCCESS...");
{
  const { data, error } = await admin
    .from("bookings")
    .insert({
      court_id: courtId,
      player_id: playerId,
      date: testDate,
      start_hour: 10,
      end_hour: 13,
      total_price: 780,
      status: "confirmed",
    })
    .select("id")
    .single();

  if (error) {
    fail("Case A: booking A 10→13 insert", `error code=${error.code} msg=${error.message}`);
  } else {
    bookingAId = data.id;
    pass("Case A: booking A 10→13 inserted", `id=${bookingAId}`);
  }
}

// ── Case B: Insert booking B 12→14 (overlaps A) → DB rejects with 23P01 ──────

console.log("\n[Case B] Insert booking B 12→14 (overlaps A 10→13) — expect DB REJECTION code=23P01...");
{
  const { data, error } = await admin
    .from("bookings")
    .insert({
      court_id: courtId,
      player_id: playerId,
      date: testDate,
      start_hour: 12,
      end_hour: 14,
      total_price: 520,
      status: "pending_payment",
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    })
    .select("id")
    .single();

  if (!error) {
    fail(
      "Case B: booking B 12→14 was NOT blocked by DB constraint",
      `inserted id=${data?.id} — exclusion constraint not working!`
    );
  } else {
    const code = error.code ?? "unknown";
    if (code === "23P01") {
      pass("Case B: DB blocked overlapping booking 12→14", `error code=${code} (exclusion_violation)`);
    } else {
      fail(
        "Case B: DB returned unexpected error code",
        `expected 23P01, got code=${code} msg=${error.message}`
      );
    }
  }
}

// ── Case C: Insert booking C 13→15 (adjacent, no overlap) → success ──────────

console.log("\n[Case C] Insert booking C 13→15 (adjacent to A 10→13, no overlap) — expect SUCCESS...");
{
  const { data, error } = await admin
    .from("bookings")
    .insert({
      court_id: courtId,
      player_id: playerId,
      date: testDate,
      start_hour: 13,
      end_hour: 15,
      total_price: 520,
      status: "pending_payment",
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    fail("Case C: booking C 13→15 insert", `error code=${error.code} msg=${error.message}`);
  } else {
    bookingCId = data.id;
    pass("Case C: booking C 13→15 inserted (adjacent, no overlap)", `id=${bookingCId}`);
  }
}

// ── Case D: Cancel A, then re-insert same slot 10→13 → success ───────────────

console.log("\n[Case D] Cancel booking A; insert booking D 10→13 (same slot as cancelled A) — expect SUCCESS...");

// Cancel booking A
if (bookingAId) {
  const { error: cancelErr } = await admin
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingAId);

  if (cancelErr) {
    fail("Case D: could not cancel booking A", cancelErr.message);
  } else {
    console.log(`  Booking A (${bookingAId}) set to cancelled.`);
  }
}

{
  const { data, error } = await admin
    .from("bookings")
    .insert({
      court_id: courtId,
      player_id: playerId,
      date: testDate,
      start_hour: 10,
      end_hour: 13,
      total_price: 780,
      status: "pending_payment",
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    fail(
      "Case D: booking D 10→13 insert after A cancelled",
      `error code=${error.code} msg=${error.message}`
    );
  } else {
    pass("Case D: booking D 10→13 inserted after A cancelled", `id=${data.id} (cancelled slot reusable)`);
  }
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

console.log("\n[Cleanup] Deleting test users (cascade deletes bookings, clubs, courts)...");

for (const [label, uid] of [
  ["owner", ownerId],
  ["player", playerId],
]) {
  if (!uid) continue;
  const { error } = await admin.auth.admin.deleteUser(uid);
  if (error) console.warn(`  WARN: failed to delete ${label}: ${error.message}`);
  else console.log(`  deleted ${label} (${uid})`);
}

// ── Result ────────────────────────────────────────────────────────────────────

console.log("");
if (failCount === 0) {
  console.log("[verify-overlap-constraint] ALL CASES PASSED");
  process.exit(0);
} else {
  console.log(`[verify-overlap-constraint] FAILED — ${failCount} case(s) failed`);
  process.exit(1);
}
