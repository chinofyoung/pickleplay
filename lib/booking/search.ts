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
