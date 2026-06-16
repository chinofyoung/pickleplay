/**
 * verify-search.mjs
 * Verifies Phase 2/3 availability-first court search logic.
 * Seeds an approved pickleball court + court (open 6–21, ₱200/hr) and a confirmed booking 9→11
 * on a fixed test date, then asserts:
 *   - available for 6→8 (before booking)  ✓
 *   - available for 11→13 (after booking)  ✓
 *   - NOT available for 8→10 (overlaps 9→11)  ✓
 *   - NOT available for 10→12 (overlaps 9→11)  ✓
 * Cleans up all seeded data + users at the end.
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

// ─── Pure logic (replicated inline — no TS transform needed) ─────────────────

function validateSlot({ startHour, endHour, openHour, closeHour }) {
  if (startHour < openHour || endHour > closeHour) return { ok: false };
  if (endHour <= startHour) return { ok: false };
  return { ok: true };
}

function overlaps(candidate, existing) {
  return existing.some(
    (e) => candidate.startHour < e.endHour && e.startHour < candidate.endHour
  );
}

function isExpired(expiresAt, now) {
  return now.getTime() > expiresAt.getTime();
}

function isCourtAvailable(courtHours, bookings, window, now) {
  const v = validateSlot({
    startHour: window.startHour,
    endHour: window.endHour,
    openHour: courtHours.openHour,
    closeHour: courtHours.closeHour,
  });
  if (!v.ok) return false;
  const active = bookings.filter(
    (b) =>
      !(b.status === "rejected" || b.status === "cancelled") &&
      !(
        b.status === "pending_payment" &&
        b.expiresAt &&
        isExpired(b.expiresAt, now)
      )
  );
  return !overlaps(
    window,
    active.map((b) => ({ startHour: b.startHour, endHour: b.endHour }))
  );
}

// ─── Clients ─────────────────────────────────────────────────────────────────

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
    throw new Error(`signIn ${email}: ${error?.message ?? "no session"}`);
  return makeAuthClient(data.session.access_token);
}

// ─── State ───────────────────────────────────────────────────────────────────

const ts = Date.now();
const password = "SearchTest123!";
const ownerEmail = `pp.search.owner.${ts}@gmail.com`;
const playerEmail = `pp.search.player.${ts}@gmail.com`;

let ownerId = null;
let playerId = null;
let pickleballCourtId = null;
let courtId = null;
let bookingId = null;

let failed = false;

function fail(msg) {
  console.error(`  FAIL: ${msg}`);
  failed = true;
}
function ok(msg) {
  console.log(`  OK — ${msg}`);
}

// Fixed test date (far future to avoid conflicts)
const TEST_DATE = "2099-12-15";

// ─── Step 1: Seed data ────────────────────────────────────────────────────────
console.log("\n[1/4] Seeding: owner, pickleball court (approved), court (open 6–21, ₱200/hr), player...");

// Create owner
{
  const { data, error } = await admin.auth.admin.createUser({
    email: ownerEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Search Owner ${ts}` },
  });
  if (error || !data.user) {
    fail(`createUser owner: ${error?.message}`);
    process.exit(1);
  }
  ownerId = data.user.id;
  await admin.from("profiles").update({ role: "owner" }).eq("id", ownerId);
  ok(`owner created: ${ownerId}`);
}

const ownerClient = await signIn(ownerEmail, password);

// Create pickleball court and approve it
{
  const { data: pickleballCourt, error } = await ownerClient
    .from("pickleball_courts")
    .insert({
      owner_id: ownerId,
      name: `Search Test Court ${ts}`,
      city: "Manila",
      amenities: [],
    })
    .select("id")
    .single();
  if (error || !pickleballCourt) {
    fail(`create pickleball court: ${error?.message}`);
    process.exit(1);
  }
  pickleballCourtId = pickleballCourt.id;
  await admin.from("pickleball_courts").update({ status: "approved" }).eq("id", pickleballCourtId);
  ok(`pickleball court created + approved: ${pickleballCourtId}`);
}

// Create court
{
  const { data: court, error } = await ownerClient
    .from("courts")
    .insert({
      pickleball_court_id: pickleballCourtId,
      name: "Search Verify Court",
      hourly_rate: 200,
      open_hour: 6,
      close_hour: 21,
    })
    .select("id")
    .single();
  if (error || !court) {
    fail(`create court: ${error?.message}`);
    process.exit(1);
  }
  courtId = court.id;
  ok(`court created: ${courtId} (open 6–21, ₱200/hr)`);
}

// Create player
{
  const { data, error } = await admin.auth.admin.createUser({
    email: playerEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Search Player ${ts}` },
  });
  if (error || !data.user) {
    fail(`createUser player: ${error?.message}`);
    process.exit(1);
  }
  playerId = data.user.id;
  ok(`player created: ${playerId}`);
}

// Insert confirmed booking 9→11 on TEST_DATE via service-role (bypasses RLS for setup)
{
  const { data: bk, error } = await admin
    .from("bookings")
    .insert({
      court_id: courtId,
      player_id: playerId,
      date: TEST_DATE,
      start_hour: 9,
      end_hour: 11,
      total_price: 400,
      status: "confirmed",
      expires_at: null,
    })
    .select("id")
    .single();
  if (error || !bk) {
    fail(`create booking 9→11: ${error?.message}`);
    process.exit(1);
  }
  bookingId = bk.id;
  ok(`confirmed booking 9→11 on ${TEST_DATE}: ${bookingId}`);
}

// ─── Step 2: Fetch data (replicating the page's query) ───────────────────────
console.log("\n[2/4] Fetching courts + bookings (replicating page query)...");

const { data: courtsRaw } = await admin
  .from("courts")
  .select("id, name, hourly_rate, open_hour, close_hour, pickleball_courts(id, name, city, area, amenities, status)")
  .eq("id", courtId);

const list = (courtsRaw ?? []);

// Normalize pickleball courts (handle array or object)
const normalizedList = list.map((c) => ({
  ...c,
  pickleball_courts: Array.isArray(c.pickleball_courts) ? c.pickleball_courts[0] : c.pickleball_courts,
}));

// Filter approved pickleball courts (in-code approach)
const approvedList = normalizedList.filter((c) => c.pickleball_courts?.status === "approved");

ok(`fetched ${approvedList.length} approved court(s) for courtId ${courtId}`);
if (approvedList.length === 0) {
  fail("No approved courts returned — check pickleball court status or query");
  process.exit(1);
}

const { data: bookingsRaw } = await admin
  .from("bookings")
  .select("court_id, start_hour, end_hour, status, expires_at")
  .in("court_id", [courtId])
  .eq("date", TEST_DATE);

ok(`fetched ${(bookingsRaw ?? []).length} booking(s) for ${TEST_DATE}`);

const byCourt = new Map();
for (const b of bookingsRaw ?? []) {
  const arr = byCourt.get(b.court_id) ?? [];
  arr.push({
    startHour: b.start_hour,
    endHour: b.end_hour,
    status: b.status,
    expiresAt: b.expires_at ? new Date(b.expires_at) : null,
  });
  byCourt.set(b.court_id, arr);
}

const court = approvedList[0];
const courtBookings = byCourt.get(courtId) ?? [];
const now = new Date();

ok(`court: ${court.name}, open ${court.open_hour}–${court.close_hour}, bookings on date: ${courtBookings.map(b => `${b.startHour}→${b.endHour}(${b.status})`).join(", ") || "none"}`);

// ─── Step 3: Assert availability windows ─────────────────────────────────────
console.log("\n[3/4] Asserting availability (court open 6–21, booking 9→11)...");

const courtHours = { openHour: court.open_hour, closeHour: court.close_hour };

// Should be AVAILABLE
const cases_available = [
  { startHour: 6, endHour: 8, label: "6→8 (before booking)" },
  { startHour: 11, endHour: 13, label: "11→13 (after booking)" },
];

for (const { startHour, endHour, label } of cases_available) {
  const result = isCourtAvailable(courtHours, courtBookings, { startHour, endHour }, now);
  if (!result) fail(`Expected AVAILABLE for ${label}, got NOT available`);
  else ok(`AVAILABLE for ${label}`);
}

// Should be NOT AVAILABLE
const cases_blocked = [
  { startHour: 8, endHour: 10, label: "8→10 (overlaps 9→11)" },
  { startHour: 10, endHour: 12, label: "10→12 (overlaps 9→11)" },
];

for (const { startHour, endHour, label } of cases_blocked) {
  const result = isCourtAvailable(courtHours, courtBookings, { startHour, endHour }, now);
  if (result) fail(`Expected NOT AVAILABLE for ${label}, got AVAILABLE`);
  else ok(`NOT AVAILABLE for ${label} (correctly blocked)`);
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────
console.log("\n[cleanup] Removing seeded data...");

for (const [label, uid] of [
  ["owner", ownerId],
  ["player", playerId],
]) {
  if (!uid) continue;
  const { error } = await admin.auth.admin.deleteUser(uid);
  if (error) console.warn(`  WARN: failed to delete ${label}: ${error.message}`);
  else ok(`${label} deleted`);
}

// ─── Result ───────────────────────────────────────────────────────────────────
console.log("");
if (failed) {
  console.log("[verify-search] FAILED — see errors above");
  process.exit(1);
} else {
  console.log("[verify-search] ALL CHECKS PASSED");
}
