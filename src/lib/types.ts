export const EVENT_COLORS = [
  "indigo",
  "sky",
  "emerald",
  "amber",
  "rose",
  "violet",
  "slate",
] as const;

export type EventColor = (typeof EVENT_COLORS)[number];

export function isEventColor(value: string): value is EventColor {
  return (EVENT_COLORS as readonly string[]).includes(value);
}

/** A time block on the schedule. Mirrors the `events` table. */
export type CalendarEvent = {
  id: string;
  title: string;
  notes: string | null;
  color: EventColor;
  /** ISO 8601 instant */
  starts_at: string;
  /** ISO 8601 instant */
  ends_at: string;
  all_day: boolean;
  /**
   * RRULE subset (see `src/lib/recurrence.ts`). When set, this row is the
   * *master* of a series and `starts_at` is its first occurrence.
   */
  rrule: string | null;
  /** Local days (`'yyyy-MM-dd'`) removed from the series. */
  excluded_dates: string[];
  /** Set on a standalone event that was split out of a series, for provenance. */
  recurrence_parent_id: string | null;
  reminder_minutes_before: number | null;
};

export const EVENT_COLUMNS =
  "id, title, notes, color, starts_at, ends_at, all_day, rrule, excluded_dates, recurrence_parent_id, reminder_minutes_before";

/** Mirrors the `daily_notes` table. */
export type DailyNote = {
  id: string;
  day: string;
  body: string;
};

export const DAILY_NOTE_COLUMNS = "id, day, body";

/**
 * 'checklist' — a standing list you tick through and reset (groceries, packing).
 * 'todo'      — a backlog of one-off tasks you clear permanently.
 */
export const LIST_KINDS = ["checklist", "todo"] as const;
export type ListKind = (typeof LIST_KINDS)[number];

export function isListKind(value: string): value is ListKind {
  return (LIST_KINDS as readonly string[]).includes(value);
}

/** Mirrors the `lists` table. */
export type TaskList = {
  id: string;
  name: string;
  kind: ListKind;
  position: number;
  /** Archived lists stay fetched so they can be restored, but render collapsed. */
  archived: boolean;
};

/** Mirrors the `tasks` table. */
export type Task = {
  id: string;
  list_id: string | null;
  title: string;
  done: boolean;
  /** 'yyyy-MM-dd' when pinned to a day, else null */
  day: string | null;
  position: number;
};

export const LIST_COLUMNS = "id, name, kind, position, archived";
export const TASK_COLUMNS = "id, list_id, title, done, day, position";
