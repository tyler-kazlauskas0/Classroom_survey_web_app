# Classroom Survey

Quick in-class understanding checks. Instructors create a survey, show a QR code, and
students answer from their phones with no login required. Results show counts,
percentages and charts, and can be exported as CSV.

**Stack:** React 19 + TypeScript + Vite, Tailwind CSS v4, React Router, Supabase
(PostgreSQL + Auth), Recharts, `qrcode`. Hosted on Cloudflare Pages.

Specifications: [SPEC.md](SPEC.md), [docs/API.md](docs/API.md),
[docs/DATABASE.md](docs/DATABASE.md), [docs/UI.md](docs/UI.md), [TODO.md](TODO.md).
Design decisions: [docs/PHASE1_REVIEW.md](docs/PHASE1_REVIEW.md).

## Run locally

```bash
npm install
npm run dev          # http://localhost:5173
```

### Demo mode vs. Supabase

The app picks its backend from environment variables:

| `.env` | Backend | Data |
|---|---|---|
| `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` **empty** | **Demo mode**: in-browser backend (`src/lib/api/demoApi.ts`) | Kept in this browser's `localStorage` only, with sample surveys |
| Both set (copy `.env.example` → `.env`) | Supabase (`src/lib/api/supabaseApi.ts`) | Your Supabase PostgreSQL database |

Demo login: **`instructor@example.com` / `demo1234`**. A yellow banner shows when demo
mode is on. Demo mode follows the same rules as the database: one active survey at a
time, only drafts are editable, one response per browser. Because demo data lives in a
single browser, a student phone can't reach it; test student pages in another tab of the
same browser. To reset the demo data, clear the site's local storage.

The database schema, Row Level Security policies and RPC functions are added in the
database phase (`supabase/migrations/`).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Type-check and production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm test` | Vitest unit tests (CSV, results maths, validation, error mapping, demo backend rules) |

## Pages

| Route | Page | Access |
|---|---|---|
| `/` | Landing | Public |
| `/login` | Instructor login | Public |
| `/dashboard` | Survey list: search, status and date filters, Edit / Activate / Close / Duplicate / Archive / Delete | Instructor |
| `/surveys/new`, `/surveys/:id/edit` | Editor: Multiple Choice and True/False questions, reorder, validation (drafts only) | Instructor |
| `/surveys/:id/present` | Projector view: large QR code, URL, live response count (5 s polling), PNG download, full screen, Close | Instructor |
| `/surveys/:id/results` | Counts, percentages, bar charts, refresh, CSV export | Instructor |
| `/s/:slug` | Student survey (mobile first, no login) | Public |

## Project structure

```text
src/
  components/   Shared UI (buttons, dialogs, badges, layout, chart, route guard)
  pages/        One file per route
  lib/
    api/        SurveyApi interface + Supabase and demo implementations
    auth.tsx    Auth context/provider
    csv.ts      CSV generation (RFC 4180, formula-injection safe, Excel BOM)
    results.ts  Results aggregation
    validation.ts, errors.ts, token.ts, config.ts, ...
public/_redirects   SPA routing for Cloudflare Pages
supabase/           Database migrations (database phase)
docs/               Specifications, design review, screenshots
```

## Screenshots

| Dashboard | Editor | Present |
|---|---|---|
| ![](docs/screenshots/03-dashboard.png) | ![](docs/screenshots/05-editor-filled.png) | ![](docs/screenshots/06-present.png) |

| Student (phone) | Confirmation | Results |
|---|---|---|
| ![](docs/screenshots/07-student-form.png) | ![](docs/screenshots/09-student-success.png) | ![](docs/screenshots/14-results-historical.png) |
