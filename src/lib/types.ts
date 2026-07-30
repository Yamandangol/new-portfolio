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
};

/** Columns Phase 1 selects from `events`. */
export const EVENT_COLUMNS =
  "id, title, notes, color, starts_at, ends_at, all_day";

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
