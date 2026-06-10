# Pickleball Booking MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Git is disabled for this project** (project rule). Wherever a normal plan would `git commit`, this plan uses a **Checkpoint** step: run the full test suite + typecheck and confirm green before moving on. Do NOT run any git command.

**Goal:** Build the Core Booking MVP — players discover clubs, book consecutive hourly court slots, pay via a manual QR + payment-proof flow, and owners/admins manage listings and confirm bookings.

**Architecture:** Next.js (App Router) frontend + Supabase (Postgres, Auth, Storage). Authorization enforced by Postgres Row Level Security. Server Components fetch data; Client Components handle interactive booking/upload UI. Booking overlap, pricing, slot validation, and expiry live in pure, unit-tested modules.

**Tech Stack:** Next.js 16 (App Router, TypeScript), Supabase JS client + supabase-ssr, **Tailwind CSS v4** (`@theme` in `globals.css`, no `tailwind.config.js`), **shadcn/ui "base-nova"** + **Base UI** primitives, **Barlow / Barlow Condensed** fonts, Vitest (unit), Zod (validation).

**Spec:** `docs/superpowers/specs/2026-06-10-pickleball-booking-mvp-design.md`

**Design parity:** The visual design must match the RaceDay project (`/Users/chinoyoung/Code/raceday`) exactly — same theme tokens, fonts, dark mode, and `components/ui`. Phase 0 copies that design system in. RaceDay uses Clerk + Convex; pickleplay uses Supabase — copy the **presentational** layer only and adapt auth-coupled bits (e.g. Clerk's `UserButton` in the navbar) to Supabase.

### RaceDay Design Tokens (reference — source of truth is raceday's `globals.css`)

- **Fonts:** heading `Barlow Condensed` (400/500/600/700, `--font-heading`), body `Barlow` (300–700, `--font-body`). Headings are `font-bold uppercase tracking-wide`.
- **Palette (dark, always-on):** `--color-primary:#f97316` (orange), `--color-secondary:#fb923c`, `--color-cta:#22c55e` (green), `--color-background:#111827`, `--color-surface:#1f2937`, `--color-card:#1f2937`, `--color-text/foreground:#f8fafc`, `--color-text-muted/muted-foreground:#94a3b8`, `--color-destructive:#ef4444`, `--color-border/input:rgba(255,255,255,0.05)`, `--color-ring:#f97316`, sidebar `#0a0f1a`.
- **Radius:** sm 0.25rem, md 0.375rem, lg 0.5rem, xl 12px, 2xl 16px. **shadcn style:** base-nova, baseColor neutral, cssVariables true, lucide icons.
- **Root layout:** `<html className="dark scroll-smooth">`, body adds `selection:bg-primary/30 selection:text-white overflow-x-hidden antialiased`.
- **App shell:** `min-h-screen flex flex-col bg-background` → `<Navbar/>` + `<main className="flex-grow pt-24">` + `<Footer/>`.

---

## File Structure

```
pickleplay/
├── app/
│   ├── (public)/
│   │   ├── page.tsx                     # Home / landing
│   │   ├── clubs/page.tsx               # Discovery: search + filters
│   │   └── clubs/[id]/page.tsx          # Club profile + courts + booking entry
│   ├── (auth)/login/page.tsx
│   ├── (auth)/register/page.tsx
│   ├── booking/[id]/page.tsx            # Booking detail: QR + proof upload + status
│   ├── my-bookings/page.tsx             # Player's bookings
│   ├── owner/                           # Owner dashboard (role-gated)
│   │   ├── clubs/page.tsx               # owner's clubs list
│   │   ├── clubs/new/page.tsx           # create club
│   │   ├── clubs/[id]/page.tsx          # edit club: courts, QRs
│   │   └── bookings/page.tsx            # review/confirm bookings
│   └── admin/clubs/page.tsx             # admin approval queue
├── lib/
│   ├── supabase/client.ts               # browser client
│   ├── supabase/server.ts               # server client (cookies)
│   ├── booking/pricing.ts               # price calc (pure)
│   ├── booking/slots.ts                 # slot validation + overlap (pure)
│   └── booking/expiry.ts                # expiry helpers (pure)
├── supabase/migrations/                 # SQL schema + RLS + cron
├── tests/unit/                          # Vitest
└── tests/e2e/                           # Playwright (optional)
```

---

## Phase 0 — Project Setup

### Task 0.1: Scaffold Next.js + tooling

**Files:**
- Create: project root files (`package.json`, `tsconfig.json`, `tailwind.config.ts`, `vitest.config.ts`)

- [ ] **Step 1: Scaffold app**

```bash
npx create-next-app@latest . --typescript --tailwind --app --eslint --src-dir=false --import-alias "@/*"
```

- [ ] **Step 2: Install dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr zod
npm install class-variance-authority clsx tailwind-merge lucide-react @base-ui-components/react sonner
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react tw-animate-css
```

Note: Tailwind v4 is configured via `@theme` in `globals.css` (Task 0.3) — do NOT create `tailwind.config.js`. Ensure `postcss.config.js` uses `@tailwindcss/postcss` (matches RaceDay).

- [ ] **Step 3: Add Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", globals: true },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
```

Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"typecheck": "tsc --noEmit"`.

- [ ] **Step 4: Verify toolchain**

Run: `npm run typecheck && npm run test`
Expected: typecheck passes; Vitest reports "no test files found" (exit 0 is fine, or add a trivial passing test).

- [ ] **Step 5: Checkpoint** — `npm run typecheck` green.

### Task 0.2: Supabase clients + env

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `.env.local.example`

- [ ] **Step 1: Env template**

Create `.env.local.example`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 2: Browser client** — Create `lib/supabase/client.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 3: Server client** — Create `lib/supabase/server.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) =>
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  );
}
```

- [ ] **Step 4: Checkpoint** — `npm run typecheck` green.

### Task 0.3: Port RaceDay design system (exact parity)

**Goal:** Make pickleplay visually identical to RaceDay. Copy the presentational design layer from `/Users/chinoyoung/Code/raceday`, adapting auth-coupled bits to Supabase.

**Files:**
- Copy/port: `app/globals.css`, `components.json`, `postcss.config.js`, `lib/utils.ts`, `components/ui/*`, `components/layout/Navbar.tsx`, `components/layout/Footer.tsx`
- Modify: `app/layout.tsx` (fonts + dark class)

- [ ] **Step 1: Copy theme + config files** — Copy these from raceday verbatim:

```bash
cp /Users/chinoyoung/Code/raceday/app/globals.css app/globals.css
cp /Users/chinoyoung/Code/raceday/components.json components.json
cp /Users/chinoyoung/Code/raceday/postcss.config.js postcss.config.js
cp /Users/chinoyoung/Code/raceday/lib/utils.ts lib/utils.ts
```

Then open `app/globals.css` and remove any raceday-only blocks that reference libraries pickleplay doesn't use (e.g. `.leaflet-*`, `.react-grid-item`, `.rgl-editing` — leaflet/react-grid). Keep all `@theme` tokens, base layer, fonts, scrollbar, and reduced-motion blocks intact.

- [ ] **Step 2: Copy presentational UI components** — Copy the whole shadcn `components/ui` folder:

```bash
mkdir -p components/ui components/layout
cp /Users/chinoyoung/Code/raceday/components/ui/*.tsx components/ui/
```

Remove components pickleplay won't use in the MVP if they pull heavy deps (e.g. `sidebar.tsx` is fine to keep; drop `ImageUpload.tsx` only if it imports Convex). Keep `button.tsx`, `card.tsx`, `input.tsx`, `label.tsx`, `badge.tsx`, `table.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `separator.tsx`, `sheet.tsx`, `skeleton.tsx`, `tabs.tsx`, `textarea.tsx`, `tooltip.tsx`, `breadcrumb.tsx`, `alert-dialog.tsx`. After copying, run `npm run typecheck` and install any missing Base UI / Radix peer deps it reports.

- [ ] **Step 3: Set up fonts in root layout** — Edit `app/layout.tsx` to match raceday:

```tsx
import { Barlow, Barlow_Condensed } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const barlow = Barlow({ subsets: ["latin"], weight: ["300","400","500","600","700"], variable: "--font-body", display: "swap" });
const barlowCondensed = Barlow_Condensed({ subsets: ["latin"], weight: ["400","500","600","700"], variable: "--font-heading", display: "swap" });

export const metadata = { title: "PicklePlay", description: "Book pickleball courts" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <body className={`${barlow.variable} ${barlowCondensed.variable} antialiased selection:bg-primary/30 selection:text-white overflow-x-hidden`}>
        {children}
        <Toaster richColors closeButton position="top-right" />
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Port Navbar + Footer (adapt Clerk → Supabase)** — Copy raceday's `components/layout/Navbar.tsx` and `Footer.tsx`. In the Navbar:
  - Replace Clerk's `<UserButton/>` / `useUser` with a Supabase-based auth control: a server-fetched user (or a small client component using `createClient().auth.getUser()`) showing "Sign In" / "Register" links when logged out, and a name + Sign Out (calls the `signOut` action from Phase 3) when logged in.
  - Replace `NAV_LINKS` with pickleplay's: `Courts` (`/clubs`), `My Bookings` (`/my-bookings`). Keep the exact same className strings, scroll-shrink behavior, mobile drawer, and logo slot (use a text logo "PicklePlay" or a placeholder until a logo asset exists).
  - Keep all styling classes identical (`fixed top-0 ... z-[100] ... px-4 py-8`, scrolled state `bg-background/80 backdrop-blur-md shadow-lg py-6`, `text-text-muted hover:text-primary`, etc.).

- [ ] **Step 5: Create the public app shell** — Create `app/(public)/layout.tsx` mirroring raceday's app layout:

```tsx
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-primary/30 selection:text-white overflow-x-hidden">
      <Navbar />
      <main className="flex-grow pt-24">{children}</main>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 6: Verify parity** — Run `npm run dev`, open the home page. Confirm: dark slate background (#111827), orange primary buttons, Barlow Condensed uppercase headings, navbar matches raceday's structure/shrink-on-scroll. Render one `<Button>`, one `<Card>`, one `<Badge variant="success">` to confirm components render with raceday styling.

- [ ] **Step 7: Checkpoint** — `npm run typecheck` green; visual parity confirmed against raceday.

---

## Phase 1 — Database Schema & RLS

### Task 1.1: Core tables migration

**Files:**
- Create: `supabase/migrations/0001_core_schema.sql`

- [ ] **Step 1: Write schema migration**

```sql
-- profiles
create type user_role as enum ('player','owner','admin');
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'player',
  full_name text,
  contact_number text,
  created_at timestamptz default now()
);

create type club_status as enum ('pending','approved','rejected');
create table clubs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  description text,
  city text,
  area text,
  address text,
  amenities text[] default '{}',
  status club_status not null default 'pending',
  created_at timestamptz default now()
);

create table club_payment_qrs (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  label text not null,            -- 'gcash' | 'maya' | 'bank' | custom
  image_path text not null
);

create table courts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  name text not null,
  hourly_rate numeric(10,2) not null check (hourly_rate >= 0),
  open_hour int not null check (open_hour between 0 and 23),
  close_hour int not null check (close_hour between 1 and 24),
  check (close_hour > open_hour),
  created_at timestamptz default now()
);

create type booking_status as enum
  ('pending_payment','proof_submitted','confirmed','rejected','cancelled');
create table bookings (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references courts(id) on delete cascade,
  player_id uuid not null references profiles(id) on delete cascade,
  date date not null,
  start_hour int not null check (start_hour between 0 and 23),
  end_hour int not null check (end_hour between 1 and 24),
  total_price numeric(10,2) not null,
  status booking_status not null default 'pending_payment',
  payment_proof_path text,
  rejection_reason text,
  expires_at timestamptz,
  created_at timestamptz default now(),
  check (end_hour > start_hour)
);
create index on bookings (court_id, date);
```

- [ ] **Step 2: Apply migration**

Run: `supabase db push` (or paste into Supabase SQL editor for hosted).
Expected: all tables created, no errors.

- [ ] **Step 3: Checkpoint** — confirm tables exist via Supabase dashboard / `supabase db diff` clean.

### Task 1.2: Profile auto-creation trigger

**Files:**
- Create: `supabase/migrations/0002_profile_trigger.sql`

- [ ] **Step 1: Write trigger**

```sql
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
```

- [ ] **Step 2: Apply + verify** — Create a test user via Supabase Auth UI; confirm a `profiles` row appears with role `player`.

- [ ] **Step 3: Checkpoint** — trigger present, profile row created.

### Task 1.3: RLS policies

**Files:**
- Create: `supabase/migrations/0003_rls.sql`

- [ ] **Step 1: Write RLS**

```sql
alter table profiles enable row level security;
alter table clubs enable row level security;
alter table courts enable row level security;
alter table club_payment_qrs enable row level security;
alter table bookings enable row level security;

create function is_admin() returns boolean language sql stable security definer
set search_path = public as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- profiles
create policy profiles_self_read on profiles for select using (id = auth.uid() or is_admin());
create policy profiles_self_update on profiles for update using (id = auth.uid());

-- clubs
create policy clubs_public_read on clubs for select using (status = 'approved' or owner_id = auth.uid() or is_admin());
create policy clubs_owner_write on clubs for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy clubs_admin_write on clubs for update using (is_admin());

-- courts
create policy courts_public_read on courts for select using (
  exists(select 1 from clubs c where c.id = club_id and (c.status='approved' or c.owner_id=auth.uid() or is_admin()))
);
create policy courts_owner_write on courts for all using (
  exists(select 1 from clubs c where c.id = club_id and c.owner_id = auth.uid())
) with check (
  exists(select 1 from clubs c where c.id = club_id and c.owner_id = auth.uid())
);

-- qrs (mirror courts)
create policy qrs_public_read on club_payment_qrs for select using (
  exists(select 1 from clubs c where c.id = club_id and (c.status='approved' or c.owner_id=auth.uid() or is_admin()))
);
create policy qrs_owner_write on club_payment_qrs for all using (
  exists(select 1 from clubs c where c.id = club_id and c.owner_id = auth.uid())
) with check (
  exists(select 1 from clubs c where c.id = club_id and c.owner_id = auth.uid())
);

-- bookings
create policy bookings_player_rw on bookings for all using (player_id = auth.uid()) with check (player_id = auth.uid());
create policy bookings_owner_read on bookings for select using (
  exists(select 1 from courts ct join clubs c on c.id=ct.club_id where ct.id=court_id and c.owner_id=auth.uid())
);
create policy bookings_owner_update on bookings for update using (
  exists(select 1 from courts ct join clubs c on c.id=ct.club_id where ct.id=court_id and c.owner_id=auth.uid())
);
create policy bookings_admin_all on bookings for all using (is_admin());
```

- [ ] **Step 2: Apply migration** — `supabase db push`.

- [ ] **Step 3: Checkpoint** — RLS enabled on all 5 tables (verify in dashboard).

### Task 1.4: Storage buckets

**Files:**
- Create: `supabase/migrations/0004_storage.sql`

- [ ] **Step 1: Create buckets + policies**

```sql
insert into storage.buckets (id, name, public) values
  ('payment-qrs','payment-qrs', true),
  ('payment-proofs','payment-proofs', false)
on conflict do nothing;

-- proofs: readable by booking's player, court owner, or admin; writable by player
create policy proofs_read on storage.objects for select using (
  bucket_id = 'payment-proofs' and (
    is_admin() or owner = auth.uid() or exists(
      select 1 from bookings b join courts ct on ct.id=b.court_id join clubs c on c.id=ct.club_id
      where b.payment_proof_path = storage.objects.name and (b.player_id=auth.uid() or c.owner_id=auth.uid())
    )
  )
);
create policy proofs_write on storage.objects for insert with check (
  bucket_id = 'payment-proofs' and auth.uid() is not null
);
create policy qrs_write on storage.objects for insert with check (
  bucket_id = 'payment-qrs' and auth.uid() is not null
);
```

- [ ] **Step 2: Apply + Checkpoint** — buckets visible in Storage dashboard.

---

## Phase 2 — Pure Booking Logic (TDD core)

### Task 2.1: Pricing

**Files:**
- Create: `lib/booking/pricing.ts`
- Test: `tests/unit/pricing.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { calcTotalPrice } from "@/lib/booking/pricing";

describe("calcTotalPrice", () => {
  it("multiplies hourly rate by number of hours", () => {
    expect(calcTotalPrice(260, 6, 9)).toBe(780); // 3 hours
  });
  it("handles a single hour", () => {
    expect(calcTotalPrice(150, 7, 8)).toBe(150);
  });
  it("throws when end <= start", () => {
    expect(() => calcTotalPrice(100, 9, 9)).toThrow();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run tests/unit/pricing.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
export function calcTotalPrice(hourlyRate: number, startHour: number, endHour: number): number {
  if (endHour <= startHour) throw new Error("endHour must be greater than startHour");
  return hourlyRate * (endHour - startHour);
}
```

- [ ] **Step 4: Run — expect PASS.** `npx vitest run tests/unit/pricing.test.ts`

- [ ] **Step 5: Checkpoint** — tests green.

### Task 2.2: Slot validation + overlap detection

**Files:**
- Create: `lib/booking/slots.ts`
- Test: `tests/unit/slots.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { validateSlot, overlaps } from "@/lib/booking/slots";

describe("validateSlot", () => {
  it("accepts a consecutive range within operating hours", () => {
    expect(validateSlot({ startHour: 6, endHour: 9, openHour: 6, closeHour: 21 })).toEqual({ ok: true });
  });
  it("rejects zero-length range", () => {
    expect(validateSlot({ startHour: 8, endHour: 8, openHour: 6, closeHour: 21 }).ok).toBe(false);
  });
  it("rejects range outside operating hours", () => {
    expect(validateSlot({ startHour: 5, endHour: 7, openHour: 6, closeHour: 21 }).ok).toBe(false);
    expect(validateSlot({ startHour: 20, endHour: 22, openHour: 6, closeHour: 21 }).ok).toBe(false);
  });
});

describe("overlaps", () => {
  const existing = [{ startHour: 8, endHour: 10 }, { startHour: 14, endHour: 16 }];
  it("detects overlap", () => {
    expect(overlaps({ startHour: 9, endHour: 11 }, existing)).toBe(true);
  });
  it("allows adjacent non-overlapping", () => {
    expect(overlaps({ startHour: 10, endHour: 12 }, existing)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `npx vitest run tests/unit/slots.test.ts`

- [ ] **Step 3: Implement**

```ts
export interface Range { startHour: number; endHour: number; }

export function validateSlot(p: Range & { openHour: number; closeHour: number }):
  { ok: true } | { ok: false; reason: string } {
  if (p.endHour <= p.startHour) return { ok: false, reason: "Invalid time range" };
  if (p.startHour < p.openHour || p.endHour > p.closeHour)
    return { ok: false, reason: "Outside operating hours" };
  return { ok: true };
}

export function overlaps(candidate: Range, existing: Range[]): boolean {
  return existing.some(e => candidate.startHour < e.endHour && e.startHour < candidate.endHour);
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Checkpoint** — tests green.

### Task 2.3: Expiry helpers

**Files:**
- Create: `lib/booking/expiry.ts`
- Test: `tests/unit/expiry.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { computeExpiry, isExpired } from "@/lib/booking/expiry";

describe("expiry", () => {
  const base = new Date("2026-06-10T10:00:00Z");
  it("expires 30 minutes after creation", () => {
    expect(computeExpiry(base).toISOString()).toBe("2026-06-10T10:30:00.000Z");
  });
  it("isExpired true after the window", () => {
    expect(isExpired(computeExpiry(base), new Date("2026-06-10T10:31:00Z"))).toBe(true);
    expect(isExpired(computeExpiry(base), new Date("2026-06-10T10:29:00Z"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

```ts
export const PENDING_WINDOW_MINUTES = 30;

export function computeExpiry(createdAt: Date): Date {
  return new Date(createdAt.getTime() + PENDING_WINDOW_MINUTES * 60_000);
}
export function isExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() > expiresAt.getTime();
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Checkpoint** — tests green.

### Task 2.4: Availability query helper (server)

**Files:**
- Create: `lib/booking/availability.ts`
- Test: `tests/unit/availability.test.ts`

- [ ] **Step 1: Write failing test** (pure function over a booking list)

```ts
import { describe, it, expect } from "vitest";
import { freeHours } from "@/lib/booking/availability";

describe("freeHours", () => {
  it("returns open hours minus booked, ignoring expired pending and rejected/cancelled", () => {
    const now = new Date("2026-06-10T10:00:00Z");
    const bookings = [
      { startHour: 8, endHour: 10, status: "confirmed", expiresAt: null },
      { startHour: 12, endHour: 13, status: "pending_payment", expiresAt: new Date("2026-06-10T09:00:00Z") }, // expired -> free
      { startHour: 15, endHour: 16, status: "rejected", expiresAt: null }, // free
    ];
    expect(freeHours({ openHour: 8, closeHour: 17 }, bookings as any, now))
      .toEqual([10, 11, 12, 13, 14, 15, 16]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

```ts
import { isExpired } from "./expiry";

type B = { startHour: number; endHour: number; status: string; expiresAt: Date | null };

export function freeHours(
  court: { openHour: number; closeHour: number },
  bookings: B[],
  now: Date
): number[] {
  const blocked = new Set<number>();
  for (const b of bookings) {
    if (b.status === "rejected" || b.status === "cancelled") continue;
    if (b.status === "pending_payment" && b.expiresAt && isExpired(b.expiresAt, now)) continue;
    for (let h = b.startHour; h < b.endHour; h++) blocked.add(h);
  }
  const free: number[] = [];
  for (let h = court.openHour; h < court.closeHour; h++) if (!blocked.has(h)) free.push(h);
  return free;
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Checkpoint** — full `npm run test` green.

---

## Phase 3 — Auth & Roles

### Task 3.1: Auth middleware (session refresh + route guards)

**Files:**
- Create: `middleware.ts`, `lib/auth/requireRole.ts`

- [ ] **Step 1: Middleware for session**

Create `middleware.ts`:

```ts
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet) => toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
      },
    }
  );
  await supabase.auth.getUser();
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
```

- [ ] **Step 2: Role guard helper** — Create `lib/auth/requireRole.ts`:

```ts
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireRole(roles: Array<"player" | "owner" | "admin">) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (!profile || !roles.includes(profile.role)) redirect("/");
  return { user, profile };
}
```

- [ ] **Step 3: Checkpoint** — `npm run typecheck` green.

### Task 3.2: Register & Login pages

**Files:**
- Create: `app/(auth)/register/page.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/actions.ts`

- [ ] **Step 1: Server actions** — Create `app/(auth)/actions.ts`:

```ts
"use server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signUp(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));
  const full_name = String(formData.get("full_name"));
  const wantsOwner = formData.get("role") === "owner";
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name } } });
  if (error) return redirect(`/register?error=${encodeURIComponent(error.message)}`);
  if (wantsOwner && data.user) {
    await supabase.from("profiles").update({ role: "owner" }).eq("id", data.user.id);
  }
  redirect("/");
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")), password: String(formData.get("password")),
  });
  if (error) return redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
```

- [ ] **Step 2: Register page** — Create `app/(auth)/register/page.tsx` with a form posting to `signUp`: fields `full_name`, `email`, `password`, and a checkbox/select `role` (player default, owner option). Render `searchParams.error` if present.

- [ ] **Step 3: Login page** — Create `app/(auth)/login/page.tsx` with a form posting to `signIn`: fields `email`, `password`. Render error.

- [ ] **Step 4: Manual verification** — Register a player and an owner; confirm `profiles.role` is set correctly; log in/out works.

- [ ] **Step 5: Checkpoint** — `npm run typecheck` green; manual auth flow verified.

---

## Phase 4 — Owner: Clubs, Courts, QRs

### Task 4.1: Create club

**Files:**
- Create: `app/owner/clubs/new/page.tsx`, `app/owner/actions.ts`, `app/owner/clubs/page.tsx`

- [ ] **Step 1: Owner actions** — Create `app/owner/actions.ts`:

```ts
"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/requireRole";
import { redirect } from "next/navigation";

const ClubSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  city: z.string().min(1),
  area: z.string().optional(),
  address: z.string().optional(),
  amenities: z.string().optional(), // comma-separated
});

export async function createClub(formData: FormData) {
  const { user } = await requireRole(["owner"]);
  const parsed = ClubSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase.from("clubs").insert({
    owner_id: user.id,
    name: parsed.name,
    description: parsed.description,
    city: parsed.city,
    area: parsed.area,
    address: parsed.address,
    amenities: parsed.amenities ? parsed.amenities.split(",").map(s => s.trim()).filter(Boolean) : [],
  });
  if (error) throw error;
  redirect("/owner/clubs");
}
```

- [ ] **Step 2: New-club page** — Create `app/owner/clubs/new/page.tsx`: `await requireRole(["owner"])`, render form posting to `createClub`.

- [ ] **Step 3: Owner clubs list** — Create `app/owner/clubs/page.tsx`: `requireRole(["owner"])`, query clubs where `owner_id = user.id`, show name + `status` badge + link to edit.

- [ ] **Step 4: Manual verification** — Owner creates a club; row appears with `status='pending'`.

- [ ] **Step 5: Checkpoint** — typecheck green; club created with pending status.

### Task 4.2: Add courts

**Files:**
- Modify: `app/owner/actions.ts` (add `addCourt`)
- Create: `app/owner/clubs/[id]/page.tsx`

- [ ] **Step 1: addCourt action** — Append to `app/owner/actions.ts`:

```ts
const CourtSchema = z.object({
  club_id: z.string().uuid(),
  name: z.string().min(1),
  hourly_rate: z.coerce.number().min(0),
  open_hour: z.coerce.number().int().min(0).max(23),
  close_hour: z.coerce.number().int().min(1).max(24),
});

export async function addCourt(formData: FormData) {
  const { user } = await requireRole(["owner"]);
  const c = CourtSchema.parse(Object.fromEntries(formData));
  if (c.close_hour <= c.open_hour) throw new Error("close_hour must exceed open_hour");
  const supabase = await createClient();
  // ownership enforced by RLS; also verify here for a clear error
  const { data: club } = await supabase.from("clubs").select("id").eq("id", c.club_id).eq("owner_id", user.id).single();
  if (!club) throw new Error("Not your club");
  const { error } = await supabase.from("courts").insert(c);
  if (error) throw error;
  redirect(`/owner/clubs/${c.club_id}`);
}
```

- [ ] **Step 2: Club edit page** — Create `app/owner/clubs/[id]/page.tsx`: `requireRole(["owner"])`, fetch club (owned) + its courts + QRs, render: club details, a courts table, an "add court" form (hidden `club_id`), and the QR section (Task 4.3).

- [ ] **Step 3: Manual verification** — Add a court; appears in the list with rate + hours.

- [ ] **Step 4: Checkpoint** — typecheck green; court created.

### Task 4.3: Upload payment QR codes

**Files:**
- Modify: `app/owner/actions.ts` (add `uploadQr`)

- [ ] **Step 1: uploadQr action** — Append:

```ts
export async function uploadQr(formData: FormData) {
  const { user } = await requireRole(["owner"]);
  const clubId = String(formData.get("club_id"));
  const label = String(formData.get("label"));
  const file = formData.get("image") as File;
  if (!file || file.size === 0) throw new Error("Image required");
  const supabase = await createClient();
  const { data: club } = await supabase.from("clubs").select("id").eq("id", clubId).eq("owner_id", user.id).single();
  if (!club) throw new Error("Not your club");
  const path = `${clubId}/${label}-${file.name}`;
  const { error: upErr } = await supabase.storage.from("payment-qrs").upload(path, file, { upsert: true });
  if (upErr) throw upErr;
  const { error } = await supabase.from("club_payment_qrs").insert({ club_id: clubId, label, image_path: path });
  if (error) throw error;
  redirect(`/owner/clubs/${clubId}`);
}
```

- [ ] **Step 2: QR form** — In `app/owner/clubs/[id]/page.tsx`, add a multipart form (`encType="multipart/form-data"`) posting to `uploadQr` with `label` select (gcash/maya/bank) + file input. Render existing QRs with `getPublicUrl`.

- [ ] **Step 3: Manual verification** — Upload a QR; it appears and is publicly viewable.

- [ ] **Step 4: Checkpoint** — typecheck green; QR uploaded + visible.

---

## Phase 5 — Admin: Club Approval

### Task 5.1: Admin approval queue

**Files:**
- Create: `app/admin/clubs/page.tsx`, `app/admin/actions.ts`

- [ ] **Step 1: Admin actions** — Create `app/admin/actions.ts`:

```ts
"use server";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/requireRole";
import { revalidatePath } from "next/cache";

export async function setClubStatus(formData: FormData) {
  await requireRole(["admin"]);
  const id = String(formData.get("club_id"));
  const status = String(formData.get("status")); // 'approved' | 'rejected'
  const supabase = await createClient();
  const { error } = await supabase.from("clubs").update({ status }).eq("id", id);
  if (error) throw error;
  revalidatePath("/admin/clubs");
}
```

- [ ] **Step 2: Admin page** — Create `app/admin/clubs/page.tsx`: `requireRole(["admin"])`, list all clubs (default filter `pending`) with Approve/Reject buttons posting to `setClubStatus`.

- [ ] **Step 3: Manual verification** — As an admin (set a profile's role to `admin` in DB), approve a club; it becomes visible in public discovery.

- [ ] **Step 4: Checkpoint** — typecheck green; approval flow verified.

---

## Phase 6 — Discovery

### Task 6.1: Clubs discovery (search + filters)

**Files:**
- Create: `app/(public)/clubs/page.tsx`

- [ ] **Step 1: Discovery page** — Create `app/(public)/clubs/page.tsx` (Server Component) reading `searchParams`: `q` (name), `city`, `maxPrice`, `amenity`.

```tsx
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function ClubsPage({ searchParams }: { searchParams: Promise<Record<string,string>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  let query = supabase.from("clubs")
    .select("id,name,city,area,amenities,courts(hourly_rate)")
    .eq("status", "approved");
  if (sp.q) query = query.ilike("name", `%${sp.q}%`);
  if (sp.city) query = query.eq("city", sp.city);
  if (sp.amenity) query = query.contains("amenities", [sp.amenity]);
  const { data: clubs } = await query;
  // maxPrice filtered in-memory against min court rate
  const filtered = (clubs ?? []).filter(c =>
    !sp.maxPrice || (c.courts ?? []).some((ct: any) => ct.hourly_rate <= Number(sp.maxPrice)));
  return (
    <main>
      <form className="filters">
        <input name="q" placeholder="Search clubs" defaultValue={sp.q} />
        <input name="city" placeholder="City" defaultValue={sp.city} />
        <input name="maxPrice" placeholder="Max ₱/hr" defaultValue={sp.maxPrice} />
        <input name="amenity" placeholder="Amenity" defaultValue={sp.amenity} />
        <button type="submit">Filter</button>
      </form>
      <ul>
        {filtered.map(c => (
          <li key={c.id}><Link href={`/clubs/${c.id}`}>{c.name} — {c.city}</Link></li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Manual verification** — Approved clubs appear; pending clubs do NOT; filters narrow results.

- [ ] **Step 3: Checkpoint** — typecheck green; discovery verified.

### Task 6.2: Club profile page

**Files:**
- Create: `app/(public)/clubs/[id]/page.tsx`

- [ ] **Step 1: Profile page** — Create `app/(public)/clubs/[id]/page.tsx`: fetch approved club + courts + QR labels. For each court render name, hourly rate, hours, and a "Book" link to the booking selector (Phase 7). Show payment QR images.

- [ ] **Step 2: Manual verification** — Profile shows courts + rates + QR images.

- [ ] **Step 3: Checkpoint** — typecheck green.

---

## Phase 7 — Booking + Payment Proof

### Task 7.1: Create booking (slot selection)

**Files:**
- Create: `app/booking/actions.ts`, `app/(public)/clubs/[id]/book/[courtId]/page.tsx`

- [ ] **Step 1: createBooking action** — Create `app/booking/actions.ts`:

```ts
"use server";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/requireRole";
import { redirect } from "next/navigation";
import { validateSlot, overlaps } from "@/lib/booking/slots";
import { calcTotalPrice } from "@/lib/booking/pricing";
import { computeExpiry } from "@/lib/booking/expiry";
import { isExpired } from "@/lib/booking/expiry";

export async function createBooking(formData: FormData) {
  const { user } = await requireRole(["player", "owner", "admin"]);
  const courtId = String(formData.get("court_id"));
  const date = String(formData.get("date"));
  const startHour = Number(formData.get("start_hour"));
  const endHour = Number(formData.get("end_hour"));
  const supabase = await createClient();

  const { data: court } = await supabase.from("courts").select("hourly_rate,open_hour,close_hour").eq("id", courtId).single();
  if (!court) throw new Error("Court not found");

  const v = validateSlot({ startHour, endHour, openHour: court.open_hour, closeHour: court.close_hour });
  if (!v.ok) throw new Error(v.reason);

  const { data: existing } = await supabase.from("bookings")
    .select("start_hour,end_hour,status,expires_at").eq("court_id", courtId).eq("date", date);
  const now = new Date();
  const active = (existing ?? []).filter(b =>
    !(b.status === "rejected" || b.status === "cancelled") &&
    !(b.status === "pending_payment" && b.expires_at && isExpired(new Date(b.expires_at), now)));
  if (overlaps({ startHour, endHour }, active.map(b => ({ startHour: b.start_hour, endHour: b.end_hour }))))
    throw new Error("Slot just taken");

  const total = calcTotalPrice(Number(court.hourly_rate), startHour, endHour);
  const { data, error } = await supabase.from("bookings").insert({
    court_id: courtId, player_id: user.id, date, start_hour: startHour, end_hour: endHour,
    total_price: total, status: "pending_payment", expires_at: computeExpiry(now).toISOString(),
  }).select("id").single();
  if (error) throw error;
  redirect(`/booking/${data.id}`);
}
```

- [ ] **Step 2: Booking selector page** — Create `app/(public)/clubs/[id]/book/[courtId]/page.tsx`: a Client Component that lets the user pick a date and a start/end hour from `freeHours` (fetched via a small server action or route), then posts to `createBooking`. For MVP, render a date input + two hour selects constrained to the court's operating hours; the server action is the source of truth for conflicts.

- [ ] **Step 3: Manual verification** — Booking a free range creates a `pending_payment` booking and redirects to its page; booking an overlapping range shows "Slot just taken".

- [ ] **Step 4: Checkpoint** — `npm run test` green (logic reused); manual flow verified.

### Task 7.2: Booking detail + proof upload

**Files:**
- Create: `app/booking/[id]/page.tsx`
- Modify: `app/booking/actions.ts` (add `uploadProof`)

- [ ] **Step 1: uploadProof action** — Append to `app/booking/actions.ts`:

```ts
export async function uploadProof(formData: FormData) {
  const { user } = await requireRole(["player", "owner", "admin"]);
  const bookingId = String(formData.get("booking_id"));
  const file = formData.get("proof") as File;
  if (!file || file.size === 0) throw new Error("Proof image required");
  const supabase = await createClient();
  const { data: booking } = await supabase.from("bookings").select("id,player_id,status").eq("id", bookingId).single();
  if (!booking || booking.player_id !== user.id) throw new Error("Not your booking");
  if (booking.status !== "pending_payment") throw new Error("Booking is not awaiting payment");
  const path = `${bookingId}/${file.name}`;
  const { error: upErr } = await supabase.storage.from("payment-proofs").upload(path, file, { upsert: true });
  if (upErr) throw upErr;
  const { error } = await supabase.from("bookings")
    .update({ payment_proof_path: path, status: "proof_submitted", expires_at: null })
    .eq("id", bookingId);
  if (error) throw error;
  redirect(`/booking/${bookingId}`);
}
```

- [ ] **Step 2: Booking detail page** — Create `app/booking/[id]/page.tsx`: fetch booking (RLS scopes to player/owner/admin), show court/club, date/time, total, status. If `pending_payment`: show the club's QR images + a multipart form posting to `uploadProof` + a visible countdown to `expires_at`. If `proof_submitted`: "Awaiting confirmation". If `confirmed`/`rejected`: show status (and `rejection_reason`).

- [ ] **Step 3: Manual verification** — Upload proof → status flips to `proof_submitted`, `expires_at` cleared.

- [ ] **Step 4: Checkpoint** — typecheck green; proof flow verified.

### Task 7.3: My Bookings

**Files:**
- Create: `app/my-bookings/page.tsx`

- [ ] **Step 1: Page** — Create `app/my-bookings/page.tsx`: `requireRole(["player","owner","admin"])`, list bookings where `player_id = user.id` ordered by date desc, with status badges and links to `/booking/[id]`.

- [ ] **Step 2: Manual verification** — Player sees their bookings with correct statuses.

- [ ] **Step 3: Checkpoint** — typecheck green.

---

## Phase 8 — Owner Booking Review + Expiry Job

### Task 8.1: Owner booking review (confirm/reject)

**Files:**
- Create: `app/owner/bookings/page.tsx`
- Modify: `app/owner/actions.ts` (add `confirmBooking`, `rejectBooking`)

- [ ] **Step 1: Actions** — Append to `app/owner/actions.ts`:

```ts
export async function confirmBooking(formData: FormData) {
  await requireRole(["owner"]);
  const id = String(formData.get("booking_id"));
  const supabase = await createClient();
  // RLS bookings_owner_update ensures owner only updates their courts' bookings
  const { error } = await supabase.from("bookings").update({ status: "confirmed" }).eq("id", id).eq("status", "proof_submitted");
  if (error) throw error;
  revalidatePath("/owner/bookings");
}

export async function rejectBooking(formData: FormData) {
  await requireRole(["owner"]);
  const id = String(formData.get("booking_id"));
  const reason = String(formData.get("reason") || "Rejected by venue");
  const supabase = await createClient();
  const { error } = await supabase.from("bookings")
    .update({ status: "rejected", rejection_reason: reason }).eq("id", id);
  if (error) throw error;
  revalidatePath("/owner/bookings");
}
```

(Ensure `revalidatePath` is imported at the top of `app/owner/actions.ts`.)

- [ ] **Step 2: Owner bookings page** — Create `app/owner/bookings/page.tsx`: `requireRole(["owner"])`, query bookings joined to owner's courts (RLS scopes automatically), default-filter `proof_submitted`. For each: show player, court, date/time, total, a link to the proof image (signed URL via `supabase.storage.from('payment-proofs').createSignedUrl`), and Confirm / Reject (with reason) forms.

- [ ] **Step 3: Manual verification** — Owner sees submitted proofs, confirms one (→ `confirmed`, visible to player), rejects another with reason (→ `rejected`, reason visible to player).

- [ ] **Step 4: Checkpoint** — typecheck green; confirm/reject verified end-to-end.

### Task 8.2: Auto-expire pending bookings (cron)

**Files:**
- Create: `supabase/migrations/0005_expire_cron.sql`

- [ ] **Step 1: Expiry SQL + schedule**

```sql
create or replace function expire_pending_bookings()
returns void language sql as $$
  update bookings set status = 'cancelled'
  where status = 'pending_payment' and expires_at is not null and expires_at < now();
$$;

-- requires pg_cron extension (enable in Supabase dashboard)
select cron.schedule('expire-pending-bookings', '* * * * *', $$select expire_pending_bookings();$$);
```

- [ ] **Step 2: Apply** — enable `pg_cron` in Supabase, run migration.

- [ ] **Step 3: Manual verification** — Create a `pending_payment` booking, set `expires_at` to the past, wait ≤1 min → status becomes `cancelled`; the slot is bookable again. (Availability also ignores expired pending bookings live, so discovery is correct even before cron runs.)

- [ ] **Step 4: Checkpoint** — full `npm run test` + `npm run typecheck` green; expiry verified.

---

## Self-Review (completed during authoring)

- **Spec coverage:** Auth/roles (Phase 3), profiles + trigger (1.2), clubs/courts/QR with owner self-service (Phase 4), admin approval gate (Phase 5), discovery search+filter (Phase 6), booking with consecutive hours + overlap + pricing (2.1/2.2/7.1), manual QR + proof + owner confirm/reject (4.3/7.2/8.1), 30-min expiry both live-ignored and cron-cancelled (2.3/2.4/8.2), in-app status only (booking detail + My Bookings, no email), RLS per role (1.3) and storage (1.4). All spec sections mapped.
- **Placeholder scan:** No TBD/TODO; every code step shows real code.
- **Type consistency:** `validateSlot`/`overlaps`/`calcTotalPrice`/`computeExpiry`/`isExpired`/`freeHours` signatures are defined once (Phase 2) and reused with matching shapes in `createBooking`. Status enum values consistent across SQL and TS.
```
