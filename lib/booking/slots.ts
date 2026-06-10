export interface Range { startHour: number; endHour: number; }
export function validateSlot(p: Range & { openHour: number; closeHour: number }):
  { ok: true } | { ok: false; reason: string } {
  if (p.endHour <= p.startHour) return { ok: false, reason: "Invalid time range" };
  if (p.startHour < p.openHour || p.endHour > p.closeHour)
    return { ok: false, reason: "Outside operating hours" };
  return { ok: true };
}
export function overlaps(candidate: Range, existing: Range[]): boolean {
  return existing.some(e => candidate.startHour < e.endHour && e.startHour < candidate.endHour);
}
