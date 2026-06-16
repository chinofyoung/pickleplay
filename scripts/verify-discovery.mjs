/**
 * verify-discovery.mjs
 * Verifies Phase 5 (Admin approval) + Phase 6 (Discovery) RLS behaviour.
 *
 * Checks:
 *  1. Create owner, set role='owner'; sign in; create pickleball court + court → status='pending'
 *  2. Anonymous client: query approved pickleball courts → pending pickleball court NOT returned
 *  3. Create admin, set role='admin' via service-role; sign in as admin; update pickleball court status='approved'
 *  4. Anonymous client again: approved pickleball courts → pickleball court IS returned, court is readable
 *  5. Cleanup: delete test users via service-role admin API
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
const ownerEmail = `pp.disco.owner.${ts}@gmail.com`;
const adminEmail = `pp.disco.admin.${ts}@gmail.com`;
const password = "TestPass123!";

let ownerId = null;
let adminId = null;
let pickleballCourtId = null;
let failed = false;

function fail(msg) {
  console.error(`  FAIL: ${msg}`);
  failed = true;
}

function ok(msg) {
  console.log(`  OK — ${msg}`);
}

// Service-role admin client
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Anon client (unauthenticated — simulates a public visitor)
const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Step 1: Create owner, set role, sign in, create pickleball court + court ─────────────
console.log("\n[1/5] Creating owner user...");
{
  const { data, error } = await adminClient.auth.admin.createUser({
    email: ownerEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Discovery Owner ${ts}` },
  });
  if (error || !data.user) {
    fail(`createUser owner: ${error?.message ?? "no user returned"}`);
    process.exit(1);
  }
  ownerId = data.user.id;
  ok(`owner created — id: ${ownerId}`);

  const { error: roleErr } = await adminClient
    .from("profiles")
    .update({ role: "owner" })
    .eq("id", ownerId);
  if (roleErr) {
    fail(`set owner role: ${roleErr.message}`);
    process.exit(1);
  }
  ok(`owner role set to 'owner'`);

  // Sign in as owner
  const anonSignIn = createClient(SUPABASE_URL, ANON_KEY);
  const { data: signInData, error: signInErr } =
    await anonSignIn.auth.signInWithPassword({ email: ownerEmail, password });
  if (signInErr || !signInData.session) {
    fail(`owner signIn: ${signInErr?.message ?? "no session"}`);
    process.exit(1);
  }
  ok(`owner signed in`);

  const ownerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${signInData.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Create pickleball court
  const { data: pickleballCourt, error: pickleballCourtErr } = await ownerClient
    .from("pickleball_courts")
    .insert({
      owner_id: ownerId,
      name: `Discovery Court ${ts}`,
      city: "Test City",
      amenities: ["Parking", "Showers"],
    })
    .select("id, status")
    .single();

  if (pickleballCourtErr || !pickleballCourt) {
    fail(`create pickleball court: ${pickleballCourtErr?.message ?? "no pickleball court returned"}`);
    process.exit(1);
  }
  pickleballCourtId = pickleballCourt.id;

  if (pickleballCourt.status !== "pending") {
    fail(`Expected status='pending', got '${pickleballCourt.status}'`);
  } else {
    ok(`pickleball court created — id: ${pickleballCourtId}, status='pending'`);
  }

  // Add a court
  const { error: courtErr } = await ownerClient.from("courts").insert({
    pickleball_court_id: pickleballCourtId,
    name: "Discovery Court A",
    hourly_rate: 350,
    open_hour: 7,
    close_hour: 21,
  });
  if (courtErr) fail(`add court: ${courtErr.message}`);
  else ok(`court added to pickleball court`);
}

// ─── Step 2: Anonymous client — pending pickleball court must NOT be visible ──────────────
console.log("\n[2/5] Anonymous client: pending pickleball court must NOT be in approved pickleball courts...");
{
  const { data: pickleballCourts, error } = await anonClient
    .from("pickleball_courts")
    .select("id, name, status, courts(id, name)")
    .eq("status", "approved");

  if (error) {
    fail(`anon query approved pickleball courts: ${error.message}`);
  } else {
    const found = (pickleballCourts ?? []).find((c) => c.id === pickleballCourtId);
    if (found) {
      fail(`Pending pickleball court IS visible to anonymous client — RLS not blocking!`);
    } else {
      ok(`Pending pickleball court correctly hidden from anonymous client (${pickleballCourts?.length ?? 0} approved pickleball courts returned)`);
    }
  }
}

// ─── Step 3: Create admin, sign in, approve the pickleball court ─────────────────────────
console.log("\n[3/5] Creating admin user and approving the pickleball court...");
{
  const { data, error } = await adminClient.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Discovery Admin ${ts}` },
  });
  if (error || !data.user) {
    fail(`createUser admin: ${error?.message ?? "no user returned"}`);
    process.exit(1);
  }
  adminId = data.user.id;
  ok(`admin user created — id: ${adminId}`);

  const { error: roleErr } = await adminClient
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", adminId);
  if (roleErr) {
    fail(`set admin role: ${roleErr.message}`);
    process.exit(1);
  }
  ok(`admin role set to 'admin'`);

  // Sign in as admin
  const anonSignIn = createClient(SUPABASE_URL, ANON_KEY);
  const { data: signInData, error: signInErr } =
    await anonSignIn.auth.signInWithPassword({ email: adminEmail, password });
  if (signInErr || !signInData.session) {
    fail(`admin signIn: ${signInErr?.message ?? "no session"}`);
    process.exit(1);
  }
  ok(`admin signed in`);

  const adminSessionClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${signInData.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Admin updates the pickleball court status to 'approved'
  const { error: updateErr } = await adminSessionClient
    .from("pickleball_courts")
    .update({ status: "approved" })
    .eq("id", pickleballCourtId);

  if (updateErr) {
    fail(`admin approve pickleball court: ${updateErr.message}`);
  } else {
    ok(`admin successfully updated pickleball court status to 'approved'`);
  }
}

// ─── Step 4: Anonymous client — approved pickleball court IS now visible ─────────────────
console.log("\n[4/5] Anonymous client: approved pickleball court MUST now be visible with its court...");
{
  const { data: pickleballCourts, error } = await anonClient
    .from("pickleball_courts")
    .select("id, name, status, courts(id, name, hourly_rate)")
    .eq("status", "approved");

  if (error) {
    fail(`anon query approved pickleball courts (post-approve): ${error.message}`);
  } else {
    const found = (pickleballCourts ?? []).find((c) => c.id === pickleballCourtId);
    if (!found) {
      fail(`Approved pickleball court is NOT visible to anonymous client — RLS not granting access!`);
    } else {
      ok(`Approved pickleball court IS visible (name: "${found.name}", status: '${found.status}')`);
      const courtCount = found.courts?.length ?? 0;
      if (courtCount === 0) {
        fail(`No courts returned for the approved pickleball court`);
      } else {
        ok(`Court is readable (${courtCount} court(s) returned, e.g. ₱${found.courts[0].hourly_rate}/hr)`);
      }
    }
  }
}

// ─── Step 5: Cleanup ──────────────────────────────────────────────────────────
console.log("\n[5/5] Cleanup: deleting test users...");
for (const [label, uid] of [
  ["owner", ownerId],
  ["admin", adminId],
]) {
  if (!uid) continue;
  const { error } = await adminClient.auth.admin.deleteUser(uid);
  if (error) console.warn(`  WARN: failed to delete ${label}: ${error.message}`);
  else ok(`${label} deleted`);
}

// ─── Result ───────────────────────────────────────────────────────────────────
if (failed) {
  console.log("\n[verify-discovery] FAILED — see errors above");
  process.exit(1);
} else {
  console.log("\n[verify-discovery] ALL CHECKS PASSED");
}
