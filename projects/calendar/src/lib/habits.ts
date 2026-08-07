import { shiftDateParam } from "@/lib/dates";
import type { Habit, HabitLog } from "@/lib/types";

/**
 * How far back logs are fetched. Streaks are computed from this window, so a
 * streak longer than this reads as exactly this many days — see `computeStreak`.
 */
export const HABIT_LOG_WINDOW_DAYS = 90;

/**
 * Habits and their logs move together: ticking a habit writes a log row, and
 * deleting a habit takes its logs with it. Keeping them in one optimistic value
 * means a single `useOptimistic` covers both and they can never disagree
 * mid-transition.
 */
export type HabitState = {
  habits: Habit[];
  logs: HabitLog[];
};

export type HabitOptimisticAction =
  | { type: "add"; habit: Habit }
  | { type: "toggle"; habitId: string; day: string; completed: boolean }
  | {
      type: "increment";
      habitId: string;
      day: string;
      delta: number;
      target: number;
    }
  | { type: "rename"; habitId: string; title: string }
  | { type: "delete"; habitId: string }
  | { type: "archive"; habitId: string; archived: boolean }
  | { type: "lock"; habitId: string; locked: boolean };

/** Clamp to the habit's allowed range: never below zero, never past the target. */
export function clampValue(value: number, target: number): number {
  return Math.max(0, Math.min(target, value));
}

function upsertLog(
  logs: HabitLog[],
  habitId: string,
  day: string,
  update: (existing: HabitLog | undefined) => { value: number; completed: boolean },
): HabitLog[] {
  const index = logs.findIndex((l) => l.habit_id === habitId && l.day === day);
  const existing = index === -1 ? undefined : logs[index];
  const next = update(existing);

  if (existing) {
    const copy = [...logs];
    copy[index] = { ...existing, ...next };
    return copy;
  }

  return [
    ...logs,
    {
      // Replaced by the real row on the next refresh; only needs to be unique
      // enough to serve as a React key in the meantime.
      id: `optimistic-${habitId}-${day}`,
      habit_id: habitId,
      day,
      ...next,
    },
  ];
}

export function reduceHabits(
  state: HabitState,
  action: HabitOptimisticAction,
): HabitState {
  switch (action.type) {
    case "add":
      return { ...state, habits: [...state.habits, action.habit] };

    case "toggle":
      return {
        ...state,
        logs: upsertLog(state.logs, action.habitId, action.day, () => ({
          // A boolean habit's target is 1, so value mirrors completion and the
          // same progress maths works for both kinds.
          value: action.completed ? 1 : 0,
          completed: action.completed,
        })),
      };

    case "increment": {
      const { target } = action;
      return {
        ...state,
        logs: upsertLog(state.logs, action.habitId, action.day, (existing) => {
          const value = clampValue((existing?.value ?? 0) + action.delta, target);
          return { value, completed: value >= target };
        }),
      };
    }

    case "rename":
      return {
        ...state,
        habits: state.habits.map((h) =>
          h.id === action.habitId ? { ...h, title: action.title } : h,
        ),
      };

    case "delete":
      // Logs go too, mirroring the ON DELETE CASCADE.
      return {
        habits: state.habits.filter((h) => h.id !== action.habitId),
        logs: state.logs.filter((l) => l.habit_id !== action.habitId),
      };

    case "archive":
      return {
        ...state,
        habits: state.habits.map((h) =>
          h.id === action.habitId ? { ...h, archived: action.archived } : h,
        ),
      };

    case "lock":
      return {
        ...state,
        habits: state.habits.map((h) =>
          h.id === action.habitId ? { ...h, locked: action.locked } : h,
        ),
      };
  }
}

/** Logs for one day, keyed by habit id. */
export function logsForDay(
  logs: HabitLog[],
  day: string,
): Map<string, HabitLog> {
  const map = new Map<string, HabitLog>();
  for (const log of logs) {
    if (log.day === day) map.set(log.habit_id, log);
  }
  return map;
}

/** Every log of one habit, keyed by day — the shape `computeStreak` wants. */
export function logDaysForHabit(
  logs: HabitLog[],
  habitId: string,
): Map<string, HabitLog> {
  const map = new Map<string, HabitLog>();
  for (const log of logs) {
    if (log.habit_id === habitId) map.set(log.day, log);
  }
  return map;
}

/**
 * Consecutive completed days ending at `day`.
 *
 * If `day` itself isn't complete the count runs to the day before, so a streak
 * doesn't read as zero all morning simply because today hasn't happened yet. A
 * gap before that ends it.
 *
 * Bounded by the fetched window (`HABIT_LOG_WINDOW_DAYS`): a longer run reports
 * as the window length rather than its true value.
 */
export function computeStreak(
  byDay: Map<string, HabitLog>,
  day: string,
  maxDays = HABIT_LOG_WINDOW_DAYS,
): number {
  let cursor = day;

  // Today not being done yet shouldn't wipe the streak — start from yesterday.
  if (!byDay.get(cursor)?.completed) {
    cursor = shiftDateParam(cursor, -1);
  }

  let streak = 0;
  while (streak < maxDays && byDay.get(cursor)?.completed) {
    streak++;
    cursor = shiftDateParam(cursor, -1);
  }
  return streak;
}

export type HabitProgress = {
  value: number;
  target: number;
  completed: boolean;
  /** 0–1, for the count-habit progress bar. */
  fraction: number;
};

export function habitProgress(habit: Habit, log: HabitLog | undefined): HabitProgress {
  const target = Math.max(1, habit.target);
  const value = clampValue(log?.value ?? 0, target);
  return {
    value,
    target,
    completed: log?.completed ?? false,
    fraction: value / target,
  };
}

/** How many of the active habits are done on `day`. */
export function habitScore(
  habits: Habit[],
  logs: HabitLog[],
  day: string,
): { done: number; total: number } {
  const byHabit = logsForDay(logs, day);
  const active = habits.filter((h) => !h.archived);
  return {
    done: active.filter((h) => byHabit.get(h.id)?.completed).length,
    total: active.length,
  };
}

/** Habits in manual order; archived ones are excluded by the caller. */
export function orderHabits(habits: Habit[]): Habit[] {
  return [...habits].sort((a, b) => a.position - b.position);
}
