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

Workload = each person's open task hours spread over the weekdays they run, compared with their weekly hours less time off.

## Pages

- **Project switcher** (top of the sidebar, as in CAzen): the current project, remembered between visits.
- **Overview**: the current project's details, phases, tasks and milestones, all edited in place.
- **Schedule**: Gantt chart of the current project. *Client view* shows only phases marked "On client schedule"
  and tasks marked "Client"; *Internal view* shows every task with who it's assigned to.
  Export as PDF (print dialog, landscape) or PNG. Both match the screen.
- **All projects**: every project with PM, current phase, schedule span and open tasks.
- **Team & workload**: 12-week hours-vs-capacity grid per staff member; click a person for their per-project
  breakdown, open tasks, time off and details. Consultants listed below.
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
3. Phase 2: Schedule with client / internal views ✓ (drag to reschedule next)
4. Phase 3: Workload per person vs capacity, merged into Team ✓
5. Phase 4: Client export, PDF / PNG ✓
6. Next: shared database (Supabase) and sign-in for the office
7. Sheets: per-project sheet list (number, name, discipline, assignee, status), import from a pasted
   sheet index / Revit schedule CSV / PDF set, counted in workload
8. Revit add-in: push sheets and views from the model, pull assignments back into a sheet parameter
9. Later: consultant logins with access limited to their projects

## Sample data

Without Supabase keys the app runs on clearly-labelled sample data saved in the browser, so it can be
tried right away. **Reset sample data** in the sidebar restores the original set.

## Setup

1. Create a Supabase project, run `supabase/migrations/0001_schema.sql` in the SQL Editor,
   and turn off public sign-ups (invite firm members instead).
2. Copy `.env.example` to `.env` and fill in the project URL and anon key.
3. On GitHub: Settings → Pages → Source: GitHub Actions; add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` under Settings → Secrets and variables → Actions.

## Commands

```bash
npm install     # once
npm run dev     # local dev server
npm run build   # production build to dist/
```
