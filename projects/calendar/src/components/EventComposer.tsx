"use client";

import { useEffect, useRef, useState } from "react";
import { EVENT_COLOR_CLASSES } from "@/lib/colors";
import { instantFrom, minutesToTimeValue, timeValueToMinutes } from "@/lib/dates";
import {
  describeRecurrence,
  formatRrule,
  parseRrule,
  weekdayCodeOf,
  type Frequency,
  type WeekdayCode,
} from "@/lib/recurrence";
import { EVENT_COLORS, type EventColor } from "@/lib/types";
import {
  deleteEvent,
  saveEvent,
  type EditScope,
} from "@/app/day/[date]/actions";

export type ComposerDraft = {
  /** Master row id. Absent when creating. */
  id?: string;
  title: string;
  notes: string;
  color: EventColor;
  startMinutes: number;
  endMinutes: number;
  rrule: string | null;
  reminderMinutes: number | null;
  /** True when this block is one instance of a repeating series. */
  isSeriesOccurrence: boolean;
};

type Props = {
  dayParam: string;
  draft: ComposerDraft;
  onClose: () => void;
  onSaved: () => void;
};

type RepeatMode = "NONE" | Frequency;

const REMINDER_CHOICES: { value: number | null; label: string }[] = [
  { value: null, label: "No reminder" },
  { value: 0, label: "At start time" },
  { value: 5, label: "5 minutes before" },
  { value: 10, label: "10 minutes before" },
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
];

const WEEKDAY_SHORT: Record<WeekdayCode, string> = {
  MO: "M", TU: "T", WE: "W", TH: "T", FR: "F", SA: "S", SU: "S",
};

/** Week-order weekdays for the chip row (Monday first, matching WEEK_STARTS_ON). */
const CHIP_ORDER: WeekdayCode[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

export default function EventComposer({
  dayParam,
  draft,
  onClose,
  onSaved,
}: Props) {
  const isEditing = Boolean(draft.id);
  const existing = parseRrule(draft.rrule);

  const [title, setTitle] = useState(draft.title);
  const [notes, setNotes] = useState(draft.notes);
  const [color, setColor] = useState<EventColor>(draft.color);
  const [start, setStart] = useState(minutesToTimeValue(draft.startMinutes));
  const [end, setEnd] = useState(minutesToTimeValue(draft.endMinutes));

  const [repeat, setRepeat] = useState<RepeatMode>(existing?.freq ?? "NONE");
  const [interval, setInterval] = useState(existing?.interval ?? 1);
  const [byDay, setByDay] = useState<WeekdayCode[]>(
    existing?.byDay.length ? existing.byDay : [weekdayCodeOf(dayParam)],
  );
  const [until, setUntil] = useState(existing?.until ?? "");
  const [reminder, setReminder] = useState<number | null>(
    draft.reminderMinutes,
  );
  // Editing one instance of a series defaults to just that instance — the
  // less destructive choice.
  const [scope, setScope] = useState<EditScope>("single");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "save" | "delete">(null);

  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    titleRef.current?.select();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function buildRrule(): string | null {
    if (repeat === "NONE") return null;
    return formatRrule({
      freq: repeat,
      interval: Math.max(1, Math.floor(interval) || 1),
      byDay: repeat === "WEEKLY" ? byDay : [],
      until: until || null,
    });
  }

  const previewRule = buildRrule();
  const preview = previewRule
    ? describeRecurrence(parseRrule(previewRule)!, dayParam)
    : null;

  // Changing the repeat rule is inherently a series-wide change.
  const ruleChanged = (draft.rrule ?? null) !== previewRule;
  const effectiveScope: EditScope =
    draft.isSeriesOccurrence && !ruleChanged ? scope : "series";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const startMinutes = timeValueToMinutes(start);
    const endMinutes = timeValueToMinutes(end);
    if (startMinutes === null || endMinutes === null) {
      setError("Those times aren't valid.");
      return;
    }
    if (endMinutes <= startMinutes) {
      setError("End time has to be after the start time.");
      return;
    }
    if (repeat === "WEEKLY" && byDay.length === 0) {
      setError("Pick at least one day to repeat on.");
      return;
    }

    setBusy("save");
    const result = await saveEvent({
      id: draft.id,
      title,
      notes,
      color,
      startsAt: instantFrom(dayParam, startMinutes).toISOString(),
      endsAt: instantFrom(dayParam, endMinutes).toISOString(),
      rrule: previewRule,
      reminderMinutesBefore: reminder,
      occurrenceDay: dayParam,
      scope: effectiveScope,
    });
    setBusy(null);

    if (result.ok) onSaved();
    else setError(result.error);
  }

  async function remove() {
    if (!draft.id) return;
    setError(null);
    setBusy("delete");
    const result = await deleteEvent(
      draft.id,
      draft.isSeriesOccurrence ? scope : "series",
      dayParam,
    );
    setBusy(null);

    if (result.ok) onSaved();
    else setError(result.error);
  }

  const fieldClass =
    "w-full rounded-lg border border-line-strong bg-canvas px-3 py-2 outline-none focus:border-accent";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={submit}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-line bg-surface p-4 shadow-xl sm:rounded-2xl sm:p-5"
      >
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">
            {isEditing ? "Edit block" : "New block"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="-m-2 p-2 text-sm text-muted hover:text-ink"
          >
            Cancel
          </button>
        </div>

        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What is it?"
          enterKeyHint="done"
          className="w-full rounded-lg border border-line-strong bg-canvas px-3 py-2.5 text-[15px] outline-none placeholder:text-muted focus:border-accent"
        />

        <div className="mt-3 flex items-center gap-2">
          <label className="flex-1">
            <span className="mb-1 block text-xs font-medium text-muted">
              Start
            </span>
            <input
              type="time"
              value={start}
              step={300}
              onChange={(e) => setStart(e.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="flex-1">
            <span className="mb-1 block text-xs font-medium text-muted">
              End
            </span>
            <input
              type="time"
              value={end}
              step={300}
              onChange={(e) => setEnd(e.target.value)}
              className={fieldClass}
            />
          </label>
        </div>

        {/* ---- repeat -------------------------------------------------- */}
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-muted">
            Repeat
          </span>
          <select
            value={repeat}
            onChange={(e) => setRepeat(e.target.value as RepeatMode)}
            className={fieldClass}
          >
            <option value="NONE">Doesn&apos;t repeat</option>
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
          </select>
        </label>

        {repeat !== "NONE" && (
          <div className="mt-2 rounded-lg border border-line p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Every</span>
              <input
                type="number"
                min={1}
                max={99}
                value={interval}
                onChange={(e) => setInterval(Number(e.target.value))}
                aria-label="Repeat interval"
                className="w-16 rounded-lg border border-line-strong bg-canvas px-2 py-1 text-sm outline-none focus:border-accent"
              />
              <span className="text-xs text-muted">
                {repeat === "DAILY"
                  ? "day(s)"
                  : repeat === "WEEKLY"
                    ? "week(s)"
                    : "month(s)"}
              </span>
            </div>

            {repeat === "WEEKLY" && (
              <div className="mt-2 flex gap-1">
                {CHIP_ORDER.map((code) => {
                  const on = byDay.includes(code);
                  return (
                    <button
                      key={code}
                      type="button"
                      aria-pressed={on}
                      aria-label={code}
                      onClick={() =>
                        setByDay((prev) =>
                          prev.includes(code)
                            ? prev.filter((c) => c !== code)
                            : [...prev, code],
                        )
                      }
                      className={`size-7 rounded-full text-xs font-medium ${
                        on
                          ? "bg-accent text-white"
                          : "border border-line text-muted hover:text-ink"
                      }`}
                    >
                      {WEEKDAY_SHORT[code]}
                    </button>
                  );
                })}
              </div>
            )}

            <label className="mt-2 block">
              <span className="mb-1 block text-xs font-medium text-muted">
                Until (optional)
              </span>
              <input
                type="date"
                value={until}
                min={dayParam}
                onChange={(e) => setUntil(e.target.value)}
                className="rounded-lg border border-line-strong bg-canvas px-2 py-1 text-sm outline-none focus:border-accent"
              />
            </label>

            {preview && (
              <p className="mt-2 text-xs text-muted">{preview}</p>
            )}
          </div>
        )}

        {/* ---- reminder ------------------------------------------------ */}
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-muted">
            Reminder
          </span>
          <select
            value={reminder === null ? "" : String(reminder)}
            onChange={(e) =>
              setReminder(e.target.value === "" ? null : Number(e.target.value))
            }
            className={fieldClass}
          >
            {REMINDER_CHOICES.map((choice) => (
              <option
                key={choice.label}
                value={choice.value === null ? "" : String(choice.value)}
              >
                {choice.label}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="mt-3">
          <legend className="mb-1.5 text-xs font-medium text-muted">
            Colour
          </legend>
          <div className="flex gap-2">
            {EVENT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={`size-7 rounded-full ${EVENT_COLOR_CLASSES[c].swatch} ${
                  color === c
                    ? "ring-2 ring-ink ring-offset-2 ring-offset-surface"
                    : "opacity-60 hover:opacity-100"
                }`}
              />
            ))}
          </div>
        </fieldset>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          rows={2}
          className="mt-3 w-full resize-none rounded-lg border border-line-strong bg-canvas px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
        />

        {/* ---- which occurrences does this affect? --------------------- */}
        {draft.isSeriesOccurrence && (
          <fieldset className="mt-3 rounded-lg border border-line p-3">
            <legend className="px-1 text-xs font-medium text-muted">
              Apply to
            </legend>
            {(
              [
                ["single", "This occurrence"],
                ["series", "The whole series"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 py-0.5">
                <input
                  type="radio"
                  name="scope"
                  checked={effectiveScope === value}
                  disabled={ruleChanged}
                  onChange={() => setScope(value)}
                  className="accent-[var(--color-accent)]"
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
            {ruleChanged && (
              <p className="mt-1 text-[11px] text-muted">
                Changing how it repeats applies to the whole series.
              </p>
            )}
          </fieldset>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          {isEditing && (
            <button
              type="button"
              onClick={remove}
              disabled={busy !== null}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-400"
            >
              {busy === "delete" ? "Deleting…" : "Delete"}
            </button>
          )}
          <button
            type="submit"
            disabled={busy !== null}
            className="ml-auto rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy === "save" ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
