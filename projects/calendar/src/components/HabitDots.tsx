import type { DayHabitScore } from "@/components/WeekView";

/** Beyond this many habits the dots stop being readable and a count is clearer. */
const MAX_DOTS = 6;

/**
 * Compact per-day habit completion for the week views. Renders one dot per
 * habit — filled for completed — falling back to "3/8" once there are too many
 * dots to scan at a glance.
 */
export default function HabitDots({
  score,
  className = "",
}: {
  score: DayHabitScore;
  className?: string;
}) {
  const { done, total } = score;
  if (total === 0) return null;

  const label = `${done} of ${total} habits done`;

  if (total > MAX_DOTS) {
    return (
      <span
        title={label}
        aria-label={label}
        className={`text-[10px] tabular-nums ${
          done === total ? "font-medium text-accent" : "text-muted"
        } ${className}`}
      >
        {done}/{total}
      </span>
    );
  }

  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-flex items-center gap-0.5 ${className}`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={`size-1.5 rounded-full ${
            i < done ? "bg-accent" : "bg-muted/35"
          }`}
        />
      ))}
    </span>
  );
}
