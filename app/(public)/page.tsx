import Image from "next/image";
import { CourtSearchBar } from "@/components/search/CourtSearchBar";
import { OwnerCtaSection } from "@/components/marketing/OwnerCtaSection";
import { getLocations } from "@/lib/booking/locations";

export default async function HomePage() {
  const locations = await getLocations();
  return (
    <div className="max-w-7xl mx-auto px-4 space-y-24">
      {/* Hero Section */}
      <section className="relative pt-16 pb-8 lg:pt-28 lg:pb-16 overflow-visible">
        {/* Background hero image — full bleed */}
        <div
          className="absolute inset-0 -mx-[50vw] left-1/2 right-1/2 w-screen overflow-hidden pointer-events-none"
          aria-hidden="true"
        >
          <Image
            src="/hero-pickleball.jpg"
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-background/80" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/40" />
        </div>

        <div className="relative z-10 space-y-14">
          {/* Top Badge */}
          <div className="flex justify-center lg:justify-start">
            <div className="inline-flex items-center gap-2.5 px-4 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-full backdrop-blur-sm">
              <span className="flex h-1.5 w-1.5 rounded-full bg-cta" />
              <span className="text-xs font-semibold text-text-muted">
                The Pickleball Booking Platform
              </span>
            </div>
          </div>

          {/* Main Headline */}
          <div className="space-y-6 text-center lg:text-left max-w-5xl">
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white leading-tight">
              FIND YOUR NEXT COURT.<br />
              <span className="text-primary">BOOK IN SECONDS.</span>
            </h1>

            <p className="text-lg md:text-xl text-text-muted max-w-2xl leading-relaxed font-normal lg:pr-8">
              From casual rallies to club open plays — discover courts near you, book in seconds,
              and join thousands of players hitting the court every day.
            </p>
          </div>

          <div className="space-y-4 pt-2 w-full">
            <CourtSearchBar locations={locations} />
          </div>

          {/* Stats Strip — clean divided grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-[1px] bg-white/[0.06] rounded-xl overflow-hidden backdrop-blur-sm">
            <div className="flex flex-col items-center py-7 px-6 gap-1.5 bg-background/80">
              <span className="text-3xl font-bold text-white leading-none">50+</span>
              <span className="text-xs uppercase tracking-wider text-text-muted">Courts Listed</span>
            </div>
            <div className="flex flex-col items-center py-7 px-6 gap-1.5 bg-background/80">
              <span className="text-3xl font-bold text-white leading-none">10K+</span>
              <span className="text-xs uppercase tracking-wider text-text-muted">Players Joined</span>
            </div>
            <div className="flex flex-col items-center py-7 px-6 gap-1.5 bg-background/80">
              <span className="text-3xl font-bold text-white leading-none">20+</span>
              <span className="text-xs uppercase tracking-wider text-text-muted">Cities</span>
            </div>
            <div className="flex flex-col items-center py-7 px-6 gap-1.5 bg-background/80">
              <span className="text-3xl font-bold text-white leading-none">30s</span>
              <span className="text-xs uppercase tracking-wider text-text-muted">Avg. Booking</span>
            </div>
          </div>
        </div>
      </section>

      {/* Club Owner CTA */}
      <OwnerCtaSection />
    </div>
  );
}
