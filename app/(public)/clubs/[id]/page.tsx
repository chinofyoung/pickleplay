import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, MapPin, Clock, QrCode } from "lucide-react";

interface ClubProfilePageProps {
  params: Promise<{ id: string }>;
}

export default async function ClubProfilePage({ params }: ClubProfilePageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch approved club with courts and payment QRs
  const { data: club } = await supabase
    .from("clubs")
    .select(
      "id, name, description, city, area, address, amenities, status, courts(id, name, hourly_rate, open_hour, close_hour), club_payment_qrs(id, label, image_path)"
    )
    .eq("id", id)
    .eq("status", "approved")
    .single();

  if (!club) notFound();

  // Resolve public URLs for QR images
  const qrsWithUrls = (club.club_payment_qrs ?? []).map((qr) => {
    const { data } = supabase.storage
      .from("payment-qrs")
      .getPublicUrl(qr.image_path);
    return { ...qr, publicUrl: data.publicUrl };
  });

  const courts = club.courts ?? [];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-10 space-y-8">
        {/* Back link */}
        <Button variant="ghost" size="sm" asChild className="-ml-1">
          <Link href="/clubs">
            <ArrowLeft className="mr-1 size-4" />
            Back to clubs
          </Link>
        </Button>

        {/* Club header */}
        <div className="space-y-2">
          <h1 className="font-heading text-4xl md:text-5xl font-bold uppercase tracking-wide text-white">
            {club.name}
          </h1>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="size-4 shrink-0 text-primary" />
            <span>{[club.area, club.city, club.address].filter(Boolean).join(" · ")}</span>
          </div>
          <Badge variant="success">Approved</Badge>
        </div>

        {/* Description */}
        {club.description && (
          <Card>
            <CardHeader className="border-b pb-4">
              <CardTitle>About</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 text-sm text-muted-foreground leading-relaxed">
              {club.description}
            </CardContent>
          </Card>
        )}

        {/* Amenities */}
        {club.amenities && club.amenities.length > 0 && (
          <Card>
            <CardHeader className="border-b pb-4">
              <CardTitle>Amenities</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-2">
                {(club.amenities as string[]).map((amenity) => (
                  <Badge key={amenity} variant="outline" className="capitalize">
                    {amenity}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Courts */}
        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle>Courts</CardTitle>
            <CardDescription>
              {courts.length > 0
                ? `${courts.length} court${courts.length !== 1 ? "s" : ""} available`
                : "No courts listed yet."}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {courts.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Court</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead className="text-right">Book</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {courts.map((court) => (
                    <TableRow key={court.id}>
                      <TableCell className="font-medium text-foreground">
                        {court.name}
                      </TableCell>
                      <TableCell className="text-primary font-medium">
                        ₱{Number(court.hourly_rate).toFixed(0)}/hr
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Clock className="size-3.5 shrink-0" />
                          {court.open_hour}:00 – {court.close_hour}:00
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="primary" asChild>
                          <Link href={`/clubs/${club.id}/book/${court.id}`}>
                            Book
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No courts available yet.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Payment QR Codes */}
        {qrsWithUrls.length > 0 && (
          <Card>
            <CardHeader className="border-b pb-4">
              <CardTitle className="flex items-center gap-2">
                <QrCode className="size-5 text-primary" />
                Payment Methods
              </CardTitle>
              <CardDescription>
                Scan a QR code to pay for your booking.
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
      </div>
    </div>
  );
}
