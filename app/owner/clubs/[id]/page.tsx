import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { addCourt, uploadQr } from "@/app/owner/actions";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, PlusCircle, QrCode } from "lucide-react";

type ClubStatus = "pending" | "approved" | "rejected";

function statusVariant(
  status: ClubStatus
): "warning" | "success" | "destructive" {
  if (status === "approved") return "success";
  if (status === "rejected") return "destructive";
  return "warning";
}

interface ClubDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ClubDetailPage({ params }: ClubDetailPageProps) {
  const { id } = await params;
  const { user } = await requireRole(["owner"]);
  const supabase = await createClient();

  // Fetch the club (must belong to this owner)
  const { data: club } = await supabase
    .from("clubs")
    .select("id, name, description, city, area, address, amenities, status")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (!club) redirect("/owner/clubs");

  // Fetch courts
  const { data: courts } = await supabase
    .from("courts")
    .select("id, name, hourly_rate, open_hour, close_hour")
    .eq("club_id", id)
    .order("name");

  // Fetch payment QRs
  const { data: qrs } = await supabase
    .from("club_payment_qrs")
    .select("id, label, image_path")
    .eq("club_id", id);

  // Resolve public URLs for QR images
  const qrsWithUrls = (qrs ?? []).map((qr) => {
    const { data } = supabase.storage
      .from("payment-qrs")
      .getPublicUrl(qr.image_path);
    return { ...qr, publicUrl: data.publicUrl };
  });

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Back */}
        <Button variant="ghost" size="sm" asChild className="-ml-1">
          <Link href="/owner/clubs">
            <ArrowLeft className="mr-1 size-4" />
            Back to clubs
          </Link>
        </Button>

        {/* Club header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl text-foreground">{club.name}</h1>
            <p className="mt-1 text-muted-foreground">
              {[club.area, club.city].filter(Boolean).join(", ")}
            </p>
          </div>
          <Badge variant={statusVariant(club.status as ClubStatus)}>
            {club.status}
          </Badge>
        </div>

        {/* Club details */}
        {(club.description || club.address || (club.amenities && club.amenities.length > 0)) && (
          <Card>
            <CardHeader className="border-b pb-4">
              <CardTitle>About</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-4 text-sm text-muted-foreground">
              {club.description && <p>{club.description}</p>}
              {club.address && (
                <p>
                  <span className="font-medium text-foreground">Address:</span>{" "}
                  {club.address}
                </p>
              )}
              {club.amenities && club.amenities.length > 0 && (
                <p>
                  <span className="font-medium text-foreground">Amenities:</span>{" "}
                  {(club.amenities as string[]).join(", ")}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Courts ─────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle>Courts</CardTitle>
            <CardDescription>
              {courts && courts.length > 0
                ? `${courts.length} court${courts.length !== 1 ? "s" : ""}`
                : "No courts yet — add one below."}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-6">
            {courts && courts.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Rate (₱/hr)</TableHead>
                    <TableHead>Hours</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {courts.map((court) => (
                    <TableRow key={court.id}>
                      <TableCell className="font-medium">
                        {court.name}
                      </TableCell>
                      <TableCell>₱{Number(court.hourly_rate).toFixed(2)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {court.open_hour}:00 – {court.close_hour}:00
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* Add court form */}
            <div className="rounded-lg border border-dashed border-border p-4">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
                <PlusCircle className="size-4 text-primary" />
                Add a Court
              </h3>
              <form action={addCourt} className="grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="club_id" value={club.id} />

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="court-name">
                    Court Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="court-name"
                    name="name"
                    type="text"
                    placeholder="Court A"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="hourly-rate">
                    Hourly Rate (₱) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="hourly-rate"
                    name="hourly_rate"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="500"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  {/* spacer for grid alignment */}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="open-hour">
                    Open Hour (0–23) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="open-hour"
                    name="open_hour"
                    type="number"
                    min="0"
                    max="23"
                    placeholder="6"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="close-hour">
                    Close Hour (1–24) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="close-hour"
                    name="close_hour"
                    type="number"
                    min="1"
                    max="24"
                    placeholder="22"
                    required
                  />
                </div>

                <div className="sm:col-span-2">
                  <Button type="submit" className="w-full sm:w-auto">
                    Add Court
                  </Button>
                </div>
              </form>
            </div>
          </CardContent>
        </Card>

        {/* ── Payment QRs ────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="flex items-center gap-2">
              <QrCode className="size-5 text-primary" />
              Payment QR Codes
            </CardTitle>
            <CardDescription>
              Players will see these QRs when paying for a booking.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-6">
            {/* Existing QRs */}
            {qrsWithUrls.length > 0 && (
              <div className="flex flex-wrap gap-4">
                {qrsWithUrls.map((qr) => (
                  <div
                    key={qr.id}
                    className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-3 text-center"
                  >
                    <div className="relative size-32 overflow-hidden rounded-md bg-white">
                      <Image
                        src={qr.publicUrl}
                        alt={`${qr.label} QR code`}
                        fill
                        className="object-contain"
                        unoptimized
                      />
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {qr.label}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {/* Upload form */}
            <div className="rounded-lg border border-dashed border-border p-4">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
                <PlusCircle className="size-4 text-primary" />
                Upload New QR
              </h3>
              <form
                action={uploadQr}
                encType="multipart/form-data"
                className="flex flex-col gap-4 sm:flex-row sm:items-end"
              >
                <input type="hidden" name="club_id" value={club.id} />

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="qr-label">Payment Method</Label>
                  <select
                    id="qr-label"
                    name="label"
                    required
                    className="h-10 rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                  >
                    <option value="gcash">GCash</option>
                    <option value="maya">Maya</option>
                    <option value="bank">Bank Transfer</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="qr-image">
                    QR Image <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="qr-image"
                    name="image"
                    type="file"
                    accept="image/*"
                    required
                    className="cursor-pointer"
                  />
                </div>

                <Button type="submit" className="shrink-0">
                  Upload QR
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
