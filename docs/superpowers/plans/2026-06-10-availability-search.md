# Availability-First Court Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
>
> **Git is disabled.** Use **Checkpoint** steps (tests/typecheck/build + verify) instead of commits. Never run git.

**Goal:** Add a hotel-style court search — pick date + start/end hour in the hero, see every available court for that window on a `/search` page, and book via the existing booking flow pre-filled.

**Architecture:** A new pure `isCourtAvailable` helper (composing the tested `validateSlot` + `overlaps`) drives a `/search` results server page. A reusable client `CourtSearchBar` lives in the hero and atop the results page. Booking reuses the existing booking page + `createBooking`, extended to accept `?start=&end=` pre-fill. No new booking path.

**Tech Stack:** Next.js 16 (App Router) + Supabase + existing `components/ui` + `lib/booking/*`. Vitest for the pure helper.

**Spec:** `docs/superpowers/specs/2026-06-10-availability-search-design.md`

---

## File Structure
```
lib/booking/search.ts                 # NEW pure isCourtAvailable
tests/unit/search.test.ts             # NEW
components/search/CourtSearchBar.tsx   # NEW client form (hero + results)
app/(public)/search/page.tsx          # NEW results page
app/(public)/page.tsx                 # MODIFY hero to embed CourtSearchBar
app/(public)/clubs/[id]/book/[courtId]/page.tsx   # MODIFY read start/end
app/(public)/clubs/[id]/book/[courtId]/SlotPicker.tsx  # MODIFY pre-select start/end
```

---

## Phase 1 — Pure availability helper (TDD)

### Task 1.1: `isCourtAvailable`

**Files:** Create `lib/booking/search.ts`; Test `tests/unit/search.test.ts`

- [ ] **Step 1: Write failing tests**
```ts
import { describe, it, expect } from "vitest";
import { isCourtAvailable } from "@/lib/booking/search";

const hours = { openHour: 6, closeHour: 21 };
const now = new Date("2026-06-10T10:00:00Z");

describe("isCourtAvailable", () => {
  it("true when window is free and within hours", () => {
    expect(isCourtAvailable(hours, [], { startHour: 8, endHour: 10 }, now)).toBe(true);
  });
  it("false when an active booking overlaps", () => {
    const bookings = [{ startHour: 9, endHour: 11, status: "confirmed", expiresAt: null }];
    expect(isCourtAvailable(hours, bookings, { startHour: 8, endHour: 10 }, now)).toBe(false);
  });
  it("false when window is outside operating hours", () => {
    expect(isCourtAvailable(hours, [], { startHour: 5, endHour: 7 }, now)).toBe(false);
    expect(isCourtAvailable(hours, [], { startHour: 20, endHour: 22 }, now)).toBe(false);
  });
  it("ignores expired pending bookings", () => {
    const bookings = [{ startHour: 8, endHour: 10, status: "pending_payment", expiresAt: new Date("2026-06-10T09:00:00Z") }];
    expect(isCourtAvailable(hours, bookings, { startHour: 8, endHour: 10 }, now)).toBe(true);
  });
  it("ignores rejected and cancelled bookings", () => {
    const bookings = [
      { startHour: 8, endHour: 10, status: "rejected", expiresAt: null },
      { startHour: 8, endHour: 10, status: "cancelled", expiresAt: null },
    ];
    expect(isCourtAvailable(hours, bookings, { startHour: 8, endHour: 10 }, now)).toBe(true);
  });
  it("blocks against a live pending booking", () => {
    const bookings = [{ startHour: 8, endHour: 10, status: "pending_payment", expiresAt: new Date("2026-06-10T10:20:00Z") }];
    expect(isCourtAvailable(hours, bookings, { startHour: 8, endHour: 10 }, now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `npx vitest run tests/unit/search.test.ts`

- [ ] **Step 3: Implement** `lib/booking/search.ts`
```ts
import { validateSlot, overlaps } from "./slots";
import { isExpired } from "./expiry";

type Booking = { startHour: number; endHour: number; status: string; expiresAt: Date | null };

export function isCourtAvailable(
  courtHours: { openHour: number; closeHour: number },
  bookings: Booking[],
  window: { startHour: number; endHour: number },
  now: Date
): boolean {
  const v = validateSlot({
    startHour: window.startHour, endHour: window.endHour,
    openHour: courtHours.openHour, closeHour: courtHours.closeHour,
  });
  if (!v.ok) return false;
  const active = bookings.filter(b =>
    !(b.status === "rejected" || b.status === "cancelled") &&
    !(b.status === "pending_payment" && b.expiresAt && isExpired(b.expiresAt, now))
  );
  return !overlaps(window, active.map(b => ({ startHour: b.startHour, endHour: b.endHour })));
}
```

- [ ] **Step 4: Run — expect PASS.** `npx vitest run tests/unit/search.test.ts`
- [ ] **Step 5: Checkpoint** — `npm run test` (all suites) + `npm run typecheck` green.

---

## Phase 2 — Search bar + hero

### Task 2.1: `CourtSearchBar` component

**Files:** Create `components/search/CourtSearchBar.tsx`

- [ ] **Step 1: Implement** — `"use client"`. Reusable search form used in the hero and atop the results page. Props: `defaults?: { date?: string; start?: number; end?: number }`. Behavior:
  - Computes `todayManila` = `new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date())` for the date input `min` and default.
  - Whole-hour options 5..23 for start; end options are start+1..24 (kept `> start`).
  - On submit, navigate with `useRouter().push(\`/search?date=${date}&start=${start}&end=${end}\`)`.
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

const HOURS = Array.from({ length: 19 }, (_, i) => i + 5); // 5..23

export function CourtSearchBar({ defaults }: { defaults?: { date?: string; start?: number; end?: number } }) {
  const router = useRouter();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const [date, setDate] = useState(defaults?.date ?? today);
  const [start, setStart] = useState(defaults?.start ?? 8);
  const [end, setEnd] = useState(defaults?.end ?? Math.max((defaults?.start ?? 8) + 1, 9));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/search?date=${date}&start=${start}&end=${Math.max(end, start + 1)}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col md:flex-row md:items-end gap-3 rounded-xl bg-card/80 backdrop-blur-sm ring-1 ring-foreground/10 p-4">
      <label className="flex flex-col gap-1.5 md:flex-1">
        <span className="text-xs uppercase tracking-wide text-text-muted">Date</span>
        <input type="date" min={today} value={date} onChange={e => setDate(e.target.value)}
          className="h-10 rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring" required />
      </label>
      <label className="flex flex-col gap-1.5 md:flex-1">
        <span className="text-xs uppercase tracking-wide text-text-muted">From</span>
        <select value={start} onChange={e => setStart(Number(e.target.value))}
          className="h-10 rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring">
          {HOURS.map(h => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 md:flex-1">
        <span className="text-xs uppercase tracking-wide text-text-muted">To</span>
        <select value={end} onChange={e => setEnd(Number(e.target.value))}
          className="h-10 rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring">
          {HOURS.filter(h => h > start).concat([24]).filter((h, i, a) => a.indexOf(h) === i).map(h => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
        </select>
      </label>
      <Button type="submit" className="shrink-0 gap-2 bg-cta hover:bg-cta/90 text-white"><Search className="size-4" /> Search</Button>
    </form>
  );
}
```

- [ ] **Step 2: Checkpoint** — `npm run typecheck` green.

### Task 2.2: Embed the search bar in the hero

**Files:** Modify `app/(public)/page.tsx`

- [ ] **Step 1: Edit the hero** — import `CourtSearchBar` and render it where the primary "Find a Court" button currently sits (inside the same `max-w-7xl mx-auto px-4` content wrapper, below the subtext). Remove the standalone "Find a Court" button (the search bar replaces it). Keep the "List Your Court" secondary button (place it just below or beside the search bar), the badge, headline, subtext, stats strip, and full-bleed image/gradient unchanged.
- [ ] **Step 2: Checkpoint** — `npm run typecheck` + `npm run build` pass; read the hero to confirm the search bar renders and the old Find-a-Court button is gone.

---

## Phase 3 — Results page

### Task 3.1: `/search` results page

**Files:** Create `app/(public)/search/page.tsx`

- [ ] **Step 1: Implement** — server component reading `searchParams` (await it): `date`, `start`, `end`, `city`, `maxPrice`, `amenity`.
```tsx
import { createClient } from "@/lib/supabase/server";
import { isCourtAvailable } from "@/lib/booking/search";
import { calcTotalPrice } from "@/lib/booking/pricing";
import { CourtSearchBar } from "@/components/search/CourtSearchBar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const date = sp.date, start = Number(sp.start), end = Number(sp.end);
  const valid = !!date && Number.isInteger(start) && Number.isInteger(end) && end > start;

  return (
    <main className="max-w-7xl mx-auto px-4 py-10 space-y-8">
      <h1 className="text-3xl md:text-4xl">Find an available court</h1>
      <CourtSearchBar defaults={{ date, start: valid ? start : undefined, end: valid ? end : undefined }} />
      {!valid ? (
        <p className="text-text-muted">Pick a date and time range to see available courts.</p>
      ) : (
        <Results date={date} start={start} end={end} city={sp.city} maxPrice={sp.maxPrice} amenity={sp.amenity} />
      )}
    </main>
  );
}

async function Results({ date, start, end, city, maxPrice, amenity }:
  { date: string; start: number; end: number; city?: string; maxPrice?: string; amenity?: string }) {
  const supabase = await createClient();
  const { data: courts } = await supabase
    .from("courts")
    .select("id, name, hourly_rate, open_hour, close_hour, clubs!inner(id, name, city, area, amenities, status)")
    .eq("clubs.status", "approved");

  const list = (courts ?? []) as any[];
  const courtIds = list.map(c => c.id);
  const { data: bookings } = courtIds.length
    ? await supabase.from("bookings").select("court_id, start_hour, end_hour, status, expires_at").in("court_id", courtIds).eq("date", date)
    : { data: [] as any[] };

  const byCourt = new Map<string, any[]>();
  for (const b of (bookings ?? [])) {
    const arr = byCourt.get(b.court_id) ?? [];
    arr.push({ startHour: b.start_hour, endHour: b.end_hour, status: b.status, expiresAt: b.expires_at ? new Date(b.expires_at) : null });
    byCourt.set(b.court_id, arr);
  }

  const now = new Date();
  let available = list.filter(c =>
    isCourtAvailable({ openHour: c.open_hour, closeHour: c.close_hour }, byCourt.get(c.id) ?? [], { startHour: start, endHour: end }, now)
  );
  if (city) available = available.filter(c => c.clubs.city === city);
  if (maxPrice) available = available.filter(c => Number(c.hourly_rate) <= Number(maxPrice));
  if (amenity) available = available.filter(c => (c.clubs.amenities ?? []).includes(amenity));

  if (!available.length) {
    return (
      <div className="rounded-xl bg-card ring-1 ring-foreground/10 p-8 text-center">
        <p className="text-text-muted">No courts free for that window. Try a different time, or <Link href="/clubs" className="text-primary hover:underline">browse all clubs</Link>.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {available.map(c => (
        <Card key={c.id}>
          <CardHeader>
            <CardTitle>{c.clubs.name} — {c.name}</CardTitle>
            <p className="text-sm text-text-muted">{c.clubs.city}{c.clubs.area ? `, ${c.clubs.area}` : ""}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-text-muted">Open {c.open_hour}:00–{c.close_hour}:00</p>
            <p className="text-lg font-bold">₱{calcTotalPrice(Number(c.hourly_rate), start, end)} <span className="text-sm font-normal text-text-muted">for {end - start}h</span></p>
            <Button asChild className="w-full bg-cta hover:bg-cta/90 text-white">
              <Link href={`/clubs/${c.clubs.id}/book/${c.id}?date=${date}&start=${start}&end=${end}`}>Book {String(start).padStart(2,"0")}:00–{String(end).padStart(2,"0")}:00</Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```
(If the `clubs!inner(...)` embed + `.eq("clubs.status","approved")` filter doesn't resolve in Supabase, fall back to: select courts with embedded clubs, then filter `c.clubs.status === "approved"` in code. Verify which works via build/runtime.)

- [ ] **Step 2: Verify** — `scripts/verify-search.mjs` (keys from THIS project's `.env.local` only): seed (service-role + owner session) an approved club + court (open 6, close 21, ₱200) on a known date with a `confirmed` booking 9→11. Replicate the page's query+filter logic in the script (or import `isCourtAvailable`): assert the court IS returned for window 6→8 (free) and 11→13 (free), and is NOT returned for 8→10 or 10→12 (overlap 9→11). Clean up.
- [ ] **Step 3: Checkpoint** — `npm run typecheck` + `npm run build` pass; verify-search passes.

---

## Phase 4 — Booking page pre-fill

### Task 4.1: Pre-select start/end in the booking page

**Files:** Modify `app/(public)/clubs/[id]/book/[courtId]/page.tsx`, `app/(public)/clubs/[id]/book/[courtId]/SlotPicker.tsx`

- [ ] **Step 1: Booking page** — read `start`/`end` from `searchParams` alongside the existing `date`. When `date` is provided via query, use it as the selected date (instead of forcing today), and pass `initialStart`/`initialEnd` (parsed ints, only if valid and within the computed free hours) to `<SlotPicker>`. Keep the existing date GET form for changing the date.
- [ ] **Step 2: SlotPicker** — extend props with `initialStart?: number; initialEnd?: number`. Initialize the start/end state from those props when present (clamped to the available `freeHours` / valid consecutive range); otherwise keep current defaults. The consecutive-range logic and submit-to-`createBooking` stay unchanged.
- [ ] **Step 3: Verify** — manual/code check: navigating to `/clubs/<clubId>/book/<courtId>?date=<d>&start=8&end=10` pre-selects date=d, start=8, end=10 in the picker (when those hours are free). Confirm `npm run typecheck` + `npm run build` pass.
- [ ] **Step 4: Checkpoint** — full `npm run test` (12 unit tests incl. new search tests) + `npm run typecheck` + `npm run build` all green.

---

## Self-Review (completed during authoring)
- **Spec coverage:** availability semantics + pure helper (1.1); hero search bar with date/start/end + PH-today min, whole-hour selects (2.1, 2.2); `/search` results with isCourtAvailable filter + city/price/amenity refine + prefilled search bar + empty state + price-for-window (3.1); Book → existing booking page pre-filled via `?date&start&end` (3.1 link + 4.1); `/clubs` browse untouched; reuses validateSlot/overlaps/calcTotalPrice/createBooking. All spec sections mapped.
- **Placeholder scan:** none; code shown in every code step.
- **Type consistency:** `isCourtAvailable(courtHours, bookings, window, now)` signature consistent across helper, tests, and the results page call; `CourtSearchBar` `defaults` prop shape (`date/start/end`) matches the page usage; query field names (`open_hour`, `close_hour`, `hourly_rate`, `expires_at`) match the schema and the booking-domain camelCase mapping used elsewhere.
