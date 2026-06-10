import { describe, it, expect } from "vitest";
import { computeExpiry, isExpired } from "@/lib/booking/expiry";
describe("expiry", () => {
  const base = new Date("2026-06-10T10:00:00Z");
  it("expires 30 minutes after creation", () => {
    expect(computeExpiry(base).toISOString()).toBe("2026-06-10T10:30:00.000Z");
  });
  it("isExpired true after the window", () => {
    expect(isExpired(computeExpiry(base), new Date("2026-06-10T10:31:00Z"))).toBe(true);
    expect(isExpired(computeExpiry(base), new Date("2026-06-10T10:29:00Z"))).toBe(false);
  });
});
