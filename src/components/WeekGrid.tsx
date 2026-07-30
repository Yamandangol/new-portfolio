"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import DayColumn, {
  HourGutter,
  MINUTES_PER_DAY,
  type TimeRange,
} from "@/components/DayColumn";
import EventComposer, { type ComposerDraft } from "@/components/EventComposer";
import {
  localStartOfDay,
  minutesSinceMidnight,
  toDateParam,
} from "@/lib/dates";
import type { PositionedEvent } from "@/lib/layout";

type Props = {
  days: string[];
  positionedByDay: Map<string, PositionedEvent[]>;
  openTaskCounts: Map<string, number>;
};

/** Seven DayColumns under a sticky header row. Laptop only — see WeekAgenda. */
export default function WeekGrid({
  days,
  positionedByDay,
  openTaskCounts,
}: Props) {
  const router = useRouter();

  const scrollRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const [composer, setComposer] = useState<{
    day: string;
    draft: ComposerDraft;
  } | null>(null);

  const today = toDateParam(new Date());

  useEffect(() => {
    const scroller = scrollRef.current;
    const columns = columnsRef.current;
    if (!scroller || !columns) return;

    const height = columns.getBoundingClientRect().height;
    if (height === 0) return;

    const now = new Date();
    const anchor = days.includes(today)
      ? minutesSinceMidnight(now) - 60
      : 7 * 60;
    scroller.scrollTop = Math.max(0, anchor * (height / MINUTES_PER_DAY));
    // Re-anchor when the week changes, not on every task tick.
  }, [days, today]);

  return (
    <>
      {/* ---- day headers, aligned with the columns below ---------------- */}
      <div className="flex shrink-0 border-b border-line bg-surface px-2 sm:px-4">
        <div className="w-11 shrink-0 sm:w-14" />
        {days.map((day) => {
          const isToday = day === today;
          const open = openTaskCounts.get(day) ?? 0;
          return (
            <Link
              key={day}
              href={`/day/${day}`}
              className={`min-w-0 flex-1 border-l border-line px-1 py-1.5 text-center hover:bg-canvas ${
                isToday ? "text-accent" : ""
              }`}
            >
              <span className="block text-[11px] uppercase tracking-wide text-muted">
                {format(localStartOfDay(day), "EEE")}
              </span>
              <span
                className={`block text-sm font-semibold tabular-nums ${
                  isToday ? "text-accent" : ""
                }`}
              >
                {format(localStartOfDay(day), "d")}
              </span>
              {open > 0 && (
                <span className="mt-0.5 inline-block rounded-full bg-accent/15 px-1.5 text-[10px] font-medium text-accent">
                  {open}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* ---- scrolling grid --------------------------------------------- */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div ref={columnsRef} className="flex px-2 pb-16 sm:px-4">
          <HourGutter />
          {days.map((day) => (
            <DayColumn
              key={day}
              dayParam={day}
              positioned={positionedByDay.get(day) ?? []}
              disabled={composer !== null}
              className="min-w-0 flex-1"
              onCreate={(dayParam, range) =>
                setComposer({
                  day: dayParam,
                  draft: {
                    title: "",
                    notes: "",
                    color: "indigo",
                    startMinutes: range.from,
                    endMinutes: range.to,
                    rrule: null,
                    reminderMinutes: null,
                    isSeriesOccurrence: false,
                  },
                })
              }
              onEdit={(event, range: TimeRange) =>
                setComposer({
                  day,
                  draft: {
                    // For a generated occurrence, event.id is synthetic — the
                    // editable row is the series master.
                    id: event.seriesId ?? event.id,
                    title: event.title,
                    notes: event.notes ?? "",
                    color: event.color,
                    startMinutes: range.from,
                    endMinutes: range.to,
                    rrule: event.rrule,
                    reminderMinutes: event.reminder_minutes_before,
                    isSeriesOccurrence: event.seriesId !== null,
                  },
                })
              }
            />
          ))}
        </div>
      </div>

      {composer && (
        // dayParam is the column that was clicked, so the composer's times
        // resolve against the right calendar day.
        <EventComposer
          dayParam={composer.day}
          draft={composer.draft}
          onClose={() => setComposer(null)}
          onSaved={() => {
            setComposer(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
