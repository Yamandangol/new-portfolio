-- ============================================================================
-- Daily habits
--
-- Two tables: `habits` is the definition, `habit_logs` is one row per habit per
-- day. A day with no row means "not done" — rows are only written once you
-- interact, so an untouched habit costs nothing.
--
-- Same conventions as 0001: every row owned via `user_id` defaulted to
-- auth.uid(), RLS on with a single "the row is mine" policy, `position` a float
-- so reordering stays a midpoint insert.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- habits
-- ---------------------------------------------------------------------------
create table public.habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
                references auth.users (id) on delete cascade,

  title       text not null check (length(btrim(title)) > 0),
  icon        text,                                    -- emoji, e.g. '🛏️'
  color       text not null default 'indigo',

  -- 'boolean' — done or not. 'count' — tallied towards `target`.
  kind        text not null check (kind in ('boolean', 'count')),
  target      integer not null default 1 check (target >= 1),
  unit        text,                                    -- e.g. 'glasses', 'min'

  position    double precision not null default 0,
  archived    boolean not null default false,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- habit_logs — one row per habit per local day
-- ---------------------------------------------------------------------------
create table public.habit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
                references auth.users (id) on delete cascade,

  habit_id    uuid not null references public.habits (id) on delete cascade,
  -- Plain `date`, matching the URL's calendar day. No timezone maths: see the
  -- timezone policy in src/lib/dates.ts.
  day         date not null,

  value       integer not null default 0 check (value >= 0),
  completed   boolean not null default false,

  created_at  timestamptz not null default now(),
  -- NOTE: required by the touch_updated_at trigger below. That function assigns
  -- new.updated_at, so attaching it to a table without this column raises
  -- `record "new" has no field "updated_at"` on every UPDATE — which, since
  -- ticking a habit is an upsert, would break the feature outright.
  updated_at  timestamptz not null default now(),

  -- One log per habit per day; also the upsert conflict target.
  unique (user_id, habit_id, day)
);

-- ---------------------------------------------------------------------------
-- indexes
-- ---------------------------------------------------------------------------
create index habits_user_position_idx on public.habits (user_id, position);
create index habit_logs_user_day_idx on public.habit_logs (user_id, day);
-- Streaks read one habit's history backwards from a day.
create index habit_logs_habit_day_idx on public.habit_logs (habit_id, day desc);

-- ---------------------------------------------------------------------------
-- triggers
-- ---------------------------------------------------------------------------
create trigger habits_touch_updated_at
  before update on public.habits
  for each row execute function public.touch_updated_at();

create trigger habit_logs_touch_updated_at
  before update on public.habit_logs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;

create policy habits_own on public.habits
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy habit_logs_own on public.habit_logs
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
