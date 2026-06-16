import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, Clock } from "lucide-react";
import { isExpired } from "@/lib/booking/expiry";
import { CourtThumb } from "@/components/court/CourtThumb";
import CourtScheduleCalendar from "./CourtScheduleCalendar";

interface BookPageProps {
  params: Promise<{ id: string; courtId: string }>;
  searchParams: Promise<{ date?: string; start?: string; end?: string }>;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS_AHEAD = 7;

function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function describeDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { date: iso, weekday: WEEKDAYS[wd], dayNum: d, month: MONTHS[m - 1] };
}

export default async function BookCourtPage({ params, searchParams }: BookPageProps) {
  const { id: pickleballCourtId, courtId } = await params;
  const { date: selectedDate, start: startParam, end: endParam } = await searchParams;

  const parsedStart = startParam !== undefined ? parseInt(startParam, 10) : NaN;
  const parsedEnd = endParam !== undefined ? parseInt(endParam, 10) : NaN;
  const initialStart = !isNaN(parsedStart) ? parsedStart : undefined;
  const initialEnd = !isNaN(parsedEnd) && !isNaN(parsedStart) && parsedEnd > parsedStart ? parsedEnd : undefined;

  const supabase = await createClient();

  // Fetch court and verify it belongs to this approved pickleball court venue
  const { data: court } = await supabase
    .from("courts")
    .select("id, name, hourly_rate, open_hour, close_hour, image_url, pickleball_courts!inner(id, name, status)")
    .eq("id", courtId)
    .eq("pickleball_courts.id", pickleballCourtId)
    .eq("pickleball_courts.status", "approved")
    .single();

  if (!court) notFound();

  const pickleballCourt = Array.isArray(court.pickleball_courts) ? court.pickleball_courts[0] : court.pickleball_courts;

  // Today + current hour in Philippine time (Asia/Manila, UTC+8)
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const nowHour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", hourCycle: "h23" }).format(new Date())
  );

  // The rolling week we display: today .. today + 6
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => describeDay(addDays(today, i)));
  const weekDates = days.map((d) => d.date);

  // Fetch all bookings for this court across the visible week
  const { data: bookings } = await supabase
    .from("bookings")
    .select("date, start_hour, end_hour, status, expires_at")
    .eq("court_id", courtId)
    .in("date", weekDates);

  // Build a map: date -> sorted list of actively-booked hours
  const now = new Date();
  const blockedByDate: Record<string, number[]> = {};
  for (const date of weekDates) blockedByDate[date] = [];
  for (const b of bookings ?? []) {
    if (b.status === "rejected" || b.status === "cancelled") continue;
    if (b.status === "pending_payment" && b.expires_at && isExpired(new Date(b.expires_at), now)) continue;
    const arr = blockedByDate[b.date];
    if (!arr) continue;
    for (let h = b.start_hour; h < b.end_hour; h++) arr.push(h);
  }
  for (const date of weekDates) blockedByDate[date] = [...new Set(blockedByDate[date])].sort((a, b) => a - b);

  const hourlyRate = Number(court.hourly_rate);
  const initialDate = selectedDate && weekDates.includes(selectedDate) ? selectedDate : today;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-10 space-y-6">
        {/* Back link */}
        <Button variant="ghost" size="sm" asChild className="-ml-1">
          <Link href={`/pickleball-courts/${pickleballCourtId}`}>
            <ArrowLeft className="mr-1 size-4" />
            Back to {pickleballCourt?.name ?? "pickleball court"}
          </Link>
        </Button>

        {/* Hero image */}
        <CourtThumb
          src={court.image_url}
          alt={`${pickleballCourt?.name} — ${court.name}`}
          sizes="(max-width: 1280px) 100vw, 1280px"
          priority
          className="aspect-[5/2] max-h-72 rounded-xl ring-1 ring-foreground/10"
        />

        {/* Heading */}
        <div className="space-y-1">
          <h1 className="font-heading text-3xl md:text-4xl font-bold uppercase tracking-wide text-white">
            Book {court.name}
          </h1>
          <p className="text-muted-foreground text-sm">
            {pickleballCourt?.name} &middot;{" "}
            <span className="text-primary font-medium">₱{hourlyRate.toFixed(0)}/hr</span>
          </p>
          <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
            <Clock className="size-4 shrink-0 text-primary" />
            Operating hours: {court.open_hour}:00 – {court.close_hour}:00
          </div>
        </div>

        <CourtScheduleCalendar
          courtId={courtId}
          hourlyRate={hourlyRate}
          openHour={court.open_hour}
          closeHour={court.close_hour}
          days={days}
          blockedByDate={blockedByDate}
          today={today}
          nowHour={nowHour}
          initialDate={initialDate}
          initialStart={initialStart}
          initialEnd={initialEnd}
        />
      </div>
    </div>
  );
}
