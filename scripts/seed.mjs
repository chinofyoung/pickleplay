/**
 * Seed script — courts + simulated schedules (bookings).
 *
 * Creates a handful of approved clubs across several PH cities, courts under
 * each, and a realistic spread of bookings over the next ~10 days. Idempotent:
 * re-running wipes the previously-seeded clubs (cascade removes their courts &
 * bookings) and rebuilds, so the dataset stays stable.
 *
 *   node scripts/seed.mjs
 *
 * Auth users are created via the Supabase service-role admin API (which fires
 * the profile trigger); everything else is written over a direct pg connection.
 */
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── env ─────────────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, "..", ".env.local");
const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()])
);
const DATABASE_URL = env.DATABASE_URL;
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!DATABASE_URL || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing DATABASE_URL / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const SEED_PASSWORD = "Seed-Passw0rd!";
const AMENITIES = ["Parking", "Showers", "Pro Shop", "Lighting", "Locker Rooms", "Café", "Air-conditioned"];

// Curated, license-free pickleball/court photos (Unsplash CDN). One unique
// image per court — every court gets a distinct hero image / card thumbnail.
const COURT_IMAGES = [
  "https://images.unsplash.com/photo-1747027694225-cbf12dd20826?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1693142518820-78d7a05f1546?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1762423570127-c36ff11b883f?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1693142519367-e8eb86d2bb08?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1669684899238-64c4abe4d3cc?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1761644541691-2a746c638881?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1646649853517-e2f75cde1908?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1732671349691-b10f10cbcb57?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1573294184805-e3044b161ace?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1673266893877-f31c1583aad3?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1639161775388-db5b5d5cc9eb?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1673211102262-f9b2b053e7da?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1669757457244-476571df8458?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1580763850522-504d40a05c50?auto=format&fit=crop&w=800&q=80",
];

// ── seed definitions ─────────────────────────────────────────────────────────
const OWNERS = [
  { email: "owner.cebu.seed@pickleplay.test", name: "Marco Reyes" },
  { email: "owner.manila.seed@pickleplay.test", name: "Liza Tan" },
  { email: "owner.davao.seed@pickleplay.test", name: "Paolo Mendoza" },
];

const PLAYERS = [
  { email: "player.ana.seed@pickleplay.test", name: "Ana Cruz" },
  { email: "player.ben.seed@pickleplay.test", name: "Ben Santos" },
  { email: "player.cara.seed@pickleplay.test", name: "Cara Lim" },
  { email: "player.dino.seed@pickleplay.test", name: "Dino Garcia" },
  { email: "player.ella.seed@pickleplay.test", name: "Ella Ramos" },
  { email: "player.finn.seed@pickleplay.test", name: "Finn Aquino" },
];

// owner index → clubs
const CLUBS = [
  { owner: 0, name: "Cebu Pickle Hub", city: "Cebu City", area: "Lahug", address: "Salinas Dr, Lahug",
    description: "Premier indoor pickleball courts in the heart of Cebu.",
    amenities: ["Parking", "Showers", "Pro Shop", "Lighting", "Air-conditioned"],
    courts: [
      { name: "Court 1", rate: 450, open: 6, close: 22 },
      { name: "Court 2", rate: 450, open: 6, close: 22 },
      { name: "Court 3", rate: 500, open: 6, close: 23 },
    ] },
  { owner: 0, name: "IT Park Smash Courts", city: "Cebu City", area: "Apas", address: "W Geonzon St, IT Park",
    description: "Rooftop courts with skyline views, open late.",
    amenities: ["Parking", "Café", "Lighting"],
    courts: [
      { name: "Court A", rate: 400, open: 7, close: 23 },
      { name: "Court B", rate: 400, open: 7, close: 23 },
    ] },
  { owner: 1, name: "Manila Bay Pickleball", city: "Manila", area: "Malate", address: "Roxas Blvd, Malate",
    description: "Bayside courts, perfect for sunset games.",
    amenities: ["Parking", "Showers", "Locker Rooms", "Lighting"],
    courts: [
      { name: "Court 1", rate: 550, open: 6, close: 22 },
      { name: "Court 2", rate: 550, open: 6, close: 22 },
    ] },
  { owner: 1, name: "QC Dink Center", city: "Quezon City", area: "Diliman", address: "Katipunan Ave, Diliman",
    description: "Community-focused courts near the universities.",
    amenities: ["Parking", "Pro Shop", "Café"],
    courts: [
      { name: "Court 1", rate: 350, open: 6, close: 21 },
      { name: "Court 2", rate: 350, open: 6, close: 21 },
      { name: "Court 3", rate: 380, open: 6, close: 21 },
    ] },
  { owner: 1, name: "Makati Padel & Pickle", city: "Makati", area: "Poblacion", address: "Kalayaan Ave, Poblacion",
    description: "Boutique air-conditioned courts in the CBD.",
    amenities: ["Showers", "Pro Shop", "Locker Rooms", "Café", "Air-conditioned"],
    courts: [
      { name: "Indoor 1", rate: 650, open: 8, close: 23 },
      { name: "Indoor 2", rate: 650, open: 8, close: 23 },
    ] },
  { owner: 2, name: "Davao Pickle Park", city: "Davao City", area: "Matina", address: "MacArthur Hwy, Matina",
    description: "Spacious outdoor courts for all skill levels.",
    amenities: ["Parking", "Lighting", "Café"],
    courts: [
      { name: "Court 1", rate: 300, open: 6, close: 22 },
      { name: "Court 2", rate: 300, open: 6, close: 22 },
    ] },
];

// ── helpers ───────────────────────────────────────────────────────────────────
function manilaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}
function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Ensure an auth user exists; returns its id. */
async function ensureUser(client, { email, name }) {
  const found = await client.query("select id from auth.users where lower(email) = lower($1)", [email]);
  if (found.rows.length) return found.rows[0].id;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      email,
      password: SEED_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: name },
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`createUser(${email}): ${res.status} ${JSON.stringify(body)}`);
  return body.id;
}

/** Build non-overlapping booking slots within [open, close) for one court/day. */
function daySlots(open, close) {
  const slots = [];
  let cursor = open;
  while (cursor < close - 1) {
    if (Math.random() < 0.4) {
      const dur = 1 + Math.floor(Math.random() * 2); // 1–2 hours
      const end = Math.min(cursor + dur, close);
      slots.push([cursor, end]);
      cursor = end + (Math.random() < 0.5 ? 1 : 0); // sometimes leave a gap
    } else {
      cursor += 1;
    }
  }
  return slots;
}

// ── main ───────────────────────────────────────────────────────────────────────
async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  await client.connect();
  console.log("Connected.\n");

  // 1. Users + profiles
  console.log("Ensuring seed users…");
  const ownerIds = [];
  for (const o of OWNERS) {
    const id = await ensureUser(client, o);
    ownerIds.push(id);
    await client.query("update profiles set role='owner', full_name=$2 where id=$1", [id, o.name]);
  }
  const playerIds = [];
  for (const p of PLAYERS) {
    const id = await ensureUser(client, p);
    playerIds.push(id);
    await client.query("update profiles set full_name=$2 where id=$1", [id, p.name]);
  }
  console.log(`  ${ownerIds.length} owners, ${playerIds.length} players ready.\n`);

  // 2. Wipe previously-seeded clubs for these owners (cascade → courts, bookings)
  const del = await client.query("delete from clubs where owner_id = any($1::uuid[])", [ownerIds]);
  console.log(`Removed ${del.rowCount} previously-seeded club(s) (cascade).\n`);

  // 3. Clubs + courts
  const totalCourts = CLUBS.reduce((n, c) => n + c.courts.length, 0);
  if (COURT_IMAGES.length < totalCourts) {
    console.error(`Need ${totalCourts} unique court images but only have ${COURT_IMAGES.length}.`);
    await client.end();
    process.exit(1);
  }
  console.log("Inserting clubs & courts…");
  const courtRows = []; // { id, open, close, rate }
  let courtCount = 0;
  for (const c of CLUBS) {
    const { rows } = await client.query(
      `insert into clubs (owner_id, name, description, city, area, address, amenities, status)
       values ($1,$2,$3,$4,$5,$6,$7,'approved') returning id`,
      [ownerIds[c.owner], c.name, c.description, c.city, c.area, c.address, c.amenities]
    );
    const clubId = rows[0].id;
    for (const ct of c.courts) {
      const image = COURT_IMAGES[courtCount]; // unique per court (guarded below)
      const r = await client.query(
        `insert into courts (club_id, name, hourly_rate, open_hour, close_hour, image_url)
         values ($1,$2,$3,$4,$5,$6) returning id`,
        [clubId, ct.name, ct.rate, ct.open, ct.close, image]
      );
      courtRows.push({ id: r.rows[0].id, open: ct.open, close: ct.close, rate: ct.rate });
      courtCount++;
    }
  }
  console.log(`  ${CLUBS.length} clubs, ${courtCount} courts.\n`);

  // 4. Simulated schedules (bookings) over the next 10 days
  console.log("Generating simulated bookings…");
  const today = manilaToday();
  const DAYS = 10;
  const nowIso = new Date().toISOString();
  const expiresIso = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(); // +6h
  const counts = { confirmed: 0, proof_submitted: 0, pending_payment: 0, cancelled: 0 };

  for (const court of courtRows) {
    for (let d = 0; d < DAYS; d++) {
      const date = addDays(today, d);
      for (const [start, end] of daySlots(court.open, court.close)) {
        // Status mix: mostly confirmed; pending/proof only near-term.
        let status = "confirmed";
        const roll = Math.random();
        if (d <= 2) {
          if (roll < 0.25) status = "pending_payment";
          else if (roll < 0.45) status = "proof_submitted";
        } else if (roll < 0.1) {
          status = "proof_submitted";
        }
        const total = court.rate * (end - start);
        await client.query(
          `insert into bookings (court_id, player_id, date, start_hour, end_hour, total_price, status, expires_at, created_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            court.id,
            pick(playerIds),
            date,
            start,
            end,
            total,
            status,
            status === "pending_payment" ? expiresIso : null,
            nowIso,
          ]
        );
        counts[status]++;
      }
    }
  }

  const totalBookings = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`  ${totalBookings} bookings:`, counts, "\n");

  await client.end();
  console.log("Seed complete.");
  console.log(`Login for any seeded account: password "${SEED_PASSWORD}"`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
