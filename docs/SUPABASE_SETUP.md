# Supabase Setup (Phase 3)

This guide creates the Supabase project, builds the database, locks down access,
and connects the app. It takes about 15 minutes. Everything here is on the
Supabase **Free** plan.

> **Secrets rule:** the only Supabase values the app uses are the **Project URL** and
> the **anon / publishable key**. Both are public by design. Never put the
> **database password**, the **service_role** key, or any **secret (`sb_secret_…`)**
> key in `.env`, in code, or on GitHub. `.env` is git-ignored, and the app refuses
> to start if it is given a secret key.

---

## 1. Create the project

1. Sign in at <https://supabase.com/dashboard> (GitHub login works).
2. **New project** → choose your organization.
3. **Name:** `classroom-survey`. **Region:** the one closest to your classroom.
4. **Database password:** click *Generate a password* and save it in a password
   manager. You won't need it for the app; never commit it.
5. Click **Create new project** and wait for it to finish provisioning (about 1–2 minutes).

Supabase projects run PostgreSQL 15 or newer, which the migrations require.

## 2. Create the tables, policies and functions

Open **SQL Editor** → **New query**. For each file below, in order, paste its whole
contents and click **Run**. Each one should finish with *Success. No rows returned*.

| Order | File | Creates |
|---|---|---|
| 1 | [`supabase/migrations/20261104000001_schema.sql`](../supabase/migrations/20261104000001_schema.sql) | 5 tables, primary/foreign keys, indexes, the one-active-survey rule, triggers |
| 2 | [`supabase/migrations/20261104000002_rls.sql`](../supabase/migrations/20261104000002_rls.sql) | Row Level Security policies and table privileges |
| 3 | [`supabase/migrations/20261104000003_functions.sql`](../supabase/migrations/20261104000003_functions.sql) | Database functions (activate, close, submit, results, …) and who can call them |

*Alternative:* with the [Supabase CLI](https://supabase.com/docs/guides/cli), run
`supabase link --project-ref <ref>` and then `supabase db push`.

Optional: run [`supabase/seed.sql`](../supabase/seed.sql) to add one sample Draft survey.

## 3. Check the security rules

Run [`supabase/verify/01_security_checks.sql`](../supabase/verify/01_security_checks.sql)
in the SQL Editor. It acts as an anonymous student and as the instructor, then
**rolls back** everything it did, so your data is untouched.

**Expected:** a table of 36 checks, **every row `PASS`**. Take a screenshot for your
assignment. Among other things it proves that students:

- can read only the Active survey;
- can submit a response only through `submit_survey_response`, which rejects
  duplicates, invalid choices and missing answers;
- **cannot** read responses or answers (results), **cannot** insert, update or delete
  any table directly, and **cannot** call instructor functions.

## 4. Lock down authentication

The policies give full access to any logged-in user, so **only you** may have an account.

1. **Authentication → Sign In / Providers** (called *Providers* in some dashboard versions):
   - make sure **Email** is enabled;
   - turn **off** *Allow new users to sign up*;
   - click **Save**.
2. **Authentication → Users → Add user → Create new user**: enter your email and a
   strong password, and tick **Auto Confirm User**.
3. **Authentication → URL Configuration → Site URL:** `http://localhost:5173` for now.
   Change it to the production URL after deployment.

## 5. Connect the app

1. **Project Settings → API Keys** (or **Settings → API** in older dashboards) and copy:
   - the **Project URL** (`https://<ref>.supabase.co`); the *Data API* URL ending in `/rest/v1/` also works;
   - the **anon** key (*Legacy API keys* tab) **or** the **publishable** key
     (`sb_publishable_…`). Do **not** copy `service_role` or `sb_secret_…` keys.
2. In the project folder:

   ```bash
   cp .env.example .env
   ```

3. Edit `.env`:

   ```ini
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon or publishable key>
   ```

4. Restart the dev server so Vite reads the new values:

   ```bash
   npm run dev
   ```

The yellow *Demo mode* banner should be gone. Log in with the user from step 4.

Check that nothing secret is tracked by Git (this should print nothing):

```bash
git ls-files | grep -E '(^|/)\.env$'
```

## 6. Demonstrate the Database Verification requirements

Use the app, then inspect the data with the **Table Editor** or by running the
queries in [`supabase/verify/02_inspect_data.sql`](../supabase/verify/02_inspect_data.sql)
one at a time.

| Requirement | Do this in the app | Show this in Supabase |
|---|---|---|
| Creating a survey stores its information | **New Survey** → title → **Save Draft** | `surveys` table / query 1 |
| Adding questions creates records | Add a multiple-choice and a true/false question → **Save Draft** | `questions` and `choices` tables / query 2 |
| Student submissions are stored persistently | **Save & Activate**, open the `/s/…` link on a phone, submit | `responses` and `answers` tables / query 3 |
| Survey results can be retrieved | Open **Results** | query 4 returns the same numbers |
| Data remains after refreshing | Reload the dashboard and results pages | counts unchanged / query 5 |
| Students can't modify surveys or see results | (none) | `01_security_checks.sql` all `PASS`; query 6 shows RLS enabled |

## 7. Production (deployment phase)

In Cloudflare **Workers → Settings → Build → Variables and secrets** (build-time variables; see [DEPLOYMENT.md](DEPLOYMENT.md)), add
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_PUBLIC_SITE_URL`. A
production build without them shows a *Configuration error* page instead of
silently running in demo mode.

---

## How access control works

| | Student (`anon` role, not logged in) | Instructor (`authenticated` role) |
|---|---|---|
| `surveys`, `questions`, `choices` | `SELECT` only, and RLS limits rows to the **Active** survey | Full access |
| `responses`, `answers` | **No privileges at all** | Full access |
| `get_public_survey(slug)` | ✔ survey content only, never responses | ✔ |
| `submit_survey_response(...)` | ✔ validated, atomic insert | ✔ |
| `save_survey`, `activate_survey`, `close_survey`, `archive_survey`, `unarchive_survey`, `duplicate_survey`, `get_survey_results` | ✘ permission denied | ✔ |

Rules the database enforces no matter who calls it:

- At most one survey is Active (unique partial index, plus an activation lock).
- Questions and choices can change only while their survey is a Draft (trigger), so
  collected results can't be altered.
- An Active survey can't be deleted; deleting any other survey cascades to its
  questions, choices, responses and answers.
- An answer's choice must belong to its question (composite foreign key).
- One response per browser token per survey (unique index).
- Submissions fail as soon as a survey is closed (the row is locked `FOR SHARE`
  during a submission).

## Testing the SQL locally (optional)

`npm run test:db` applies the migrations to a **disposable local** PostgreSQL
database, using a stand-in for Supabase's roles, and runs the security checks:

```bash
TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npm run test:db
```

It refuses to run against a Supabase host.
