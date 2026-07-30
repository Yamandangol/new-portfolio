"use server";

import { createClient } from "@/lib/supabase/server";
import { isEventColor } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type EventDraft = {
  /** omitted when creating */
  id?: string;
  title: string;
  notes: string;
  color: string;
  /** ISO 8601 instant, built in the browser's timezone */
  startsAt: string;
  endsAt: string;
};

export async function saveEvent(draft: EventDraft): Promise<ActionResult> {
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Signed out — reload and sign in." };

  const row = {
    user_id: user.id,
    title,
    notes: draft.notes.trim() || null,
    color: isEventColor(draft.color) ? draft.color : "indigo",
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
  };

  // RLS keeps the id-scoped update from touching anyone else's row, but the
  // explicit user_id filter makes that guarantee local and obvious.
  const { error } = draft.id
    ? await supabase
        .from("events")
        .update(row)
        .eq("id", draft.id)
        .eq("user_id", user.id)
    : await supabase.from("events").insert(row);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Signed out — reload and sign in." };

  const { error } = await supabase
    .from("events")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
