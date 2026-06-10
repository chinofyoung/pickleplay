"use client";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { submitOwnerApplication } from "@/app/dashboard/actions";

interface LatestApplication {
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
}

interface ApplyOwnerCardProps {
  latest: LatestApplication | null;
}

export function ApplyOwnerCard({ latest }: ApplyOwnerCardProps) {
  if (latest?.status === "pending") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Application under review
            <Badge variant="warning">Pending</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Your application to become a club owner is currently being reviewed. We&apos;ll notify you once a decision has been made.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (latest?.status === "approved") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            You&apos;re a club owner!
            <Badge variant="success">Approved</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/owner/clubs">Go to My Clubs</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // null or rejected — show application form
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {latest?.status === "rejected" ? "Re-apply as Club Owner" : "Apply as Club Owner"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {latest?.status === "rejected" && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <p className="font-medium mb-1">Your previous application was rejected.</p>
            {latest.rejection_reason && (
              <p className="text-destructive/80">{latest.rejection_reason}</p>
            )}
          </div>
        )}

        <form action={submitOwnerApplication} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="business_name">Business name</Label>
            <Input
              id="business_name"
              name="business_name"
              type="text"
              placeholder="My Pickleball Club"
              required
              minLength={2}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contact_number">Contact number</Label>
            <Input
              id="contact_number"
              name="contact_number"
              type="tel"
              placeholder="+63 917 123 4567"
              required
              minLength={5}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                name="city"
                type="text"
                placeholder="Makati"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="area">Area <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                id="area"
                name="area"
                type="text"
                placeholder="BGC"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="message">Message <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea
              id="message"
              name="message"
              placeholder="Tell us about your club or courts..."
              rows={3}
            />
          </div>

          <Button type="submit" className="mt-1">
            Apply as Club Owner
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
