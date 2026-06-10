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
}

interface Club {
  id: string;
  name: string;
  city: string;
  area: string | null;
  amenities: string[] | null;
  courts: Court[];
}

export default async function ClubsDiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("clubs")
    .select("id,name,city,area,amenities,courts(hourly_rate)")
    .eq("status", "approved");

  if (sp.q) query = query.ilike("name", `%${sp.q}%`);
  if (sp.city) query = query.eq("city", sp.city);
  if (sp.amenity) query = query.contains("amenities", [sp.amenity]);

  const { data: rawClubs } = await query.order("name");

  let clubs: Club[] = (rawClubs ?? []) as Club[];

  // In-memory maxPrice filter against min court hourly_rate
  if (sp.maxPrice) {
    const maxPriceNum = Number(sp.maxPrice);
    if (!isNaN(maxPriceNum)) {
      clubs = clubs.filter((club) => {
        if (!club.courts || club.courts.length === 0) return true;
        const minRate = Math.min(...club.courts.map((c) => Number(c.hourly_rate)));
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
            Find a <span className="text-primary">Club</span>
          </h1>
          <p className="text-muted-foreground text-base">
            Browse approved pickleball clubs. Filter by location, price, or amenities.
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
              placeholder="Club name…"
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
                <Link href="/clubs">Clear filters</Link>
              </Button>
            )}
          </div>
        </form>

        {/* Results */}
        {clubs.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <MapPin className="size-12 text-muted-foreground/40" />
            <p className="text-lg font-medium text-muted-foreground">
              No clubs found
            </p>
            <p className="text-sm text-muted-foreground/60">
              {hasFilters
                ? "Try adjusting your filters."
                : "No approved clubs available yet."}
            </p>
            {hasFilters && (
              <Button variant="outline" asChild>
                <Link href="/clubs">Clear filters</Link>
              </Button>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {clubs.length} club{clubs.length !== 1 ? "s" : ""} found
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {clubs.map((club) => {
                const rates = club.courts
                  ?.map((c) => Number(c.hourly_rate))
                  .filter((r) => !isNaN(r));
                const minRate =
                  rates && rates.length > 0
                    ? Math.min(...rates)
                    : null;

                return (
                  <Link key={club.id} href={`/clubs/${club.id}`} className="group">
                    <Card className="h-full transition-all group-hover:ring-primary/40 group-hover:ring-2">
                      <CardHeader className="pb-2">
                        <CardTitle className="font-heading text-lg font-bold uppercase tracking-wide text-white group-hover:text-primary transition-colors line-clamp-2">
                          {club.name}
                        </CardTitle>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="size-3.5 shrink-0" />
                          <span>
                            {[club.area, club.city].filter(Boolean).join(", ")}
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {minRate !== null && (
                          <p className="text-sm font-medium text-primary">
                            From ₱{minRate.toFixed(0)}/hr
                          </p>
                        )}
                        {club.amenities && club.amenities.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {club.amenities.slice(0, 4).map((a) => (
                              <Badge key={a} variant="outline" className="text-xs capitalize">
                                {a}
                              </Badge>
                            ))}
                            {club.amenities.length > 4 && (
                              <Badge variant="ghost" className="text-xs">
                                +{club.amenities.length - 4}
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
