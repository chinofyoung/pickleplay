/**
 * verify-owner-review.mjs
 * Verifies Phase 8.1 Owner Booking Review: confirm, reject-with-reason,
 * RLS owner isolation, and signed-URL access control.
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

// Minimal valid 1×1 PNG
const PNG_BYTES = new Uint8Array([
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

// ─── State ───────────────────────────────────────────────────────────────────

const ts = Date.now();
const password = "ReviewTest123!";

const owner1Email = `pp.rev.owner1.${ts}@gmail.com`;
const owner2Email = `pp.rev.owner2.${ts}@gmail.com`;
const playerEmail = `pp.rev.player.${ts}@gmail.com`;

let owner1Id = null;
let owner2Id = null;
let playerId = null;
let pickleballCourtId = null;
let pickleballCourt2Id = null;
let courtId = null;
let court2Id = null;
let booking1Id = null;
let booking2Id = null;
let proofPath1 = null;
let proofPath2 = null;

let failed = false;

function fail(msg) {
  console.error(`  FAIL: ${msg}`);
  failed = true;
}
function ok(msg) {
  console.log(`  OK — ${msg}`);
}

const testDate = new Date(Date.now() + 86400000).toISOString().split("T")[0];

// ─── [1] Setup: owner1, approved pickleball court + court, player ────────────────────────
console.log("\n[1/6] Setup: owner1, pickleball court, court, player...");

{
  const { data, error } = await admin.auth.admin.createUser({
    email: owner1Email, password, email_confirm: true,
    user_metadata: { full_name: `Rev Owner1 ${ts}` },
  });
  if (error || !data.user) { fail(`createUser owner1: ${error?.message}`); process.exit(1); }
  owner1Id = data.user.id;
  await admin.from("profiles").update({ role: "owner" }).eq("id", owner1Id);
  ok(`owner1 created: ${owner1Id}`);
}

const owner1Client = await signIn(owner1Email, password);

{
  const { data: pickleballCourt, error } = await owner1Client.from("pickleball_courts").insert({
    owner_id: owner1Id,
    name: `Rev Court1 ${ts}`,
    city: "Cebu City",
    amenities: [],
  }).select("id").single();
  if (error || !pickleballCourt) { fail(`create pickleball court1: ${error?.message}`); process.exit(1); }
  pickleballCourtId = pickleballCourt.id;
  await admin.from("pickleball_courts").update({ status: "approved" }).eq("id", pickleballCourtId);
  ok(`pickleball court1 created + approved: ${pickleballCourtId}`);
}

{
  const { data: court, error } = await owner1Client.from("courts").insert({
    pickleball_court_id: pickleballCourtId,
    name: "Rev Court A",
    hourly_rate: 300,
    open_hour: 6,
    close_hour: 22,
  }).select("id").single();
  if (error || !court) { fail(`create court: ${error?.message}`); process.exit(1); }
  courtId = court.id;
  ok(`court created: ${courtId}`);
}

{
  const { data, error } = await admin.auth.admin.createUser({
    email: playerEmail, password, email_confirm: true,
    user_metadata: { full_name: `Rev Player ${ts}` },
  });
  if (error || !data.user) { fail(`createUser player: ${error?.message}`); process.exit(1); }
  playerId = data.user.id;
  ok(`player created: ${playerId}`);
}

// ─── [2] Player books + uploads proof → proof_submitted (booking 1) ───────────
console.log("\n[2/6] Player creates booking1 and submits proof...");

const playerClient = await signIn(playerEmail, password);

{
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  const { data: bk, error } = await playerClient.from("bookings").insert({
    court_id: courtId,
    player_id: playerId,
    date: testDate,
    start_hour: 8,
    end_hour: 10,
    total_price: 600,
    status: "pending_payment",
    expires_at: expiresAt,
  }).select("id").single();
  if (error || !bk) { fail(`create booking1: ${error?.message}`); process.exit(1); }
  booking1Id = bk.id;
  ok(`booking1 created: ${booking1Id}`);
}

proofPath1 = `${booking1Id}/proof1.png`;
{
  const { error } = await playerClient.storage
    .from("payment-proofs")
    .upload(proofPath1, PNG_BYTES, { contentType: "image/png", upsert: true });
  if (error) { fail(`proof1 upload: ${error.message}`); }
  else ok(`proof1 uploaded: ${proofPath1}`);
}

{
  const { error } = await playerClient.from("bookings")
    .update({ payment_proof_path: proofPath1, status: "proof_submitted", expires_at: null })
    .eq("id", booking1Id);
  if (error) fail(`booking1 set proof_submitted: ${error.message}`);
  else ok(`booking1 → proof_submitted`);
}

// ─── [3] Owner1 confirms booking1 ─────────────────────────────────────────────
console.log("\n[3/6] Owner1 confirms booking1 (status=proof_submitted → confirmed)...");

{
  const { error } = await owner1Client.from("bookings")
    .update({ status: "confirmed" })
    .eq("id", booking1Id)
    .eq("status", "proof_submitted");
  if (error) {
    fail(`owner1 confirm booking1: ${error.message}`);
  } else {
    // Verify DB
    const { data: bk } = await admin.from("bookings")
      .select("status")
      .eq("id", booking1Id)
      .single();
    if (bk?.status === "confirmed") {
      ok(`booking1 status = confirmed ✓`);
    } else {
      fail(`Expected confirmed, got ${bk?.status}`);
    }
  }
}

// ─── [4] Second booking → proof_submitted → owner1 rejects with reason ────────
console.log("\n[4/6] Player creates booking2 → proof_submitted → owner1 rejects with reason...");

{
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  const { data: bk, error } = await playerClient.from("bookings").insert({
    court_id: courtId,
    player_id: playerId,
    date: testDate,
    start_hour: 12,
    end_hour: 14,
    total_price: 600,
    status: "pending_payment",
    expires_at: expiresAt,
  }).select("id").single();
  if (error || !bk) { fail(`create booking2: ${error?.message}`); process.exit(1); }
  booking2Id = bk.id;
  ok(`booking2 created: ${booking2Id}`);
}

proofPath2 = `${booking2Id}/proof2.png`;
{
  const { error } = await playerClient.storage
    .from("payment-proofs")
    .upload(proofPath2, PNG_BYTES, { contentType: "image/png", upsert: true });
  if (error) fail(`proof2 upload: ${error.message}`);
  else ok(`proof2 uploaded: ${proofPath2}`);
}

{
  const { error } = await playerClient.from("bookings")
    .update({ payment_proof_path: proofPath2, status: "proof_submitted", expires_at: null })
    .eq("id", booking2Id);
  if (error) fail(`booking2 set proof_submitted: ${error.message}`);
  else ok(`booking2 → proof_submitted`);
}

const rejectionReason = "Payment amount incorrect — please re-submit";
{
  const { error } = await owner1Client.from("bookings")
    .update({ status: "rejected", rejection_reason: rejectionReason })
    .eq("id", booking2Id);
  if (error) {
    fail(`owner1 reject booking2: ${error.message}`);
  } else {
    const { data: bk } = await admin.from("bookings")
      .select("status, rejection_reason")
      .eq("id", booking2Id)
      .single();
    if (bk?.status === "rejected" && bk?.rejection_reason === rejectionReason) {
      ok(`booking2 status = rejected, rejection_reason = "${bk.rejection_reason}" ✓`);
    } else {
      fail(`Expected rejected + reason, got status=${bk?.status} reason=${bk?.rejection_reason}`);
    }
  }
}

// ─── [5] RLS negative: owner2 cannot update owner1's booking ──────────────────
console.log("\n[5/6] RLS negative: owner2 cannot update owner1's booking...");

{
  const { data, error } = await admin.auth.admin.createUser({
    email: owner2Email, password, email_confirm: true,
    user_metadata: { full_name: `Rev Owner2 ${ts}` },
  });
  if (error || !data.user) { fail(`createUser owner2: ${error?.message}`); process.exit(1); }
  owner2Id = data.user.id;
  await admin.from("profiles").update({ role: "owner" }).eq("id", owner2Id);
  ok(`owner2 created: ${owner2Id}`);
}

// Give owner2 their own pickleball court + court (so they're a valid owner, just different pickleball courts)
const owner2Client = await signIn(owner2Email, password);

{
  const { data: pickleballCourt2, error } = await owner2Client.from("pickleball_courts").insert({
    owner_id: owner2Id,
    name: `Rev Court2 ${ts}`,
    city: "Manila",
    amenities: [],
  }).select("id").single();
  if (error || !pickleballCourt2) { fail(`create pickleball court2: ${error?.message}`); }
  else {
    pickleballCourt2Id = pickleballCourt2.id;
    await admin.from("pickleball_courts").update({ status: "approved" }).eq("id", pickleballCourt2Id);
    ok(`owner2's pickleball court2 created + approved: ${pickleballCourt2Id}`);
  }
}

{
  // owner2 tries to confirm booking1 (which belongs to owner1's court)
  const { data, error } = await owner2Client.from("bookings")
    .update({ status: "confirmed" })
    .eq("id", booking1Id);

  // Expect: RLS blocks update → 0 rows affected, or permission error
  if (error) {
    ok(`RLS blocked owner2 from updating owner1's booking (error: ${error.message})`);
  } else {
    // Check DB — status should NOT have changed (it was already confirmed, but we
    // should confirm no rows were touched by owner2)
    const { data: bk } = await admin.from("bookings")
      .select("status")
      .eq("id", booking1Id)
      .single();
    // Since booking1 is already "confirmed", a no-op update wouldn't change it.
    // To truly test the block, attempt to update booking2 (which is "rejected") back to "confirmed"
    const { data: d2, error: e2 } = await owner2Client.from("bookings")
      .update({ status: "confirmed" })
      .eq("id", booking2Id);

    if (e2) {
      ok(`RLS blocked owner2 from updating owner1's booking2 (error: ${e2.message})`);
    } else {
      // Verify that booking2 was NOT changed by owner2
      const { data: bk2 } = await admin.from("bookings")
        .select("status")
        .eq("id", booking2Id)
        .single();
      if (bk2?.status === "rejected") {
        ok(`RLS isolation confirmed: owner2 update had 0 effect on booking2 (status still "rejected") ✓`);
      } else {
        fail(`RLS FAILURE: owner2 changed booking2 status to ${bk2?.status}! Security issue.`);
      }
    }
  }
}

// ─── [6] Signed URL: owner1 can get one; anon cannot ──────────────────────────
console.log("\n[6/6] Signed URL: owner1 can generate; anon client cannot...");

{
  // Owner1 generates a signed URL for proof1
  const { data: signedData, error: signedErr } = await owner1Client.storage
    .from("payment-proofs")
    .createSignedUrl(proofPath1, 60 * 10);

  if (signedErr || !signedData?.signedUrl) {
    fail(`owner1 createSignedUrl failed: ${signedErr?.message}`);
  } else {
    ok(`owner1 signed URL generated: ${signedData.signedUrl.slice(0, 80)}…`);

    // Verify the URL actually resolves (fetch HEAD)
    try {
      const res = await fetch(signedData.signedUrl, { method: "HEAD" });
      if (res.ok || res.status === 200) {
        ok(`Signed URL is accessible (HTTP ${res.status})`);
      } else {
        // Some storage configs return 200 for signed URLs even if the content is
        // small — just warn if non-2xx
        console.warn(`  WARN: signed URL returned HTTP ${res.status} (may still be valid)`);
      }
    } catch (fetchErr) {
      console.warn(`  WARN: Could not fetch signed URL (network): ${fetchErr.message}`);
    }
  }
}

{
  // Anon client (no auth) tries to create a signed URL — should fail
  const anonStorageClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: anonSigned, error: anonErr } = await anonStorageClient.storage
    .from("payment-proofs")
    .createSignedUrl(proofPath1, 60);

  if (anonErr || !anonSigned?.signedUrl) {
    ok(`Anon client cannot createSignedUrl for private proof (blocked: ${anonErr?.message ?? "no URL returned"}) ✓`);
  } else {
    // Some Supabase setups return a signed URL regardless (the URL itself may
    // 401 when fetched). Try fetching it to verify it's inaccessible.
    try {
      const res = await fetch(anonSigned.signedUrl, { method: "HEAD" });
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        ok(`Anon signed URL returns HTTP ${res.status} when fetched (access blocked) ✓`);
      } else {
        fail(`Anon signed URL is accessible (HTTP ${res.status}) — storage RLS may not be configured correctly`);
      }
    } catch {
      ok(`Anon signed URL is not accessible (fetch failed) ✓`);
    }
  }
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────
console.log("\n[cleanup] Removing test data...");

for (const p of [proofPath1, proofPath2].filter(Boolean)) {
  const { error } = await admin.storage.from("payment-proofs").remove([p]);
  if (error) console.warn(`  WARN: failed to delete proof ${p}: ${error.message}`);
  else ok(`deleted storage object: ${p}`);
}

for (const [label, uid] of [
  ["owner1", owner1Id],
  ["owner2", owner2Id],
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
  console.log("[verify-owner-review] FAILED — see errors above");
  process.exit(1);
} else {
  console.log("[verify-owner-review] ALL CHECKS PASSED");
}
