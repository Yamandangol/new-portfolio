export function isMissingRelationError(error: { message?: string } | null | undefined): boolean {
  const message = error?.message ?? "";
  return /could not find the table|relation .* does not exist|schema cache|undefined table/i.test(message);
}

/**
 * Turn a raw Postgres error into something a user can act on. Reads are
 * swallowed elsewhere when the table's missing (empty state instead of a
 * crash) — writes can't be swallowed, so this is the message they show
 * instead of "relation public.habits does not exist".
 */
export function friendlyDbError(error: { message?: string } | null | undefined): string {
  if (isMissingRelationError(error)) {
    return "Habits aren't set up yet — run supabase/migrations/0002_habits.sql, then reload.";
  }
  return error?.message ?? "Something went wrong.";
}
