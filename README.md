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

Workload = each person's task hours spread over the weeks they run, compared with their capacity less time off.

## Repository layout

```
src/
  lib/supabase.ts       Supabase client (reads .env)
  lib/data.ts           Data layer: Supabase when configured, otherwise sample data in the browser
  lib/types.ts          Record types, statuses, default phases
  components/           Inline edit fields, assignee picker
  pages/                Projects, ProjectDetail, Schedule, Workload, Team
supabase/migrations/    Database schema (run once in Supabase SQL Editor)
.github/workflows/      CI build + GitHub Pages deploy
```

## Roadmap

1. Phase 0: Setup (repo, shell, schema) ✓
2. Phase 1: Projects, phases and tasks (create, edit, assign) ✓ (runs on sample data until Supabase is connected)
3. Phase 2: Schedule (interactive Gantt, drag to reschedule)
4. Phase 3: Workload (per-person weekly hours vs capacity, over-allocation flags)
5. Phase 4: Client export (branded PDF / PNG Gantt, client-visible phases and milestones only)
6. Later: consultant logins with access limited to their projects

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
