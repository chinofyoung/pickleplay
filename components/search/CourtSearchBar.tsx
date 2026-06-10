"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Search } from "lucide-react";

const HOURS = Array.from({ length: 19 }, (_, i) => i + 5); // 5..23

function fmt(h: number) {
  return String(h).padStart(2, "0") + ":00";
}

export function CourtSearchBar({ defaults }: { defaults?: { date?: string; start?: number; end?: number } }) {
  const router = useRouter();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const [date, setDate] = useState(defaults?.date ?? today);
  const [start, setStart] = useState(defaults?.start ?? 8);
  const [end, setEnd] = useState(defaults?.end ?? Math.max((defaults?.start ?? 8) + 1, 9));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/search?date=${date}&start=${start}&end=${Math.max(end, start + 1)}`);
  }

  // To options: hours strictly greater than start, plus 24
  const toHours = HOURS.filter(h => h > start).concat([24]).filter((h, i, a) => a.indexOf(h) === i);

  return (
    <form onSubmit={submit} className="w-full flex flex-col md:flex-row md:items-end gap-3 rounded-xl bg-card/80 backdrop-blur-sm ring-1 ring-foreground/10 p-4">
      {/* Date — native date input (good on mobile) */}
      <label className="flex flex-col gap-1.5 md:flex-1">
        <span className="text-xs uppercase tracking-wide text-text-muted">Date</span>
        <input
          type="date"
          min={today}
          value={date}
          onChange={e => setDate(e.target.value)}
          className="h-10 rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring"
          required
        />
      </label>

      {/* From — custom themed Select */}
      <div className="flex flex-col gap-1.5 md:flex-1">
        <span className="text-xs uppercase tracking-wide text-text-muted">From</span>
        <Select<number>
          value={start}
          onValueChange={(val) => {
            if (val === null) return;
            setStart(val);
            // Enforce end > start
            if (end <= val) setEnd(val + 1 <= 24 ? val + 1 : 24);
          }}
        >
          <SelectTrigger>
            <SelectValue>{fmt(start)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {HOURS.map(h => (
              <SelectItem key={h} value={h}>
                {fmt(h)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* To — custom themed Select */}
      <div className="flex flex-col gap-1.5 md:flex-1">
        <span className="text-xs uppercase tracking-wide text-text-muted">To</span>
        <Select<number>
          value={end}
          onValueChange={(val) => {
            if (val === null) return;
            setEnd(val);
          }}
        >
          <SelectTrigger>
            <SelectValue>{fmt(end)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {toHours.map(h => (
              <SelectItem key={h} value={h}>
                {fmt(h)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" className="shrink-0 gap-2 bg-cta hover:bg-cta/90 text-white">
        <Search className="size-4" /> Search
      </Button>
    </form>
  );
}
