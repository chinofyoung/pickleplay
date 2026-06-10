import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ApplyOwnerCard } from "./ApplyOwnerCard";

export default async function DashboardPage() {
  const { user, profile } = await requireRole(["player", "owner", "admin"]);
  const supabase = await createClient();
  const { data: latest } = await supabase
    .from("owner_applications")
    .select("status, rejection_reason, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <main className="max-w-7xl mx-auto px-4 py-10 space-y-8">
      <h1 className="text-3xl md:text-4xl">Dashboard</h1>
      <p className="text-text-muted">Welcome{profile.full_name ? `, ${profile.full_name}` : ""}.</p>

      <Card>
        <CardHeader><CardTitle>My Bookings</CardTitle></CardHeader>
        <CardContent>
          <Button asChild variant="outline"><Link href="/my-bookings">View my bookings</Link></Button>
        </CardContent>
      </Card>

      {profile.role === "owner" && (
        <Card>
          <CardHeader><CardTitle>Club Owner</CardTitle></CardHeader>
          <CardContent className="flex gap-3">
            <Button asChild><Link href="/owner/clubs">My Clubs</Link></Button>
            <Button asChild variant="outline"><Link href="/owner/bookings">Booking Requests</Link></Button>
          </CardContent>
        </Card>
      )}

      {profile.role === "admin" && (
        <Card>
          <CardHeader><CardTitle>Super Admin</CardTitle></CardHeader>
          <CardContent>
            <Button asChild><Link href="/admin/applications">Owner Applications</Link></Button>
          </CardContent>
        </Card>
      )}

      {profile.role === "player" && <ApplyOwnerCard latest={latest ?? null} />}
    </main>
  );
}
