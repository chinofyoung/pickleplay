"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { createBooking } from "@/app/booking/actions";
import { cn } from "@/lib/utils";

type DayInfo = { date: string; weekday: string; dayNum: number; month: string };

interface Props {
  courtId: string;
  hourlyRate: number;
  openHour: number;
  closeHour: number;
  days: DayInfo[];
  blockedByDate: Record<string, number[]>;
  today: string;
  nowHour: number;
  initialDate: string;
  initialStart?: number;
  initialEnd?: number;
}

function formatHour(h: number): string {
  const h24 = h % 24;
  const period = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:00 ${period}`;
}

type SlotStatus = "open" | "booked" | "past";

export default function CourtScheduleCalendar({
  courtId,
  hourlyRate,
  openHour,
  closeHour,
  days,
  blockedByDate,
  today,
  nowHour,
  initialDate,
  initialStart,
  initialEnd,
}: Props) {
  const [view, setView] = useState<"day" | "week">("day");
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [start, setStart] = useState<number | null>(initialStart ?? null);
  const [end, setEnd] = useState<number | null>(
    initialStart !== undefined && initialEnd !== undefined ? initialEnd : initialStart !== undefined ? initialStart + 1 : null
  );

  const hours = useMemo(
    () => Array.from({ length: closeHour - openHour }, (_, i) => openHour + i),
    [openHour, closeHour]
  );

  function statusOf(date: string, h: number): SlotStatus {
    if ((blockedByDate[date] ?? []).includes(h)) return "booked";
    if (date === today && h <= nowHour) return "past";
    return "open";
  }

  function rangeAllOpen(date: string, a: number, b: number): boolean {
    for (let h = a; h < b; h++) if (statusOf(date, h) !== "open") return false;
    return true;
  }

  function selectDate(date: string) {
    if (date === selectedDate) return;
    setSelectedDate(date);
    setStart(null);
    setEnd(null);
  }

  // Click an open hour (in either view) to build a contiguous range of slots.
  // Selecting in a different day moves the selection to that day. Works the
  // same in day and week views, so multiple slots can be picked in the week grid.
  function selectSlot(date: string, h: number) {
    if (statusOf(date, h) !== "open") return;
    if (date !== selectedDate) {
      setSelectedDate(date);
      setStart(h);
      setEnd(h + 1);
      return;
    }
    if (start === null || end === null) {
      setStart(h);
      setEnd(h + 1);
      return;
    }
    if (h === start && end === start + 1) {
      setStart(null);
      setEnd(null);
      return;
    }
    if (h >= start) {
      if (rangeAllOpen(date, start, h + 1)) setEnd(h + 1);
      else {
        setStart(h);
        setEnd(h + 1);
      }
    } else {
      if (rangeAllOpen(date, h, end)) setStart(h);
      else {
        setStart(h);
        setEnd(h + 1);
      }
    }
  }

  const isSelected = (date: string, h: number) =>
    date === selectedDate && start !== null && end !== null && h >= start && h < end;

  const price = start !== null && end !== null && end > start ? hourlyRate * (end - start) : null;
  const selectedDay = days.find((d) => d.date === selectedDate);

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Toolbar: view toggle + legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="inline-flex rounded-lg bg-muted/40 p-1">
          {(["day", "week"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors",
                view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm border border-primary/40 bg-primary/10" /> Open
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-primary" /> Selected
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-muted-foreground/30" /> Booked
          </span>
        </div>
      </div>

      {view === "day" ? (
        <DayView
          days={days}
          selectedDate={selectedDate}
          selectDate={selectDate}
          hours={hours}
          statusOf={statusOf}
          isSelected={isSelected}
          onSelect={selectSlot}
        />
      ) : (
        <WeekView
          days={days}
          hours={hours}
          statusOf={statusOf}
          isSelected={isSelected}
          onSelect={selectSlot}
        />
      )}

      {/* Reserve bar */}
      <div className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          {start !== null && end !== null ? (
            <span className="text-foreground">
              {selectedDay?.weekday}, {selectedDay?.month} {selectedDay?.dayNum} ·{" "}
              <span className="font-medium">{formatHour(start)} – {formatHour(end)}</span>
              {price !== null && (
                <>
                  {" · "}
                  <span className="font-semibold text-primary">₱{price.toFixed(0)}</span>
                </>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">Select an open slot to reserve.</span>
          )}
        </div>
        <form action={createBooking}>
          <input type="hidden" name="court_id" value={courtId} />
          <input type="hidden" name="date" value={selectedDate} />
          <input type="hidden" name="start_hour" value={start ?? ""} />
          <input type="hidden" name="end_hour" value={end ?? ""} />
          <Button type="submit" variant="primary" disabled={start === null || end === null} className="w-full sm:w-auto">
            {start !== null && end !== null ? `Reserve ${formatHour(start)}–${formatHour(end)}` : "Reserve slot"}
          </Button>
        </form>
      </div>

      <p className="px-4 pb-4 text-xs text-muted-foreground">
        You must be signed in to book. If you are not signed in, you will be redirected to login.
      </p>
    </div>
  );
}

// ── Day view ──────────────────────────────────────────────────────────────────
function DayView({
  days,
  selectedDate,
  selectDate,
  hours,
  statusOf,
  isSelected,
  onSelect,
}: {
  days: DayInfo[];
  selectedDate: string;
  selectDate: (d: string) => void;
  hours: number[];
  statusOf: (date: string, h: number) => SlotStatus;
  isSelected: (date: string, h: number) => boolean;
  onSelect: (date: string, h: number) => void;
}) {
  return (
    <div className="p-4 space-y-4">
      {/* Day strip */}
      <div className="custom-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {days.map((d) => {
          const active = d.date === selectedDate;
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => selectDate(d.date)}
              className={cn(
                "flex min-w-16 shrink-0 flex-col items-center rounded-lg border px-3 py-2 transition-colors",
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              )}
            >
              <span className="text-xs uppercase tracking-wide">{d.weekday}</span>
              <span className="text-lg font-semibold">{d.dayNum}</span>
              <span className="text-[10px] uppercase">{d.month}</span>
            </button>
          );
        })}
      </div>

      {/* Hour rows */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {hours.map((h) => {
          const status = statusOf(selectedDate, h);
          const selected = isSelected(selectedDate, h);
          return (
            <button
              key={h}
              type="button"
              disabled={status !== "open"}
              onClick={() => onSelect(selectedDate, h)}
              className={cn(
                "flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors",
                selected && "border-primary bg-primary text-primary-foreground",
                !selected && status === "open" && "border-primary/30 bg-primary/5 text-foreground hover:bg-primary/15",
                status === "booked" && "cursor-not-allowed border-border bg-muted/30 text-muted-foreground",
                status === "past" && "cursor-not-allowed border-border/50 bg-transparent text-muted-foreground/40"
              )}
            >
              <span className="font-medium">{formatHour(h)}</span>
              <span className="text-xs">
                {selected ? "Selected" : status === "booked" ? "Booked" : status === "past" ? "—" : "Open"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Week view ───────────────────────────────────────────────────────────────────
function WeekView({
  days,
  hours,
  statusOf,
  isSelected,
  onSelect,
}: {
  days: DayInfo[];
  hours: number[];
  statusOf: (date: string, h: number) => SlotStatus;
  isSelected: (date: string, h: number) => boolean;
  onSelect: (date: string, h: number) => void;
}) {
  return (
    <div className="custom-scrollbar overflow-x-auto p-4">
      <div className="min-w-[640px]">
        {/* Header row */}
        <div className="grid grid-cols-[4rem_repeat(7,1fr)] gap-1">
          <div />
          {days.map((d) => (
            <div key={d.date} className="pb-2 text-center">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{d.weekday}</div>
              <div className="text-sm font-semibold text-foreground">
                {d.month} {d.dayNum}
              </div>
            </div>
          ))}
        </div>

        {/* Hour rows */}
        {hours.map((h) => (
          <div key={h} className="grid grid-cols-[4rem_repeat(7,1fr)] gap-1 py-0.5">
            <div className="flex items-center justify-end pr-2 text-xs text-muted-foreground">{formatHour(h)}</div>
            {days.map((d) => {
              const status = statusOf(d.date, h);
              const selected = isSelected(d.date, h);
              return (
                <button
                  key={d.date}
                  type="button"
                  disabled={status !== "open"}
                  onClick={() => onSelect(d.date, h)}
                  title={`${d.weekday} ${d.month} ${d.dayNum} · ${formatHour(h)} · ${
                    selected ? "selected" : status
                  }`}
                  className={cn(
                    "flex h-7 items-center justify-center rounded-sm border text-[10px] font-medium transition-colors",
                    selected && "border-primary bg-primary text-primary-foreground",
                    !selected && status === "open" && "border-primary/30 bg-primary/10 text-primary hover:bg-primary/25",
                    status === "booked" && "cursor-not-allowed border-transparent bg-muted-foreground/25 text-muted-foreground",
                    status === "past" && "cursor-not-allowed border-transparent bg-transparent text-muted-foreground/40"
                  )}
                >
                  {selected ? "Selected" : status === "booked" ? "Booked" : status === "past" ? "—" : "Open"}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
