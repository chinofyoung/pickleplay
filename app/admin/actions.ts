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

export async function approveApplication(formData: FormData) {
  await requireRole(["admin"]);
  const id = String(formData.get("app_id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_owner_application", { app_id: id });
  if (error) throw new Error("Could not approve application.");
  revalidatePath("/admin/applications");
}

export async function rejectApplication(formData: FormData) {
  await requireRole(["admin"]);
  const id = String(formData.get("app_id"));
  const reason = String(formData.get("reason") || "Application rejected");
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_owner_application", { app_id: id, reason });
  if (error) throw new Error("Could not reject application.");
  revalidatePath("/admin/applications");
}
