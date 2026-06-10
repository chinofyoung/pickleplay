"use server";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/requireRole";
import { redirect } from "next/navigation";
import { validateSlot, overlaps } from "@/lib/booking/slots";
import { calcTotalPrice } from "@/lib/booking/pricing";
import { computeExpiry, isExpired } from "@/lib/booking/expiry";

export async function createBooking(formData: FormData) {
  const { user } = await requireRole(["player", "owner", "admin"]);
  const courtId = String(formData.get("court_id"));
  const date = String(formData.get("date"));
  const startHour = Number(formData.get("start_hour"));
  const endHour = Number(formData.get("end_hour"));
  const supabase = await createClient();

  const { data: court } = await supabase
    .from("courts")
    .select("hourly_rate,open_hour,close_hour")
    .eq("id", courtId)
    .single();
  if (!court) throw new Error("Court not found");

  // Proactively cancel expired pending_payment bookings so they don't
  // falsely trip the exclusion constraint (not-yet-cron-cancelled).
  await supabase
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("court_id", courtId)
    .eq("date", date)
    .eq("status", "pending_payment")
    .lt("expires_at", new Date().toISOString());

  const v = validateSlot({
    startHour,
    endHour,
    openHour: court.open_hour,
    closeHour: court.close_hour,
  });
  if (!v.ok) throw new Error(v.reason);

  const { data: existing } = await supabase
    .from("bookings")
    .select("start_hour,end_hour,status,expires_at")
    .eq("court_id", courtId)
    .eq("date", date);

  const now = new Date();
  const active = (existing ?? []).filter(
    (b) =>
      !(b.status === "rejected" || b.status === "cancelled") &&
      !(
        b.status === "pending_payment" &&
        b.expires_at &&
        isExpired(new Date(b.expires_at), now)
      )
  );

  if (
    overlaps(
      { startHour, endHour },
      active.map((b) => ({ startHour: b.start_hour, endHour: b.end_hour }))
    )
  )
    throw new Error("Slot just taken");

  const total = calcTotalPrice(Number(court.hourly_rate), startHour, endHour);
  const { data, error } = await supabase
    .from("bookings")
    .insert({
      court_id: courtId,
      player_id: user.id,
      date,
      start_hour: startHour,
      end_hour: endHour,
      total_price: total,
      status: "pending_payment",
      expires_at: computeExpiry(now).toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    if ((error as any).code === "23P01") throw new Error("Slot just taken");
    throw error;
  }
  redirect(`/booking/${data.id}`);
}

export async function uploadProof(formData: FormData) {
  const { user } = await requireRole(["player", "owner", "admin"]);
  const bookingId = String(formData.get("booking_id"));
  const file = formData.get("proof") as File;
  if (!file || file.size === 0) throw new Error("Proof image required");

  const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!ALLOWED.includes(file.type)) throw new Error("Please upload a JPG, PNG, WEBP, or GIF image");
  if (file.size > 5 * 1024 * 1024) throw new Error("Image too large (max 5MB)");

  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("id,player_id,status,expires_at")
    .eq("id", bookingId)
    .single();
  if (!booking || booking.player_id !== user.id)
    throw new Error("Not your booking");
  if (booking.status !== "pending_payment")
    throw new Error("Booking is not awaiting payment");
  if (booking.expires_at && isExpired(new Date(booking.expires_at), new Date()))
    throw new Error("Payment window has expired");

  const ext = (file.name.split(".").pop() || "bin").replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 5) || "bin";
  const path = `${bookingId}/proof.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("payment-proofs")
    .upload(path, file, { upsert: true });
  if (upErr) throw upErr;
  const { error } = await supabase
    .from("bookings")
    .update({ payment_proof_path: path, status: "proof_submitted", expires_at: null })
    .eq("id", bookingId);
  if (error) throw error;
  redirect(`/booking/${bookingId}`);
}
