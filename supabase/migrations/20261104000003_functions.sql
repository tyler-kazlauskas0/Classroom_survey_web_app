-- =====================================================================
-- Classroom Survey — 003 Database functions (RPCs)
-- (docs/API.md §6–§11, docs/PHASE1_REVIEW.md §1)
--
-- Errors are raised with a machine-readable code as the message
-- (e.g. 'SURVEY_NOT_ACTIVE'); the frontend maps them to friendly text.
--
-- Instructor functions are SECURITY INVOKER: they run with the caller's
-- privileges, so RLS still applies, and only `authenticated` may call them.
-- Student functions are SECURITY DEFINER so anonymous users never need
-- direct table access; they validate everything themselves.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Internal helper: replace a draft survey's questions/choices from JSON.
-- p_questions: [{question_text, question_type, choices: [{choice_text}]}]
-- ---------------------------------------------------------------------
create or replace function public._insert_survey_content(p_survey_id uuid, p_questions jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    q        jsonb;
    c        jsonb;
    q_pos    int;
    c_pos    int;
    q_type   text;
    q_text   text;
    c_text   text;
    q_id     uuid;
    v_choices jsonb;
begin
    if p_questions is null or jsonb_typeof(p_questions) <> 'array' then
        raise exception 'VALIDATION_ERROR' using detail = 'questions must be an array';
    end if;
    if jsonb_array_length(p_questions) > 100 then
        raise exception 'VALIDATION_ERROR' using detail = 'too many questions';
    end if;

    for q, q_pos in select value, ordinality from jsonb_array_elements(p_questions) with ordinality loop
        q_text := btrim(coalesce(q ->> 'question_text', ''));
        q_type := q ->> 'question_type';
        if q_text = '' then
            raise exception 'VALIDATION_ERROR' using detail = format('question %s: text is required', q_pos);
        end if;
        if q_type is null or q_type not in ('multiple_choice', 'true_false') then
            raise exception 'VALIDATION_ERROR' using detail = format('question %s: invalid type', q_pos);
        end if;

        insert into public.questions (survey_id, question_text, question_type, position)
        values (p_survey_id, q_text, q_type, q_pos)
        returning id into q_id;

        if q_type = 'true_false' then
            -- True/False always stores exactly these two choices.
            v_choices := '[{"choice_text":"True"},{"choice_text":"False"}]'::jsonb;
        else
            v_choices := q -> 'choices';
            if v_choices is null or jsonb_typeof(v_choices) <> 'array'
               or jsonb_array_length(v_choices) < 2 or jsonb_array_length(v_choices) > 10 then
                raise exception 'VALIDATION_ERROR'
                    using detail = format('question %s: needs 2 to 10 choices', q_pos);
            end if;
        end if;

        for c, c_pos in select value, ordinality from jsonb_array_elements(v_choices) with ordinality loop
            c_text := btrim(coalesce(c ->> 'choice_text', ''));
            if c_text = '' then
                raise exception 'VALIDATION_ERROR'
                    using detail = format('question %s choice %s: text is required', q_pos, c_pos);
            end if;
            insert into public.choices (question_id, choice_text, position)
            values (q_id, c_text, c_pos);
        end loop;
    end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- save_survey: create (p_survey_id = null) or replace a Draft survey.
-- Returns the survey id. Atomic: a failed save changes nothing.
-- ---------------------------------------------------------------------
create or replace function public.save_survey(
    p_survey_id   uuid,
    p_title       text,
    p_description text,
    p_questions   jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_id     uuid;
    v_status text;
    v_title  text := btrim(coalesce(p_title, ''));
    v_desc   text := nullif(btrim(coalesce(p_description, '')), '');
begin
    if v_title = '' then
        raise exception 'VALIDATION_ERROR' using detail = 'title is required';
    end if;

    if p_survey_id is null then
        insert into public.surveys (title, description)
        values (v_title, v_desc)
        returning id into v_id;
    else
        select status into v_status from public.surveys where id = p_survey_id for update;
        if not found then
            raise exception 'SURVEY_NOT_FOUND';
        end if;
        if v_status <> 'draft' then
            raise exception 'SURVEY_NOT_EDITABLE';
        end if;
        update public.surveys set title = v_title, description = v_desc where id = p_survey_id;
        delete from public.questions where survey_id = p_survey_id;
        v_id := p_survey_id;
    end if;

    perform public._insert_survey_content(v_id, p_questions);
    return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- activate_survey (API §7): close any active survey, assign a slug if
-- needed, activate this one. Returns the survey row as JSON.
-- ---------------------------------------------------------------------
create or replace function public.activate_survey(p_survey_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_survey public.surveys;
begin
    -- Serialise concurrent activations so the one-active rule never races.
    perform pg_advisory_xact_lock(hashtext('classroom_survey.activate'));

    select * into v_survey from public.surveys where id = p_survey_id for update;
    if not found then
        raise exception 'SURVEY_NOT_FOUND';
    end if;
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
    where status = 'active' and id <> p_survey_id;

    update public.surveys set status = 'active'
    where id = p_survey_id
    returning * into v_survey;   -- trigger assigns public_slug if missing

    return to_jsonb(v_survey);
end;
$$;

-- ---------------------------------------------------------------------
-- close_survey (API §8). Submissions fail immediately afterwards.
-- ---------------------------------------------------------------------
create or replace function public.close_survey(p_survey_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_status text;
begin
    select status into v_status from public.surveys where id = p_survey_id for update;
    if not found then
        raise exception 'SURVEY_NOT_FOUND';
    end if;
    if v_status <> 'active' then
        raise exception 'INVALID_TRANSITION' using detail = 'Only an active survey can be closed.';
    end if;
    update public.surveys set status = 'closed' where id = p_survey_id;
end;
$$;

-- ---------------------------------------------------------------------
-- archive_survey / unarchive_survey
-- ---------------------------------------------------------------------
create or replace function public.archive_survey(p_survey_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_status text;
begin
    select status into v_status from public.surveys where id = p_survey_id for update;
    if not found then
        raise exception 'SURVEY_NOT_FOUND';
    end if;
    if v_status not in ('draft', 'closed') then
        raise exception 'INVALID_TRANSITION' using detail = 'Only draft or closed surveys can be archived.';
    end if;
    update public.surveys set status = 'archived' where id = p_survey_id;
end;
$$;

create or replace function public.unarchive_survey(p_survey_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_survey public.surveys;
begin
    select * into v_survey from public.surveys where id = p_survey_id for update;
    if not found then
        raise exception 'SURVEY_NOT_FOUND';
    end if;
    if v_survey.status <> 'archived' then
        raise exception 'INVALID_TRANSITION';
    end if;
    -- Never-activated surveys return to Draft (still editable); others to Closed.
    update public.surveys
    set status = case when v_survey.public_slug is null then 'draft' else 'closed' end
    where id = p_survey_id;
end;
$$;

-- ---------------------------------------------------------------------
-- duplicate_survey (API §6): Draft copy of survey/questions/choices,
-- no responses. Returns the new survey id.
-- ---------------------------------------------------------------------
create or replace function public.duplicate_survey(p_survey_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_src   public.surveys;
    v_new   uuid;
    v_q     record;
    v_new_q uuid;
begin
    select * into v_src from public.surveys where id = p_survey_id;
    if not found then
        raise exception 'SURVEY_NOT_FOUND';
    end if;

    insert into public.surveys (title, description, status)
    values (left('Copy of ' || v_src.title, 200), v_src.description, 'draft')
    returning id into v_new;

    for v_q in select * from public.questions where survey_id = p_survey_id order by position loop
        insert into public.questions (survey_id, question_text, question_type, position)
        values (v_new, v_q.question_text, v_q.question_type, v_q.position)
        returning id into v_new_q;

        insert into public.choices (question_id, choice_text, position)
        select v_new_q, choice_text, position
        from public.choices
        where question_id = v_q.id
        order by position;
    end loop;

    return v_new;
end;
$$;

-- ---------------------------------------------------------------------
-- get_survey_results (API §11). Instructor only.
-- Percentages are relative to the answers to each question, 1 decimal.
-- ---------------------------------------------------------------------
create or replace function public.get_survey_results(p_survey_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
    with q as (
        select id, question_text, question_type, position
        from public.questions
        where survey_id = p_survey_id
    ),
    choice_counts as (
        select c.question_id, c.id as choice_id, c.choice_text, c.position,
               count(a.id) as cnt
        from public.choices c
        join q on q.id = c.question_id
        left join public.answers a on a.choice_id = c.id
        group by c.question_id, c.id, c.choice_text, c.position
    ),
    question_totals as (
        select q.id as question_id, count(a.id) as total
        from q
        left join public.answers a on a.question_id = q.id
        group by q.id
    )
    select jsonb_build_object(
        'survey_id', s.id,
        'response_count', (select count(*) from public.responses r where r.survey_id = s.id),
        'questions', coalesce((
            select jsonb_agg(
                jsonb_build_object(
                    'question_id', q.id,
                    'question_text', q.question_text,
                    'question_type', q.question_type,
                    'response_count', qt.total,
                    'choices', coalesce((
                        select jsonb_agg(
                            jsonb_build_object(
                                'choice_id', cc.choice_id,
                                'choice_text', cc.choice_text,
                                'count', cc.cnt,
                                'percentage', case when qt.total = 0 then 0
                                                   else round(cc.cnt * 100.0 / qt.total, 1) end
                            ) order by cc.position)
                        from choice_counts cc
                        where cc.question_id = q.id
                    ), '[]'::jsonb)
                ) order by q.position)
            from q
            join question_totals qt on qt.question_id = q.id
        ), '[]'::jsonb)
    )
    from public.surveys s
    where s.id = p_survey_id;
$$;

-- ---------------------------------------------------------------------
-- get_public_survey (API §9). Anonymous. Resolves a slug.
-- Returns {status:'not_found'} | {status:'closed'} |
--         {status:'active', data:{survey, questions[choices]}}
-- Never returns response data.
-- ---------------------------------------------------------------------
create or replace function public.get_public_survey(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    v_survey public.surveys;
begin
    select * into v_survey from public.surveys where public_slug = p_slug;
    if not found then
        return jsonb_build_object('status', 'not_found');
    end if;
    if v_survey.status <> 'active' then
        return jsonb_build_object('status', 'closed');
    end if;

    return jsonb_build_object(
        'status', 'active',
        'data', jsonb_build_object(
            'survey', jsonb_build_object(
                'id', v_survey.id,
                'title', v_survey.title,
                'description', v_survey.description
            ),
            'questions', coalesce((
                select jsonb_agg(
                    jsonb_build_object(
                        'id', q.id,
                        'question_text', q.question_text,
                        'question_type', q.question_type,
                        'position', q.position,
                        'choices', coalesce((
                            select jsonb_agg(
                                jsonb_build_object(
                                    'id', c.id,
                                    'choice_text', c.choice_text,
                                    'position', c.position
                                ) order by c.position)
                            from public.choices c
                            where c.question_id = q.id
                        ), '[]'::jsonb)
                    ) order by q.position)
                from public.questions q
                where q.survey_id = v_survey.id
            ), '[]'::jsonb)
        )
    );
end;
$$;

-- ---------------------------------------------------------------------
-- submit_survey_response (API §10, DATABASE.md §9, §11). Anonymous.
-- Validates and inserts the response and all answers in one transaction.
-- ---------------------------------------------------------------------
create or replace function public.submit_survey_response(
    p_survey_id       uuid,
    p_anonymous_token text,
    p_answers         jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
    uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
    v_status      text;
    v_response_id uuid;
    v_token       text := nullif(btrim(coalesce(p_anonymous_token, '')), '');
    a             jsonb;
    v_qid         uuid;
    v_cid         uuid;
    v_seen        uuid[] := '{}';
begin
    -- FOR SHARE blocks a concurrent close_survey until this commits, and
    -- makes this submission fail if the survey was closed first.
    select status into v_status from public.surveys where id = p_survey_id for share;
    if not found or v_status <> 'active' then
        raise exception 'SURVEY_NOT_ACTIVE';
    end if;

    if v_token is null or length(v_token) > 200 then
        raise exception 'VALIDATION_ERROR' using detail = 'anonymous token is required';
    end if;
    if p_answers is null or jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) > 100 then
        raise exception 'VALIDATION_ERROR' using detail = 'answers must be an array';
    end if;

    if exists (select 1 from public.responses
               where survey_id = p_survey_id and anonymous_token = v_token) then
        raise exception 'DUPLICATE_RESPONSE';
    end if;

    -- Validate every answer before writing anything.
    for a in select value from jsonb_array_elements(p_answers) loop
        if coalesce(a ->> 'question_id', '') !~ uuid_re then
            raise exception 'INVALID_QUESTION';
        end if;
        v_qid := (a ->> 'question_id')::uuid;
        if v_qid = any (v_seen)
           or not exists (select 1 from public.questions where id = v_qid and survey_id = p_survey_id) then
            raise exception 'INVALID_QUESTION';
        end if;
        v_seen := v_seen || v_qid;

        if coalesce(a ->> 'choice_id', '') !~ uuid_re then
            raise exception 'INVALID_CHOICE';
        end if;
        v_cid := (a ->> 'choice_id')::uuid;
        if not exists (select 1 from public.choices where id = v_cid and question_id = v_qid) then
            raise exception 'INVALID_CHOICE';
        end if;
    end loop;

    -- Every question is required in V1.
    if exists (select 1 from public.questions
               where survey_id = p_survey_id and not (id = any (v_seen))) then
        raise exception 'MISSING_REQUIRED_ANSWER';
    end if;

    begin
        insert into public.responses (survey_id, anonymous_token)
        values (p_survey_id, v_token)
        returning id into v_response_id;
    exception when unique_violation then
        -- Two simultaneous submits from the same browser.
        raise exception 'DUPLICATE_RESPONSE';
    end;

    insert into public.answers (response_id, question_id, choice_id)
    select v_response_id, (value ->> 'question_id')::uuid, (value ->> 'choice_id')::uuid
    from jsonb_array_elements(p_answers);

    return jsonb_build_object('success', true, 'response_id', v_response_id);
end;
$$;

-- =====================================================================
-- Function privileges. Supabase grants EXECUTE on new functions to
-- anon and authenticated by default; restrict to the intended callers.
-- =====================================================================
revoke execute on all functions in schema public from public, anon, authenticated;

-- Students (and instructors previewing the student page)
grant execute on function public.get_public_survey(text)                     to anon, authenticated;
grant execute on function public.submit_survey_response(uuid, text, jsonb)   to anon, authenticated;

-- Instructor only
grant execute on function public.save_survey(uuid, text, text, jsonb)        to authenticated;
grant execute on function public._insert_survey_content(uuid, jsonb)         to authenticated;
grant execute on function public.activate_survey(uuid)                       to authenticated;
grant execute on function public.close_survey(uuid)                          to authenticated;
grant execute on function public.archive_survey(uuid)                        to authenticated;
grant execute on function public.unarchive_survey(uuid)                      to authenticated;
grant execute on function public.duplicate_survey(uuid)                      to authenticated;
grant execute on function public.get_survey_results(uuid)                    to authenticated;
-- Called from the slug trigger while an instructor activates a survey.
grant execute on function public.generate_public_slug()                      to authenticated;
