import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { approveApplication, rejectApplication } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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

type AppStatus = "pending" | "approved" | "rejected";

function statusVariant(
  status: AppStatus
): "warning" | "success" | "destructive" {
  if (status === "approved") return "success";
  if (status === "rejected") return "destructive";
  return "warning";
}

interface ProfileRow {
  full_name: string | null;
}

interface ApplicationRow {
  id: string;
  user_id: string;
  business_name: string;
  contact_number: string;
  city: string;
  area: string | null;
  message: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  profiles: ProfileRow | ProfileRow[] | null;
}

function getApplicantName(
  profiles: ProfileRow | ProfileRow[] | null,
  fallback: string
): string {
  if (!profiles) return fallback;
  const p = Array.isArray(profiles) ? profiles[0] : profiles;
  return p?.full_name ?? fallback;
}

export default async function AdminApplicationsPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();

  const { data: applications, error } = await supabase
    .from("owner_applications")
    .select("*, profiles!owner_applications_user_id_fkey(full_name)")
    .order("created_at", { ascending: false });

  // If FK embed fails, fall back to separate query
  let rows: ApplicationRow[] = [];
  if (error || !applications) {
    // Fallback: fetch apps + profiles separately
    const { data: apps } = await supabase
      .from("owner_applications")
      .select("*")
      .order("created_at", { ascending: false });

    if (apps && apps.length > 0) {
      const userIds = [...new Set(apps.map((a) => a.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);

      const profileMap = new Map(
        (profiles ?? []).map((p) => [p.id, p.full_name])
      );

      rows = apps.map((a) => ({
        ...a,
        profiles: { full_name: profileMap.get(a.user_id) ?? null },
      }));
    }
  } else {
    rows = applications as ApplicationRow[];
  }

  const pending = rows.filter((a) => a.status === "pending");
  const reviewed = rows.filter((a) => a.status !== "pending");

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-7 text-primary" />
          <h1 className="font-heading text-3xl font-bold uppercase tracking-wide text-white">
            Owner Applications
          </h1>
          {pending.length > 0 && (
            <Badge variant="warning" className="ml-2">
              {pending.length} pending
            </Badge>
          )}
        </div>

        {/* Pending Applications */}
        <section className="space-y-4">
          <h2 className="font-heading text-xl font-semibold text-white">
            Pending Applications
          </h2>

          {pending.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  No pending applications. All caught up!
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {pending.map((app) => (
                <Card key={app.id}>
                  <CardHeader className="border-b pb-4">
                    <CardTitle className="text-foreground">
                      {app.business_name}
                    </CardTitle>
                    <CardAction>
                      <Badge variant="warning">pending</Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                          Applicant
                        </p>
                        <p className="text-foreground font-medium">
                          {getApplicantName(
                            app.profiles,
                            app.user_id.slice(0, 8) + "…"
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                          Contact
                        </p>
                        <p className="text-foreground">{app.contact_number}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                          Location
                        </p>
                        <p className="text-foreground">
                          {app.area ? `${app.area}, ${app.city}` : app.city}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                          Submitted
                        </p>
                        <p className="text-foreground">
                          {new Date(app.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {app.message && (
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                          Message
                        </p>
                        <p className="text-foreground/80 text-sm italic">
                          &ldquo;{app.message}&rdquo;
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-border">
                      {/* Approve */}
                      <form action={approveApplication}>
                        <input type="hidden" name="app_id" value={app.id} />
                        <Button
                          type="submit"
                          size="sm"
                          className="bg-green-600 hover:bg-green-500 text-white border-transparent"
                        >
                          Approve
                        </Button>
                      </form>

                      {/* Reject with reason */}
                      <form
                        action={rejectApplication}
                        className="flex items-center gap-2"
                      >
                        <input type="hidden" name="app_id" value={app.id} />
                        <Input
                          name="reason"
                          placeholder="Rejection reason (optional)"
                          className="h-8 text-sm w-56"
                        />
                        <Button type="submit" size="sm" variant="destructive">
                          Reject
                        </Button>
                      </form>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Reviewed Applications */}
        {reviewed.length > 0 && (
          <section className="space-y-4">
            <h2 className="font-heading text-xl font-semibold text-white">
              Reviewed Applications
            </h2>
            <Card>
              <CardHeader className="border-b pb-4">
                <CardTitle>History</CardTitle>
                <CardAction>
                  <span className="text-sm text-muted-foreground">
                    {reviewed.length} reviewed
                  </span>
                </CardAction>
              </CardHeader>
              <CardContent className="pt-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Business</TableHead>
                      <TableHead>Applicant</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reviewed.map((app) => (
                      <TableRow key={app.id}>
                        <TableCell className="font-medium text-foreground">
                          {app.business_name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {getApplicantName(
                            app.profiles,
                            app.user_id.slice(0, 8) + "…"
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {app.area ? `${app.area}, ${app.city}` : app.city}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={statusVariant(app.status as AppStatus)}
                          >
                            {app.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {app.rejection_reason ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>
        )}
      </div>
    </div>
  );
}
