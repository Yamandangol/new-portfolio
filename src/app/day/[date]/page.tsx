import { notFound, redirect } from "next/navigation";
import DayView from "@/components/DayView";
import SetupNotice from "@/components/SetupNotice";
import { isDateParam, paddedUtcWindow, shiftDateParam } from "@/lib/dates";
import { HABIT_LOG_WINDOW_DAYS } from "@/lib/habits";
import { createClient } from "@/lib/supabase/server";
import {
  DAILY_NOTE_COLUMNS,
  EVENT_COLUMNS,
  HABIT_COLUMNS,
  HABIT_LOG_COLUMNS,
  LIST_COLUMNS,
  TASK_COLUMNS,
  type CalendarEvent,
  type DailyNote,
  type Habit,
  type HabitLog,
  type Task,
  type TaskList,
} from "@/lib/types";

export default async function DayPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  // Validated before it reaches the .or() filter below, which is string-built.
  if (!isDateParam(date)) notFound();

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return <SetupNotice />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // proxy.ts already gates this, but a Server Component must never assume.
  if (!user) redirect("/login");

  // Fetch a padded window and let the client narrow it to the exact local day
  // (see the timezone note in src/lib/dates.ts). The predicate below is an
  // overlap test, so blocks that started before the window still show up.
  const { from, to } = paddedUtcWindow(date);

  const [
    eventsResult,
    seriesResult,
    listsResult,
    tasksResult,
    noteResult,
    habitsResult,
    habitLogsResult,
  ] = await Promise.all([
    supabase
      .from("events")
      .select(EVENT_COLUMNS)
      .is("rrule", null)
      .lt("starts_at", to)
      .gt("ends_at", from)
      .order("starts_at", { ascending: true }),

    // Series masters are fetched whatever the window: a routine started years
    // ago still has occurrences today, so a date filter would hide it. There
    // are only ever a handful of these rows.
    supabase
      .from("events")
      .select(EVENT_COLUMNS)
      .not("rrule", "is", null)
      .lte("starts_at", to),

    // Archived lists come back too. They render collapsed under "Archived"
    // rather than being filtered away, so archiving stays reversible.
    supabase
      .from("lists")
      .select(LIST_COLUMNS)
      .order("position", { ascending: true }),

    // Every still-open task, plus anything pinned to this day so completed
    // items remain visible on the day you ticked them. `day` is a plain date
    // column, so comparing it to the URL's day needs no timezone maths.
    supabase
      .from("tasks")
      .select(TASK_COLUMNS)
      .or(`done.eq.false,day.eq.${date}`)
      .order("position", { ascending: true }),

    // maybeSingle: most days simply have no note.
    supabase
      .from("daily_notes")
      .select(DAILY_NOTE_COLUMNS)
      .eq("day", date)
      .maybeSingle(),

    // Archived habits come back too, so they can be restored — same pattern
    // as lists.
    supabase
      .from("habits")
      .select(HABIT_COLUMNS)
      .order("position", { ascending: true }),

    // A trailing window rather than just this day: streaks are consecutive
    // completed days, which a single day's rows can't tell you. The window
    // bounds how long a streak can read as — see HABIT_LOG_WINDOW_DAYS.
    supabase
      .from("habit_logs")
      .select(HABIT_LOG_COLUMNS)
      .gte("day", shiftDateParam(date, -(HABIT_LOG_WINDOW_DAYS - 1)))
      .lte("day", date),
  ]);

  return (
    <DayView
      dayParam={date}
      events={[
        ...((eventsResult.data ?? []) as CalendarEvent[]),
        ...((seriesResult.data ?? []) as CalendarEvent[]),
      ]}
      lists={(listsResult.data ?? []) as TaskList[]}
      tasks={(tasksResult.data ?? []) as Task[]}
      habits={(habitsResult.data ?? []) as Habit[]}
      habitLogs={(habitLogsResult.data ?? []) as HabitLog[]}
      noteBody={(noteResult.data as DailyNote | null)?.body ?? ""}
      userEmail={user.email ?? "signed in"}
      eventsError={
        eventsResult.error?.message ?? seriesResult.error?.message ?? null
      }
      tasksError={
        listsResult.error?.message ??
        tasksResult.error?.message ??
        habitsResult.error?.message ??
        habitLogsResult.error?.message ??
        null
      }
    />
  );
}
