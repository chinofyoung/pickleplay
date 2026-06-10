import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { setClubStatus } from "@/app/admin/actions";
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
import { ShieldCheck } from "lucide-react";

type ClubStatus = "pending" | "approved" | "rejected";

function statusVariant(
  status: ClubStatus
): "warning" | "success" | "destructive" {
  if (status === "approved") return "success";
  if (status === "rejected") return "destructive";
  return "warning";
}

interface ProfileRow {
  full_name: string | null;
}

interface ClubRow {
  id: string;
  name: string;
  city: string;
  status: string;
  owner_id: string;
  profiles: ProfileRow | ProfileRow[] | null;
}

function getOwnerName(profiles: ProfileRow | ProfileRow[] | null, fallback: string): string {
  if (!profiles) return fallback;
  const p = Array.isArray(profiles) ? profiles[0] : profiles;
  return p?.full_name ?? fallback;
}

export default async function AdminClubsPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();

  // Fetch ALL clubs with owner info, pending first
  const { data: clubs } = await supabase
    .from("clubs")
    .select("id, name, city, status, owner_id, profiles(full_name)")
    .order("status", { ascending: true }) // pending alphabetically before approved/rejected
    .order("name", { ascending: true });

  const pending = (clubs ?? []).filter((c) => c.status === "pending");
  const others = (clubs ?? []).filter((c) => c.status !== "pending");
  const sorted = [...pending, ...others] as ClubRow[];

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-7 text-primary" />
          <h1 className="font-heading text-3xl font-bold uppercase tracking-wide text-white">
            Club Approvals
          </h1>
          {pending.length > 0 && (
            <Badge variant="warning" className="ml-2">
              {pending.length} pending
            </Badge>
          )}
        </div>

        {sorted.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No clubs found.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="border-b pb-4">
              <CardTitle>All Clubs</CardTitle>
              <CardAction>
                <span className="text-sm text-muted-foreground">
                  {sorted.length} club{sorted.length !== 1 ? "s" : ""} total
                  {pending.length > 0 ? ` · ${pending.length} pending` : ""}
                </span>
              </CardAction>
            </CardHeader>
            <CardContent className="pt-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Club Name</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((club) => (
                    <TableRow key={club.id}>
                      <TableCell className="font-medium text-foreground">
                        {club.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {club.city}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {getOwnerName(club.profiles, club.owner_id.slice(0, 8) + "…")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(club.status as ClubStatus)}>
                          {club.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {club.status === "pending" ? (
                          <div className="flex justify-end gap-2">
                            <form action={setClubStatus}>
                              <input type="hidden" name="club_id" value={club.id} />
                              <input type="hidden" name="status" value="approved" />
                              <Button
                                type="submit"
                                size="sm"
                                variant="default"
                                className="bg-green-600 hover:bg-green-500 text-white border-transparent"
                              >
                                Approve
                              </Button>
                            </form>
                            <form action={setClubStatus}>
                              <input type="hidden" name="club_id" value={club.id} />
                              <input type="hidden" name="status" value="rejected" />
                              <Button type="submit" size="sm" variant="destructive">
                                Reject
                              </Button>
                            </form>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground capitalize">
                            {club.status}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
