# Owner Application + Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
>
> **Git is disabled for this project.** Use **Checkpoint** steps (run tests/typecheck/build + verify) instead of commits. Never run a git command. Migrations are applied via Node `pg` scripts reading `DATABASE_URL` from `.env.local` (pattern in `scripts/apply-0007.mjs`), connecting with `ssl:{rejectUnauthorized:false}`.

**Goal:** Replace signup-time owner selection with an application flow: everyone signs up as a player, gets a role-aware `/dashboard`, and applies to become an Owner; the super admin approves/rejects; approved owners' pickleball courts go live immediately (per-pickleball-court approval removed).

**Architecture:** New `owner_applications` table + two `SECURITY DEFINER` RPCs (`approve_owner_application`, `reject_owner_application`, both guarded by `is_admin()`) so applicants can't self-approve. A `/dashboard` server page composes role-aware sections. Admin review moves from `/admin/pickleball-courts` to `/admin/applications`. Pickleball courts default to `approved`.

**Tech Stack:** Next.js 16 (App Router) + Supabase (Postgres, RLS, RPC) + existing RaceDay `components/ui`. Reuses `lib/auth/requireRole.ts`, `lib/supabase/server.ts`.

**Spec:** `docs/superpowers/specs/2026-06-10-owner-application-dashboard-design.md`

---

## File Structure
```
supabase/migrations/
  0010_owner_applications.sql              # table + RLS + approve/reject RPCs
  0011_pickleball_courts_default_approved.sql
  0012_signup_role_revert.sql
app/dashboard/
  page.tsx                                 # role-aware hub (server)
  actions.ts                               # submitOwnerApplication
  ApplyOwnerCard.tsx                       # client form / status card
app/admin/applications/page.tsx            # super-admin review queue
app/admin/actions.ts                       # + approveApplication, rejectApplication (rpc)
app/(auth)/actions.ts                      # signUp: drop role
app/(auth)/register/page.tsx               # drop owner selector
components/layout/Navbar.tsx               # + Dashboard link
```

---

## Phase 1 — Database

### Task 1.1: Migration `0010_owner_applications.sql`

**Files:** Create `supabase/migrations/0010_owner_applications.sql`

- [ ] **Step 1: Write the migration**
```sql
create type application_status as enum ('pending','approved','rejected');

create table owner_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  business_name text not null,
  contact_number text not null,
  city text not null,
  area text,
  message text,
  status application_status not null default 'pending',
  rejection_reason text,
  created_at timestamptz default now(),
  reviewed_at timestamptz
);

create unique index owner_applications_one_pending
  on owner_applications (user_id) where status = 'pending';

alter table owner_applications enable row level security;

create policy applications_self_insert on owner_applications
  for insert with check (user_id = auth.uid());
create policy applications_self_read on owner_applications
  for select using (user_id = auth.uid() or is_admin());

create or replace function approve_owner_application(app_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare applicant uuid;
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  update owner_applications set status='approved', reviewed_at=now()
    where id = app_id and status='pending'
    returning user_id into applicant;
  if applicant is null then raise exception 'application not found or not pending'; end if;
  update profiles set role='owner' where id = applicant;
end; $$;

create or replace function reject_owner_application(app_id uuid, reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  update owner_applications set status='rejected', rejection_reason=reason, reviewed_at=now()
    where id = app_id and status='pending';
end; $$;

grant execute on function approve_owner_application(uuid) to authenticated;
grant execute on function reject_owner_application(uuid, text) to authenticated;
```

- [ ] **Step 2: Apply** — write `scripts/apply-0010.mjs` (read `DATABASE_URL` from `.env.local`) and run it. Confirm the table, the partial unique index, both policies, and both functions exist.

- [ ] **Step 3: Checkpoint** — query `pg_proc` for the two function names and `pg_policies` for the two policies; confirm present.

### Task 1.2: Migration `0011_pickleball_courts_default_approved.sql`

**Files:** Create `supabase/migrations/0011_pickleball_courts_default_approved.sql`

- [ ] **Step 1: Write**
```sql
alter table pickleball_courts alter column status set default 'approved';
```
- [ ] **Step 2: Apply** via `scripts/apply-0011.mjs`.
- [ ] **Step 3: Checkpoint** — `select column_default from information_schema.columns where table_name='pickleball_courts' and column_name='status';` → contains `'approved'`.

### Task 1.3: Migration `0012_signup_role_revert.sql`

**Files:** Create `supabase/migrations/0012_signup_role_revert.sql`

- [ ] **Step 1: Write** (drop role-from-metadata; keep full_name coalesce; role falls back to column default 'player')
```sql
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      split_part(new.email, '@', 1)
    )
  );
  return new;
end; $$;
```
- [ ] **Step 2: Apply** via `scripts/apply-0012.mjs`.
- [ ] **Step 3: Verify** with `scripts/verify-signup-role.mjs`: create a user with `user_metadata: { full_name: "X", role: "owner" }` via service-role admin API → query profiles → expect `role='player'` (role from metadata no longer honored). Clean up.
- [ ] **Step 4: Update `_combined.sql`** — append 0010, 0011, 0012 blocks with `-- ===== ... =====` headers.
- [ ] **Step 5: Checkpoint** — verify script passes.

---

## Phase 2 — Signup reverts

### Task 2.1: Remove role selection from signup

**Files:** Modify `app/(auth)/actions.ts`, `app/(auth)/register/page.tsx`

- [ ] **Step 1: Edit `signUp`** in `app/(auth)/actions.ts` — drop the role; always player:
```ts
export async function signUp(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));
  const full_name = String(formData.get("full_name"));
  const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name } } });
  if (error) return redirect(`/register?error=${encodeURIComponent(error.message)}`);
  redirect("/");
}
```
- [ ] **Step 2: Edit `app/(auth)/register/page.tsx`** — remove the "I'm a pickleball court owner" role selector field entirely (keep full_name, email, password, and the Google button). Add a one-line note under the form: "Want to list courts? You can apply to become an owner from your dashboard after signing up."
- [ ] **Step 3: Checkpoint** — `npm run typecheck` + `npm run build` pass.

---

## Phase 3 — Dashboard + apply flow

### Task 3.1: Owner application action

**Files:** Create `app/dashboard/actions.ts`

- [ ] **Step 1: Write the action**
```ts
"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/requireRole";
import { revalidatePath } from "next/cache";

const ApplicationSchema = z.object({
  business_name: z.string().min(2),
  contact_number: z.string().min(5),
  city: z.string().min(1),
  area: z.string().optional(),
  message: z.string().optional(),
});

export async function submitOwnerApplication(formData: FormData) {
  const { user } = await requireRole(["player", "owner", "admin"]);
  const parsed = ApplicationSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase.from("owner_applications").insert({
    user_id: user.id,
    business_name: parsed.business_name,
    contact_number: parsed.contact_number,
    city: parsed.city,
    area: parsed.area,
    message: parsed.message,
  });
  if (error) {
    if ((error as any).code === "23505") throw new Error("You already have a pending application.");
    throw new Error("Could not submit application. Please try again.");
  }
  revalidatePath("/dashboard");
}
```
- [ ] **Step 2: Checkpoint** — `npm run typecheck` passes.

### Task 3.2: Apply-owner card (client)

**Files:** Create `app/dashboard/ApplyOwnerCard.tsx`

- [ ] **Step 1: Write the component** — `"use client"`. Props: `latest: { status: "pending"|"approved"|"rejected"; rejection_reason: string|null } | null`. Behavior:
  - If `latest?.status === "pending"`: show a Card "Application under review" with a pending Badge.
  - If `latest?.status === "approved"`: show "You're an owner!" with a link to `/owner/pickleball-courts`.
  - Else (no application or `rejected`): show the application form (`<form action={submitOwnerApplication}>` — import from `@/app/dashboard/actions`) with fields business_name, contact_number, city, area, message and a submit Button. If `rejected`, show the `rejection_reason` in a destructive note above the form and a heading "Re-apply".
  Use existing `components/ui` (Card, Input, Label, Button, Badge, Textarea). On-brand dark/orange.
- [ ] **Step 2: Checkpoint** — `npm run typecheck` passes.

### Task 3.3: Dashboard page (role-aware)

**Files:** Create `app/dashboard/page.tsx`

- [ ] **Step 1: Write the page** — server component:
```tsx
import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ApplyOwnerCard } from "./ApplyOwnerCard";

export default async function DashboardPage() {
  const { user, profile } = await requireRole(["player", "owner", "admin"]);
  const supabase = await createClient();
  const { data: latest } = await supabase
    .from("owner_applications")
    .select("status, rejection_reason, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <main className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      <h1 className="text-3xl md:text-4xl">Dashboard</h1>
      <p className="text-text-muted">Welcome{profile.full_name ? `, ${profile.full_name}` : ""}.</p>

      {/* Everyone: bookings shortcut */}
      <Card>
        <CardHeader><CardTitle>My Bookings</CardTitle></CardHeader>
        <CardContent>
          <Button asChild variant="outline"><Link href="/my-bookings">View my bookings</Link></Button>
        </CardContent>
      </Card>

      {/* Owner section */}
      {profile.role === "owner" && (
        <Card>
          <CardHeader><CardTitle>Owner</CardTitle></CardHeader>
          <CardContent className="flex gap-3">
            <Button asChild><Link href="/owner/pickleball-courts">My Pickleball Courts</Link></Button>
            <Button asChild variant="outline"><Link href="/owner/bookings">Booking Requests</Link></Button>
          </CardContent>
        </Card>
      )}

      {/* Admin section */}
      {profile.role === "admin" && (
        <Card>
          <CardHeader><CardTitle>Super Admin</CardTitle></CardHeader>
          <CardContent>
            <Button asChild><Link href="/admin/applications">Owner Applications</Link></Button>
          </CardContent>
        </Card>
      )}

      {/* Players (non-owner, non-admin): apply to be an owner */}
      {profile.role === "player" && <ApplyOwnerCard latest={latest ?? null} />}
    </main>
  );
}
```
- [ ] **Step 2: Verify** — `scripts/verify-application.mjs`: create a player, sign in, insert an application (status pending) → success; attempt to insert a SECOND pending application → expect the partial unique index to block (`23505`). Attempt to insert an application with `user_id` = another user's id → RLS blocks. Clean up.
- [ ] **Step 3: Checkpoint** — typecheck + build pass; verify script passes.

---

## Phase 4 — Admin applications review

### Task 4.1: Approve/reject actions (RPC)

**Files:** Modify `app/admin/actions.ts`

- [ ] **Step 1: Append actions**
```ts
export async function approveApplication(formData: FormData) {
  await requireRole(["admin"]);
  const id = String(formData.get("app_id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_owner_application", { app_id: id });
  if (error) throw new Error("Could not approve application.");
  revalidatePath("/admin/applications");
}

export async function rejectApplication(formData: FormData) {
  await requireRole(["admin"]);
  const id = String(formData.get("app_id"));
  const reason = String(formData.get("reason") || "Application rejected");
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_owner_application", { app_id: id, reason });
  if (error) throw new Error("Could not reject application.");
  revalidatePath("/admin/applications");
}
```
(`requireRole`, `createClient`, `revalidatePath` are already imported in this file.)
- [ ] **Step 2: Checkpoint** — typecheck passes.

### Task 4.2: Admin applications page

**Files:** Create `app/admin/applications/page.tsx`

- [ ] **Step 1: Write the page** — `requireRole(["admin"])`; query `owner_applications` ordered by created_at desc (admin RLS allows reading all), join the applicant's `profiles.full_name`. For each `pending` application show business_name, applicant name, contact_number, city/area, message, and Approve (form → `approveApplication`, hidden `app_id`) + Reject (form → `rejectApplication`, hidden `app_id`, `reason` Input) buttons. Show approved/rejected below for reference with status Badges. Use Card/Table/Badge, on-brand.
- [ ] **Step 2: Verify** — `scripts/verify-admin-review.mjs`: create player + application (pending); create an admin (service-role sets role='admin'); sign in as admin; call `supabase.rpc('approve_owner_application', { app_id })` → success; query profiles for the applicant → expect `role='owner'`. New player + application; as admin call `reject_owner_application` with a reason → application status `rejected`, reason set, applicant role still `player`. Negative: sign in as a plain player and call `approve_owner_application` on any app → expect the RPC to raise "not authorized". Clean up.
- [ ] **Step 3: Checkpoint** — typecheck + build pass; verify script passes.

---

## Phase 5 — Navigation + cleanup

### Task 5.1: Navbar Dashboard link

**Files:** Modify `components/layout/Navbar.tsx`, `app/(public)/layout.tsx`

- [ ] **Step 1:** In `Navbar.tsx`, when `auth` is non-null (logged in), add a "Dashboard" link → `/dashboard` alongside the existing role-aware links (Courts always; My Bookings when logged in; My Pickleball Courts for owner; Admin → change target to `/admin/applications`). Keep all existing classNames identical.
- [ ] **Step 2:** Confirm `app/(public)/layout.tsx` already passes `auth` to Navbar (from the earlier auth-state work) — no change needed unless the role link target for admin needs updating to `/admin/applications`.
- [ ] **Step 3: Checkpoint** — typecheck + build pass; read Navbar to confirm Dashboard link shows only when logged in and Admin points to `/admin/applications`.

### Task 5.2: Point admin entry to applications

**Files:** Modify `components/layout/Navbar.tsx` (admin link) and confirm `/admin/pickleball-courts` is no longer linked from primary nav.

- [ ] **Step 1:** Ensure the only admin nav entry points to `/admin/applications`. Leave `/admin/pickleball-courts` + `setPickleballCourtStatus` in the codebase (retained for optional pickleball court suspension) but unlinked from primary navigation.
- [ ] **Step 2: Checkpoint** — typecheck + build pass; full `npm run test` still green (existing 11 unit tests unaffected).

---

## Self-Review (completed during authoring)
- **Spec coverage:** single-gate approval (1.1 RPC flips role; 1.2 pickleball courts default approved); everyone-player (1.3 trigger revert + 2.1 signup); owner_applications table + RLS + one-pending index (1.1); role-aware `/dashboard` (3.3) with apply/status card (3.2) + submit action (3.1); admin `/admin/applications` review + approve/reject RPC (4.1, 4.2); re-apply after rejection (form shown when latest status rejected — 3.2; index only blocks pending); Navbar Dashboard link + admin→applications (5.1, 5.2); discovery unchanged. All spec sections mapped.
- **Placeholder scan:** none; code shown in every code step.
- **Type consistency:** `submitOwnerApplication`/`approveApplication`/`rejectApplication` signatures consistent; RPC names `approve_owner_application(uuid)` / `reject_owner_application(uuid,text)` match between migration and actions; `application_status` enum values consistent; `ApplyOwnerCard` prop `latest` shape matches the dashboard query (`status`, `rejection_reason`).
