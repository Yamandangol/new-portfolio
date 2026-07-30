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

---

## Conventions

**Structure**
```
src/app/                routes
  page.tsx              → redirects to today (client-side; see timezone policy)
  login/                sign-in
  day/[date]/           the day view + its Server Actions
  auth/actions.ts       signIn / signOut
src/components/         client components (PascalCase files)
src/lib/                pure helpers, no React (camelCase files)
supabase/migrations/    numbered, append-only SQL
```

**Naming** — database columns `snake_case`; TypeScript `camelCase`. Rows crossing
that boundary keep their `snake_case` field names (`starts_at`) rather than being
mapped, so a type mismatch is a compile error instead of a silent rename bug.

**Data flow** — Server Component fetches → Client Component renders → Server
Action mutates → `router.refresh()`. Server Actions return
`{ ok: true } | { ok: false, error }`; they never throw for user-facing problems.

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
- [ ] **Phase 2** — checklist and to-do layer alongside the schedule
- [ ] **Phase 3** — week view for forward planning
- [ ] **Phase 4** — recurring routines, daily notes, reminders

### Known gaps, deliberately deferred
- Dragging an existing block to move or resize it (create-by-drag works; editing
  times is done in the composer).
- All-day events — the `all_day` column exists and is selected, but nothing
  reads it yet: there's no UI to set it and no all-day strip above the grid, so
  an all-day row would currently render as an ordinary 24-hour block.
- Recurrence, reminders, notes — Phase 4 columns exist, unused.
- No service worker, so no offline use.
