import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireRole(
  roles: Array<"player" | "owner" | "admin">
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !roles.includes(profile.role)) redirect("/");
  return { user, profile };
}
