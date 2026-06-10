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
