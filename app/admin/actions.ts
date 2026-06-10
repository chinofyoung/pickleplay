"use server";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/requireRole";
import { revalidatePath } from "next/cache";

export async function setClubStatus(formData: FormData) {
  await requireRole(["admin"]);
  const id = String(formData.get("club_id"));
  const status = String(formData.get("status")); // 'approved' | 'rejected'
  if (status !== "approved" && status !== "rejected") throw new Error("Invalid status");
  const supabase = await createClient();
  const { error } = await supabase.from("clubs").update({ status }).eq("id", id);
  if (error) throw error;
  revalidatePath("/admin/clubs");
  revalidatePath("/clubs");
}
