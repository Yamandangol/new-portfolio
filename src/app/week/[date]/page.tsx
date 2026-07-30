import { notFound, redirect } from "next/navigation";
import SetupNotice from "@/components/SetupNotice";
import WeekView from "@/components/WeekView";
import { isDateParam, paddedUtcWindow, weekDayParams } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import {
  EVENT_COLUMNS,
  TASK_COLUMNS,
  type CalendarEvent,
  type Task,
} from "@/lib/types";

export default async function WeekPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  // Any day in the week is a valid URL; the week is derived from it.
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
  if (!user) redirect("/login");

  const days = weekDayParams(date);
  // Same padded-window approach as the day view, spanning seven days instead of
  // one; the client clamps each event to the right local day.
  const { from, to } = paddedUtcWindow(days[0], 7);

  const [eventsResult, seriesResult, tasksResult] = await Promise.all([
    supabase
      .from("events")
      .select(EVENT_COLUMNS)
      .is("rrule", null)
      .lt("starts_at", to)
      .gt("ends_at", from)
      .order("starts_at", { ascending: true }),

    // Series masters regardless of the window — see the day view for why.
    supabase
      .from("events")
      .select(EVENT_COLUMNS)
      .not("rrule", "is", null)
      .lte("starts_at", to),

    // Only tasks pinned into this week — the backlog isn't shown here.
    // `day` is a plain date column, so this needs no timezone maths.
    supabase
      .from("tasks")
      .select(TASK_COLUMNS)
      .gte("day", days[0])
      .lte("day", days[6])
      .order("position", { ascending: true }),
  ]);

  return (
    <WeekView
      weekParam={days[0]}
      days={days}
      events={[
        ...((eventsResult.data ?? []) as CalendarEvent[]),
        ...((seriesResult.data ?? []) as CalendarEvent[]),
      ]}
      tasks={(tasksResult.data ?? []) as Task[]}
      userEmail={user.email ?? "signed in"}
      eventsError={
        eventsResult.error?.message ?? seriesResult.error?.message ?? null
      }
      tasksError={tasksResult.error?.message ?? null}
    />
  );
}
