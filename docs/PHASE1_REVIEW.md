# Phase 1 — Specification Review

Sources reviewed: `SPEC.md`, `TODO.md`, `docs/API.md`, `docs/DATABASE.md`, `docs/UI.md`,
and the course functional requirements (§4 Instructor/Student/Presentation, §5 Database).

---

## 1. Application Architecture

```text
 ┌──────────────────────────┐         HTTPS (anon key + user JWT)
 │  React SPA (Vite, TS,    │ ───────────────────────────────────────┐
 │  Tailwind, React Router) │                                        ▼
 │  hosted on Cloudflare    │        ┌───────────────────────────────────────────┐
 │  Pages                   │        │ Supabase                                  │
 │                          │        │  • Auth (email/password, instructor only)│
 │  Instructor pages        │──────▶ │  • PostgREST (table CRUD, RLS-filtered)  │
 │   /login /dashboard      │        │  • RPC (Postgres functions)              │
 │   /surveys/new           │        │  • PostgreSQL                            │
 │   /surveys/:id/edit      │        │      surveys ─< questions ─< choices      │
 │   /surveys/:id/present   │        │      surveys ─< responses ─< answers      │
 │   /surveys/:id/results   │        │      answers >─ questions, choices        │
 │                          │        └───────────────────────────────────────────┘
 │  Student page /s/:slug   │──────▶  only via SECURITY DEFINER RPCs
 └──────────────────────────┘
```

**There is no custom server.** Two trust zones talk to the same database:

| Actor | Postgres role | Access path | Can do |
|---|---|---|---|
| Instructor | `authenticated` | Supabase JS client: tables + RPCs | Full CRUD on all 5 tables, activation, results, CSV |
| Student | `anon` | `get_public_survey(slug)` and `submit_survey_response(...)` RPCs (+ read-only RLS on active survey content) | Read the active survey's questions/choices; insert one response atomically |

Security rests on **RLS + function grants**, because the anon key ships in the browser.
Students never get direct `INSERT/UPDATE/DELETE` on any table and never `SELECT` on
`responses` / `answers`.

### Database functions (RPCs)

| Function | Caller | Purpose |
|---|---|---|
| `activate_survey(p_survey_id)` | authenticated | In one transaction: close current active survey, generate slug if missing, set active, return `{id,status,public_slug}` |
| `close_survey(p_survey_id)` | authenticated | Set status `closed` |
| `save_survey(p_survey_id, p_title, p_description, p_questions jsonb)` | authenticated | Atomically replace a **draft** survey's questions/choices (avoids half-saved editor state) |
| `duplicate_survey(p_survey_id)` | authenticated | Copy survey/questions/choices as Draft "Copy of …", return new id |
| `get_survey_results(p_survey_id)` | authenticated | Return the results JSON shape in API §11 |
| `get_public_survey(p_slug)` | anon | Return `{status, survey, questions[choices]}`; distinguishes *not found* vs *closed* |
| `submit_survey_response(p_survey_id, p_anonymous_token, p_answers)` | anon | Validate + insert response and answers in one transaction |

### Frontend layout (`src/`)

```text
src/
  lib/        supabase.ts, auth context, api wrappers (surveys.ts, results.ts, public.ts),
              csv.ts, errors.ts (DB error → friendly message), token.ts (anonymous token)
  components/ StatusBadge, ConfirmDialog, QuestionEditor, ChoiceList, ResultsChart,
              ProtectedRoute, Loading/Empty/Error states
  pages/      Landing, Login, Dashboard, SurveyEditor, Present, Results, StudentSurvey
supabase/
  migrations/ 001_schema.sql, 002_rls.sql, 003_functions.sql
  verify/     SQL scripts used to demonstrate RLS and persistence
```

---

## 2. Inconsistencies Found in the Documents

| # | Issue | Where | Resolution |
|---|---|---|---|
| 1 | Student route is `/s/:surveyId` in TODO but `/s/:slug` in API/UI | TODO Ph.7 vs API §9, UI §1 | Use **`/s/:slug`** |
| 2 | `surveys` lacks `public_slug` and `updated_at` in SPEC §6 | SPEC vs DATABASE §3 | **DATABASE.md is authoritative** for schema |
| 3 | TODO marks almost everything done, but the repository was empty | TODO.md | Checkboxes reset to `[ ]`; they will be ticked as work lands |
| 4 | Anon RLS only exposes *active* surveys, yet UI requires a distinct "Survey closed" message | DATABASE §8 vs UI §8 | Closed and missing surveys are indistinguishable via RLS → add `get_public_survey` SECURITY DEFINER RPC that returns only a status for non-active surveys |
| 5 | DATABASE §9 says anon "needs INSERT on responses/answers", then recommends an RPC | DATABASE §9 | **No anon table INSERT.** `submit_survey_response` is SECURITY DEFINER; anon gets only `EXECUTE` |
| 6 | Requirement says "edit existing **draft** surveys"; TODO says "prevent editing active unless closed" (implies closed is editable) | Course §4.1 vs TODO Ph.5 | Only **Draft** is editable. Editing closed surveys would orphan/alter collected answers (`answers.choice_id on delete set null`). To change a used survey → Duplicate |
| 7 | Course requirements list 7 implementation phases; TODO has 16 | — | Mapping proposed in §4 below |

---

## 3. Missing Decisions — and Recommended Defaults

Items marked ⚠️ have security or data-integrity consequences.

1. ⚠️ **Who is an instructor?** DATABASE §10 grants full access to *any* authenticated user.
   Supabase allows public sign-up by default, so anyone could register and read results.
   **Decision:** disable email sign-ups in Supabase Auth settings; create the instructor
   account manually in the dashboard. (Multi-instructor ownership stays post-MVP.)
2. **True/False storage.** **Decision:** a `true_false` question gets two real `choices`
   rows ("True", "False") created automatically, so every answer references a `choice_id`
   and results/CSV code has one path.
3. **Required answers.** There is no `required` column, but `MISSING_REQUIRED_ANSWER` exists.
   **Decision:** every question is required in V1.
4. **Minimum content.** **Decision:** survey must have a title and ≥1 question to activate;
   multiple-choice needs ≥2 non-empty choices.
5. **Lifecycle transitions.** Not specified. **Decision:**
   - `draft → active` (activate), `active → closed` (close), `closed → active` (re-open, keeps slug and responses),
   - `draft | closed → archived`; unarchive returns to `closed`, or to `draft` if it was never activated,
   - archived surveys cannot be activated directly; active surveys cannot be archived or deleted without closing first.
6. **Slug format.** **Decision:** 8 random chars from an unambiguous alphabet
   (`23456789abcdefghjkmnpqrstuvwxyz`), generated in SQL with `gen_random_bytes`,
   retried on collision, generated once and kept for the survey's life.
7. ⚠️ **Race between close and submit** ("submissions must fail immediately").
   **Decision:** `submit_survey_response` reads the survey row `FOR SHARE` and checks
   `status = 'active'` inside the same transaction as the insert.
8. ⚠️ **Concurrent activation.** **Decision:** keep the partial unique index
   `only_one_active_survey`; `activate_survey` closes the old active row before activating
   the new one, in one function (one transaction).
9. **Duplicate-submission protection.** "Reasonable protection against *accidental*
   duplicates." **Decision:** random UUID token in `localStorage`, sent with each submit;
   unique index `(survey_id, anonymous_token)` enforces it; the client also remembers
   submitted survey ids to show "already submitted" without a round trip. Acknowledged
   limitation: a private window or cleared storage can resubmit — acceptable per requirement.
10. **Response counter on the Present page.** Realtime is post-MVP. **Decision:** poll
    the count every 5 s (instructor is authenticated, so a `count` query is allowed).
11. **Percentage denominator.** **Decision:** `count / answers-to-that-question`, rounded
    to 1 decimal; since all questions are required this equals total responses.
    Zero responses → 0 % and the "No responses yet" empty state.
12. **CSV format.** **Decision:** columns `response_id, submitted_at, <question 1 text>, …`;
    cells contain the chosen choice text; RFC 4180 quoting; UTF-8 BOM for Excel;
    neutralise spreadsheet-formula injection (prefix cells starting with `= + - @` with `'`);
    survey metadata goes in the filename (`<title>-<date>.csv`) to keep the file one clean table.
13. **Editor save strategy.** **Decision:** full-replace of questions/choices via
    `save_survey` RPC (safe because only drafts, which have no responses, are editable).
14. **Public URL base for QR codes.** **Decision:** `VITE_PUBLIC_SITE_URL` env var with
    fallback to `window.location.origin`, so QR codes point at production when deployed.
15. **SPA routing on Cloudflare.** **Decision:** `wrangler.jsonc` with `"not_found_handling": "single-page-application"` (Workers static assets). *(Originally `public/_redirects`; Workers rejects that rule as an infinite loop, so it was replaced.)*
16. ⚠️ **SECURITY DEFINER hygiene.** **Decision:** every definer function sets
    `search_path = public`, `REVOKE EXECUTE ... FROM public`, then grants only to the
    intended role (`anon` or `authenticated`).
17. **Migrations workflow.** **Decision:** plain SQL files in `supabase/migrations/`,
    run in order in the Supabase SQL Editor (no CLI dependency). Verification SQL in `supabase/verify/`.
18. **Testing tools.** **Decision:** Vitest for pure logic (CSV, results mapping, error
    mapping, editor validation); SQL scripts using `set role anon` / `set role authenticated`
    to prove RLS; manual checklist for end-to-end flows.
19. **Versions.** React 18/19 + Vite, Tailwind v4 (`@tailwindcss/vite`), React Router,
    `@supabase/supabase-js` v2, Recharts, `qrcode` — pinned in `package.json`.

**Things only you can do** (no code can do these): create the Supabase project,
copy the project URL + anon key into `.env`, disable public sign-ups, create the
instructor user, and connect Cloudflare Pages to the GitHub repo.

---

## 4. Implementation Plan (7 phases)

| Phase | Scope | TODO phases covered | Done when |
|---|---|---|---|
| **1. Review specs** | This document; specs committed to repo | — | Decisions agreed |
| **2. Project setup** | Vite + React + TS + Tailwind + Router + supabase-js + Recharts + qrcode; folder structure; `.env.example`; ESLint/Prettier; landing page; `_redirects` | 1 | `npm run build` and `npm run lint` pass |
| **3. Database & security** | `001_schema.sql` (5 tables, FKs, indexes, triggers, partial unique indexes), `002_rls.sql`, `003_functions.sql` (all RPCs above), verification SQL | 2, 6 (DB part), 8 (DB part) | Verify scripts show: anon reads only active survey, cannot read responses/answers or write tables; authenticated has full access |
| **4. Instructor auth + dashboard + editor** | Login/logout, auth provider, protected routes; dashboard list with badges, search, status filter, Edit/Duplicate/Archive/Delete with confirmations; editor for MC & T/F with add/reorder/delete and validation | 3, 4, 5, 12 | Creating a survey and questions produces rows visible in Table Editor; survives refresh |
| **5. Activation, presentation, student page** | Activate/Close, slug, QR + PNG download, Present page with polled response count; `/s/:slug` with all states (loading, not found, closed, already submitted, submitting, success); anonymous token | 6, 7, 8 | Phone can scan QR, submit once, second attempt blocked; closing blocks new submissions |
| **6. Results, history, CSV** | Results RPC + page with counts, percentages, Recharts bars with numeric labels, refresh; historical filters (title, date); CSV export | 9, 10, 11 | Counts match SQL in Table/SQL Editor; CSV opens correctly in Excel/Sheets |
| **7. Polish, testing, deployment** | Accessibility & keyboard pass, mobile layout, Vitest suite, RLS tests, Cloudflare Pages deploy, production verification, README with Database Verification walkthrough | 13, 14, 15 | All MVP checkboxes ticked; production QR → production URL |

Post-MVP items (TODO Phase 16) remain out of scope.

### Database Verification (to be demonstrated in Phases 3–6)

| Requirement | How it will be shown |
|---|---|
| Creating a survey stores it | Row appears in `surveys` (Table Editor) |
| Adding questions creates records | Rows in `questions` / `choices` with matching FKs |
| Submissions persist | Rows in `responses` / `answers` after a student submit |
| Results retrievable | `select * from get_survey_results('<id>')` in SQL Editor matches Results page |
| Survives refresh | Reload dashboard/results; data unchanged |
| Students can't modify/see results | `supabase/verify/rls_checks.sql` run as `anon` role |
