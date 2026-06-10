import Link from "next/link";
import { ArrowRight, Users, LayoutDashboard, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

const benefits = [
  {
    icon: Users,
    title: "Reach More Players",
    description:
      "Get discovered by thousands of pickleball players actively searching for courts near them.",
    colorClass: "text-primary",
    bgClass: "bg-primary/[0.08]",
    borderClass: "border-primary/[0.12]",
  },
  {
    icon: LayoutDashboard,
    title: "Manage Bookings & Payment Proofs",
    description:
      "One dashboard to handle all reservations, review payment screenshots, and confirm slots.",
    colorClass: "text-cta",
    bgClass: "bg-cta/[0.08]",
    borderClass: "border-cta/[0.12]",
  },
  {
    icon: Zap,
    title: "Free to List — Get Approved Fast",
    description:
      "No upfront fees. Submit your courts today and start accepting bookings within 24 hours.",
    colorClass: "text-orange-300",
    bgClass: "bg-orange-400/[0.08]",
    borderClass: "border-orange-400/[0.12]",
  },
];

export function OwnerCtaSection() {
  return (
    <section className="relative rounded-2xl overflow-hidden border border-white/[0.05] bg-white/[0.015] p-12 md:p-20 text-center">
      {/* Background glows */}
      <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-96 h-96 bg-primary/[0.06] rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/2 w-96 h-96 bg-cta/[0.04] rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 space-y-10">
        {/* Badge */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-primary/[0.12] rounded-md bg-primary/[0.06]">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              For Court Owners
            </span>
          </div>
        </div>

        {/* Heading */}
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-white max-w-3xl mx-auto leading-tight">
          OWN COURTS?{" "}
          <span className="text-primary">START EARNING.</span>
        </h2>

        {/* Subline */}
        <p className="text-text-muted max-w-xl mx-auto text-lg font-normal leading-relaxed">
          List your courts on PicklePlay — reach players near you, manage
          bookings and payments in one place, and fill your empty slots.
        </p>

        {/* Benefits */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 text-left">
          {benefits.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <div
                key={benefit.title}
                className="flex items-start gap-4 p-6 rounded-xl bg-white/[0.02] border border-white/[0.05]"
              >
                <div
                  className={`mt-0.5 w-10 h-10 rounded-xl ${benefit.bgClass} border ${benefit.borderClass} flex items-center justify-center shrink-0`}
                >
                  <Icon size={18} className={benefit.colorClass} />
                </div>
                <div className="space-y-1">
                  <h4 className="text-white text-sm font-bold">
                    {benefit.title}
                  </h4>
                  <p className="text-text-muted text-sm leading-relaxed">
                    {benefit.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-4">
          <Button
            size="lg"
            className="w-full sm:w-auto font-semibold px-8 bg-primary hover:bg-primary/90 text-white"
            asChild
          >
            <Link href="/register" className="flex items-center gap-2">
              Become a Club Owner
              <ArrowRight size={16} />
            </Link>
          </Button>
          <Link
            href="/register"
            className="text-text-muted text-sm hover:text-white transition-colors border-b border-white/[0.1] pb-px hover:border-white/[0.3]"
          >
            List your court for free
          </Link>
        </div>
      </div>
    </section>
  );
}
