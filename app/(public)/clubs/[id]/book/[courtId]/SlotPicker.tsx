"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { createBooking } from "@/app/booking/actions";

interface SlotPickerProps {
  freeHours: number[];
  courtId: string;
  date: string;
  hourlyRate: number;
}

function formatHour(h: number): string {
  if (h === 0) return "12:00 AM";
  if (h === 12) return "12:00 PM";
  if (h < 12) return `${h}:00 AM`;
  return `${h - 12}:00 PM`;
}

export default function SlotPicker({ freeHours, courtId, date, hourlyRate }: SlotPickerProps) {
  const [startHour, setStartHour] = useState<number | null>(null);
  const [endHour, setEndHour] = useState<number | null>(null);

  // Compute valid end options from chosen start:
  // Walk freeHours starting at start+1; each next hour is valid only if
  // the preceding hour (boundary - 1) is in freeHours.
  const endOptions = useMemo((): number[] => {
    if (startHour === null) return [];
    const freeSet = new Set(freeHours);
    const ends: number[] = [];
    // Start+1 is always a valid end (start itself just needs to be in freeHours, which it is)
    // Then continue as long as freeHours contains each intermediate hour.
    let prev = startHour;
    while (true) {
      const candidate = prev + 1;
      // candidate end requires freeHours to include prev (the hour slot prev->candidate)
      if (!freeSet.has(prev)) break;
      ends.push(candidate);
      prev = candidate;
    }
    return ends;
  }, [startHour, freeHours]);

  const price =
    startHour !== null && endHour !== null && endHour > startHour
      ? hourlyRate * (endHour - startHour)
      : null;

  function handleStartChange(val: string) {
    const h = val === "" ? null : Number(val);
    setStartHour(h);
    setEndHour(null);
  }

  function handleEndChange(val: string) {
    setEndHour(val === "" ? null : Number(val));
  }

  return (
    <form action={createBooking} className="space-y-5">
      <input type="hidden" name="court_id" value={courtId} />
      <input type="hidden" name="date" value={date} />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="start_hour" className="block text-xs font-medium text-muted-foreground mb-1.5">
            Start time
          </label>
          <select
            id="start_hour"
            name="start_hour"
            required
            value={startHour ?? ""}
            onChange={(e) => handleStartChange(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
          >
            <option value="">Select start</option>
            {freeHours.map((h) => (
              <option key={h} value={h}>
                {formatHour(h)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="end_hour" className="block text-xs font-medium text-muted-foreground mb-1.5">
            End time
          </label>
          <select
            id="end_hour"
            name="end_hour"
            required
            value={endHour ?? ""}
            onChange={(e) => handleEndChange(e.target.value)}
            disabled={startHour === null}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50"
          >
            <option value="">Select end</option>
            {endOptions.map((h) => (
              <option key={h} value={h}>
                {formatHour(h)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Live price */}
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <span className="text-foreground font-medium">Pricing:</span>{" "}
        ₱{hourlyRate.toFixed(0)} × hours booked = total.{" "}
        {price !== null ? (
          <span>
            Total:{" "}
            <span className="text-primary font-semibold">₱{price.toFixed(0)}</span>
          </span>
        ) : (
          <span>Select start and end to see total.</span>
        )}
      </div>

      <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-500">
        You must be signed in to book. If you are not signed in, you will be redirected to login.
      </div>

      <Button
        type="submit"
        variant="primary"
        size="default"
        className="w-full"
        disabled={startHour === null || endHour === null}
      >
        Reserve slot
      </Button>
    </form>
  );
}
