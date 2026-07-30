"use server";

import { createClient } from "@/lib/supabase/server";
import { isListKind, type ListKind } from "@/lib/types";

export type TaskResult = { ok: true } | { ok: false; error: string };

const SIGNED_OUT = "Signed out — reload and sign in." as const;

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
// tasks
// ---------------------------------------------------------------------------

export async function addTask(input: {
  title: string;
  listId: string | null;
  day: string | null;
}): Promise<TaskResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Type something first." };

  const { supabase, userId } = await authed();
  if (!userId) return { ok: false, error: SIGNED_OUT };

  const { error } = await supabase.from("tasks").insert({
    user_id: userId,
    title,
    list_id: input.listId,
    day: input.day,
    position: appendPosition(),
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setTaskDone(
  id: string,
  done: boolean,
): Promise<TaskResult> {
  const { supabase, userId } = await authed();
  if (!userId) return { ok: false, error: SIGNED_OUT };

  // done and done_at must move together — the tasks_done_at_consistent CHECK
  // constraint rejects any row where one is set without the other.
  const { error } = await supabase
    .from("tasks")
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function renameTask(
  id: string,
  title: string,
): Promise<TaskResult> {
  const trimmed = title.trim();
  if (!trimmed) return { ok: false, error: "A task needs a title." };

  const { supabase, userId } = await authed();
  if (!userId) return { ok: false, error: SIGNED_OUT };

  const { error } = await supabase
    .from("tasks")
    .update({ title: trimmed })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteTask(id: string): Promise<TaskResult> {
  const { supabase, userId } = await authed();
  if (!userId) return { ok: false, error: SIGNED_OUT };

  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Pin a task to a day (`'yyyy-MM-dd'`), or unpin it with `null`. */
export async function setTaskDay(
  id: string,
  day: string | null,
): Promise<TaskResult> {
  const { supabase, userId } = await authed();
  if (!userId) return { ok: false, error: SIGNED_OUT };

  const { error } = await supabase
    .from("tasks")
    .update({ day })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// lists
// ---------------------------------------------------------------------------

export async function addList(
  name: string,
  kind: string,
): Promise<TaskResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name the list first." };

  const { supabase, userId } = await authed();
  if (!userId) return { ok: false, error: SIGNED_OUT };

  const { error } = await supabase.from("lists").insert({
    user_id: userId,
    name: trimmed,
    kind: (isListKind(kind) ? kind : "checklist") satisfies ListKind,
    position: appendPosition(),
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function renameList(
  id: string,
  name: string,
): Promise<TaskResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "A list needs a name." };

  const { supabase, userId } = await authed();
  if (!userId) return { ok: false, error: SIGNED_OUT };

  const { error } = await supabase
    .from("lists")
    .update({ name: trimmed })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Soft delete. The list keeps its tasks, so archiving is recoverable from the
 * dashboard — unlike a hard delete, which would cascade them away.
 */
export async function archiveList(id: string): Promise<TaskResult> {
  const { supabase, userId } = await authed();
  if (!userId) return { ok: false, error: SIGNED_OUT };

  const { error } = await supabase
    .from("lists")
    .update({ archived: true })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Untick every item in a checklist — the groceries workflow, where the list is
 * reused each week rather than emptied.
 */
export async function resetChecklist(listId: string): Promise<TaskResult> {
  const { supabase, userId } = await authed();
  if (!userId) return { ok: false, error: SIGNED_OUT };

  const { error } = await supabase
    .from("tasks")
    .update({ done: false, done_at: null })
    .eq("list_id", listId)
    .eq("user_id", userId)
    .eq("done", true);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
