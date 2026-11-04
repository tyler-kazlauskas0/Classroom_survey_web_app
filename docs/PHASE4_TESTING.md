# Phase 4 — Database Integration Testing

The app is connected to Supabase through the environment variables in
`.env.example`. The required workflow is tested automatically against the
**live Supabase project** at two levels.

| Command | What it drives | Checks |
|---|---|---|
| `npm run test:integration` | The app's data layer (`src/lib/api/supabaseApi.ts`), exactly the code the pages call | 9 |
| `npm run test:e2e` | The real UI in Chromium: instructor on a desktop, each student in a **separate** phone-sized browser profile. Every step is also checked directly in the database | 10 |

Both read `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `E2E_INSTRUCTOR_EMAIL`
and `E2E_INSTRUCTOR_PASSWORD` from the environment or `.env` (never committed).
Each creates one survey titled `[E2E] …` and **deletes it afterwards**; if
another survey was active it is re-activated.

## Workflow results (live Supabase)

| # | Step | How it is verified | Result |
|---|---|---|---|
| 1 | Instructor creates a survey | Log in with Supabase Auth → New Survey → Save Draft; `surveys` row exists with `status = draft` | ✅ |
| 2 | Instructor adds questions and answer choices | Multiple choice (3 choices) + True/False → Save Draft; 2 `questions` rows and 5 `choices` rows | ✅ |
| 3 | Instructor activates the survey | Save & Activate → presentation page with QR code; row is `active` with an 8-character slug; exactly one active survey | ✅ |
| 4 | Student opens the survey | New browser profile, no login, opens the QR URL; title and both questions render. An unknown link shows *Survey not found* | ✅ |
| 5 | Student submits answers | Two students submit; each sees *Thank you!*; reloading shows *already submitted*; duplicate, incomplete and invalid submissions are rejected by the database | ✅ |
| 6 | Responses are saved in the database | 2 `responses` rows with tokens, 4 `answers` rows with the exact choices picked; the presentation page count updates to 2 | ✅ |
| 7 | Instructor views the results | Results page shows 2 responses and the correct counts and percentages (base case 1 / 50.0 %, loop 1 / 50.0 %, True 2 / 100.0 %); unchanged after reload; CSV export has a header and 2 rows | ✅ |
| (extra) | Students cannot see results | Logged out: `get_survey_results`, the response count and response export are all refused | ✅ |
| (extra) | Closing stops submissions | After *Close Survey*, the student link shows *no longer accepting responses* and the database rejects submissions with `SURVEY_NOT_ACTIVE` | ✅ |

Screenshots from each run are written to `e2e/screenshots/` (git-ignored
because they show the instructor's email).

## Running it yourself

```bash
cp .env.example .env     # fill in the values; see docs/SUPABASE_SETUP.md
```

Then add `E2E_INSTRUCTOR_EMAIL` and `E2E_INSTRUCTOR_PASSWORD` to `.env`; a dedicated
test user is recommended. Then:

```bash
npm run test:integration
```

```bash
npm run test:e2e
```

`test:e2e` uses Playwright's Chromium; on a new machine run
`npx playwright install chromium` once.

## Changes made while connecting

- `VITE_SUPABASE_URL` may now be either the Project URL or the Data API URL
  (`…supabase.co/rest/v1/`) shown in the dashboard. The app strips `/rest/v1`, which
  supabase-js adds itself; previously the Data API form broke every request.
- Logging out now signs out only the current browser, not every device. Logging
  out on a laptop no longer logs out the projector.
