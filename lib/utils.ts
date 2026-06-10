import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Standardizes any date-like value (Date, Timestamp, ISO string) into a Date object
 */
export function toDate(value: unknown): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  const parsed = new Date(value as string);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Formats a date to YYYY-MM-DD string for native HTML date inputs
 */
export function toInputDate(date: unknown): string {
  const d = toDate(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDate(date: unknown, formatStr: "short" | "long" | "full" = "short") {
  if (!date) return "";
  const d = toDate(date);

  if (formatStr === "full") {
    return d.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  return d.toLocaleDateString('en-US', {
    month: formatStr === "short" ? 'short' : 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Generates a unique ID using crypto.randomUUID if available,
 * otherwise falls back to a custom implementation.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 11) +
    Math.random().toString(36).substring(2, 11);
}
