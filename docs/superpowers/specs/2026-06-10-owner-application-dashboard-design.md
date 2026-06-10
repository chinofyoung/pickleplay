# Owner Application + Dashboard Design

**Date:** 2026-06-10
**Status:** Approved
**Builds on:** `2026-06-10-pickleball-booking-mvp-design.md`

## Overview

Change how users become Club Owners. Instead of selecting "owner" at signup, **everyone signs up as a Player**, gets a signed-in **dashboard**, and can **apply to become a Club Owner** from there. The **super admin** (the platform operator) reviews applications and approves/rejects them. Approving the owner is the single vetting gate — once approved, that owner's clubs go live immediately (no separate per-club approval).

Three roles in `profiles.role`:
- **player** — default for every new account.
- **owner** — granted only by an approved owner application.
- **admin** (super admin) — the platform operator; set manually in the DB, never self-assignable.

## Goals
- Self-service signup creates a Player; no role choice at signup.
- A role-aware `/dashboard` hub for all signed-in users.
- Players apply to be owners via a form; super admin approves/rejects (with reason); rejected users may re-apply.
- Approved owners create clubs that are live immediately.

## Non-Goals
- No change to the booking/payment-proof flow.
- No per-club approval (removed — owner vetting replaces it).
- No email notifications (in-app status only, consistent with the MVP).

## Single-Gate Approval Model
- New users → `player`.
- Player submits an owner application → `pending`.
- Super admin **approves** → applicant's `profiles.role` becomes `owner`; or **rejects** (with `rejection_reason`); applicant may submit a new application after rejection.
- Owner-created clubs default to `clubs.status = 'approved'`. The `clubs.status` column is retained so an admin can later suspend a club (set to `rejected`) without a schema change. Discovery continues to filter `status = 'approved'`.

## Data Model

### New table: `owner_applications`
- `id` uuid pk
- `user_id` uuid → profiles(id), not null
- `business_name` text not null
- `contact_number` text not null
- `city` text not null
- `area` text
- `message` text
- `status` enum `application_status` (`pending` | `approved` | `rejected`) default `pending`
- `rejection_reason` text
- `created_at` timestamptz default now()
- `reviewed_at` timestamptz
- Partial unique index on `(user_id)` where `status = 'pending'` — at most one pending application per user.

### `clubs`
- `status` default changes from `pending` to `approved` (owner-created clubs are live immediately). Column and enum retained.

### `profiles`
- Unchanged shape. `role` continues to be frozen against self-update (security fix already in place). Role changes happen only via the admin approval path below.

## Authorization

### RLS on `owner_applications`
- `applications_self_insert` — `with check (user_id = auth.uid())`.
- `applications_self_read` — `using (user_id = auth.uid() or is_admin())`.
- `applications_admin_read` covered by the `or is_admin()` above.
- No direct client UPDATE policy — status changes go through SECURITY DEFINER functions (below), so applicants can't approve themselves.

### Approval/rejection via SECURITY DEFINER RPCs
Two `security definer` Postgres functions, each guarded by `is_admin()`:
- `approve_owner_application(app_id uuid)` — if caller `is_admin()`: set the application `status='approved'`, `reviewed_at=now()`, and set the applicant's `profiles.role='owner'`. Atomic.
- `reject_owner_application(app_id uuid, reason text)` — if caller `is_admin()`: set `status='rejected'`, `rejection_reason=reason`, `reviewed_at=now()`. Role unchanged.
Both raise an exception if the caller is not an admin. The admin UI calls these via `supabase.rpc(...)`.

## Dashboard (`/dashboard`, role-aware)
A single signed-in hub (requires auth). Content adapts to `profiles.role`:
- **Player**: profile summary; "My Bookings" shortcut; an **Apply as Club Owner** card that shows either (a) the application form, (b) "Application pending review", or (c) "Rejected — <reason>" with a re-apply action, depending on their latest application.
- **Owner**: the player content, plus **My Clubs** (manage clubs/courts/QRs — reuses `/owner/clubs`) and **Booking Requests** (reuses `/owner/bookings`).
- **Super admin**: **Owner Applications** review queue (approve/reject with reason) — replaces the old per-club approval screen — plus oversight links.

## Application & Review Flow
1. Player → `/dashboard` → "Apply as Club Owner" → form: business_name, contact_number, city, area, message → submit → application `pending`.
2. Super admin → `/admin/applications` → sees pending applications with applicant details → **Approve** (role → owner) or **Reject** (reason).
3. Approved user is now an owner: their dashboard shows My Clubs; clubs they create are live (`approved`) immediately.
4. Rejected user sees the reason on their dashboard and can submit a new application.

## Changes to Existing Code
- **Signup** (`app/(auth)/actions.ts`): remove the `role` option; always create a player. Pass only `full_name` in metadata.
- **Signup trigger** (new migration): revert `handle_new_user` to NOT read role from metadata (everyone → `player`); keep the `full_name` coalesce fallback.
- **Register page**: remove the "I'm a club owner" selector.
- **Admin**: replace `/admin/clubs` (per-club approval) with `/admin/applications` (owner-application review). `setClubStatus` retained only for optional club suspension (not in the default flow).
- **Clubs**: default `status='approved'`; `createClub` no longer needs admin approval.
- **Navbar**: add a **Dashboard** link for signed-in users; Admin link points to `/admin/applications`.
- **Discovery**: unchanged (`status='approved'` filter).

## Migrations (new)
- `0010_owner_applications.sql`: `application_status` enum; `owner_applications` table + partial unique index; RLS policies; `approve_owner_application` / `reject_owner_application` SECURITY DEFINER functions.
- `0011_clubs_default_approved.sql`: `alter table clubs alter column status set default 'approved';`
- `0012_signup_role_revert.sql`: `create or replace function handle_new_user()` without role-from-metadata (player only), keeping the full_name coalesce.
- Update `_combined.sql`.

## Testing
- Unit/integration:
  - Player can insert their own application; cannot insert for another user (RLS).
  - Player cannot approve their own application / cannot self-set `role='owner'` (RPC requires admin; direct profile role update blocked).
  - Admin `approve_owner_application` flips applicant role to `owner`; `reject_owner_application` sets reason and leaves role unchanged.
  - Rejected applicant can submit a new application; the partial unique index blocks two simultaneous `pending` apps.
  - Approved owner can create a club that defaults to `approved` and appears in public discovery.
- Build + typecheck green; pages use the existing RaceDay design components.
