import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Clock, CalendarDays, QrCode, CheckCircle, XCircle, Timer } from "lucide-react";
import { uploadProof } from "@/app/booking/actions";

interface BookingDetailPageProps {
  params: Promise<{ id: string }>;
}

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

export default async function BookingDetailPage({ params }: BookingDetailPageProps) {
  const { id: bookingId } = await params;
  await requireRole(["player", "owner", "admin"]);

  const supabase = await createClient();

  // Fetch booking with court + pickleball court
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, date, start_hour, end_hour, total_price, status, payment_proof_path, rejection_reason, expires_at, player_id, courts!inner(id, name, pickleball_court_id, pickleball_courts!inner(id, name))"
    )
    .eq("id", bookingId)
    .single();

  if (!booking) notFound();

  const court = Array.isArray(booking.courts) ? booking.courts[0] : booking.courts;
  const pickleballCourt = court ? (Array.isArray(court.pickleball_courts) ? court.pickleball_courts[0] : court.pickleball_courts) : null;

  // Fetch pickleball court payment QRs
  const pickleballCourtId = pickleballCourt?.id ?? court?.pickleball_court_id;
  const { data: qrs } = await supabase
    .from("pickleball_court_payment_qrs")
    .select("id, label, image_path")
    .eq("pickleball_court_id", pickleballCourtId);

  const qrsWithUrls = (qrs ?? []).map((qr) => {
    const { data } = supabase.storage.from("payment-qrs").getPublicUrl(qr.image_path);
    return { ...qr, publicUrl: data.publicUrl };
  });

  const expiresAt = booking.expires_at ? new Date(booking.expires_at) : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-10 space-y-6">
        {/* Back link */}
        <Button variant="ghost" size="sm" asChild className="-ml-1">
          <Link href="/my-bookings">
            <ArrowLeft className="mr-1 size-4" />
            My Bookings
          </Link>
        </Button>

        {/* Booking header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-3xl md:text-4xl font-bold uppercase tracking-wide text-white">
              Booking
            </h1>
            <Badge variant={statusBadgeVariant(booking.status)} className="text-xs h-6 px-2.5">
              {statusLabel(booking.status)}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm font-mono">
            #{bookingId.slice(0, 8).toUpperCase()}
          </p>
        </div>

        {/* Booking details card */}
        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Court</span>
              <span className="text-foreground font-medium">{court?.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Pickleball Court</span>
              <span className="text-foreground">{pickleballCourt?.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <CalendarDays className="size-3.5" />
                Date
              </span>
              <span className="text-foreground">{booking.date}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Clock className="size-3.5" />
                Time
              </span>
              <span className="text-foreground">
                {formatHour(booking.start_hour)} – {formatHour(booking.end_hour)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-muted-foreground font-medium">Total</span>
              <span className="text-primary font-bold text-base">
                ₱{Number(booking.total_price).toFixed(0)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Status-specific sections */}

        {/* PENDING PAYMENT: show QR + proof upload */}
        {booking.status === "pending_payment" && (
          <>
            {/* Expiry notice */}
            {expiresAt && (
              <div className="flex items-start gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-500">
                <Timer className="size-4 mt-0.5 shrink-0" />
                <div>
                  <span className="font-medium">Payment window expires</span> at{" "}
                  {expiresAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} on{" "}
                  {expiresAt.toLocaleDateString()}.
                  <br />
                  <span className="text-yellow-500/80">This booking will auto-cancel if unpaid.</span>
                </div>
              </div>
            )}

            {/* QR Codes */}
            {qrsWithUrls.length > 0 && (
              <Card>
                <CardHeader className="border-b pb-4">
                  <CardTitle className="flex items-center gap-2">
                    <QrCode className="size-5 text-primary" />
                    Pay via QR
                  </CardTitle>
                  <CardDescription>
                    Scan one of the QR codes below to pay ₱{Number(booking.total_price).toFixed(0)}, then upload your proof below.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="flex flex-wrap gap-5">
                    {qrsWithUrls.map((qr) => (
                      <div
                        key={qr.id}
                        className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-center"
                      >
                        <div className="relative size-36 overflow-hidden rounded-lg bg-white">
                          <Image
                            src={qr.publicUrl}
                            alt={`${qr.label} QR code`}
                            fill
                            className="object-contain"
                            unoptimized
                          />
                        </div>
                        <Badge variant="primary" className="capitalize">
                          {qr.label}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Upload proof */}
            <Card>
              <CardHeader className="border-b pb-4">
                <CardTitle>Upload Payment Proof</CardTitle>
                <CardDescription>
                  Upload a screenshot or photo of your payment confirmation.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <form
                  action={uploadProof}
                  encType="multipart/form-data"
                  className="space-y-4"
                >
                  <input type="hidden" name="booking_id" value={bookingId} />
                  <div>
                    <label htmlFor="proof" className="block text-xs font-medium text-muted-foreground mb-1.5">
                      Proof image (JPG, PNG, etc.)
                    </label>
                    <input
                      id="proof"
                      type="file"
                      name="proof"
                      accept="image/*"
                      required
                      className="block w-full text-sm text-muted-foreground file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                    />
                  </div>
                  <Button type="submit" variant="primary" className="w-full">
                    Submit Payment Proof
                  </Button>
                </form>
              </CardContent>
            </Card>
          </>
        )}

        {/* PROOF SUBMITTED */}
        {booking.status === "proof_submitted" && (
          <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/10 px-4 py-4 text-sm text-primary">
            <Clock className="size-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Payment proof submitted</p>
              <p className="text-primary/80 mt-0.5">
                Awaiting confirmation from the venue. You will be notified once confirmed.
              </p>
            </div>
          </div>
        )}

        {/* CONFIRMED */}
        {booking.status === "confirmed" && (
          <div className="flex items-start gap-3 rounded-lg border border-green-500/20 bg-green-500/10 px-4 py-4 text-sm text-green-500">
            <CheckCircle className="size-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Booking confirmed!</p>
              <p className="text-green-500/80 mt-0.5">
                Your court is reserved. See you on {booking.date} at{" "}
                {formatHour(booking.start_hour)}.
              </p>
            </div>
          </div>
        )}

        {/* REJECTED */}
        {booking.status === "rejected" && (
          <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-4 text-sm text-red-400">
            <XCircle className="size-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Booking rejected</p>
              {booking.rejection_reason && (
                <p className="text-red-400/80 mt-0.5">{booking.rejection_reason}</p>
              )}
            </div>
          </div>
        )}

        {/* CANCELLED */}
        {booking.status === "cancelled" && (
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
            <XCircle className="size-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-foreground">Booking cancelled</p>
              <p className="mt-0.5">This booking was cancelled (payment window expired).</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
