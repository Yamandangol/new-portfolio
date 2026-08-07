-- Lock a habit against archiving — protects core habits (bed, workout) from
-- an accidental tap on the × button. Restoring an already-archived habit is
-- still always allowed; the lock only blocks the archive direction.
alter table public.habits
  add column locked boolean not null default false;
