# my-calendar — project notes

Personal, single-user calendar and daily planner. Private tool, not a product.
This file records settled decisions so later sessions don't re-decide them.

---

## Stack

| Concern    | Choice                                    | Why |
| ---------- | ----------------------------------------- | --- |
| Framework  | **Next.js 16** (App Router, Turbopack)    | Server Components + Server Actions mean data mutations need no hand-written API layer. First-class free hosting on Vercel. |
| Language   | **TypeScript**, strict                    | — |
| Styling    | **Tailwind CSS v4**                       | CSS-first config; no JS theme file to drift. |
| Database   | **Supabase Postgres**                     | Real SQL + row level security on a free tier. Owning the schema outright matters more than convenience here. |
| Auth       | **Supabase Auth**, email + password       | Single user; account is created from the dashboard, public signup stays off. |
| Hosting    | **Vercel** free tier                      | Zero-config for Next.js, custom domain included free. |
| Dates      | **date-fns**                              | Tree-shakeable, no global mutation, no Moment-style baggage. |
| PWA        | Hand-written `manifest.webmanifest`       | Installable is the only requirement; a service worker would add offline complexity we don't need yet. |

Total recurring cost: **£0** on both free tiers.

### Deliberately not used
- **No ORM.** The schema lives in `supabase/migrations/` as plain SQL. One
  source of truth, and RLS policies are only expressible in SQL anyway.
- **No state manager.** Server Components fetch, Server Actions mutate,
  `router.refresh()` re-syncs. Nothing to keep in sync client-side.
- **No component library.** The UI is a dozen elements; a design system would
  outweigh it.
- **No service worker yet.** Revisit only if offline editing is actually wanted.

---

## Data model

Locked. Defined in full in [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql),
including columns that only later phases use — so the model never gets
redesigned mid-build.

- **`events`** — time blocks on the schedule. `starts_at` / `ends_at` are
  `timestamptz`. Recurrence lives here too (`rrule`, `recurrence_parent_id`,
  `excluded_dates`) rather than in a separate routines table: a "recurring
  routine" is just an event with an RRULE.
- **`lists`** — named containers, `kind` is `'checklist'` (standing list you tick
  through, e.g. groceries) or `'todo'` (backlog of one-offs).
- **`tasks`** — checklist items and free-form to-dos. A task can independently be
  filed under a list (`list_id`), pinned to a day (`day`), and/or attached to a
  time block (`event_id`). All three are optional — that's what lets checklists,
  to-dos and the schedule coexist instead of being three separate apps.
- **`daily_notes`** — one free-text note per day, unique on `(user_id, day)`.

Rules that hold everywhere:
- Every table has `user_id` defaulting to `auth.uid()`, and RLS with exactly one
  policy: *the row is mine*. Never disable RLS.
- `position` columns are `double precision` so reordering is a midpoint insert,
  never a renumbering of siblings.
- `created_at` / `updated_at` on every table; `updated_at` is maintained by the
  `touch_updated_at` trigger, never by application code.

### Timezone policy

Instants are stored as absolute UTC (`timestamptz`) and **rendered in the
browser's local timezone**. The URL carries a bare calendar day
(`/day/2026-07-30`), which only means something in a timezone — and the server
doesn't know the browser's.

So the server fetches a **padded ±2-day UTC window** and the client narrows it to
exact local-day boundaries (`paddedUtcWindow` and `layOutDay`). No timezone
config to set, and correct whether you're at home or travelling. Don't "optimise"
this into an exact server-side day range without first solving how the server
learns the timezone.

### Task layer

The panel has three kinds of section, derived by `groupTasks`:

| Section      | Which tasks                          |
| ------------ | ------------------------------------ |
| *(day name)* | `day` = the day being viewed         |
| **To-do**    | `list_id` null **and** `day` null    |
| each list    | `list_id` = that list                |

Two behaviours that look like bugs but are deliberate:

- **A task can appear twice.** One pinned to the day *and* filed under a list
  shows in both sections — the same task in two views, exactly as Todoist shows
  a project task in Today. Ticking it in either place updates both.
- **Archiving is reversible.** `archiveList` was a dead end at first: the query
  filtered archived lists out and nothing could bring them back, so a list and
  its tasks vanished for good. Archived lists are now fetched, shown collapsed
  under **Archived**, and restorable. `groupTasks` still withholds their tasks so
  they don't leak into the backlog. Never hard-delete a list — the `tasks`
  foreign key is `on delete cascade` and would take the items with it.

Checklists vs to-do lists differ only in how they end: a checklist is **reset**
(unticked in bulk, `resetChecklist`) for reuse; a to-do list is cleared item by
item.

### Week view

`WEEK_STARTS_ON` in `src/lib/dates.ts` is the **only** place the first weekday is
decided — currently Monday (ISO 8601). Switching to Sunday-first is that one
line; every week calculation reads it.

The two renderings are not a styling variation, they're different tools:

- **Laptop (`lg`+)** — seven `DayColumn`s under a sticky header row. Full
  create/edit, same gestures as the day view.
- **Phone (`< lg`)** — an agenda list. Seven time-grid columns at 375px would
  leave ~45px per day, which is unreadable, so the phone gets what forward
  planning actually needs: what's on each day in order, with the day view one tap
  away for editing. The agenda is deliberately read-only.

### Habits

Two tables (migration `0002`). `habits` is the definition; `habit_logs` is one
row per habit per local day, written only when you interact — a missing row
means "not done", so an untouched habit costs nothing.

A **boolean habit is a count habit with `target = 1`**, so `value`/`completed`
and the progress maths are identical for both kinds and there is no branching in
`habitProgress`.

**Streaks need a window, not a day.** The day view fetches the trailing
`HABIT_LOG_WINDOW_DAYS` (90) of logs, because "consecutive completed days" can't
be derived from a single day's rows. A run longer than the window reports as the
window length. If today isn't done yet the count runs to yesterday, so a streak
doesn't read as zero all morning; a gap before that ends it.

**Habits and their logs share one `useOptimistic` value** (`HabitState`), owned by
`DayView` like the task one. Ticking a habit writes a log row, so splitting the
two would let them disagree mid-transition.

**Deleting is guarded.** `deleteHabit` only truly deletes while a habit has no
logs; anything with history is archived instead, because cascading the logs away
would destroy the record of days you actually did the thing. The action returns
`outcome: "deleted" | "archived"` so the UI can tell which happened.

The `+`/`−` steppers are 32px rather than the 24px a dense list would suggest —
they're the most-tapped controls in the app and 24px is an awkward phone target.

### Recurrence

`src/lib/recurrence.ts` implements a **deliberate subset** of RFC 5545:
`FREQ=DAILY|WEEKLY|MONTHLY`, `INTERVAL`, `BYDAY` (weekly), `UNTIL`.

**Why hand-rolled instead of the `rrule` package.** Recurrence here means *local
wall-clock* repetition: an 18:00 gym slot must stay at 18:00 across a DST change,
not drift to 17:00. General RRULE libraries expand from a UTC instant, which
fights the timezone policy above. So this module works purely in local calendar
days and `expandOccurrences` re-applies the master's wall-clock time to each one.
Both of the local zone's 2026 DST transitions are covered by assertions.

**`COUNT` is not supported, on purpose.** Honouring it means enumerating every
occurrence from the series start; without it, expansion jumps straight to the
first candidate in range, so a routine begun years ago costs the same as one
begun yesterday. `UNTIL` covers the same need.

**Storage shape.** A repeating event is one *master* row carrying the `rrule`;
occurrences are generated in the browser and never stored. Their ids are
synthetic (`<masterId>::<yyyy-mm-dd>`), so anything editing one must resolve back
to `seriesId`.

**Editing one occurrence** excludes that date on the master (`excluded_dates`)
and, for an edit, writes a standalone event with `recurrence_parent_id` set for
provenance. This needs no column the locked schema doesn't already have. Changing
the repeat rule itself always applies to the whole series — the UI disables the
scope choice and says so, because "this occurrence repeats differently" is not a
coherent state.

**Fetching.** Series masters are queried *without* a date-window filter — a
routine that started years ago still occurs today, so the window would hide it.
One-offs stay windowed. There are only ever a handful of masters.

### Reminders

`reminder_minutes_before` fires **while the app is open**, via the Notification
API with an in-page toast fallback (the toast shows even when notification
permission is denied). A 30-second poll is used rather than one timer per event:
long `setTimeout`s drift and get throttled in background tabs. Fired reminders are
recorded in `localStorage` so a reload doesn't replay them, and anything more than
5 minutes overdue is skipped so opening the app after lunch doesn't produce a
flood.

**This is not background push.** Notifying with the app closed needs a service
worker, push subscriptions, VAPID keys and a scheduled server job to send them —
real infrastructure with a running cost, against the near-zero-cost, low-
maintenance constraint. If that's ever wanted, it's an additive change: the column
and the UI already exist.

---

## Conventions

**Structure**
```
src/app/                routes
  page.tsx              → redirects to today (client-side; see timezone policy)
  login/                sign-in
  day/[date]/           the day view + all task/event Server Actions
  week/[date]/          the week view (any day in the week is a valid URL)
  auth/actions.ts       signIn / signOut
src/components/         client components (PascalCase files)
src/lib/                pure helpers, no React (camelCase files)
supabase/migrations/    numbered, append-only SQL
```

**Grid geometry has one home.** `DayColumn` owns the hour lines, positioned
blocks, drag/tap-to-create gesture and current-time line. The day view renders
one; the week view renders seven. Don't reimplement pointer-to-minute maths
anywhere else — extend `DayColumn` instead. `HourGutter` ships with it so the
labels always line up with the rows.

**Naming** — database columns `snake_case`; TypeScript `camelCase`. Rows crossing
that boundary keep their `snake_case` field names (`starts_at`) rather than being
mapped, so a type mismatch is a compile error instead of a silent rename bug.

**Data flow** — Server Component fetches → Client Component renders → Server
Action mutates → `router.refresh()`. Server Actions return
`{ ok: true } | { ok: false, error }`; they never throw for user-facing problems.

**Optimistic updates** — task edits apply locally before the round-trip, because
ticking a checkbox has to feel instant. The rule: **one `useOptimistic` per
screen, owned by the highest component that reads the data.** It lives in
`DayView`, not `TaskPanel`, so the phone tab badge and the panel rows can never
disagree. The reducer is `reduceTasks` in `src/lib/tasks.ts` — pure, and unit
tested. Apply the action *inside* the same transition as the Server Action call,
then `router.refresh()` within that transition, so the optimistic value survives
until real data replaces it.

**Styling** — semantic tokens only (`bg-canvas`, `bg-surface`, `border-line`,
`text-ink`, `text-muted`, `bg-accent`), defined once in `globals.css` and
re-pointed for dark mode. Never hardcode a hex or a raw palette colour in
markup. Event colours are the one exception and live in `src/lib/colors.ts` as
whole class strings, because Tailwind's scanner can't see interpolated names.

**Layout geometry** — one hour row is `var(--hour-height)`. All block positions
are `calc(<minutes> / 60 * var(--hour-height))`, so changing the zoom level is a
one-line CSS change.

**Auth** — session refresh and route gating happen in `src/proxy.ts`. Note this
is `proxy.ts`, not `middleware.ts`: Next 16 renamed the convention and warns on
the old name. Always validate with `supabase.auth.getUser()` (verifies the JWT
server-side), never `getSession()`.

---

## Setup from scratch

1. **Create a Supabase project** — <https://supabase.com/dashboard>, free tier.
2. **Create the schema** — SQL Editor → paste all of
   `supabase/migrations/0001_init.sql` → Run.
3. **Create your user** — Authentication → Users → *Add user* → set email and
   password there. Then Authentication → Sign In / Providers → **disable
   "Allow new users to sign up"**, since this app is single-user.
4. **Configure the app** — copy `.env.local.example` to `.env.local` and fill in
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (Project Settings → API). Both are browser-public by design; RLS is what
   protects the data. **Never** put the `service_role` key in this app.
5. **Run it** — `npm install && npm run dev`, then <http://localhost:3000>.

### Deploying
Import the repo on Vercel, add the same two environment variables, deploy. Add
the custom domain under the project's Domains tab. Also add the deployed origin
to Supabase → Authentication → URL Configuration → Site URL / Redirect URLs.

---

## Commands

```bash
npm run dev        # dev server on :3000
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```

---

## Phase status

- [x] **Phase 1** — auth + single-day time-blocked schedule (add/edit/delete)
- [x] **Phase 2** — checklist and to-do layer alongside the schedule
- [x] **Phase 3** — week view for forward planning
- [x] **Phase 4** — recurring routines, daily notes, reminders

Layout: schedule and tasks sit side by side from `lg` (1024px) up; below that
they're a Schedule/Tasks switch, with both panes kept mounted so switching
doesn't lose the schedule's scroll position.

### Verified
- Migration applied; all four tables exist and RLS returns nothing to an
  anonymous caller.
- `proxy.ts` redirects unauthenticated requests to `/login`; a bad sign-in
  surfaces the error instead of crashing.
- Assertions cover `layOutDay` (overlap columns, column reuse, midnight
  clamping), the task grouping/reducer (archived-list orphans, the deliberate
  double-appearance), and the week helpers — 1,100 dates checked for
  Monday-start, consecutiveness and idempotency, plus month/year boundaries.
- Block geometry measured in the browser: 09:00 lands at exactly 9 × the hour
  height, 18:00 at 18 ×, with the grid 24 × tall.
- Week grid: seven equal columns, blocks in the right days, the current-time
  line only in today's column, per-day open-task badges.
- Recurrence assertions: parse/format round trips, daily/weekly/monthly interval
  phasing, `BYDAY`, 31st-of-the-month skipping short months, 29 Feb in leap years
  only, `UNTIL` clipping, and both 2026 DST transitions in the local zone — where
  a daily 18:00 routine keeps its wall-clock time while the UTC gap across the
  change absorbs the offset shift.
- Recurrence rendered in the week view against a fixture with two long-running
  series: the weekday routine appears Mon–Fri and not at weekends, the Mon/Wed/Fri
  routine appears only on those days, and an `excluded_dates` entry removes
  exactly one occurrence while the rest of the series stays intact.
- Composer round-trips a stored rule (`FREQ=WEEKLY;BYDAY=MO,WE,FR` → the right
  three chips lit and "Every week on Mon, Wed, Fri"), and editing the rule forces
  the scope to the whole series with the choice disabled and explained.
- Daily note renders its stored body; reminder banner correctly stays hidden when
  notification permission is already denied.
- Responsive checked at 375px and 1280px, no horizontal overflow in either.

**Still unverified: persistence and cross-device sync.** Everything above is
either the unauthenticated path or fixture-driven rendering. Creating an event,
ticking a task, reloading and confirming it survived all need a signed-in
session.

### Known gaps, deliberately deferred
- **Manual reordering.** `position` is a float precisely so reordering is a
  midpoint insert, but nothing writes it yet — new rows append at `Date.now()`
  and order is fixed. Drag-reorder is the intended use of that column.
- Moving a task to a *different* day: you can pin/unpin it to the day you're
  looking at, but not send it forward from the week view.
- The phone week agenda is read-only by design — no create/edit there, since the
  day view is one tap away and is the editing surface.
- Task `notes` and `event_id` columns exist and are unused — attaching a task to
  a specific time block is modelled but has no UI.
- **Recurring tasks.** `tasks.rrule` exists and nothing writes it. Recurring
  *routines* are modelled as repeating events, which covers the brief; a repeating
  checklist (weekly shop) would use this column.
- Reminders don't fire with the app closed — see the Reminders section for what
  that would cost.
- Recurrence has no `COUNT`, no "last Friday of the month", and no per-occurrence
  *move* to a different day (editing one occurrence keeps it on its own date).
- Dragging an existing block to move or resize it (create-by-drag works; editing
  times is done in the composer).
- All-day events — the `all_day` column exists and is selected, but nothing
  reads it yet: there's no UI to set it and no all-day strip above the grid, so
  an all-day row would currently render as an ordinary 24-hour block.
- Recurrence and reminders — Phase 4 columns exist, unused.
- No service worker, so no offline use.
