"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Search, CalendarDays, Clock, Check, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

const ALL_LOCATIONS = "All locations";

const HOURS = Array.from({ length: 19 }, (_, i) => i + 5); // 5..23

// 12-hour am/pm label for an hour in 0..24 (24 = midnight).
function fmtTime(h: number) {
  const h24 = h % 24;
  const period = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:00 ${period}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "yyyy-mm-dd" → "Wed, Jun 10" (timezone-safe via UTC).
function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[wd]}, ${MONTHS_SHORT[m - 1]} ${d}`;
}

export function CourtSearchBar({
  locations = [],
  defaults,
}: {
  locations?: string[];
  defaults?: { date?: string; start?: number; end?: number; city?: string };
}) {
  const router = useRouter();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const [date, setDate] = useState(defaults?.date ?? today);
  const [start, setStart] = useState(defaults?.start ?? 8);
  const [end, setEnd] = useState(defaults?.end ?? Math.max((defaults?.start ?? 8) + 1, 9));
  const [city, setCity] = useState(defaults?.city ?? "");
  const [dateOpen, setDateOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams({ date, start: String(start), end: String(Math.max(end, start + 1)) });
    if (city) params.set("city", city);
    router.push(`/search?${params.toString()}`);
  }

  // From: any hour that still leaves room for an end after it. To: strictly after start, plus midnight (24).
  const fromHours = HOURS.filter(h => h < 24);
  const toHours = HOURS.filter(h => h > start).concat([24]).filter((h, i, a) => a.indexOf(h) === i);

  function pickStart(h: number) {
    setStart(h);
    if (end <= h) setEnd(h + 1 <= 24 ? h + 1 : 24);
  }

  const triggerCls =
    "flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-base text-left outline-none transition-colors hover:bg-white/[0.03] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 data-[popup-open]:border-ring";

  return (
    <form onSubmit={submit} className="w-full flex flex-col md:flex-row md:items-end gap-3 rounded-xl bg-card/80 backdrop-blur-sm ring-1 ring-foreground/10 p-4">
      {/* Date — custom themed calendar */}
      <div className="flex flex-col gap-1.5 md:flex-1">
        <span className="text-xs uppercase tracking-wide text-text-muted">Date</span>
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger className={triggerCls}>
            <CalendarDays className="size-4 shrink-0 text-text-muted" />
            <span className="truncate">{fmtDate(date)}</span>
          </PopoverTrigger>
          <PopoverContent>
            <Calendar
              value={date}
              min={today}
              onSelect={(iso) => {
                setDate(iso);
                setDateOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Time — single combined From/To range picker */}
      <div className="flex flex-col gap-1.5 md:flex-[1.5]">
        <span className="text-xs uppercase tracking-wide text-text-muted">Time</span>
        <Popover open={timeOpen} onOpenChange={setTimeOpen}>
          <PopoverTrigger className={triggerCls}>
            <Clock className="size-4 shrink-0 text-text-muted" />
            <span className="truncate">{fmtTime(start)} – {fmtTime(end)}</span>
          </PopoverTrigger>
          <PopoverContent className="p-0">
            <div className="flex w-[19rem]">
              <TimeColumn
                label="From"
                hours={fromHours}
                selected={start}
                onPick={pickStart}
              />
              <div className="w-px self-stretch bg-foreground/10" />
              <TimeColumn
                label="To"
                hours={toHours}
                selected={end}
                onPick={(h) => {
                  setEnd(h);
                  setTimeOpen(false);
                }}
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Location — defaults to all locations */}
      <div className="flex flex-col gap-1.5 md:flex-1">
        <span className="text-xs uppercase tracking-wide text-text-muted">Location</span>
        <Popover open={locOpen} onOpenChange={setLocOpen}>
          <PopoverTrigger className={triggerCls}>
            <MapPin className="size-4 shrink-0 text-text-muted" />
            <span className="truncate">{city || ALL_LOCATIONS}</span>
          </PopoverTrigger>
          <PopoverContent className="p-1">
            <div className="custom-scrollbar max-h-64 w-[16rem] overflow-y-auto">
              {[ALL_LOCATIONS, ...locations].map((name) => {
                const value = name === ALL_LOCATIONS ? "" : name;
                const isSelected = value === city;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setCity(value);
                      setLocOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm transition-colors",
                      "hover:bg-white/[0.06]",
                      isSelected ? "text-primary font-medium" : "text-foreground"
                    )}
                  >
                    {name}
                    {isSelected && <Check className="size-3.5 text-primary" />}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <Button type="submit" className="shrink-0 gap-2 px-12 bg-cta hover:bg-cta/90 text-white">
        <Search className="size-4" /> Search
      </Button>
    </form>
  );
}

function TimeColumn({
  label,
  hours,
  selected,
  onPick,
}: {
  label: string;
  hours: number[];
  selected: number;
  onPick: (h: number) => void;
}) {
  return (
    <div className="flex-1">
      <div className="sticky top-0 bg-card px-3 pt-3 pb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </div>
      <div className="custom-scrollbar max-h-64 overflow-y-auto p-1">
        {hours.map(h => {
          const isSelected = h === selected;
          return (
            <button
              key={h}
              type="button"
              onClick={() => onPick(h)}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm transition-colors",
                "hover:bg-white/[0.06]",
                isSelected ? "text-primary font-medium" : "text-foreground"
              )}
            >
              {fmtTime(h)}
              {isSelected && <Check className="size-3.5 text-primary" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
