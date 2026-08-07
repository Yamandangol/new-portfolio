import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  format,
  startOfWeek,
} from "date-fns";
import {
  localStartOfDay,
  minutesSinceMidnight,
  toDateParam,
  WEEK_STARTS_ON,
} from "@/lib/dates";
import type { CalendarEvent } from "@/lib/types";

/**
 * A deliberately small slice of RFC 5545.
 *
 * Why hand-rolled rather than the `rrule` package: recurrence here means *local
 * wall-clock* repetition — "gym at 18:00 every Mon/Wed/Fri" must stay at 18:00
 * across a DST boundary, not drift to 17:00. Generic RRULE libraries expand from
 * a UTC instant, which fights the timezone policy in `dates.ts`. So this module
 * works purely in local calendar days, and the time-of-day is re-applied per
 * occurrence by `expandOccurrences`.
 *
 * Supported: FREQ=DAILY|WEEKLY|MONTHLY, INTERVAL, BYDAY (weekly), UNTIL.
 * Not supported: COUNT, BYMONTHDAY, BYSETPOS, nested rules. COUNT is left out on
 * purpose — honouring it means enumerating every occurrence from the series
 * start, which this module avoids so that a daily routine begun years ago still
 * costs a couple of arithmetic steps to render.
 */

export const WEEKDAY_CODES = [
  "SU",
  "MO",
  "TU",
  "WE",
  "TH",
  "FR",
  "SA",
] as const;

export type WeekdayCode = (typeof WEEKDAY_CODES)[number];
export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY";

export type Recurrence = {
  freq: Frequency;
  /** Every n days/weeks/months. Always >= 1. */
  interval: number;
  /** Weekly only. Empty means "the weekday the series started on". */
  byDay: WeekdayCode[];
  /** Inclusive last day, `'yyyy-MM-dd'`, or null for open-ended. */
  until: string | null;
};

/** Guards against a malformed rule spinning forever. */
const MAX_OCCURRENCES = 750;

const WEEKDAY_LABELS: Record<WeekdayCode, string> = {
  SU: "Sun",
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
};

const WEEKDAYS_MON_TO_FRI: WeekdayCode[] = ["MO", "TU", "WE", "TH", "FR"];

function isWeekdayCode(value: string): value is WeekdayCode {
  return (WEEKDAY_CODES as readonly string[]).includes(value);
}

/** Day-of-week of a `'yyyy-MM-dd'` param, as an RFC code. */
export function weekdayCodeOf(dayParam: string): WeekdayCode {
  return WEEKDAY_CODES[localStartOfDay(dayParam).getDay()];
}

// ---------------------------------------------------------------------------
// parse / format
// ---------------------------------------------------------------------------

export function parseRrule(rule: string | null | undefined): Recurrence | null {
  if (!rule) return null;

  const parts = new Map<string, string>();
  for (const chunk of rule.split(";")) {
    const [key, value] = chunk.split("=");
    if (key && value) parts.set(key.trim().toUpperCase(), value.trim());
  }

  const freq = parts.get("FREQ");
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY") return null;

  const rawInterval = Number(parts.get("INTERVAL") ?? 1);
  const interval =
    Number.isFinite(rawInterval) && rawInterval >= 1
      ? Math.floor(rawInterval)
      : 1;

  const byDay =
    freq === "WEEKLY"
      ? (parts.get("BYDAY") ?? "")
          .split(",")
          .map((d) => d.trim().toUpperCase())
          .filter(isWeekdayCode)
      : [];

  // UNTIL is stored as a bare date (YYYYMMDD); a full datetime form is accepted
  // on read so hand-written rules don't silently lose their end date.
  const rawUntil = parts.get("UNTIL");
  let until: string | null = null;
  if (rawUntil && /^\d{8}/.test(rawUntil)) {
    until = `${rawUntil.slice(0, 4)}-${rawUntil.slice(4, 6)}-${rawUntil.slice(6, 8)}`;
  }

  return { freq, interval, byDay, until };
}

export function formatRrule(rec: Recurrence): string {
  const parts = [`FREQ=${rec.freq}`];
  if (rec.interval > 1) parts.push(`INTERVAL=${rec.interval}`);
  if (rec.freq === "WEEKLY" && rec.byDay.length > 0) {
    // Keep BYDAY in week order so the same rule always serialises identically.
    const ordered = WEEKDAY_CODES.filter((c) => rec.byDay.includes(c));
    parts.push(`BYDAY=${ordered.join(",")}`);
  }
  if (rec.until) parts.push(`UNTIL=${rec.until.replaceAll("-", "")}`);
  return parts.join(";");
}

/** Plain-English summary for the composer, e.g. "Every week on Mon, Wed". */
export function describeRecurrence(
  rec: Recurrence,
  seriesStartDay: string,
): string {
  const every = rec.interval === 1 ? "Every" : `Every ${rec.interval}`;
  let base: string;

  if (rec.freq === "DAILY") {
    base = rec.interval === 1 ? "Every day" : `${every} days`;
  } else if (rec.freq === "WEEKLY") {
    const days = rec.byDay.length > 0 ? rec.byDay : [weekdayCodeOf(seriesStartDay)];
    const ordered = WEEKDAY_CODES.filter((c) => days.includes(c));
    const isWeekdays =
      ordered.length === 5 &&
      WEEKDAYS_MON_TO_FRI.every((d) => ordered.includes(d));

    const unit = rec.interval === 1 ? "Every week" : `${every} weeks`;
    base = isWeekdays
      ? rec.interval === 1
        ? "Every weekday"
        : `${unit} on weekdays`
      : `${unit} on ${ordered.map((d) => WEEKDAY_LABELS[d]).join(", ")}`;
  } else {
    const dayOfMonth = localStartOfDay(seriesStartDay).getDate();
    const unit = rec.interval === 1 ? "Every month" : `${every} months`;
    base = `${unit} on day ${dayOfMonth}`;
  }

  if (rec.until) {
    return `${base}, until ${format(localStartOfDay(rec.until), "d MMM yyyy")}`;
  }
  return base;
}

// ---------------------------------------------------------------------------
// expansion
// ---------------------------------------------------------------------------

/**
 * Local calendar days on which the series occurs, within `[rangeStart, rangeEnd]`
 * inclusive. Jumps straight to the first candidate rather than walking from the
 * series start, so an old series is no more expensive than a new one.
 */
export function occurrenceDays(
  rec: Recurrence,
  seriesStartDay: string,
  rangeStart: string,
  rangeEnd: string,
): string[] {
  // An occurrence can never precede the series start.
  const from = rangeStart < seriesStartDay ? seriesStartDay : rangeStart;
  const to = rec.until && rec.until < rangeEnd ? rec.until : rangeEnd;
  if (to < from) return [];

  const start = localStartOfDay(seriesStartDay);
  const fromDate = localStartOfDay(from);
  const toDate = localStartOfDay(to);
  const out: string[] = [];

  if (rec.freq === "DAILY") {
    const offset = differenceInCalendarDays(fromDate, start);
    const remainder = offset % rec.interval;
    const firstOffset =
      remainder === 0 ? offset : offset + (rec.interval - remainder);

    for (let i = 0; i < MAX_OCCURRENCES; i++) {
      const day = addDays(start, firstOffset + i * rec.interval);
      if (day > toDate) break;
      out.push(toDateParam(day));
    }
    return out;
  }

  if (rec.freq === "WEEKLY") {
    const days = rec.byDay.length > 0 ? rec.byDay : [weekdayCodeOf(seriesStartDay)];
    const wanted = new Set<number>(
      days.map((code) => WEEKDAY_CODES.indexOf(code)),
    );

    const opts = { weekStartsOn: WEEK_STARTS_ON } as const;
    const seriesWeek = startOfWeek(start, opts);
    const fromWeek = startOfWeek(fromDate, opts);

    // Whole weeks between the two week-starts, rounded up to the interval.
    const weeksApart = Math.round(
      differenceInCalendarDays(fromWeek, seriesWeek) / 7,
    );
    const remainder = ((weeksApart % rec.interval) + rec.interval) % rec.interval;
    let weekIndex =
      weeksApart < 0
        ? 0
        : remainder === 0
          ? weeksApart
          : weeksApart + (rec.interval - remainder);

    for (let guard = 0; guard < MAX_OCCURRENCES; guard++) {
      const weekStart = addDays(seriesWeek, weekIndex * 7);
      if (weekStart > toDate) break;

      for (let d = 0; d < 7; d++) {
        const day = addDays(weekStart, d);
        if (!wanted.has(day.getDay())) continue;
        // A BYDAY earlier in the first week than the series start isn't an
        // occurrence — the series hasn't begun yet.
        if (day < start || day < fromDate || day > toDate) continue;
        out.push(toDateParam(day));
      }
      weekIndex += rec.interval;
    }
    return out;
  }

  // MONTHLY — same day-of-month as the series start.
  const dayOfMonth = start.getDate();
  const monthsApart = differenceInCalendarMonths(fromDate, start);
  const remainder = ((monthsApart % rec.interval) + rec.interval) % rec.interval;
  let monthIndex =
    monthsApart < 0
      ? 0
      : remainder === 0
        ? monthsApart
        : monthsApart + (rec.interval - remainder);

  for (let guard = 0; guard < MAX_OCCURRENCES; guard++) {
    const monthStart = addMonths(
      new Date(start.getFullYear(), start.getMonth(), 1),
      monthIndex,
    );
    const candidate = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth(),
      dayOfMonth,
    );

    if (
      candidate > toDate &&
      // A short month can push the candidate past `to` while later months are
      // still in range, so only stop once the month itself has passed.
      monthStart > toDate
    ) {
      break;
    }
    if (monthStart > toDate) break;

    // Day 31 in a 30-day month rolls into the next month — skip rather than
    // silently moving the occurrence, matching RFC 5545 BYMONTHDAY behaviour.
    const isRealDate = candidate.getMonth() === monthStart.getMonth();
    if (isRealDate && candidate >= start && candidate >= fromDate && candidate <= toDate) {
      out.push(toDateParam(candidate));
    }
    monthIndex += rec.interval;
  }
  return out;
}

// ---------------------------------------------------------------------------
// events
// ---------------------------------------------------------------------------

export type EventOccurrence = CalendarEvent & {
  /** Master event id when this was generated from a series, else null. */
  seriesId: string | null;
  /** The local day this occurrence falls on. */
  occurrenceDay: string;
};

/** Separator in a generated occurrence's synthetic id. */
export const OCCURRENCE_ID_SEPARATOR = "::";

export function isGeneratedOccurrence(occurrence: EventOccurrence): boolean {
  return occurrence.seriesId !== null;
}

/**
 * Turn stored rows into concrete occurrences covering `[fromDay, toDay]`.
 *
 * One-off events pass through untouched. A master with an RRULE is emitted once
 * per matching local day, re-applying the master's wall-clock start time to that
 * day — which is what keeps an 18:00 routine at 18:00 across a DST change —
 * and carrying its duration forward.
 */
export function expandOccurrences(
  events: CalendarEvent[],
  fromDay: string,
  toDay: string,
): EventOccurrence[] {
  const out: EventOccurrence[] = [];

  for (const event of events) {
    const rec = parseRrule(event.rrule);

    if (!rec) {
      out.push({
        ...event,
        seriesId: null,
        occurrenceDay: toDateParam(new Date(event.starts_at)),
      });
      continue;
    }

    const start = new Date(event.starts_at);
    const seriesStartDay = toDateParam(start);
    const startMinutes = minutesSinceMidnight(start);
    const durationMs = new Date(event.ends_at).getTime() - start.getTime();
    const excluded = new Set(event.excluded_dates ?? []);

    for (const day of occurrenceDays(rec, seriesStartDay, fromDay, toDay)) {
      if (excluded.has(day)) continue;

      const occurrenceStart = localStartOfDay(day);
      occurrenceStart.setMinutes(occurrenceStart.getMinutes() + startMinutes);

      out.push({
        ...event,
        id: `${event.id}${OCCURRENCE_ID_SEPARATOR}${day}`,
        starts_at: occurrenceStart.toISOString(),
        ends_at: new Date(occurrenceStart.getTime() + durationMs).toISOString(),
        seriesId: event.id,
        occurrenceDay: day,
      });
    }
  }

  return out;
}
