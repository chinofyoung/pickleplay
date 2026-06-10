export function calcTotalPrice(hourlyRate: number, startHour: number, endHour: number): number {
  if (endHour <= startHour) throw new Error("endHour must be greater than startHour");
  return hourlyRate * (endHour - startHour);
}
