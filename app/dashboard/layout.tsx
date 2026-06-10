import React from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let auth: { fullName: string | null; role: "player" | "owner" | "admin" } | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, full_name")
      .eq("id", user.id)
      .maybeSingle();
    auth = {
      fullName: profile?.full_name ?? user.email ?? null,
      role: (profile?.role as "player" | "owner" | "admin") ?? "player",
    };
  }

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-primary/30 selection:text-white overflow-x-hidden">
      <Navbar auth={auth} />
      <div className="flex-grow pt-24">{children}</div>
      <Footer />
    </div>
  );
}
