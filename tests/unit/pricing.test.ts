import { describe, it, expect } from "vitest";
import { calcTotalPrice } from "@/lib/booking/pricing";
describe("calcTotalPrice", () => {
  it("multiplies hourly rate by number of hours", () => {
    expect(calcTotalPrice(260, 6, 9)).toBe(780);
  });
  it("handles a single hour", () => {
    expect(calcTotalPrice(150, 7, 8)).toBe(150);
  });
  it("throws when end <= start", () => {
    expect(() => calcTotalPrice(100, 9, 9)).toThrow();
  });
});
