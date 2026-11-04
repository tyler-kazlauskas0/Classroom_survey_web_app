-- =====================================================================
-- Classroom Survey — 001 Schema
-- Tables, relationships, indexes and triggers (docs/DATABASE.md §3–§6).
-- Run first. Safe to run on an empty Supabase project.
-- =====================================================================

-- ---------------------------------------------------------------------
-- surveys
-- ---------------------------------------------------------------------
create table public.surveys (
    id          uuid primary key default gen_random_uuid(),
    title       text not null check (length(btrim(title)) between 1 and 200),
    description text check (description is null or length(description) <= 1000),
    status      text not null default 'draft'
        check (status in ('draft', 'active', 'closed', 'archived')),
    public_slug text unique,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index surveys_status_idx on public.surveys (status);
create index surveys_created_at_idx on public.surveys (created_at desc);

-- Only one survey may be Active at any time (DATABASE.md §5).
create unique index only_one_active_survey
    on public.surveys ((status))
    where status = 'active';

-- ---------------------------------------------------------------------
-- questions  (a survey has many questions)
-- ---------------------------------------------------------------------
create table public.questions (
    id            uuid primary key default gen_random_uuid(),
    survey_id     uuid not null references public.surveys (id) on delete cascade,
    question_text text not null check (length(btrim(question_text)) between 1 and 500),
    question_type text not null
        check (question_type in ('multiple_choice', 'true_false')),
    position      integer not null check (position > 0),
    created_at    timestamptz not null default now(),
    unique (survey_id, position)
);

create index questions_survey_id_idx on public.questions (survey_id);

-- ---------------------------------------------------------------------
-- choices  (a question has many choices)
-- ---------------------------------------------------------------------
create table public.choices (
    id          uuid primary key default gen_random_uuid(),
    question_id uuid not null references public.questions (id) on delete cascade,
    choice_text text not null check (length(btrim(choice_text)) between 1 and 300),
    position    integer not null check (position > 0),
    created_at  timestamptz not null default now(),
    unique (question_id, position),
    -- Target for the composite foreign key on answers below.
    unique (id, question_id)
);

create index choices_question_id_idx on public.choices (question_id);

-- ---------------------------------------------------------------------
-- responses  (a survey has many responses; one per student submission)
-- ---------------------------------------------------------------------
create table public.responses (
    id              uuid primary key default gen_random_uuid(),
    survey_id       uuid not null references public.surveys (id) on delete cascade,
    anonymous_token text check (anonymous_token is null or length(anonymous_token) <= 200),
    submitted_at    timestamptz not null default now()
);

create index responses_survey_id_idx on public.responses (survey_id);
create index responses_submitted_at_idx on public.responses (submitted_at);

-- Duplicate-submission protection: one response per browser token per survey.
create unique index responses_unique_student_per_survey
    on public.responses (survey_id, anonymous_token)
    where anonymous_token is not null;

-- ---------------------------------------------------------------------
-- answers  (a response has many answers; one per question)
-- ---------------------------------------------------------------------
create table public.answers (
    id          uuid primary key default gen_random_uuid(),
    response_id uuid not null references public.responses (id) on delete cascade,
    question_id uuid not null references public.questions (id) on delete cascade,
    choice_id   uuid,
    text_answer text,
    created_at  timestamptz not null default now(),
    unique (response_id, question_id),
    -- The chosen choice must belong to the answered question.
    -- (If the choice is deleted, only choice_id is cleared.)
    foreign key (choice_id, question_id)
        references public.choices (id, question_id)
        on delete set null (choice_id)
);

create index answers_response_id_idx on public.answers (response_id);
create index answers_question_id_idx on public.answers (question_id);
create index answers_choice_id_idx on public.answers (choice_id);

-- =====================================================================
-- Triggers
-- =====================================================================

-- updated_at timestamp (DATABASE.md §4)
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger surveys_updated_at
before update on public.surveys
for each row
execute function public.update_updated_at_column();

-- Public slug: 8 random characters, unambiguous alphabet, unique,
-- non-sequential, generated when a survey is first activated (§6).
create or replace function public.generate_public_slug()
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
    alphabet constant text := '23456789abcdefghjkmnpqrstuvwxyz';
    bytes bytea;
    slug  text;
    -- Byte positions of a v4 UUID that are fully random (skip version/variant bytes).
    idx   int[] := array[0, 1, 2, 3, 4, 5, 10, 11];
    i     int;
begin
    loop
        bytes := uuid_send(gen_random_uuid());
        slug := '';
        foreach i in array idx loop
            slug := slug || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
        end loop;
        exit when not exists (select 1 from public.surveys where public_slug = slug);
    end loop;
    return slug;
end;
$$;

create or replace function public.surveys_assign_slug()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    if new.status = 'active' and new.public_slug is null then
        new.public_slug := public.generate_public_slug();
    end if;
    return new;
end;
$$;

create trigger surveys_assign_slug
before insert or update of status on public.surveys
for each row
execute function public.surveys_assign_slug();

-- An active survey must be closed before it can be deleted.
create or replace function public.surveys_prevent_active_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    if old.status = 'active' then
        raise exception 'INVALID_TRANSITION' using detail = 'Close the survey before deleting it.';
    end if;
    return old;
end;
$$;

create trigger surveys_prevent_active_delete
before delete on public.surveys
for each row
execute function public.surveys_prevent_active_delete();

-- Questions and choices may only change while their survey is a Draft,
-- so collected results can never be altered by later edits.
-- (Cascade deletes of a whole survey are allowed: the parent row is
-- already gone when the child rows are removed.)
create or replace function public.guard_survey_content()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
    v_survey_id uuid;
    v_status    text;
begin
    if tg_table_name = 'questions' then
        v_survey_id := coalesce(new.survey_id, old.survey_id);
        if tg_op = 'UPDATE' and new.survey_id <> old.survey_id then
            raise exception 'SURVEY_NOT_EDITABLE';
        end if;
    else
        select q.survey_id into v_survey_id
        from public.questions q
        where q.id = coalesce(new.question_id, old.question_id);
        if tg_op = 'UPDATE' and new.question_id <> old.question_id then
            raise exception 'SURVEY_NOT_EDITABLE';
        end if;
    end if;

    select s.status into v_status from public.surveys s where s.id = v_survey_id;
    if v_status is not null and v_status <> 'draft' then
        raise exception 'SURVEY_NOT_EDITABLE';
    end if;

    return coalesce(new, old);
end;
$$;

create trigger questions_guard_content
before insert or update or delete on public.questions
for each row
execute function public.guard_survey_content();

create trigger choices_guard_content
before insert or update or delete on public.choices
for each row
execute function public.guard_survey_content();
