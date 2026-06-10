"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/requireRole";
import { revalidatePath } from "next/cache";

const ApplicationSchema = z.object({
  business_name: z.string().min(2),
  contact_number: z.string().min(5),
  city: z.string().min(1),
  area: z.string().optional(),
  message: z.string().optional(),
});

export async function submitOwnerApplication(formData: FormData) {
  const { user } = await requireRole(["player", "owner", "admin"]);
  const parsed = ApplicationSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase.from("owner_applications").insert({
    user_id: user.id,
    business_name: parsed.business_name,
    contact_number: parsed.contact_number,
    city: parsed.city,
    area: parsed.area,
    message: parsed.message,
  });
  if (error) {
    if ((error as any).code === "23505") throw new Error("You already have a pending application.");
    throw new Error("Could not submit application. Please try again.");
  }
  revalidatePath("/dashboard");
}
