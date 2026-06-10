import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { confirmBooking, rejectBooking } from "@/app/owner/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle, XCircle, Clock, ImageOff } from "lucide-react";

type BookingStatus =
  | "pending_payment"
  | "proof_submitted"
  | "confirmed"
  | "rejected"
  | "cancelled"
  | "expired";

function statusVariant(
  status: string
): "warning" | "success" | "destructive" | "secondary" {
  if (status === "confirmed") return "success";
  if (status === "rejected") return "destructive";
  if (status === "proof_submitted") return "warning";
  return "secondary";
}

/** Safely unwrap a Supabase joined field that may be an array or object. */
function first<T>(val: T | T[] | null | undefined): T | null {
  if (val == null) return null;
  return Array.isArray(val) ? (val[0] ?? null) : val;
}

export default async function OwnerBookingsPage() {
  const { user } = await requireRole(["owner"]);
  const supabase = await createClient();

  // RLS (bookings_owner_read) scopes reads to the owner's courts;
  // we also join courts→clubs for display.
  const { data: rawBookings, error } = await supabase
    .from("bookings")
    .select(
      `id, date, start_hour, end_hour, total_price, status,
       payment_proof_path, rejection_reason, player_id,
       court:court_id ( id, name, club:club_id ( id, name ) ),
       profile:player_id ( full_name )`
    )
    .order("date", { ascending: false })
    .order("start_hour", { ascending: true });

  if (error) {
    return (
      <div className="min-h-screen bg-background p-6 md:p-10">
        <div className="mx-auto max-w-5xl">
          <p className="text-destructive">
            Failed to load bookings: {error.message}
          </p>
        </div>
      </div>
    );
  }

  // Extra safety: restrict to owner's clubs in case RLS is unexpectedly broad
  const { data: ownerClubs } = await supabase
    .from("clubs")
    .select("id")
    .eq("owner_id", user.id);

  const ownerClubIds = new Set((ownerClubs ?? []).map((c) => c.id));

  // Normalise rows
  const bookings = (rawBookings ?? [])
    .map((b) => {
      const court = first(b.court as Parameters<typeof first>[0]);
      const club = court ? first((court as { club: unknown }).club as Parameters<typeof first>[0]) : null;
      const profile = first(b.profile as Parameters<typeof first>[0]);
      return {
        id: b.id as string,
        date: b.date as string,
        start_hour: b.start_hour as number,
        end_hour: b.end_hour as number,
        total_price: b.total_price as number,
        status: b.status as BookingStatus,
        payment_proof_path: b.payment_proof_path as string | null,
        rejection_reason: b.rejection_reason as string | null,
        player_id: b.player_id as string,
        court_name: (court as { name?: string } | null)?.name ?? null,
        club_id: (club as { id?: string } | null)?.id ?? null,
        club_name: (club as { name?: string } | null)?.name ?? null,
        player_name: (profile as { full_name?: string | null } | null)?.full_name ?? null,
      };
    })
    .filter((b) => b.club_id == null || ownerClubIds.has(b.club_id));

  const proofSubmitted = bookings.filter((b) => b.status === "proof_submitted");
  const otherBookings = bookings.filter((b) => b.status !== "proof_submitted");

  // Generate signed URLs for proof_submitted bookings (10-minute TTL)
  const signedUrls: Record<string, string | null> = {};
  for (const bk of proofSubmitted) {
    if (bk.payment_proof_path) {
      const { data } = await supabase.storage
        .from("payment-proofs")
        .createSignedUrl(bk.payment_proof_path, 60 * 10);
      signedUrls[bk.id] = data?.signedUrl ?? null;
    }
  }

  const formatTime = (h: number) => `${String(h).padStart(2, "0")}:00`;

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl text-foreground">Booking Requests</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Review proof-of-payment submissions from players
            </p>
          </div>
          {proofSubmitted.length > 0 && (
            <Badge variant="warning" className="text-sm px-3 py-1 h-auto">
              {proofSubmitted.length} pending review
            </Badge>
          )}
        </div>

        {/* ── Proof Submitted — primary section ── */}
        {proofSubmitted.length > 0 ? (
          <Card>
            <CardHeader className="border-b pb-4">
              <CardTitle className="flex items-center gap-2">
                <Clock className="size-4 text-yellow-500" />
                Awaiting Review
              </CardTitle>
              <CardAction>
                <span className="text-sm text-muted-foreground">
                  {proofSubmitted.length} booking
                  {proofSubmitted.length !== 1 ? "s" : ""}
                </span>
              </CardAction>
            </CardHeader>
            <CardContent className="pt-0 divide-y divide-border">
              {proofSubmitted.map((bk) => {
                const signedUrl = signedUrls[bk.id];
                const playerName =
                  bk.player_name ?? bk.player_id.slice(0, 8) + "…";

                return (
                  <div key={bk.id} className="py-6 space-y-4">
                    {/* Booking info */}
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm md:grid-cols-4">
                      <div>
                        <span className="text-muted-foreground">Player</span>
                        <p className="font-medium text-foreground">{playerName}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Court / Club</span>
                        <p className="font-medium text-foreground">
                          {bk.court_name ?? "—"}
                          {bk.club_name && (
                            <span className="text-muted-foreground">
                              {" "}
                              · {bk.club_name}
                            </span>
                          )}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Date</span>
                        <p className="font-medium text-foreground">{bk.date}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Time / Total</span>
                        <p className="font-medium text-foreground">
                          {formatTime(bk.start_hour)}–{formatTime(bk.end_hour)}
                          <span className="ml-2 text-muted-foreground">
                            ₱{Number(bk.total_price).toFixed(2)}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Proof image */}
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">
                        Payment Proof
                      </p>
                      {signedUrl ? (
                        <a
                          href={signedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={signedUrl}
                            alt="Payment proof"
                            className="max-h-48 rounded-lg border border-border object-contain bg-muted"
                          />
                          <span className="mt-1 block text-xs text-primary hover:underline">
                            Open full size ↗
                          </span>
                        </a>
                      ) : (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                          <ImageOff className="size-4" />
                          No proof image available
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      {/* Confirm */}
                      <form action={confirmBooking}>
                        <input type="hidden" name="booking_id" value={bk.id} />
                        <Button
                          type="submit"
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white border-transparent"
                        >
                          <CheckCircle className="mr-1.5 size-4" />
                          Confirm Booking
                        </Button>
                      </form>

                      {/* Reject */}
                      <form
                        action={rejectBooking}
                        className="flex flex-col gap-2 flex-1 max-w-xs"
                      >
                        <input type="hidden" name="booking_id" value={bk.id} />
                        <Textarea
                          name="reason"
                          placeholder="Rejection reason (optional)"
                          className="text-sm min-h-12 resize-none"
                          rows={2}
                        />
                        <Button type="submit" variant="destructive" size="sm">
                          <XCircle className="mr-1.5 size-4" />
                          Reject
                        </Button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <CheckCircle className="mx-auto mb-3 size-10 text-muted-foreground/50" />
              <p className="text-muted-foreground">
                No booking requests awaiting review.
              </p>
            </CardContent>
          </Card>
        )}

        {/* ── Historical bookings ── */}
        {otherBookings.length > 0 && (
          <Card>
            <CardHeader className="border-b pb-4">
              <CardTitle>All Bookings</CardTitle>
              <CardAction>
                <span className="text-sm text-muted-foreground">
                  {otherBookings.length} booking
                  {otherBookings.length !== 1 ? "s" : ""}
                </span>
              </CardAction>
            </CardHeader>
            <CardContent className="pt-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead>Court / Club</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {otherBookings.map((bk) => {
                    const playerName =
                      bk.player_name ?? bk.player_id.slice(0, 8) + "…";
                    return (
                      <TableRow key={bk.id}>
                        <TableCell className="font-medium">{playerName}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {bk.court_name ?? "—"}
                          {bk.club_name && (
                            <span className="ml-1 text-xs">· {bk.club_name}</span>
                          )}
                        </TableCell>
                        <TableCell>{bk.date}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatTime(bk.start_hour)}–{formatTime(bk.end_hour)}
                        </TableCell>
                        <TableCell>₱{Number(bk.total_price).toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(bk.status)}>
                            {bk.status.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
