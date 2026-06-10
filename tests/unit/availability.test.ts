import { describe, it, expect } from "vitest";
import { freeHours } from "@/lib/booking/availability";
describe("freeHours", () => {
  it("returns open hours minus booked, ignoring expired pending and rejected/cancelled", () => {
    const now = new Date("2026-06-10T10:00:00Z");
    const bookings = [
      { startHour: 8, endHour: 10, status: "confirmed", expiresAt: null },
      { startHour: 12, endHour: 13, status: "pending_payment", expiresAt: new Date("2026-06-10T09:00:00Z") },
      { startHour: 15, endHour: 16, status: "rejected", expiresAt: null },
    ];
    expect(freeHours({ openHour: 8, closeHour: 17 }, bookings as any, now))
      .toEqual([10, 11, 12, 13, 14, 15, 16]);
  });
});
