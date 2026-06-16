import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CourtThumb } from "@/components/court/CourtThumb";
import Link from "next/link";
import { MapPin, Search } from "lucide-react";

interface SearchParams {
  q?: string;
  city?: string;
  maxPrice?: string;
  amenity?: string;
}

interface Court {
  hourly_rate: number;
  image_url: string | null;
}

interface PickleballCourt {
  id: string;
  name: string;
  city: string;
  area: string | null;
  amenities: string[] | null;
  courts: Court[];
}

export default async function PickleballCourtsDiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("pickleball_courts")
    .select("id,name,city,area,amenities,courts(hourly_rate,image_url)")
    .eq("status", "approved");

  if (sp.q) query = query.ilike("name", `%${sp.q}%`);
  if (sp.city) query = query.eq("city", sp.city);
  if (sp.amenity) query = query.contains("amenities", [sp.amenity]);

  const { data: rawPickleballCourts } = await query.order("name");

  let pickleballCourts: PickleballCourt[] = (rawPickleballCourts ?? []) as PickleballCourt[];

  // In-memory maxPrice filter against min court hourly_rate
  if (sp.maxPrice) {
    const maxPriceNum = Number(sp.maxPrice);
    if (!isNaN(maxPriceNum)) {
      pickleballCourts = pickleballCourts.filter((pickleballCourt) => {
        if (!pickleballCourt.courts || pickleballCourt.courts.length === 0) return true;
        const minRate = Math.min(...pickleballCourt.courts.map((c) => Number(c.hourly_rate)));
        return minRate <= maxPriceNum;
      });
    }
  }

  const hasFilters = sp.q || sp.city || sp.maxPrice || sp.amenity;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-10 space-y-8">
        {/* Page header */}
        <div className="space-y-2">
          <h1 className="font-heading text-4xl md:text-5xl font-bold uppercase tracking-wide text-white">
            Find a <span className="text-primary">Pickleball Court</span>
          </h1>
          <p className="text-muted-foreground text-base">
            Browse approved pickleball courts. Filter by location, price, or amenities.
          </p>
        </div>

        {/* Filter form */}
        <form
          method="GET"
          className="flex flex-col md:flex-row md:items-end gap-3 rounded-xl bg-card ring-1 ring-foreground/10 p-4"
        >
          <div className="flex flex-col gap-1.5 md:flex-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Search name
            </label>
            <Input
              name="q"
              placeholder="Pickleball court name…"
              defaultValue={sp.q ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5 md:flex-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              City
            </label>
            <Input
              name="city"
              placeholder="e.g. Cebu City"
              defaultValue={sp.city ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5 md:flex-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Max price (₱/hr)
            </label>
            <Input
              name="maxPrice"
              type="number"
              min="0"
              placeholder="e.g. 500"
              defaultValue={sp.maxPrice ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5 md:flex-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Amenity
            </label>
            <Input
              name="amenity"
              placeholder="e.g. Parking"
              defaultValue={sp.amenity ?? ""}
            />
          </div>
          <div className="flex shrink-0 gap-2">
            <Button type="submit" variant="primary">
              <Search className="size-4" />
              Search
            </Button>
            {hasFilters && (
              <Button type="button" variant="outline" asChild>
                <Link href="/pickleball-courts">Clear filters</Link>
              </Button>
            )}
          </div>
        </form>

        {/* Results */}
        {pickleballCourts.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <MapPin className="size-12 text-muted-foreground/40" />
            <p className="text-lg font-medium text-muted-foreground">
              No pickleball courts found
            </p>
            <p className="text-sm text-muted-foreground/60">
              {hasFilters
                ? "Try adjusting your filters."
                : "No approved pickleball courts available yet."}
            </p>
            {hasFilters && (
              <Button variant="outline" asChild>
                <Link href="/pickleball-courts">Clear filters</Link>
              </Button>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {pickleballCourts.length} pickleball court{pickleballCourts.length !== 1 ? "s" : ""} found
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {pickleballCourts.map((pickleballCourt) => {
                const rates = pickleballCourt.courts
                  ?.map((c) => Number(c.hourly_rate))
                  .filter((r) => !isNaN(r));
                const minRate =
                  rates && rates.length > 0
                    ? Math.min(...rates)
                    : null;
                const thumb = pickleballCourt.courts?.find((c) => c.image_url)?.image_url ?? null;

                return (
                  <Link key={pickleballCourt.id} href={`/pickleball-courts/${pickleballCourt.id}`} className="group">
                    <Card className="h-full pt-0 transition-all group-hover:ring-primary/40 group-hover:ring-2">
                      <CourtThumb src={thumb} alt={pickleballCourt.name} />
                      <CardHeader className="pb-2">
                        <CardTitle className="font-heading text-lg font-bold uppercase tracking-wide text-white group-hover:text-primary transition-colors line-clamp-2">
                          {pickleballCourt.name}
                        </CardTitle>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="size-3.5 shrink-0" />
                          <span>
                            {[pickleballCourt.area, pickleballCourt.city].filter(Boolean).join(", ")}
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {minRate !== null && (
                          <p className="text-sm font-medium text-primary">
                            From ₱{minRate.toFixed(0)}/hr
                          </p>
                        )}
                        {pickleballCourt.amenities && pickleballCourt.amenities.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {pickleballCourt.amenities.slice(0, 4).map((a) => (
                              <Badge key={a} variant="outline" className="text-xs capitalize">
                                {a}
                              </Badge>
                            ))}
                            {pickleballCourt.amenities.length > 4 && (
                              <Badge variant="ghost" className="text-xs">
                                +{pickleballCourt.amenities.length - 4}
                              </Badge>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
