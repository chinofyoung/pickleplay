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

type ClubStatus = "pending" | "approved" | "rejected";

function statusVariant(
  status: ClubStatus
): "warning" | "success" | "destructive" {
  if (status === "approved") return "success";
  if (status === "rejected") return "destructive";
  return "warning";
}

export default async function OwnerClubsPage() {
  const { user } = await requireRole(["owner"]);
  const supabase = await createClient();

  const { data: clubs } = await supabase
    .from("clubs")
    .select("id, name, city, status, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl text-foreground">My Clubs</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/owner/bookings">
                <ClipboardList className="mr-1.5 size-4" />
                Booking Requests
              </Link>
            </Button>
            <Button asChild>
              <Link href="/owner/clubs/new">
                <PlusCircle className="mr-1.5 size-4" />
                Create Club
              </Link>
            </Button>
          </div>
        </div>

        {/* Clubs table */}
        {clubs && clubs.length > 0 ? (
          <Card>
            <CardHeader className="border-b pb-4">
              <CardTitle>All Clubs</CardTitle>
              <CardAction>
                <span className="text-sm text-muted-foreground">
                  {clubs.length} club{clubs.length !== 1 ? "s" : ""}
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
                  {clubs.map((club) => (
                    <TableRow key={club.id}>
                      <TableCell className="font-medium">{club.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {club.city}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(club.status as ClubStatus)}>
                          {club.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/owner/clubs/${club.id}`}>Manage</Link>
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
                You haven&apos;t created any clubs yet.
              </p>
              <Button asChild className="mt-4">
                <Link href="/owner/clubs/new">
                  <PlusCircle className="mr-1.5 size-4" />
                  Create your first club
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
