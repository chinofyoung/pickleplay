import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function HomePage() {
  return (
    <section className="max-w-7xl mx-auto px-4 py-16 flex flex-col items-center text-center gap-10">
      <div className="flex flex-col items-center gap-6">
        <Badge variant="success">Now Open</Badge>
        <h1 className="text-5xl md:text-7xl font-heading font-bold uppercase tracking-wide text-white">
          Find Your <span className="text-primary">Court</span>
        </h1>
        <p className="text-text-muted text-lg max-w-xl">
          Book pickleball courts near you in seconds. Browse clubs, pick your slot, and play.
        </p>
        <Button asChild size="lg" className="h-14 md:h-16 px-8 md:px-10 text-lg md:text-xl rounded-xl font-bold gap-2">
          <Link href="/clubs">Find a Court <ArrowRight className="size-5 md:size-6" /></Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Browse Clubs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-text-muted text-sm">Discover pickleball clubs in your area with available courts.</p>
            <Badge variant="primary" className="mt-3">100+ Clubs</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Book Instantly</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-text-muted text-sm">Reserve your slot in real-time. No phone calls needed.</p>
            <Badge variant="cta" className="mt-3">Open Now</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Play More</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-text-muted text-sm">Track your bookings, manage schedules, and enjoy the game.</p>
            <Badge variant="outline" className="mt-3">Free to Join</Badge>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
