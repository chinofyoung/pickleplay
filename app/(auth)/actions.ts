"use server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export async function signUp(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));
  const full_name = String(formData.get("full_name"));
  const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name } } });
  if (error) return redirect(`/register?error=${encodeURIComponent(error.message)}`);
  redirect("/");
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) return redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

const SignUpOwnerSchema = z.object({
  full_name: z.string().min(1),
  email: z.string().email(),
  contact_number: z.string().min(5),
  password: z.string().min(6),
  name: z.string().min(2),
  address: z.string().min(1),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
});

export async function signUpOwner(formData: FormData) {
  // 1. Validate input
  let parsed: z.infer<typeof SignUpOwnerSchema>;
  try {
    parsed = SignUpOwnerSchema.parse(Object.fromEntries(formData));
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0]?.message ?? "Invalid input" : "Invalid input";
    return redirect(`/register?error=${encodeURIComponent(message)}&tab=owner`);
  }

  const { full_name, email, contact_number, password, name, address, lat, lng } = parsed;

  // 2. Create auth user with anon/SSR client (sets cookies for session)
  const supabase = await createClient();
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name, contact_number } },
  });
  if (signUpError) return redirect(`/register?error=${encodeURIComponent(signUpError.message)}&tab=owner`);

  // 3. Retrieve new user id
  const newUserId = signUpData.user?.id;
  if (!newUserId) return redirect(`/register?error=${encodeURIComponent("Sign up succeeded but user ID was missing")}&tab=owner`);

  // 4. Privileged writes via service-role client (bypasses RLS)
  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // 4a. Elevate role to owner (trigger sets it to 'player' by default)
  const { error: roleError } = await adminClient
    .from("profiles")
    .update({ role: "owner" })
    .eq("id", newUserId);
  if (roleError) return redirect(`/register?error=${encodeURIComponent("Failed to assign owner role: " + roleError.message)}&tab=owner`);

  // 4b. Create the pickleball court with pending status
  const { error: courtError } = await adminClient.from("pickleball_courts").insert({
    owner_id: newUserId,
    name,
    address,
    lat: lat ?? null,
    lng: lng ?? null,
    status: "pending",
  });
  if (courtError) return redirect(`/register?error=${encodeURIComponent("Failed to create court: " + courtError.message)}&tab=owner`);

  // 5. Success
  redirect("/");
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? "";
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (error) return redirect(`/login?error=${encodeURIComponent(error.message)}`);
  if (data?.url) redirect(data.url);
}
