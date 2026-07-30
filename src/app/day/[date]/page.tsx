import { notFound, redirect } from "next/navigation";
import DayView from "@/components/DayView";
import SetupNotice from "@/components/SetupNotice";
import { isDateParam, paddedUtcWindow } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import {
  EVENT_COLUMNS,
  LIST_COLUMNS,
  TASK_COLUMNS,
  type CalendarEvent,
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

  const [eventsResult, listsResult, tasksResult] = await Promise.all([
    supabase
      .from("events")
      .select(EVENT_COLUMNS)
      .lt("starts_at", to)
      .gt("ends_at", from)
      .order("starts_at", { ascending: true }),

    supabase
      .from("lists")
      .select(LIST_COLUMNS)
      .eq("archived", false)
      .order("position", { ascending: true }),

    // Every still-open task, plus anything pinned to this day so completed
    // items remain visible on the day you ticked them. `day` is a plain date
    // column, so comparing it to the URL's calendar day needs no timezone maths.
    supabase
      .from("tasks")
      .select(TASK_COLUMNS)
      .or(`done.eq.false,day.eq.${date}`)
      .order("position", { ascending: true }),
  ]);

  return (
    <DayView
      dayParam={date}
      events={(eventsResult.data ?? []) as CalendarEvent[]}
      lists={(listsResult.data ?? []) as TaskList[]}
      tasks={(tasksResult.data ?? []) as Task[]}
      userEmail={user.email ?? "signed in"}
      eventsError={eventsResult.error?.message ?? null}
      tasksError={
        listsResult.error?.message ?? tasksResult.error?.message ?? null
      }
    />
  );
}
