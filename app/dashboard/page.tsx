import { requireRole } from "@/lib/auth/requireRole";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const { profile } = await requireRole(["player", "owner", "admin"]);

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
          <CardHeader><CardTitle>Owner</CardTitle></CardHeader>
          <CardContent className="flex gap-3">
            <Button asChild><Link href="/owner/pickleball-courts">My Pickleball Courts</Link></Button>
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
    </main>
  );
}
