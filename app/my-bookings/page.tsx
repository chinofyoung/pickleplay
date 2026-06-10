import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { CalendarDays, Clock, ArrowRight, Ticket } from "lucide-react";

function formatHour(h: number): string {
  if (h === 0) return "12:00 AM";
  if (h === 12) return "12:00 PM";
  if (h < 12) return `${h}:00 AM`;
  return `${h - 12}:00 PM`;
}

function statusBadgeVariant(status: string): "success" | "warning" | "error" | "primary" | "outline" {
  switch (status) {
    case "confirmed": return "success";
    case "proof_submitted": return "primary";
    case "pending_payment": return "warning";
    case "rejected": return "error";
    case "cancelled": return "outline";
    default: return "outline";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "pending_payment": return "Pending Payment";
    case "proof_submitted": return "Proof Submitted";
    case "confirmed": return "Confirmed";
    case "rejected": return "Rejected";
    case "cancelled": return "Cancelled";
    default: return status;
  }
}

export default async function MyBookingsPage() {
  const { user } = await requireRole(["player", "owner", "admin"]);
  const supabase = await createClient();

  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      "id, date, start_hour, end_hour, total_price, status, courts!inner(id, name, clubs!inner(id, name))"
    )
    .eq("player_id", user.id)
    .order("date", { ascending: false });

  const items = bookings ?? [];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-10 space-y-6">
        {/* Heading */}
        <div className="space-y-1">
          <h1 className="font-heading text-4xl md:text-5xl font-bold uppercase tracking-wide text-white">
            My Bookings
          </h1>
          <p className="text-muted-foreground text-sm">
            All your court reservations in one place.
          </p>
        </div>

        {items.length === 0 ? (
          <Card>
            <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
              <Ticket className="size-10 text-muted-foreground/40" />
              <div>
                <p className="text-foreground font-medium">No bookings yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Browse courts and make your first reservation.
                </p>
              </div>
              <Button variant="primary" asChild>
                <Link href="/clubs">Browse clubs</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((booking) => {
              const court = Array.isArray(booking.courts) ? booking.courts[0] : booking.courts;
              const club = court ? (Array.isArray(court.clubs) ? court.clubs[0] : court.clubs) : null;

              return (
                <Card key={booking.id} className="hover:ring-primary/30 transition-all">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-foreground font-semibold text-sm truncate">
                            {court?.name}
                          </span>
                          <span className="text-muted-foreground text-xs">·</span>
                          <span className="text-muted-foreground text-xs truncate">
                            {club?.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <CalendarDays className="size-3.5 shrink-0 text-primary" />
                            {booking.date}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="size-3.5 shrink-0 text-primary" />
                            {formatHour(booking.start_hour)} – {formatHour(booking.end_hour)}
                          </span>
                          <span className="text-primary font-semibold">
                            ₱{Number(booking.total_price).toFixed(0)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={statusBadgeVariant(booking.status)} className="text-xs">
                          {statusLabel(booking.status)}
                        </Badge>
                        <Button variant="ghost" size="icon-sm" asChild>
                          <Link href={`/booking/${booking.id}`}>
                            <ArrowRight className="size-4" />
                            <span className="sr-only">View booking</span>
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {items.length > 0 && (
          <div className="text-center">
            <Button variant="outline" asChild>
              <Link href="/clubs">Book another court</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
