"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/requireRole";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

// ─── Pickleball Court ────────────────────────────────────────────────────────

const PickleballCourtSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  city: z.string().min(1),
  area: z.string().optional(),
  address: z.string().optional(),
  amenities: z.string().optional(),
});

export async function createPickleballCourt(formData: FormData) {
  const { user } = await requireRole(["owner"]);
  const parsed = PickleballCourtSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase.from("pickleball_courts").insert({
    owner_id: user.id,
    name: parsed.name,
    description: parsed.description,
    city: parsed.city,
    area: parsed.area,
    address: parsed.address,
    amenities: parsed.amenities
      ? parsed.amenities
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
  });
  if (error) throw error;
  revalidatePath("/owner/pickleball-courts");
  redirect("/owner/pickleball-courts");
}

// ─── Court ───────────────────────────────────────────────────────────────────

const CourtSchema = z.object({
  pickleball_court_id: z.string().uuid(),
  name: z.string().min(1),
  hourly_rate: z.coerce.number().min(0),
  open_hour: z.coerce.number().int().min(0).max(23),
  close_hour: z.coerce.number().int().min(1).max(24),
});

export async function addCourt(formData: FormData) {
  const { user } = await requireRole(["owner"]);
  const c = CourtSchema.parse(Object.fromEntries(formData));
  if (c.close_hour <= c.open_hour)
    throw new Error("close_hour must exceed open_hour");
  const supabase = await createClient();
  const { data: pickleballCourt } = await supabase
    .from("pickleball_courts")
    .select("id")
    .eq("id", c.pickleball_court_id)
    .eq("owner_id", user.id)
    .single();
  if (!pickleballCourt) throw new Error("Not your pickleball court");
  const { error } = await supabase.from("courts").insert(c);
  if (error) throw error;
  revalidatePath(`/owner/pickleball-courts/${c.pickleball_court_id}`);
}

// ─── Booking Review ──────────────────────────────────────────────────────────

export async function confirmBooking(formData: FormData) {
  await requireRole(["owner"]);
  const id = String(formData.get("booking_id"));
  const supabase = await createClient();
  // RLS bookings_owner_update ensures owner only updates their courts' bookings
  const { error } = await supabase
    .from("bookings")
    .update({ status: "confirmed" })
    .eq("id", id)
    .eq("status", "proof_submitted");
  if (error) throw error;
  revalidatePath("/owner/bookings");
  revalidatePath("/my-bookings");
  revalidatePath(`/booking/${id}`);
}

export async function rejectBooking(formData: FormData) {
  await requireRole(["owner"]);
  const id = String(formData.get("booking_id"));
  const reason = String(formData.get("reason") || "Rejected by venue");
  const supabase = await createClient();
  const { error } = await supabase
    .from("bookings")
    .update({ status: "rejected", rejection_reason: reason })
    .eq("id", id)
    .eq("status", "proof_submitted");
  if (error) throw error;
  revalidatePath("/owner/bookings");
  revalidatePath("/my-bookings");
  revalidatePath(`/booking/${id}`);
}

// ─── Payment QR ──────────────────────────────────────────────────────────────

export async function uploadQr(formData: FormData) {
  const { user } = await requireRole(["owner"]);
  const pickleballCourtId = String(formData.get("pickleball_court_id"));
  const label = String(formData.get("label"));
  const file = formData.get("image") as File;
  if (!file || file.size === 0) throw new Error("Image required");

  const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!ALLOWED.includes(file.type)) throw new Error("Please upload a JPG, PNG, WEBP, or GIF image");
  if (file.size > 5 * 1024 * 1024) throw new Error("Image too large (max 5MB)");

  const supabase = await createClient();
  const { data: pickleballCourt } = await supabase
    .from("pickleball_courts")
    .select("id")
    .eq("id", pickleballCourtId)
    .eq("owner_id", user.id)
    .single();
  if (!pickleballCourt) throw new Error("Not your pickleball court");

  const ext = (file.name.split(".").pop() || "bin").replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 5) || "bin";
  const path = `${pickleballCourtId}/${label}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("payment-qrs")
    .upload(path, file, { upsert: true });
  if (upErr) throw upErr;

  // De-duplicate: delete any existing row for same (pickleball_court_id, label) before inserting
  await supabase.from("pickleball_court_payment_qrs").delete().eq("pickleball_court_id", pickleballCourtId).eq("label", label);

  const { error } = await supabase
    .from("pickleball_court_payment_qrs")
    .insert({ pickleball_court_id: pickleballCourtId, label, image_path: path });
  if (error) throw error;
  revalidatePath(`/owner/pickleball-courts/${pickleballCourtId}`);
}
