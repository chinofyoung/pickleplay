import { describe, it, expect } from "vitest";
import { validateSlot, overlaps } from "@/lib/booking/slots";
describe("validateSlot", () => {
  it("accepts a consecutive range within operating hours", () => {
    expect(validateSlot({ startHour: 6, endHour: 9, openHour: 6, closeHour: 21 })).toEqual({ ok: true });
  });
  it("rejects zero-length range", () => {
    expect(validateSlot({ startHour: 8, endHour: 8, openHour: 6, closeHour: 21 }).ok).toBe(false);
  });
  it("rejects range outside operating hours", () => {
    expect(validateSlot({ startHour: 5, endHour: 7, openHour: 6, closeHour: 21 }).ok).toBe(false);
    expect(validateSlot({ startHour: 20, endHour: 22, openHour: 6, closeHour: 21 }).ok).toBe(false);
  });
});
describe("overlaps", () => {
  const existing = [{ startHour: 8, endHour: 10 }, { startHour: 14, endHour: 16 }];
  it("detects overlap", () => {
    expect(overlaps({ startHour: 9, endHour: 11 }, existing)).toBe(true);
  });
  it("allows adjacent non-overlapping", () => {
    expect(overlaps({ startHour: 10, endHour: 12 }, existing)).toBe(false);
  });
});
