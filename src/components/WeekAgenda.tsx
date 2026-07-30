"use client";

import Link from "next/link";
import { format } from "date-fns";
import { EVENT_COLOR_CLASSES } from "@/lib/colors";
import { localStartOfDay, minutesToTimeValue, toDateParam } from "@/lib/dates";
import type { PositionedEvent } from "@/lib/layout";
import type { Task } from "@/lib/types";

type Props = {
  days: string[];
  positionedByDay: Map<string, PositionedEvent[]>;
  tasksByDay: Map<string, Task[]>;
};

/**
 * The phone week view. Seven columns of time grid at 375px would give each day
 * about 45px — unreadable — so forward planning on a phone is an agenda: what's
 * on each day, in order, with the day view one tap away for editing.
 */
export default function WeekAgenda({
  days,
  positionedByDay,
  tasksByDay,
}: Props) {
  const today = toDateParam(new Date());

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-16">
      {days.map((day) => {
        const events = positionedByDay.get(day) ?? [];
        const tasks = tasksByDay.get(day) ?? [];
        const openTasks = tasks.filter((t) => !t.done);
        const isToday = day === today;

        return (
          <section key={day} className="border-b border-line">
            <Link
              href={`/day/${day}`}
              className="flex items-baseline gap-2 px-3 py-2 hover:bg-canvas"
            >
              <h2
                className={`text-sm font-semibold ${
                  isToday ? "text-accent" : ""
                }`}
              >
                {format(localStartOfDay(day), "EEE d MMM")}
              </h2>
              {isToday && (
                <span className="text-[11px] font-medium text-accent">
                  Today
                </span>
              )}
              <span className="ml-auto text-[11px] text-muted">
                {events.length === 0 && openTasks.length === 0
                  ? "Free"
                  : [
                      events.length > 0 && `${events.length} block${events.length === 1 ? "" : "s"}`,
                      openTasks.length > 0 && `${openTasks.length} task${openTasks.length === 1 ? "" : "s"}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
              </span>
            </Link>

            {(events.length > 0 || openTasks.length > 0) && (
              <ul className="px-3 pb-2">
                {events.map((p) => (
                  <li
                    key={p.event.id}
                    className="flex items-baseline gap-2 py-0.5 text-sm"
                  >
                    <span
                      aria-hidden
                      className={`size-2 shrink-0 translate-y-0.5 rounded-full ${EVENT_COLOR_CLASSES[p.event.color].swatch}`}
                    />
                    <span className="shrink-0 tabular-nums text-xs text-muted">
                      {minutesToTimeValue(p.startMinutes)}
                    </span>
                    <span className="min-w-0 truncate">{p.event.title}</span>
                  </li>
                ))}

                {openTasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex items-baseline gap-2 py-0.5 text-sm text-muted"
                  >
                    <span aria-hidden className="shrink-0 text-xs">
                      ☐
                    </span>
                    <span className="min-w-0 truncate">{task.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
