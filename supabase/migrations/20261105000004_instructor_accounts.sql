-- =====================================================================
-- Classroom Survey — 004 Instructor accounts (multiple instructors)
--
-- Run AFTER migrations 001–003. Safe on a database that already has data.
--
-- Before: any logged-in user could read and change every survey (fine for
-- one instructor, unsafe once people can create their own accounts).
-- After:  every survey belongs to the instructor who created it. Row Level
--         Security limits each instructor to their own surveys, questions,
--         choices, responses and answers. "Only one Active survey" now
--         means one per instructor. Student access is unchanged.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Owner column
-- ---------------------------------------------------------------------
alter table public.surveys
    add column if not exists owner_id uuid default auth.uid();

-- Existing surveys (created before accounts existed) go to the oldest
-- instructor account, i.e. the original instructor.
do $$
begin
    if to_regclass('auth.users') is not null then
        execute $sql$
            update public.surveys
            set owner_id = (select id from auth.users order by created_at limit 1)
            where owner_id is null
        $sql$;
    end if;
end $$;

-- Every survey must have an owner from now on. (Fails only if old surveys
-- exist but no instructor account does; create the account first.)
alter table public.surveys alter column owner_id set not null;

create index if not exists surveys_owner_id_idx on public.surveys (owner_id);

-- Owners can't be changed after creation.
create or replace function public.surveys_keep_owner()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    if new.owner_id is distinct from old.owner_id then
        raise exception 'INVALID_TRANSITION' using detail = 'A survey''s owner cannot be changed.';
    end if;
    return new;
end;
$$;

drop trigger if exists surveys_keep_owner on public.surveys;
create trigger surveys_keep_owner
before update of owner_id on public.surveys
for each row
execute function public.surveys_keep_owner();

-- ---------------------------------------------------------------------
-- 2. One Active survey per instructor (was: one in the whole database)
-- ---------------------------------------------------------------------
drop index if exists public.only_one_active_survey;
create unique index if not exists one_active_survey_per_owner
    on public.surveys (owner_id)
    where status = 'active';

-- ---------------------------------------------------------------------
-- 3. Row Level Security: instructors see only their own data
-- ---------------------------------------------------------------------
drop policy if exists "authenticated users manage surveys"   on public.surveys;
drop policy if exists "authenticated users manage questions" on public.questions;
drop policy if exists "authenticated users manage choices"   on public.choices;
drop policy if exists "authenticated users manage responses" on public.responses;
drop policy if exists "authenticated users manage answers"   on public.answers;

create policy "instructors manage own surveys"
on public.surveys for all to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "instructors manage own questions"
on public.questions for all to authenticated
using (exists (
    select 1 from public.surveys s
    where s.id = questions.survey_id and s.owner_id = (select auth.uid())))
with check (exists (
    select 1 from public.surveys s
    where s.id = questions.survey_id and s.owner_id = (select auth.uid())));

create policy "instructors manage own choices"
on public.choices for all to authenticated
using (exists (
    select 1 from public.questions q join public.surveys s on s.id = q.survey_id
    where q.id = choices.question_id and s.owner_id = (select auth.uid())))
with check (exists (
    select 1 from public.questions q join public.surveys s on s.id = q.survey_id
    where q.id = choices.question_id and s.owner_id = (select auth.uid())));

create policy "instructors manage own responses"
on public.responses for all to authenticated
using (exists (
    select 1 from public.surveys s
    where s.id = responses.survey_id and s.owner_id = (select auth.uid())))
with check (exists (
    select 1 from public.surveys s
    where s.id = responses.survey_id and s.owner_id = (select auth.uid())));

create policy "instructors manage own answers"
on public.answers for all to authenticated
using (exists (
    select 1 from public.responses r join public.surveys s on s.id = r.survey_id
    where r.id = answers.response_id and s.owner_id = (select auth.uid())))
with check (exists (
    select 1 from public.responses r join public.surveys s on s.id = r.survey_id
    where r.id = answers.response_id and s.owner_id = (select auth.uid())));

-- ---------------------------------------------------------------------
-- 4. activate_survey: close only the caller's own active survey
--    (RLS already hides other instructors' rows; this makes it explicit
--    and serialises activations per instructor instead of globally).
-- ---------------------------------------------------------------------
create or replace function public.activate_survey(p_survey_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_survey public.surveys;
    v_owner  uuid;
begin
    select owner_id into v_owner from public.surveys where id = p_survey_id;
    if not found then
        raise exception 'SURVEY_NOT_FOUND';
    end if;

    -- Per-instructor lock taken BEFORE any row lock, so two simultaneous
    -- activations by the same instructor queue instead of deadlocking.
    perform pg_advisory_xact_lock(hashtext('classroom_survey.activate.' || v_owner::text));

    select * into v_survey from public.surveys where id = p_survey_id for update;

    if v_survey.status = 'active' then
        return to_jsonb(v_survey);
    end if;
    if v_survey.status = 'archived' then
        raise exception 'INVALID_TRANSITION' using detail = 'Unarchive the survey first.';
    end if;
    if not exists (select 1 from public.questions where survey_id = p_survey_id) then
        raise exception 'VALIDATION_ERROR' using detail = 'Add at least one question before activating.';
    end if;

    update public.surveys set status = 'closed'
    where status = 'active' and owner_id = v_survey.owner_id and id <> p_survey_id;

    update public.surveys set status = 'active'
    where id = p_survey_id
    returning * into v_survey;

    return to_jsonb(v_survey);
end;
$$;

revoke execute on function public.activate_survey(uuid) from public, anon;
grant execute on function public.activate_survey(uuid) to authenticated;
revoke execute on function public.surveys_keep_owner() from public, anon, authenticated;
