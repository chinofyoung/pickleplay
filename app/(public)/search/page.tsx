import { createClient } from "@/lib/supabase/server";
import { isCourtAvailable } from "@/lib/booking/search";
import { calcTotalPrice } from "@/lib/booking/pricing";
import { CourtSearchBar } from "@/components/search/CourtSearchBar";
import { getLocations } from "@/lib/booking/locations";
import { CourtThumb } from "@/components/court/CourtThumb";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const date = sp.date, start = Number(sp.start), end = Number(sp.end);
  const valid = !!date && Number.isInteger(start) && Number.isInteger(end) && end > start;
  const locations = await getLocations();

  return (
    <main className="max-w-7xl mx-auto px-4 py-10 space-y-8">
      <h1 className="text-3xl md:text-4xl">Find an available court</h1>
      <CourtSearchBar
        locations={locations}
        defaults={{ date, start: valid ? start : undefined, end: valid ? end : undefined, city: sp.city }}
      />
      {!valid ? (
        <p className="text-text-muted">Pick a date and time range to see available courts.</p>
      ) : (
        <Results date={date} start={start} end={end} city={sp.city} maxPrice={sp.maxPrice} amenity={sp.amenity} />
      )}
    </main>
  );
}

async function Results({ date, start, end, city, maxPrice, amenity }:
  { date: string; start: number; end: number; city?: string; maxPrice?: string; amenity?: string }) {
  const supabase = await createClient();
  const { data: courts } = await supabase
    .from("courts")
    .select("id, name, hourly_rate, open_hour, close_hour, image_url, pickleball_courts(id, name, city, area, amenities, status)");

  const list = (courts ?? []) as any[];

  // Filter to approved pickleball courts in code (avoids Supabase inner-join filtering edge cases)
  const approvedList = list.filter(c => {
    const pickleballCourt = Array.isArray(c.pickleball_courts) ? c.pickleball_courts[0] : c.pickleball_courts;
    return pickleballCourt?.status === "approved";
  });

  const courtIds = approvedList.map((c: any) => c.id);
  const { data: bookings } = courtIds.length
    ? await supabase.from("bookings").select("court_id, start_hour, end_hour, status, expires_at").in("court_id", courtIds).eq("date", date)
    : { data: [] as any[] };

  const byCourt = new Map<string, any[]>();
  for (const b of (bookings ?? [])) {
    const arr = byCourt.get(b.court_id) ?? [];
    arr.push({ startHour: b.start_hour, endHour: b.end_hour, status: b.status, expiresAt: b.expires_at ? new Date(b.expires_at) : null });
    byCourt.set(b.court_id, arr);
  }

  const now = new Date();
  let available = approvedList.filter((c: any) =>
    isCourtAvailable({ openHour: c.open_hour, closeHour: c.close_hour }, byCourt.get(c.id) ?? [], { startHour: start, endHour: end }, now)
  );

  // Normalize pickleball courts to always be an object
  available = available.map((c: any) => ({
    ...c,
    pickleball_courts: Array.isArray(c.pickleball_courts) ? c.pickleball_courts[0] : c.pickleball_courts,
  }));

  if (city) available = available.filter((c: any) => c.pickleball_courts?.city === city);
  if (maxPrice) available = available.filter((c: any) => Number(c.hourly_rate) <= Number(maxPrice));
  if (amenity) available = available.filter((c: any) => (c.pickleball_courts?.amenities ?? []).includes(amenity));

  if (!available.length) {
    return (
      <div className="rounded-xl bg-card ring-1 ring-foreground/10 p-8 text-center">
        <p className="text-text-muted">No courts free for that window. Try a different time, or <Link href="/pickleball-courts" className="text-primary hover:underline">browse all pickleball courts</Link>.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {available.map((c: any) => (
        <Card key={c.id} className="pt-0">
          <CourtThumb src={c.image_url} alt={`${c.pickleball_courts?.name} — ${c.name}`} />
          <CardHeader>
            <CardTitle>{c.pickleball_courts?.name} — {c.name}</CardTitle>
            <p className="text-sm text-text-muted">{c.pickleball_courts?.city}{c.pickleball_courts?.area ? `, ${c.pickleball_courts.area}` : ""}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-text-muted">Open {c.open_hour}:00–{c.close_hour}:00</p>
            <p className="text-lg font-bold">₱{calcTotalPrice(Number(c.hourly_rate), start, end)} <span className="text-sm font-normal text-text-muted">for {end - start}h</span></p>
            <Button asChild className="w-full bg-cta hover:bg-cta/90 text-white">
              <Link href={`/pickleball-courts/${c.pickleball_courts?.id}/book/${c.id}?date=${date}&start=${start}&end=${end}`}>Book {String(start).padStart(2,"0")}:00–{String(end).padStart(2,"00")}:00</Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
