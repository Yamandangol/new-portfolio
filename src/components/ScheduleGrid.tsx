"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import EventComposer, { type ComposerDraft } from "@/components/EventComposer";
import { EVENT_COLOR_CLASSES } from "@/lib/colors";
import {
  minutesSinceMidnight,
  minutesToTimeValue,
  snapMinutes,
  toDateParam,
} from "@/lib/dates";
import { visibleMinutes, type PositionedEvent } from "@/lib/layout";

/** Times snap to a quarter hour. */
const SNAP = 15;
/** Duration used when you tap rather than drag out a range. */
const DEFAULT_DURATION = 60;
const MINUTES_PER_DAY = 1440;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

type Props = {
  dayParam: string;
  positioned: PositionedEvent[];
};

/**
 * The time-blocked hour grid: drag (mouse) or tap (touch) to create, click a
 * block to edit. Owns its own scroll position and the create/edit composer.
 */
export default function ScheduleGrid({ dayParam, positioned }: Props) {
  const router = useRouter();

  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const [composer, setComposer] = useState<ComposerDraft | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);

  // ---- current-time indicator ---------------------------------------------
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setNowMinutes(
        toDateParam(now) === dayParam ? minutesSinceMidnight(now) : null,
      );
    };
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, [dayParam]);

  // ---- open on something useful rather than midnight ----------------------
  useEffect(() => {
    const scroller = scrollRef.current;
    const grid = gridRef.current;
    if (!scroller || !grid) return;

    const height = grid.getBoundingClientRect().height;
    // Zero height means we're mounted but hidden (phone, Tasks tab showing).
    // Leave the scroll alone; it will be set when the pane becomes visible.
    if (height === 0) return;

    const now = new Date();
    const anchor =
      toDateParam(now) === dayParam ? minutesSinceMidnight(now) - 60 : 7 * 60;
    scroller.scrollTop = Math.max(0, anchor * (height / MINUTES_PER_DAY));
  }, [dayParam]);

  // ---- pointer → time ------------------------------------------------------
  const minutesAt = useCallback((clientY: number) => {
    const grid = gridRef.current;
    if (!grid) return 0;
    const rect = grid.getBoundingClientRect();
    const raw = ((clientY - rect.top) / rect.height) * MINUTES_PER_DAY;
    return Math.max(0, Math.min(MINUTES_PER_DAY, raw));
  }, []);

  const gesture = useRef<{
    id: number;
    type: string;
    startY: number;
    anchor: number;
    moved: boolean;
  } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    if (composer || e.button !== 0) return;

    const anchor = snapMinutes(minutesAt(e.clientY), SNAP);
    gesture.current = {
      id: e.pointerId,
      type: e.pointerType,
      startY: e.clientY,
      anchor,
      moved: false,
    };

    // Only the mouse drags out a range. On touch, a vertical drag has to stay
    // available for scrolling the day, so touch is tap-to-create only.
    if (e.pointerType === "mouse") {
      setDrag({ from: anchor, to: anchor });
      gridRef.current?.setPointerCapture(e.pointerId);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    if (Math.abs(e.clientY - g.startY) > 6) g.moved = true;
    if (g.type === "mouse") {
      setDrag({ from: g.anchor, to: snapMinutes(minutesAt(e.clientY), SNAP) });
    }
  }

  function endGesture() {
    gesture.current = null;
    setDrag(null);
  }

  function onPointerUp(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    endGesture();

    // A touch that moved was a scroll, not a tap.
    if (g.type !== "mouse" && g.moved) return;

    let from = g.anchor;
    let to =
      g.type === "mouse" ? snapMinutes(minutesAt(e.clientY), SNAP) : g.anchor;
    if (to < from) [from, to] = [to, from];
    if (to - from < SNAP) to = from + DEFAULT_DURATION;
    if (to > MINUTES_PER_DAY) {
      to = MINUTES_PER_DAY;
      from = Math.min(from, MINUTES_PER_DAY - SNAP);
    }

    setComposer({
      title: "",
      notes: "",
      color: "indigo",
      startMinutes: from,
      endMinutes: to,
    });
  }

  const ghost = drag
    ? { from: Math.min(drag.from, drag.to), to: Math.max(drag.from, drag.to) }
    : null;

  return (
    <>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex px-2 pb-16 sm:px-4">
          {/* hour gutter */}
          <div className="no-select w-11 shrink-0 sm:w-14">
            {HOURS.map((hour) => (
              <div key={hour} className="h-(--hour-height) relative">
                <span
                  className={`absolute right-2 text-[11px] tabular-nums text-muted ${
                    hour === 0 ? "top-0" : "-top-1.5"
                  }`}
                >
                  {minutesToTimeValue(hour * 60)}
                </span>
              </div>
            ))}
          </div>

          {/* grid body */}
          <div
            ref={gridRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={endGesture}
            className="relative flex-1 touch-pan-y border-l border-line"
            style={{ height: "calc(24 * var(--hour-height))" }}
          >
            {/* hour lines */}
            {HOURS.map((hour) => (
              <div
                key={hour}
                aria-hidden
                className="h-(--hour-height) border-t border-line first:border-t-0"
              />
            ))}

            {positioned.length === 0 && !ghost && (
              <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-sm text-muted">
                Drag or tap a time to add a block
              </p>
            )}

            {/* drag ghost */}
            {ghost && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-1 rounded-md border-2 border-dashed border-accent bg-accent/10"
                style={{
                  top: `calc(${ghost.from} / 60 * var(--hour-height))`,
                  height: `calc(${Math.max(ghost.to - ghost.from, SNAP)} / 60 * var(--hour-height))`,
                }}
              >
                <span className="px-1.5 text-[11px] font-medium text-accent">
                  {minutesToTimeValue(ghost.from)} –{" "}
                  {minutesToTimeValue(Math.max(ghost.to, ghost.from + SNAP))}
                </span>
              </div>
            )}

            {/* events */}
            {positioned.map((p) => {
              const height = visibleMinutes(p);
              // Below this there is only room for the title on one tight line;
              // the times are already legible from the block's position.
              const compact = height < 55;
              return (
                <button
                  key={p.event.id}
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() =>
                    setComposer({
                      id: p.event.id,
                      title: p.event.title,
                      notes: p.event.notes ?? "",
                      color: p.event.color,
                      startMinutes: Math.round(p.startMinutes),
                      endMinutes: Math.round(p.endMinutes),
                    })
                  }
                  className={`absolute overflow-hidden rounded-md border-l-4 px-1.5 text-left shadow-sm transition-shadow hover:shadow-md ${
                    compact ? "py-0 text-[11px]/[1.2]" : "py-0.5 text-xs/[1.35]"
                  } ${EVENT_COLOR_CLASSES[p.event.color].block}`}
                  style={{
                    top: `calc(${p.startMinutes} / 60 * var(--hour-height))`,
                    height: `calc(${height} / 60 * var(--hour-height) - 2px)`,
                    left: `calc(${(p.column / p.columnCount) * 100}% + 2px)`,
                    width: `calc(${100 / p.columnCount}% - 4px)`,
                  }}
                >
                  <span className="block truncate font-semibold">
                    {p.event.title}
                  </span>
                  {!compact && (
                    <span className="block truncate opacity-75">
                      {minutesToTimeValue(p.startMinutes)} –{" "}
                      {minutesToTimeValue(p.endMinutes)}
                    </span>
                  )}
                </button>
              );
            })}

            {/* now line */}
            {nowMinutes !== null && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                style={{ top: `calc(${nowMinutes} / 60 * var(--hour-height))` }}
              >
                <span className="size-2 -translate-x-1 rounded-full bg-now" />
                <span className="h-px flex-1 bg-now" />
              </div>
            )}
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
