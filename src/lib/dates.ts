import { addDays, format, isValid, parse } from "date-fns";

/**
 * Timezone policy
 * ---------------
 * Instants are stored as `timestamptz` (absolute UTC) and always *rendered* in
 * the browser's local timezone. The URL carries a plain calendar day
 * (`/day/2026-07-30`), which only means something in a timezone — and the
 * server doesn't know the browser's.
 *
 * So: the server fetches a padded window around the requested day (UTC-anchored,
 * ±2 days — more than the ±14h of real timezone offsets), and the client filters
 * that window down to the exact local-day boundaries. No timezone config, and
 * correct whether you're at home or abroad.
 */

const DAY_MS = 86_400_000;
export const DATE_PARAM_FORMAT = "yyyy-MM-dd";

export function isDateParam(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return isValid(parse(value, DATE_PARAM_FORMAT, new Date()));
}

/** `'2026-07-30'` → that day's midnight **in the browser's local timezone**. */
export function localStartOfDay(param: string): Date {
  const [y, m, d] = param.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/** A `Date` → the `'yyyy-MM-dd'` param for its **local** calendar day. */
export function toDateParam(date: Date): string {
  return format(date, DATE_PARAM_FORMAT);
}

export function shiftDateParam(param: string, days: number): string {
  return toDateParam(addDays(localStartOfDay(param), days));
}

/**
 * UTC-anchored window generously covering `param`'s local day in any timezone.
 * Used for the server-side fetch; the client narrows it down precisely.
 */
export function paddedUtcWindow(param: string): { from: string; to: string } {
  const [y, m, d] = param.split("-").map(Number);
  const anchor = Date.UTC(y, m - 1, d);
  return {
    from: new Date(anchor - 2 * DAY_MS).toISOString(),
    to: new Date(anchor + 3 * DAY_MS).toISOString(),
  };
}

/** Minutes since local midnight. */
export function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function snapMinutes(minutes: number, step: number): number {
  return Math.round(minutes / step) * step;
}

/** Minutes since midnight → `'HH:mm'` for an `<input type="time">`. */
export function minutesToTimeValue(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(minutes)));
  const h = Math.floor(clamped / 60) % 24;
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function timeValueToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** Local day + minutes since its midnight → an absolute instant. */
export function instantFrom(dayParam: string, minutes: number): Date {
  const base = localStartOfDay(dayParam);
  base.setMinutes(base.getMinutes() + minutes);
  return base;
}

export function formatDayHeading(param: string): string {
  return format(localStartOfDay(param), "EEEE, d MMMM yyyy");
}

export function formatTimeRange(startsAt: string, endsAt: string): string {
  return `${format(new Date(startsAt), "HH:mm")} – ${format(new Date(endsAt), "HH:mm")}`;
}
