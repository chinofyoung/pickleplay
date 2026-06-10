export const PENDING_WINDOW_MINUTES = 30;
export function computeExpiry(createdAt: Date): Date {
  return new Date(createdAt.getTime() + PENDING_WINDOW_MINUTES * 60_000);
}
export function isExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() > expiresAt.getTime();
}
