import type { EventColor } from "@/lib/types";

/**
 * Tailwind classes per event colour. Written out as literals (not built by
 * string interpolation) so Tailwind's scanner can actually see them.
 */
export const EVENT_COLOR_CLASSES: Record<
  EventColor,
  { block: string; swatch: string }
> = {
  indigo: {
    block:
      "bg-indigo-500/15 border-indigo-500 text-indigo-950 dark:bg-indigo-400/20 dark:text-indigo-50",
    swatch: "bg-indigo-500",
  },
  sky: {
    block:
      "bg-sky-500/15 border-sky-500 text-sky-950 dark:bg-sky-400/20 dark:text-sky-50",
    swatch: "bg-sky-500",
  },
  emerald: {
    block:
      "bg-emerald-500/15 border-emerald-500 text-emerald-950 dark:bg-emerald-400/20 dark:text-emerald-50",
    swatch: "bg-emerald-500",
  },
  amber: {
    block:
      "bg-amber-500/20 border-amber-500 text-amber-950 dark:bg-amber-400/20 dark:text-amber-50",
    swatch: "bg-amber-500",
  },
  rose: {
    block:
      "bg-rose-500/15 border-rose-500 text-rose-950 dark:bg-rose-400/20 dark:text-rose-50",
    swatch: "bg-rose-500",
  },
  violet: {
    block:
      "bg-violet-500/15 border-violet-500 text-violet-950 dark:bg-violet-400/20 dark:text-violet-50",
    swatch: "bg-violet-500",
  },
  slate: {
    block:
      "bg-slate-500/15 border-slate-500 text-slate-900 dark:bg-slate-400/20 dark:text-slate-50",
    swatch: "bg-slate-500",
  },
};
