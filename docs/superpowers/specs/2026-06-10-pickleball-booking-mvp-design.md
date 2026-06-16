# Pickleball Booking Platform — Core Booking MVP Design

**Date:** 2026-06-10
**Status:** Approved
**Reference:** https://picklehub.ph/ (feature/UX inspiration)

## Overview

A pickleball court booking platform for the Philippine market. This spec covers the
**Core Booking MVP**: the minimum slice where a player can discover a venue and book +
pay for a court end-to-end, and an owner can list courts and confirm bookings.

Subsystems explicitly **out of scope** for this cycle (future cycles): Open Plays,
Tournaments, Programs/coaching, full operator analytics dashboard, AI assistant chatbot.

## Goals

- Players can find pickleball courts, book one or more consecutive hourly slots, pay via a
  manual payment-proof flow, and track booking status in-app.
- Owners can self-register, list a pickleball court + courts, upload payment QR codes, and
  review/confirm bookings.
- Platform Admins can approve/reject pickleball courts and oversee all activity.

## Non-Goals (this cycle)

- Automated payment gateway integration (manual QR + proof instead).
- Email/SMS/push notifications (in-app status only).
- Maps-based discovery (search + filters only).
- Open Plays, Tournaments, Programs, chatbot, advanced analytics.

## Architecture & Stack

- **Next.js (App Router)** — server components for data fetching; client components for
  interactive UI (booking calendar, file uploads).
- **Supabase** — Postgres (data), Auth (email/password + Google OAuth), Storage (QR
  images + payment proofs).
- **Row Level Security (RLS)** is the authorization backbone — auth rules live in the DB,
  not scattered across app code.
- **Tailwind CSS + shadcn/ui** for components. Visual polish handled later via the
  frontend-design skill.

## Data Model

### profiles
Extends Supabase `auth.users`.
- `id` (FK to auth.users)
- `role`: `player` | `owner` | `admin`
- `full_name`, `contact_number`
- timestamps

### pickleball_courts
- `id`, `owner_id` (FK profiles)
- `name`, `description`
- `city` / `area`, `address`
- `amenities` (text[])
- `status`: `pending` | `approved` | `rejected`
- `payment_qrs`: list of { label: `gcash` | `maya` | `bank` | other, image_path }
- timestamps

### courts
- `id`, `pickleball_court_id` (FK pickleball_courts)
- `name`
- `hourly_rate` (₱, integer centavos or decimal)
- `open_hour`, `close_hour` (operating hours, 0–23)
- timestamps

### bookings
- `id`, `court_id` (FK courts), `player_id` (FK profiles)
- `date`
- `start_hour`, `end_hour` (consecutive hourly range on a single court/date)
- `total_price` (hourly_rate × hours)
- `status`: `pending_payment` | `proof_submitted` | `confirmed` | `rejected` | `cancelled`
- `payment_proof_path` (Storage)
- `rejection_reason` (nullable)
- `expires_at` (for pending_payment auto-cancel)
- timestamps

**Booking spans one or more consecutive hourly slots** on a single court + date. Overlap
with any existing non-rejected/non-cancelled booking on the same court/date/hour-range is
rejected at write time (DB-level overlap check).

## Key User Flows

### Player
1. Browse/search pickleball courts (text search + city/area, price, amenity filters).
2. Open pickleball court profile → see courts, hours, rates, amenities, payment QRs.
3. Pick court, date, and one or more consecutive hours.
4. Create booking → status `pending_payment`, `expires_at` = now + 30 min.
5. See the owner's payment QR → pay externally (GCash/Maya/bank).
6. Upload payment proof → status `proof_submitted`.
7. Wait for owner confirmation → status `confirmed` (or `rejected`).
8. Track all bookings and statuses in "My Bookings".

### Owner
1. Register / sign in (role = owner).
2. Create pickleball court → status `pending` (awaits admin approval).
3. Add courts (name, hourly rate, operating hours).
4. Upload payment QR codes (GCash / Maya / bank).
5. Review incoming bookings (those in `proof_submitted`).
6. Confirm (→ `confirmed`) or reject (→ `rejected`, with reason; slot released).

### Platform Admin
1. Review pickleball courts in `pending` status → approve / reject.
2. Oversight read access across all pickleball courts and bookings.

## Authorization (RLS)

- **profiles:** user reads/updates own; admin reads all.
- **pickleball_courts:** public read where `status = approved`; owner CRUD own; admin full.
- **courts:** public read where parent pickleball court approved; owner CRUD own; admin full.
- **bookings:** player CRUD own; owner reads + updates status on bookings for their
  courts; admin full.
- **storage:** payment proofs readable by the booking's player + the court's owner +
  admin; QR images readable publicly (on approved pickleball courts).

## Edge Cases & Error Handling

- **Double-booking:** overlap check on (court, date, hour range) against non-rejected/
  non-cancelled bookings; concurrent attempts get a clear "slot just taken" error.
- **Abandoned bookings:** `pending_payment` bookings hold the slot but auto-cancel after
  **30 minutes** (`expires_at`), freeing the slot. Enforced via a scheduled job /
  Supabase cron and guarded in availability queries (expired pending bookings don't block).
- **Proof rejection:** owner rejects with a reason; player sees reason in-app; slot released.
- **Unapproved pickleball courts** are hidden from public discovery.
- **Invalid slot selection:** non-consecutive hours, hours outside operating window, or
  zero-length ranges are rejected with validation errors.

## Testing

- **Unit:** price calculation, overlap/availability detection, expiry logic, slot
  validation.
- **Integration:** full booking lifecycle (create → proof → confirm/reject/expire) and
  RLS policy enforcement per role.
- TDD throughout per the test-driven-development skill.

## Future Cycles (not in this spec)

Open Plays · Tournaments · Programs/coaching · operator analytics dashboard · AI
assistant chatbot · automated payment gateway · map-based discovery · notifications.
