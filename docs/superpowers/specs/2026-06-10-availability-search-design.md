# Availability-First Court Search Design

**Date:** 2026-06-10
**Status:** Approved
**Builds on:** `2026-06-10-pickleball-booking-mvp-design.md`

## Overview

Add a hotel/flight-style court search: the player picks a **date + start time + end time** and sees **every available court** for that window across all approved pickleball courts, then books. The search bar lives in the homepage hero. The existing pickleball-court-browse page (`/pickleball-courts`) stays as a secondary "browse all venues" path.

## Goals
- Prominent **Date · Start · End · Search** form in the hero.
- A `/search` results page listing courts free for the whole requested window, with city/price/amenity refine filters.
- Booking reuses the existing, hardened booking flow (search is a faster discovery funnel, not a new booking path).

## Non-Goals
- No change to the hourly-slot booking model (whole-hour times only).
- No replacement of `/pickleball-courts` browse.
- No DB-side availability function yet (in-code filtering is fine for MVP; noted as a future optimization).

## Availability Semantics
A court is **available** for a requested window `[start, end)` on a date when:
1. The window fits the court's operating hours: `start >= open_hour and end <= close_hour and end > start` (reuses `validateSlot`).
2. No **active** booking on that court+date overlaps `[start, end)` — active = status not in (`rejected`,`cancelled`) and not an expired `pending_payment` (reuses `overlaps` + the expired-pending filter used in `createBooking`).

### New pure helper: `lib/booking/search.ts`
```ts
isCourtAvailable(
  courtHours: { openHour: number; closeHour: number },
  bookings: { startHour: number; endHour: number; status: string; expiresAt: Date | null }[],
  window: { startHour: number; endHour: number },
  now: Date
): boolean
```
Composes `validateSlot` (window within hours) and `overlaps` (against active bookings). Unit-tested (TDD): available when free; unavailable when overlapping; unavailable when outside hours; expired-pending ignored; rejected/cancelled ignored.

## Hero Search Form
The hero retains its badge, two-line headline, and subtext. Below the subtext, a **search card** (hotel-style): a date input (min = today in `Asia/Manila`), a Start-time select and End-time select (whole hours, e.g. 6:00–22:00), and a green **Search** button. It is a GET form submitting to `/search?date=<YYYY-MM-DD>&start=<h>&end=<h>`. The "List Your Court" secondary button stays; the stats strip stays below. The previous standalone "Find a Court" button is replaced by this search (searching *is* finding a court). Background image + gradient unchanged. Component: `components/search/CourtSearchBar.tsx` (client; reused on hero and results page).

## Results Page `/search`
Server component at `app/(public)/search/page.tsx`, reads `searchParams` `date`, `start`, `end`, plus optional `city`, `maxPrice`, `amenity`.
- **Validation:** if `date`/`start`/`end` missing or `end <= start`, render the search prompt (the `CourtSearchBar`) with a hint — no results query.
- **Query:** fetch courts whose pickleball court `status='approved'`, selecting court fields + pickleball court (`name`, `city`, `area`, `amenities`); fetch that date's bookings for those courts (`court_id, start_hour, end_hour, status, expires_at`).
- **Filter (in code):** keep courts where `isCourtAvailable(...)` is true for the window. Then apply refine filters: `city` (eq on pickleball court city), `maxPrice` (court `hourly_rate <= maxPrice`), `amenity` (pickleball court amenities contains).
- **Render:** a `CourtSearchBar` prefilled with the current params at the top; a grid of available-court cards — pickleball court name + city/area, court name, operating hours, **price for the window** = `calcTotalPrice(hourly_rate, start, end)`, and a **Book** button.
- **Empty state:** "No courts free for that window — try a different time" + link to `/pickleball-courts` browse.

## Book Action (confirm step)
The **Book** button links to the existing court booking page **pre-filled**:
`/pickleball-courts/[pickleballCourtId]/book/[courtId]?date=<date>&start=<start>&end=<end>`.
The booking page and its `SlotPicker` (client) are extended to read `start`/`end` from `searchParams` and pre-select them (within the court's free hours; user may still adjust). Confirming calls the existing `createBooking` server action, which remains the authoritative validation (operating hours, overlap, price, expiry, DB exclusion constraint). No new booking path.

## Reuse vs New
- **Reused:** `validateSlot`, `overlaps`, `calcTotalPrice`, `freeHours`, `createBooking`, the booking page, `SlotPicker`, design components, `/pickleball-courts` browse.
- **New:** `lib/booking/search.ts` (`isCourtAvailable` + tests); `app/(public)/search/page.tsx`; `components/search/CourtSearchBar.tsx`; `?start=&end=` pre-fill in `app/(public)/pickleball-courts/[id]/book/[courtId]/page.tsx` + `SlotPicker.tsx`; hero updated to embed `CourtSearchBar`.

## Edge Cases & Errors
- Past date blocked (min = today, `Asia/Manila`).
- Invalid/missing window → inline prompt, no query.
- No matches → empty state.
- Time selects offer whole hours within a sensible global range (e.g. 5:00–23:00); per-court operating hours still enforced by `isCourtAvailable` and `createBooking`.

## Testing
- **Unit (TDD):** `isCourtAvailable` — free→true; overlapping active booking→false; window outside operating hours→false; expired-pending ignored→true; rejected/cancelled ignored→true.
- **Integration:** seed an approved pickleball court with a court and a confirmed booking; `/search` query logic returns the court for a free window and excludes it for an overlapping window; pre-filled booking page creates a booking via `createBooking`.
- Build + typecheck green; pages use existing RaceDay components.
