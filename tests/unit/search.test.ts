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
