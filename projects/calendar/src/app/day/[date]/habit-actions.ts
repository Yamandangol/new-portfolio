"use server";

import { clampValue } from "@/lib/habits";
import { friendlyDbError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";
import { isHabitKind, type HabitKind } from "@/lib/types";

export type HabitResult =
  | { ok: true; outcome?: "deleted" | "archived" }
  | { ok: false; error: string };

const SIGNED_OUT = "Signed out — reload and sign in." as const;

/** Matches the `unique (user_id, habit_id, day)` constraint on habit_logs. */
const LOG_CONFLICT_TARGET = "user_id,habit_id,day";

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

/**
 * New rows go to the end. Epoch milliseconds are monotonic and land in a float
 * column, so inserting between two neighbours later is still a midpoint
 * calculation — no renumbering of siblings.
 */
function appendPosition(): number {
  return Date.now();
}

// ---------------------------------------------------------------------------
// logging
// ---------------------------------------------------------------------------

/** Tick or untick a boolean habit for one day. */
export async function toggleHabit(
  habitId: string,
  day: string,
  completed: boolean,
): Promise<HabitResult> {
  const { supabase, userId } = await authed();
  if (!userId) return { ok: false, error: SIGNED_OUT };

  const { error } = await supabase.from("habit_logs").upsert(
    {
      user_id: userId,
      habit_id: habitId,
      day,
      // A boolean habit's target is 1, so value and completion agree and the
      // same progress maths serves both kinds.
      value: completed ? 1 : 0,
      completed,
    },
    { onConflict: LOG_CONFLICT_TARGET },
  );

  if (error) return { ok: false, error: friendlyDbError(error) };
  return { ok: true };
}

/**
 * Move a count habit by `delta`, clamped to 0..target.
 *
 * Read-then-write rather than an atomic increment: this is a single-user app, so
 * two writers racing isn't a case that arises, and the clamp needs the habit's
 * target anyway.
 */
export async function incrementHabit(
  habitId: string,
  day: string,
  delta: number,
): Promise<HabitResult> {
  const { supabase, userId } = await authed();
  if (!userId) return { ok: false, error: SIGNED_OUT };

  const [habitResult, logResult] = await Promise.all([
    supabase
      .from("habits")
      .select("target")
      .eq("id", habitId)
      .eq("user_id", userId)
      .single(),
    supabase
      .from("habit_logs")
      .select("value")
      .eq("habit_id", habitId)
      .eq("user_id", userId)
      .eq("day", day)
      // Most days have no row yet.
      .maybeSingle(),
  ]);

  if (habitResult.error) return { ok: false, error: friendlyDbError(habitResult.error) };
  if (logResult.error) return { ok: false, error: friendlyDbError(logResult.error) };

  const target = Math.max(1, habitResult.data?.target ?? 1);
  const value = clampValue((logResult.data?.value ?? 0) + delta, target);

  const { error } = await supabase.from("habit_logs").upsert(
    {
      user_id: userId,
      habit_id: habitId,
      day,
      value,
      completed: value >= target,
    },
    { onConflict: LOG_CONFLICT_TARGET },
  );

  if (error) return { ok: false, error: friendlyDbError(error) };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// habits
// ---------------------------------------------------------------------------

export async function addHabit(
  title: string,
  kind: string,
  target?: number,
  unit?: string,
  icon?: string,
): Promise<HabitResult> {
  const trimmed = title.trim();
  if (!trimmed) return { ok: false, error: "Name the habit first." };

  const { supabase, userId } = await authed();
  if (!userId) return { ok: false, error: SIGNED_OUT };

  const resolvedKind: HabitKind = isHabitKind(kind) ? kind : "boolean";
  // A boolean habit is a count habit with a target of one, which keeps the
  // progress and completion maths identical for both.
  const resolvedTarget =
    resolvedKind === "boolean" ? 1 : Math.max(1, Math.floor(target ?? 1));

  const { error } = await supabase.from("habits").insert({
    user_id: userId,
    title: trimmed,
    kind: resolvedKind,
    target: resolvedTarget,
    unit: unit?.trim() || null,
    icon: icon?.trim() || null,
    position: appendPosition(),
  });

  if (error) return { ok: false, error: friendlyDbError(error) };
  return { ok: true };
}

export async function renameHabit(
  habitId: string,
  title: string,
): Promise<HabitResult> {
  const trimmed = title.trim();
  if (!trimmed) return { ok: false, error: "A habit needs a title." };

  const { supabase, userId } = await authed();
  if (!userId) return { ok: false, error: SIGNED_OUT };

  const { error } = await supabase
    .from("habits")
    .update({ title: trimmed })
    .eq("id", habitId)
    .eq("user_id", userId);

  if (error) return { ok: false, error: friendlyDbError(error) };
  return { ok: true };
}

/**
 * Soft delete. The habit keeps its logs and still comes back from the query, so
 * it can be restored in the app — same as list archiving.
 *
 * Guarded server-side, not just in the UI: a locked habit refuses to archive.
 * Restoring (archived: false) is never blocked — the lock only protects
 * against losing a core habit to a stray tap, not against undoing that.
 */
export async function archiveHabit(
  habitId: string,
  archived: boolean,
): Promise<HabitResult> {
  const { supabase, userId } = await authed();
  if (!userId) return { ok: false, error: SIGNED_OUT };

  if (archived) {
    const { data, error: readError } = await supabase
      .from("habits")
      .select("locked")
      .eq("id", habitId)
      .eq("user_id", userId)
      .single();

    if (readError) return { ok: false, error: friendlyDbError(readError) };
    if (data?.locked) {
      return { ok: false, error: "Locked — unlock it first to archive." };
    }
  }

  const { error } = await supabase
    .from("habits")
    .update({ archived })
    .eq("id", habitId)
    .eq("user_id", userId);

  if (error) return { ok: false, error: friendlyDbError(error) };
  return { ok: true };
}

/** Toggle whether a habit can be archived by a tap on its × button. */
export async function setHabitLocked(
  habitId: string,
  locked: boolean,
): Promise<HabitResult> {
  const { supabase, userId } = await authed();
  if (!userId) return { ok: false, error: SIGNED_OUT };

  const { error } = await supabase
    .from("habits")
    .update({ locked })
    .eq("id", habitId)
    .eq("user_id", userId);

  if (error) return { ok: false, error: friendlyDbError(error) };
  return { ok: true };
}

/**
 * Remove a habit outright, but only while it has no history — deleting one with
 * logs would cascade away a record of days you actually did the thing, which is
 * the whole point of tracking it. Anything with history is archived instead, and
 * the outcome says which happened so the UI can tell you.
 */
export async function deleteHabit(habitId: string): Promise<HabitResult> {
  const { supabase, userId } = await authed();
  if (!userId) return { ok: false, error: SIGNED_OUT };

  const { count, error: countError } = await supabase
    .from("habit_logs")
    .select("id", { count: "exact", head: true })
    .eq("habit_id", habitId)
    .eq("user_id", userId);

  if (countError) return { ok: false, error: friendlyDbError(countError) };

  if ((count ?? 0) > 0) {
    const { error } = await supabase
      .from("habits")
      .update({ archived: true })
      .eq("id", habitId)
      .eq("user_id", userId);

    if (error) return { ok: false, error: friendlyDbError(error) };
    return { ok: true, outcome: "archived" };
  }

  const { error } = await supabase
    .from("habits")
    .delete()
    .eq("id", habitId)
    .eq("user_id", userId);

  if (error) return { ok: false, error: friendlyDbError(error) };
  return { ok: true, outcome: "deleted" };
}
