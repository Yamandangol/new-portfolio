"use server";

import { createClient } from "@/lib/supabase/server";
import { isEventColor } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Which part of a repeating series an edit or delete applies to. A one-off
 * event always uses "single".
 */
export type EditScope = "single" | "series";

export type EventDraft = {
  /** Master row id. Omitted when creating. */
  id?: string;
  title: string;
  notes: string;
  color: string;
  /** ISO 8601 instant, built in the browser's timezone */
  startsAt: string;
  endsAt: string;
  /** RRULE subset, or null for a one-off. */
  rrule: string | null;
  reminderMinutesBefore: number | null;
  /** The local day being edited — needed to split one occurrence out. */
  occurrenceDay?: string;
  scope?: EditScope;
};

const SIGNED_OUT = "Signed out — reload and sign in." as const;

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

/** The columns every write shares, whatever the scope. */
type EventRow = {
  title: string;
  notes: string | null;
  color: string;
  starts_at: string;
  ends_at: string;
  reminder_minutes_before: number | null;
};

// Explicit discriminated union — without the `ok` tag, `error` narrows to
// `string | undefined` at the call sites.
type Validated =
  | { ok: false; error: string }
  | { ok: true; row: EventRow };

function validate(draft: EventDraft): Validated {
  const title = draft.title.trim();
  if (!title) return { ok: false, error: "Give it a title." };

  const startsAt = new Date(draft.startsAt);
  const endsAt = new Date(draft.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return { ok: false, error: "Those times aren't valid." };
  }
  if (endsAt <= startsAt) {
    return { ok: false, error: "End time has to be after the start time." };
  }

  return {
    ok: true,
    row: {
      title,
      notes: draft.notes.trim() || null,
      color: isEventColor(draft.color) ? draft.color : "indigo",
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      reminder_minutes_before: draft.reminderMinutesBefore,
    },
  };
}

export async function saveEvent(draft: EventDraft): Promise<ActionResult> {
  const checked = validate(draft);
  if (!checked.ok) return { ok: false, error: checked.error };

  const { supabase, userId } = await authed();
  if (!userId) return { ok: false, error: SIGNED_OUT };

  // ---- create -------------------------------------------------------------
  if (!draft.id) {
    const { error } = await supabase.from("events").insert({
      ...checked.row,
      user_id: userId,
      rrule: draft.rrule,
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  // ---- edit one occurrence of a series ------------------------------------
  // Rather than tracking overrides, the date is removed from the series and a
  // standalone event is written in its place. Same result for the user, and it
  // needs no column the locked schema doesn't already have.
  if (draft.scope === "single" && draft.occurrenceDay) {
    const { data: master, error: readError } = await supabase
      .from("events")
      .select("excluded_dates")
      .eq("id", draft.id)
      .eq("user_id", userId)
      .single();

    if (readError) return { ok: false, error: readError.message };

    const excluded = new Set<string>(master?.excluded_dates ?? []);
    excluded.add(draft.occurrenceDay);

    const { error: excludeError } = await supabase
      .from("events")
      .update({ excluded_dates: [...excluded].sort() })
      .eq("id", draft.id)
      .eq("user_id", userId);

    if (excludeError) return { ok: false, error: excludeError.message };

    const { error: insertError } = await supabase.from("events").insert({
      ...checked.row,
      user_id: userId,
      rrule: null,
      recurrence_parent_id: draft.id,
    });

    return insertError
      ? { ok: false, error: insertError.message }
      : { ok: true };
  }

  // ---- edit the whole series, or a plain one-off --------------------------
  const { error } = await supabase
    .from("events")
    .update({ ...checked.row, rrule: draft.rrule })
    .eq("id", draft.id)
    .eq("user_id", userId);

  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Delete an event. For a series occurrence with scope "single" the date is
 * excluded rather than any row being removed; "series" deletes the master, and
 * the `recurrence_parent_id` cascade takes any split-out occurrences with it.
 */
export async function deleteEvent(
  id: string,
  scope: EditScope = "series",
  occurrenceDay?: string,
): Promise<ActionResult> {
  const { supabase, userId } = await authed();
  if (!userId) return { ok: false, error: SIGNED_OUT };

  if (scope === "single" && occurrenceDay) {
    const { data: master, error: readError } = await supabase
      .from("events")
      .select("excluded_dates")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (readError) return { ok: false, error: readError.message };

    const excluded = new Set<string>(master?.excluded_dates ?? []);
    excluded.add(occurrenceDay);

    const { error } = await supabase
      .from("events")
      .update({ excluded_dates: [...excluded].sort() })
      .eq("id", id)
      .eq("user_id", userId);

    return error ? { ok: false, error: error.message } : { ok: true };
  }

  const { error } = await supabase
    .from("events")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Upsert the free-text note for one day. Empty body deletes the row. */
export async function saveDailyNote(
  day: string,
  body: string,
): Promise<ActionResult> {
  const { supabase, userId } = await authed();
  if (!userId) return { ok: false, error: SIGNED_OUT };

  if (!body.trim()) {
    const { error } = await supabase
      .from("daily_notes")
      .delete()
      .eq("day", day)
      .eq("user_id", userId);
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  const { error } = await supabase
    .from("daily_notes")
    .upsert(
      { user_id: userId, day, body },
      // Matches the unique (user_id, day) constraint, so re-saving the same day
      // updates in place instead of erroring.
      { onConflict: "user_id,day" },
    );

  return error ? { ok: false, error: error.message } : { ok: true };
}
