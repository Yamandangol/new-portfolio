"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import DayColumn, {
  HourGutter,
  MINUTES_PER_DAY,
  type TimeRange,
} from "@/components/DayColumn";
import EventComposer, { type ComposerDraft } from "@/components/EventComposer";
import { minutesSinceMidnight, toDateParam } from "@/lib/dates";
import type { PositionedEvent } from "@/lib/layout";

type Props = {
  dayParam: string;
  positioned: PositionedEvent[];
};

/**
 * The day view's schedule: one DayColumn in a scroller, plus the composer.
 * All grid geometry and gestures live in DayColumn, shared with the week view.
 */
export default function ScheduleGrid({ dayParam, positioned }: Props) {
  const router = useRouter();

  const scrollRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const [composer, setComposer] = useState<ComposerDraft | null>(null);

  // ---- open on something useful rather than midnight ----------------------
  useEffect(() => {
    const scroller = scrollRef.current;
    const column = columnRef.current;
    if (!scroller || !column) return;

    const height = column.getBoundingClientRect().height;
    // Zero height means we're mounted but hidden (phone, Tasks tab showing).
    // Leave the scroll alone; it will be set when the pane becomes visible.
    if (height === 0) return;

    const now = new Date();
    const anchor =
      toDateParam(now) === dayParam ? minutesSinceMidnight(now) - 60 : 7 * 60;
    scroller.scrollTop = Math.max(0, anchor * (height / MINUTES_PER_DAY));
  }, [dayParam]);

  return (
    <>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex px-2 pb-16 sm:px-4">
          <HourGutter />
          <div ref={columnRef} className="min-w-0 flex-1">
            <DayColumn
              dayParam={dayParam}
              positioned={positioned}
              disabled={composer !== null}
              emptyHint="Drag or tap a time to add a block"
              onCreate={(_day, range) =>
                setComposer({
                  title: "",
                  notes: "",
                  color: "indigo",
                  startMinutes: range.from,
                  endMinutes: range.to,
                  rrule: null,
                  reminderMinutes: null,
                  isSeriesOccurrence: false,
                })
              }
              onEdit={(event, range: TimeRange) =>
                setComposer({
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
                })
              }
            />
          </div>
        </div>
      </div>

      {composer && (
        <EventComposer
          dayParam={dayParam}
          draft={composer}
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
