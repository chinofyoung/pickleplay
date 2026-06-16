import Link from "next/link";
import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { PlusCircle, ClipboardList } from "lucide-react";

type PickleballCourtStatus = "pending" | "approved" | "rejected";

function statusVariant(
  status: PickleballCourtStatus
): "warning" | "success" | "destructive" {
  if (status === "approved") return "success";
  if (status === "rejected") return "destructive";
  return "warning";
}

export default async function OwnerPickleballCourtsPage() {
  const { user } = await requireRole(["owner"]);
  const supabase = await createClient();

  const { data: pickleballCourts } = await supabase
    .from("pickleball_courts")
    .select("id, name, city, status, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl text-foreground">My Pickleball Courts</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/owner/bookings">
                <ClipboardList className="mr-1.5 size-4" />
                Booking Requests
              </Link>
            </Button>
            <Button asChild>
              <Link href="/owner/pickleball-courts/new">
                <PlusCircle className="mr-1.5 size-4" />
                Create Pickleball Court
              </Link>
            </Button>
          </div>
        </div>

        {/* Pickleball Courts table */}
        {pickleballCourts && pickleballCourts.length > 0 ? (
          <Card>
            <CardHeader className="border-b pb-4">
              <CardTitle>All Pickleball Courts</CardTitle>
              <CardAction>
                <span className="text-sm text-muted-foreground">
                  {pickleballCourts.length} pickleball court{pickleballCourts.length !== 1 ? "s" : ""}
                </span>
              </CardAction>
            </CardHeader>
            <CardContent className="pt-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pickleballCourts.map((pickleballCourt) => (
                    <TableRow key={pickleballCourt.id}>
                      <TableCell className="font-medium">{pickleballCourt.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {pickleballCourt.city}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(pickleballCourt.status as PickleballCourtStatus)}>
                          {pickleballCourt.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/owner/pickleball-courts/${pickleballCourt.id}`}>Manage</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                You haven&apos;t created any pickleball courts yet.
              </p>
              <Button asChild className="mt-4">
                <Link href="/owner/pickleball-courts/new">
                  <PlusCircle className="mr-1.5 size-4" />
                  Create your first pickleball court
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
