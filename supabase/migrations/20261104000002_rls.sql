-- =====================================================================
-- Classroom Survey — 002 Row Level Security and table privileges
-- (docs/DATABASE.md §7–§10)
--
-- Roles (Supabase):
--   anon           students — no login. Read-only access to the ACTIVE
--                  survey's content. No access at all to responses/answers.
--                  Submissions only through submit_survey_response().
--   authenticated  instructor — full access. Public sign-ups MUST be
--                  disabled in Supabase Auth so that only accounts you
--                  create can log in (see docs/SUPABASE_SETUP.md).
-- =====================================================================

alter table public.surveys   enable row level security;
alter table public.questions enable row level security;
alter table public.choices   enable row level security;
alter table public.responses enable row level security;
alter table public.answers   enable row level security;

-- ---------------------------------------------------------------------
-- Table privileges (defence in depth on top of RLS).
-- Supabase grants everything to anon by default; take it back.
-- ---------------------------------------------------------------------
revoke all on public.surveys, public.questions, public.choices,
              public.responses, public.answers
    from anon;

grant select on public.surveys, public.questions, public.choices to anon;

grant select, insert, update, delete
    on public.surveys, public.questions, public.choices,
       public.responses, public.answers
    to authenticated;

-- ---------------------------------------------------------------------
-- Public student permissions (§8): read only Active surveys.
-- ---------------------------------------------------------------------
create policy "students read active surveys"
on public.surveys
for select
to anon
using (status = 'active');

create policy "students read active survey questions"
on public.questions
for select
to anon
using (
    exists (
        select 1
        from public.surveys
        where surveys.id = questions.survey_id
          and surveys.status = 'active'
    )
);

create policy "students read active survey choices"
on public.choices
for select
to anon
using (
    exists (
        select 1
        from public.questions
        join public.surveys on surveys.id = questions.survey_id
        where questions.id = choices.question_id
          and surveys.status = 'active'
    )
);

-- No anon policies on responses or answers: students can neither read
-- results nor insert rows directly (§9). Submissions go through the
-- SECURITY DEFINER function submit_survey_response().

-- ---------------------------------------------------------------------
-- Instructor permissions (§10): single-instructor deployment.
-- ---------------------------------------------------------------------
create policy "authenticated users manage surveys"
on public.surveys for all to authenticated using (true) with check (true);

create policy "authenticated users manage questions"
on public.questions for all to authenticated using (true) with check (true);

create policy "authenticated users manage choices"
on public.choices for all to authenticated using (true) with check (true);

create policy "authenticated users manage responses"
on public.responses for all to authenticated using (true) with check (true);

create policy "authenticated users manage answers"
on public.answers for all to authenticated using (true) with check (true);
