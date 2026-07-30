# Personal Calendar & Life Tracker — Build Brief

**1. Task**
Build a personal, fully custom calendar and daily planner web app for one user (me), self-hosted on my own domain. It combines a Google-Calendar-style time-blocked schedule with checklists, to-do lists, and recurring routines. This is a private personal tool, not a general-purpose product.

**2. Context**
- Personal use only, single authenticated user
- Will run on my own hosted domain
- Needs to work well on both a laptop (browser) and a phone (installable, app-like experience)
- Should have zero or near-zero recurring cost
- I want you to make the architecture decisions and drive the build — pick whatever's genuinely best for this
- Google Calendar is the closest existing product, but it's too rigid — checklist items (e.g. groceries), free-form to-dos, and time-blocked scheduling all need to coexist naturally

**3. Reference**
- Interface reference: Google Calendar's day/week grid view, and productivity apps like Todoist or Notion for how they handle checklists and to-dos
- Mood/style: clean, minimal, fast to enter data into — this gets opened and edited many times a day, not just browsed

**4. Effort**
- Prioritize a working, reliable core over a large feature list
- Favor an established, well-supported, free-tier-friendly approach over anything experimental
- Consistency and low maintenance matter more than novelty

**5. Act**
Build a dynamic (not static) web app with persistent, synced storage where I can: view and edit a day as a time-blocked schedule; maintain daily checklists and to-do items alongside that schedule; and see a week view for forward planning.

**6. Scope**
- Single user, authenticated — not multi-tenant, no public signup
- Must stay free to run and host
- Don't scope-creep into a general project-management tool — stay focused on personal daily planning
- Lock the data model early; don't redesign it mid-build

**7. Delegate**
Break the build into phases:
- Phase 1: authentication + single-day time-blocked schedule (add/edit/delete)
- Phase 2: checklist and to-do layer alongside the schedule
- Phase 3: week view for forward planning
- Phase 4: recurring routines, daily notes, reminders

Each phase should leave me with a fully working app, never a half-finished one.

**8. Evidence**
At the end of each phase, show the feature actually working, not just describe it — I should be able to open the app and use the new functionality immediately.

**9. Memory**
Document the chosen stack, data model, and any conventions (naming, structure, styling approach) in a short project file, so future sessions stay consistent instead of redeciding settled things.

**10. Checkpoint**
Before calling a phase done, verify: data actually persists and syncs across a page reload and across devices, nothing from earlier phases broke, and the interface is usable on both a phone-sized screen and a laptop screen.

**11. Report**
For each phase, tell me: what was built, what was chosen (stack/tools) and why, how to run or access it, and what's left for the next phase.
