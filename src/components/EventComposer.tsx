"use client";

import { useEffect, useRef, useState } from "react";
import { EVENT_COLOR_CLASSES } from "@/lib/colors";
import { instantFrom, minutesToTimeValue, timeValueToMinutes } from "@/lib/dates";
import { EVENT_COLORS, type EventColor } from "@/lib/types";
import { deleteEvent, saveEvent } from "@/app/day/[date]/actions";

export type ComposerDraft = {
  /** absent for a new event */
  id?: string;
  title: string;
  notes: string;
  color: EventColor;
  startMinutes: number;
  endMinutes: number;
};

type Props = {
  dayParam: string;
  draft: ComposerDraft;
  onClose: () => void;
  onSaved: () => void;
};

/**
 * Create/edit sheet. Renders as a centred dialog on a laptop and a bottom sheet
 * on a phone — same markup, different placement.
 */
export default function EventComposer({
  dayParam,
  draft,
  onClose,
  onSaved,
}: Props) {
  const isEditing = Boolean(draft.id);

  const [title, setTitle] = useState(draft.title);
  const [notes, setNotes] = useState(draft.notes);
  const [color, setColor] = useState<EventColor>(draft.color);
  const [start, setStart] = useState(minutesToTimeValue(draft.startMinutes));
  const [end, setEnd] = useState(minutesToTimeValue(draft.endMinutes));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "save" | "delete">(null);

  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus straight into the title so a new block is one keystroke away.
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

    setBusy("save");
    const result = await saveEvent({
      id: draft.id,
      title,
      notes,
      color,
      startsAt: instantFrom(dayParam, startMinutes).toISOString(),
      endsAt: instantFrom(dayParam, endMinutes).toISOString(),
    });
    setBusy(null);

    if (result.ok) onSaved();
    else setError(result.error);
  }

  async function remove() {
    if (!draft.id) return;
    setError(null);
    setBusy("delete");
    const result = await deleteEvent(draft.id);
    setBusy(null);

    if (result.ok) onSaved();
    else setError(result.error);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-t-2xl border border-line bg-surface p-4 shadow-xl sm:rounded-2xl sm:p-5"
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
              className="w-full rounded-lg border border-line-strong bg-canvas px-3 py-2 outline-none focus:border-accent"
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
              className="w-full rounded-lg border border-line-strong bg-canvas px-3 py-2 outline-none focus:border-accent"
            />
          </label>
        </div>

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
