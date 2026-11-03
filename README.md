# archMGMT

Simple project management for a small architecture firm: tasks, schedules and workloads in one place,
with Gantt charts that export ready to hand to a client.

## Stack

| Layer | Choice |
| --- | --- |
| Web app | React + TypeScript (Vite) |
| Hosting | GitHub Pages (static) |
| Shared data and sign-in | Supabase (Postgres + Auth only, no file storage) |
| CI | GitHub Actions (build check on every push, Pages deploy) |

## Data model

- **People**: staff (role, weekly capacity hours, time off) and consultants (company, discipline).
  Consultants can be assigned tasks but aren't counted in staff workload.
- **Projects**: number, name, client, PM, status, dates
- **Phases**: Predesign / SD / DD / CD / Bidding / CA bars on the schedule; can be shown to the client or hidden
- **Tasks**: work inside a phase, with assignee, dates and estimated hours; milestones show as diamonds

Workload (no hours: those live in Monograph) = the size of each person's open tasks (light / medium / heavy) over the
weekdays they run, against their availability less time off, shown as a heat map. A full-time person is treated as
carrying about three medium tasks at once.

## Pages

- **Project switcher** (top of the sidebar, as in CAzen): the current project, remembered between visits.
- **Overview**: the current project's heading, a phase strip showing where the project is, and collapsible
  phases (current one open) with one-line summaries. Click a task to edit all of its details.
- **Schedule**, three views of the current project:
  - *Timeline*: drag bars to move them, drag ends to change length; moving a phase moves its tasks.
    Zoom to 12 months (month ticks), 6 months (week ticks) or 3 months (day ticks) for fine moves;
    click and hold empty space to pan. *Working view* shows everything; *Presentation view* shows only
    phases and tasks marked "Show in presentation view". Export as PDF (print, landscape) or PNG.
  - *Calendar*: month grid; drag a task to another day.
  - *Board*: columns by status (kanban), by phase, or by week (post-it pull plan, notes coloured by person);
    drag cards between columns.
  - Undo (button or Ctrl+Z) reverses drags and moves.
- **Project colours**: each project picks one root colour and a scheme (swatch next to its number on Overview).
  Every phase gets a different hue that harmonises with the root (Balanced, Triad or Complementary), all at one
  soft lightness and chroma (computed in OKLCH). The first phase is the root colour. Used on every view and export.
- **All projects**: every project with PM, current phase, schedule span and open tasks.
- **Team & workload**: 12-week heat map per staff member (Light / Steady / Busy / Overloaded), ◆ for due dates,
  hover for the week's tasks; click a person for their per-project breakdown, open tasks, time off, availability.
- **Editing tasks**: every part of a task row is clickable in place (status, size, dates, assignee, ⋯ for more);
  clicking a task in the timeline, calendar or board opens the same controls in a small panel.
- **Settings & data**: backup / restore, remove sample data.

## Keeping data safe while iterating

- Browser data lives under one fixed storage key that never changes.
- When the data shape changes, an upgrade step is added to `UPGRADES` in `src/lib/data.ts`.
  Steps only add or convert, never wipe, and run once.
- Sample rows are tagged, so **Remove sample data** deletes only those.
- Database changes go in new numbered files in `supabase/migrations/` (add columns/tables; never drop
  or rewrite a migration that has been run).
- **Download backup** exports everything as one JSON file; **Restore** adds or updates by id and never deletes.

## Repository layout

```
src/
  lib/supabase.ts       Supabase client (reads .env)
  lib/data.ts           Data layer: Supabase when configured, otherwise sample data in the browser
  lib/sample.ts         Sample data seeds (add-only)
  lib/workload.ts       Hours-by-week and capacity calculations
  lib/types.ts          Record types, statuses, default phases
  components/           Project switcher, schedule chart, inline edit fields
  pages/                Projects, ProjectDetail (Overview), Schedule, Team, Settings
supabase/migrations/    Database schema (run once in Supabase SQL Editor)
.github/workflows/      CI build + GitHub Pages deploy
```

## Roadmap

1. Phase 0: Setup (repo, shell, schema) ✓
2. Phase 1: Projects, phases and tasks (create, edit, assign) ✓ (runs on sample data until Supabase is connected)
3. Phase 2: Schedule: timeline with drag + zoom, calendar, board; working / presentation views ✓
4. Phase 3: Workload per person vs capacity, merged into Team ✓
5. Phase 4: Presentation export, PDF / PNG ✓
6. Shared database (Supabase) and invite-only sign-in ✓
7. Sheets: per-project sheet list (number, name, discipline, assignee, status), import from a pasted
   sheet index / Revit schedule CSV / PDF set, counted in workload
8. Revit add-in: push sheets and views from the model, pull assignments back into a sheet parameter
9. Later: consultant logins with access limited to their projects

## Sample data

Without Supabase keys the app runs on clearly-labelled sample data saved in the browser, so it can be
tried right away. **Reset sample data** in the sidebar restores the original set.

## Shared database (live)

- Supabase project **archMGMT** (AMR organization), `https://foaehycyfaosjipzdvxe.supabase.co`.
  The publishable key is in `src/lib/supabase.ts`; it is meant for browser code. Access is decided by the
  database rules: only signed-in **@amr-architects.com** addresses, or emails added to the `app_access`
  table, can read or change anything (migrations 0004, 0005).
- Migrations 0001–0005 are applied. New database changes go in new numbered files (add-only).
- People sign in with invite + password. To add someone: Supabase → Authentication → Users → **Invite user**.
  For someone outside AMR (e.g. a consultant), also add their email to `app_access` (Table Editor).
- Supabase → Authentication → URL Configuration: Site URL `https://amrjacob.github.io/archMGMT/`
  (so invite and reset links open the app).
- Data from before the database: Settings → **Copy into shared database** (in the browser that has it).
- To work on a local copy without the database, set `VITE_SUPABASE_URL=off` in `.env`.

## Commands

```bash
npm install     # once
npm run dev     # local dev server
npm run build   # production build to dist/
```
