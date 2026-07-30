import type { CalendarEvent } from "@/lib/types";

export type PositionedEvent = {
  event: CalendarEvent;
  /** minutes since local midnight, clamped to the day */
  startMinutes: number;
  endMinutes: number;
  /** 0-based column within its overlap cluster */
  column: number;
  /** how many columns the cluster needs */
  columnCount: number;
};

/**
 * Shortest block we will draw. At the default hour height this is just enough
 * for one tight line of text, so a 5-minute event is still readable and
 * tappable rather than a sliver.
 */
const MIN_VISIBLE_MINUTES = 22;

/**
 * Lay out a day's events Google-Calendar style: events that overlap in time are
 * grouped into a cluster and split into side-by-side columns.
 *
 * `dayStart` is local midnight; events are clamped to the day so a block that
 * spans midnight still renders as a partial block on both days.
 */
export function layOutDay(
  events: CalendarEvent[],
  dayStart: Date,
): PositionedEvent[] {
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayStartMs + 86_400_000;

  const spans = events
    .map((event) => {
      const startMs = new Date(event.starts_at).getTime();
      const endMs = new Date(event.ends_at).getTime();
      return { event, startMs, endMs };
    })
    // keep only what actually intersects this local day
    .filter(({ startMs, endMs }) => endMs > dayStartMs && startMs < dayEndMs)
    .map(({ event, startMs, endMs }) => {
      const startMinutes = Math.max(0, (startMs - dayStartMs) / 60_000);
      const endMinutes = Math.min(1440, (endMs - dayStartMs) / 60_000);
      return { event, startMinutes, endMinutes };
    })
    .sort(
      (a, b) =>
        a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes,
    );

  const positioned: PositionedEvent[] = [];

  // Walk the sorted list, cutting a new cluster whenever an event starts after
  // everything before it has ended.
  let cluster: typeof spans = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;

    // Greedy column packing: reuse the first column that is already free.
    const columnEnds: number[] = [];
    const assigned = cluster.map((span) => {
      const visibleEnd = Math.max(
        span.endMinutes,
        span.startMinutes + MIN_VISIBLE_MINUTES,
      );
      let column = columnEnds.findIndex((end) => end <= span.startMinutes);
      if (column === -1) {
        column = columnEnds.length;
      }
      columnEnds[column] = visibleEnd;
      return { span, column };
    });

    for (const { span, column } of assigned) {
      positioned.push({
        event: span.event,
        startMinutes: span.startMinutes,
        endMinutes: span.endMinutes,
        column,
        columnCount: columnEnds.length,
      });
    }

    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const span of spans) {
    const visibleEnd = Math.max(
      span.endMinutes,
      span.startMinutes + MIN_VISIBLE_MINUTES,
    );
    if (span.startMinutes >= clusterEnd) flush();
    cluster.push(span);
    clusterEnd = Math.max(clusterEnd, visibleEnd);
  }
  flush();

  return positioned;
}

/** Height a block should occupy, floored so very short events stay tappable. */
export function visibleMinutes(p: PositionedEvent): number {
  return Math.max(MIN_VISIBLE_MINUTES, p.endMinutes - p.startMinutes);
}
