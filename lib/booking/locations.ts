import { createClient } from "@/lib/supabase/server";

/**
 * Distinct cities of approved clubs, sorted alphabetically.
 * Powers the "Location" filter in the court search bar.
 */
export async function getLocations(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clubs")
    .select("city")
    .eq("status", "approved");

  const cities = new Set<string>();
  for (const row of (data ?? []) as { city: string | null }[]) {
    const city = row.city?.trim();
    if (city) cities.add(city);
  }
  return [...cities].sort((a, b) => a.localeCompare(b));
}
