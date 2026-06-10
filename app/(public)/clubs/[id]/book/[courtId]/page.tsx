import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ArrowLeft, Clock, CalendarDays } from "lucide-react";
import { freeHours } from "@/lib/booking/availability";
import SlotPicker from "./SlotPicker";

interface BookPageProps {
  params: Promise<{ id: string; courtId: string }>;
  searchParams: Promise<{ date?: string }>;
}

export default async function BookCourtPage({ params, searchParams }: BookPageProps) {
  const { id: clubId, courtId } = await params;
  const { date: selectedDate } = await searchParams;

  const supabase = await createClient();

  // Fetch court and verify it belongs to this approved club
  const { data: court } = await supabase
    .from("courts")
    .select("id, name, hourly_rate, open_hour, close_hour, clubs!inner(id, name, status)")
    .eq("id", courtId)
    .eq("clubs.id", clubId)
    .eq("clubs.status", "approved")
    .single();

  if (!court) notFound();

  const club = Array.isArray(court.clubs) ? court.clubs[0] : court.clubs;

  // Today's date in YYYY-MM-DD in Philippine time (Asia/Manila, UTC+8)
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const dateToUse = selectedDate && selectedDate >= today ? selectedDate : null;

  let freeSlots: number[] = [];

  if (dateToUse) {
    const { data: bookings } = await supabase
      .from("bookings")
      .select("start_hour, end_hour, status, expires_at")
      .eq("court_id", courtId)
      .eq("date", dateToUse);

    const mappedBookings = (bookings ?? []).map((b) => ({
      startHour: b.start_hour,
      endHour: b.end_hour,
      status: b.status,
      expiresAt: b.expires_at ? new Date(b.expires_at) : null,
    }));

    freeSlots = freeHours(
      { openHour: court.open_hour, closeHour: court.close_hour },
      mappedBookings,
      new Date()
    );
  }

  const hourlyRate = Number(court.hourly_rate);

  // Format hour to 12h display (used for badges below)
  function formatHour(h: number): string {
    if (h === 0) return "12:00 AM";
    if (h === 12) return "12:00 PM";
    if (h < 12) return `${h}:00 AM`;
    return `${h - 12}:00 PM`;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-10 space-y-6">
        {/* Back link */}
        <Button variant="ghost" size="sm" asChild className="-ml-1">
          <Link href={`/clubs/${clubId}`}>
            <ArrowLeft className="mr-1 size-4" />
            Back to {club?.name ?? "club"}
          </Link>
        </Button>

        {/* Heading */}
        <div className="space-y-1">
          <h1 className="font-heading text-3xl md:text-4xl font-bold uppercase tracking-wide text-white">
            Book {court.name}
          </h1>
          <p className="text-muted-foreground text-sm">
            {club?.name} &middot;{" "}
            <span className="text-primary font-medium">₱{hourlyRate.toFixed(0)}/hr</span>
          </p>
          <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
            <Clock className="size-4 shrink-0 text-primary" />
            Operating hours: {court.open_hour}:00 – {court.close_hour}:00
          </div>
        </div>

        {/* Date selector */}
        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="size-5 text-primary" />
              Select Date
            </CardTitle>
            <CardDescription>
              Choose a date to see available slots.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <form method="GET" className="flex gap-3 items-end">
              <div className="flex-1">
                <label htmlFor="date" className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Date
                </label>
                <input
                  id="date"
                  type="date"
                  name="date"
                  min={today}
                  defaultValue={dateToUse ?? ""}
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
                />
              </div>
              <Button type="submit" variant="primary" size="default">
                Check availability
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Booking form — only shown when date is selected */}
        {dateToUse && (
          <Card>
            <CardHeader className="border-b pb-4">
              <CardTitle>Available Slots — {dateToUse}</CardTitle>
              {freeSlots.length === 0 ? (
                <CardDescription className="text-yellow-500">
                  No slots available on this date.
                </CardDescription>
              ) : (
                <CardDescription>
                  Select a consecutive start and end hour. Hours must be consecutive.
                </CardDescription>
              )}
            </CardHeader>
            {freeSlots.length > 0 && (
              <CardContent className="pt-4 space-y-5">
                {/* Available slots display */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Free hours on this date:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {freeSlots.map((h) => (
                      <Badge key={h} variant="primary" className="text-xs">
                        {formatHour(h)}–{formatHour(h + 1)}
                      </Badge>
                    ))}
                  </div>
                </div>

                <SlotPicker
                  freeHours={freeSlots}
                  courtId={courtId}
                  date={dateToUse}
                  hourlyRate={hourlyRate}
                />
              </CardContent>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
