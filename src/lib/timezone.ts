import { format, formatDistanceToNowStrict, isBefore } from "date-fns";

/** kickoff lock window for group-stage match predictions (1 hour before). */
export const PREDICTION_LOCK_MS = 60 * 60 * 1000;

export function kickoffDate(iso: string): Date {
  return new Date(iso);
}

export function lockDate(iso: string): Date {
  return new Date(new Date(iso).getTime() - PREDICTION_LOCK_MS);
}

export function isLocked(iso: string, now: Date = new Date()): boolean {
  return !isBefore(now, lockDate(iso));
}

export function isStarted(iso: string, now: Date = new Date()): boolean {
  return !isBefore(now, kickoffDate(iso));
}

export function formatKickoff(iso: string): string {
  return format(new Date(iso), "EEE, MMM d · h:mm a");
}

export function formatDay(iso: string): string {
  return format(new Date(iso), "EEEE, MMMM d");
}

export function dayKey(iso: string): string {
  return format(new Date(iso), "yyyy-MM-dd");
}

export function relativeKickoff(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  if (d.getTime() <= now) return "kicked off";
  return `in ${formatDistanceToNowStrict(d)}`;
}

export function relativeLock(iso: string): string {
  const lock = lockDate(iso);
  const now = Date.now();
  if (lock.getTime() <= now) return "locked";
  return `locks in ${formatDistanceToNowStrict(lock)}`;
}
