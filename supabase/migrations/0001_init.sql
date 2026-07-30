-- ============================================================================
-- my-calendar — initial schema
--
-- This migration defines the COMPLETE data model for all four build phases.
-- Phase 1 only reads/writes `events`, but the later-phase tables and columns
-- are created now so the model is locked and never redesigned mid-build.
--
-- Conventions:
--   * every row is owned by exactly one auth user (`user_id`), defaulted to
--     auth.uid() so inserts never have to pass it explicitly
--   * RLS is on for every table; the only policy is "the row is mine"
--   * instants are `timestamptz` (absolute UTC); whole-day anchors are `date`
--   * `position` is a float so items can be reordered by midpoint insertion
--     without renumbering siblings
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- events — time blocks on the schedule (Phase 1; recurrence used in Phase 4)
-- ---------------------------------------------------------------------------
create table public.events (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid()
                          references auth.users (id) on delete cascade,

  title                 text not null check (length(btrim(title)) > 0),
  notes                 text,
  color                 text not null default 'indigo',

  starts_at             timestamptz not null,
  ends_at               timestamptz not null,
  all_day               boolean not null default false,

  -- Phase 4: recurrence. `rrule` holds an RFC 5545 RRULE string on the master
  -- row; materialised exceptions point back at it via recurrence_parent_id.
  rrule                 text,
  recurrence_parent_id  uuid references public.events (id) on delete cascade,
  excluded_dates        date[] not null default '{}',

  -- Phase 4: reminders
  reminder_minutes_before integer check (reminder_minutes_before >= 0),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint events_time_order check (ends_at > starts_at)
);

create index events_user_starts_at_idx on public.events (user_id, starts_at);
create index events_recurrence_parent_idx on public.events (recurrence_parent_id)
  where recurrence_parent_id is not null;

create trigger events_touch_updated_at
  before update on public.events
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- lists — named containers for checklists and to-dos (Phase 2)
-- ---------------------------------------------------------------------------
create table public.lists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
                references auth.users (id) on delete cascade,

  name        text not null check (length(btrim(name)) > 0),
  -- 'checklist' = a standing list you tick through (groceries, packing)
  -- 'todo'      = a backlog of one-off tasks
  kind        text not null default 'checklist'
                check (kind in ('checklist', 'todo')),
  position    double precision not null default 0,
  archived    boolean not null default false,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index lists_user_position_idx on public.lists (user_id, position);

create trigger lists_touch_updated_at
  before update on public.lists
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- tasks — checklist items and free-form to-dos (Phase 2; rrule in Phase 4)
--
-- A task may be loose (list_id null, day null), filed under a list, pinned to
-- a day, and/or attached to a specific time block. These are independent.
-- ---------------------------------------------------------------------------
create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
                references auth.users (id) on delete cascade,

  list_id     uuid references public.lists (id) on delete cascade,
  event_id    uuid references public.events (id) on delete set null,

  title       text not null check (length(btrim(title)) > 0),
  notes       text,
  done        boolean not null default false,
  done_at     timestamptz,

  -- the day this task is planned for, in the user's local calendar
  day         date,
  position    double precision not null default 0,

  -- Phase 4: recurring routines are just tasks with an RRULE
  rrule       text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- done_at is set exactly when done is true
  constraint tasks_done_at_consistent
    check ((done and done_at is not null) or (not done and done_at is null))
);

create index tasks_user_day_idx on public.tasks (user_id, day);
create index tasks_user_list_position_idx on public.tasks (user_id, list_id, position);
create index tasks_open_idx on public.tasks (user_id) where not done;

create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- daily_notes — one free-text note per day (Phase 4)
-- ---------------------------------------------------------------------------
create table public.daily_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
                references auth.users (id) on delete cascade,

  day         date not null,
  body        text not null default '',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (user_id, day)
);

create trigger daily_notes_touch_updated_at
  before update on public.daily_notes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security — single rule everywhere: the row must be mine.
-- ---------------------------------------------------------------------------
alter table public.events      enable row level security;
alter table public.lists       enable row level security;
alter table public.tasks       enable row level security;
alter table public.daily_notes enable row level security;

create policy events_own on public.events
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy lists_own on public.lists
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy tasks_own on public.tasks
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy daily_notes_own on public.daily_notes
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
