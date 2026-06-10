import { requireRole } from "@/lib/auth/requireRole";
import { createClub } from "@/app/owner/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function NewClubPage() {
  await requireRole(["owner"]);

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Back link */}
        <Button variant="ghost" size="sm" asChild className="-ml-1">
          <Link href="/owner/clubs">
            <ArrowLeft className="mr-1 size-4" />
            Back to clubs
          </Link>
        </Button>

        <h1 className="text-3xl text-foreground">Create a New Club</h1>

        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle>Club Details</CardTitle>
            <CardDescription>
              Your club will start with a{" "}
              <span className="text-yellow-400">pending</span> status and become
              visible after admin approval.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4">
            <form action={createClub} className="flex flex-col gap-5">
              {/* Name */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">
                  Club Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  placeholder="Ace Pickleball Club"
                  required
                  minLength={2}
                />
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  name="description"
                  rows={3}
                  placeholder="Tell players about your club..."
                  className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                />
              </div>

              {/* City + Area */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="city">
                    City <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="city"
                    name="city"
                    type="text"
                    placeholder="Cebu City"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="area">Area / District</Label>
                  <Input
                    id="area"
                    name="area"
                    type="text"
                    placeholder="Lahug"
                  />
                </div>
              </div>

              {/* Address */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="address">Street Address</Label>
                <Input
                  id="address"
                  name="address"
                  type="text"
                  placeholder="123 Pickle St."
                />
              </div>

              {/* Amenities */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="amenities">Amenities</Label>
                <Input
                  id="amenities"
                  name="amenities"
                  type="text"
                  placeholder="Parking, Showers, Lockers (comma-separated)"
                />
                <p className="text-xs text-muted-foreground">
                  Separate multiple amenities with commas.
                </p>
              </div>

              <Button type="submit" className="mt-2 w-full">
                Create Club
              </Button>
            </form>
          </CardContent>

          <CardFooter className="text-xs text-muted-foreground">
            Clubs are reviewed by our team before going live. You&apos;ll be
            notified once approved.
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
