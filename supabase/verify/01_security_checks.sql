-- =====================================================================
-- Classroom Survey — security and behaviour checks
--
-- Run in the Supabase SQL Editor AFTER the three migrations.
-- It acts as an anonymous student (role anon) and as the instructor
-- (role authenticated), checks what each can and cannot do, and then
-- ROLLS BACK every change it made: your real data is not modified.
--
-- Expected result: a table where every row says PASS.
-- =====================================================================
create temp table if not exists _checks (n serial, check_name text, result text, detail text);
truncate _checks;

do $$
declare
    r          text[] := '{}';   -- survives the rollback below
    v_id       uuid;
    v_draft    uuid;
    v_slug     text;
    v_json     jsonb;
    v_q1       uuid;
    v_q2       uuid;
    v_c1       uuid;
    v_c_other  uuid;
    v_tf       uuid;
    v_n        int;
    v_ok       boolean;
    v_err      text;
    -- Two throw-away instructor identities (no real accounts are touched).
    v_a        uuid := gen_random_uuid();
    v_b        uuid := gen_random_uuid();
    v_b_survey uuid;
    v_rows     int;
    v_denied   text[] := array[
        ['read responses',                 'select count(*) from public.responses'],
        ['read answers',                   'select count(*) from public.answers'],
        ['insert responses directly',      'insert into public.responses (survey_id) values ('':sid'')'],
        ['insert answers directly',        'insert into public.answers (response_id, question_id) values (gen_random_uuid(), '':qid'')'],
        ['update surveys',                 'update public.surveys set title = ''hacked'''],
        ['delete surveys',                 'delete from public.surveys'],
        ['create surveys',                 'insert into public.surveys (title) values (''x'')'],
        ['update choices',                 'update public.choices set choice_text = ''x'''],
        ['view results (get_survey_results)', 'select public.get_survey_results('':sid'')'],
        ['activate a survey',              'select public.activate_survey('':did'')'],
        ['close a survey',                 'select public.close_survey('':sid'')'],
        ['save a survey',                  'select public.save_survey(null, ''x'', null, ''[]'')'],
        ['duplicate a survey',             'select public.duplicate_survey('':sid'')']
    ];
begin
    begin  -- everything in this block is rolled back at the end

        -- ============== Instructor (authenticated) =====================
        perform set_config('role', 'authenticated', true);
        perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);

        v_id := public.save_survey(null, '__verify__ Recursion', 'check', '[
            {"question_text":"What is required?","question_type":"multiple_choice",
             "choices":[{"choice_text":"A base case"},{"choice_text":"A loop"},{"choice_text":"A pointer"}]},
            {"question_text":"Recursion needs a stopping condition.","question_type":"true_false","choices":[]}
        ]'::jsonb);
        select count(*) into v_n from public.surveys where id = v_id and status = 'draft';
        r := r || array['Instructor: creating a survey stores a Draft row', (v_n = 1)::text, ''];

        select count(*) into v_n from public.questions where survey_id = v_id;
        r := r || array['Instructor: questions are stored', (v_n = 2)::text, v_n || ' questions'];

        select count(*) into v_n from public.choices c join public.questions q on q.id = c.question_id
        where q.survey_id = v_id;
        r := r || array['Instructor: choices are stored (True/False gets 2)', (v_n = 5)::text, v_n || ' choices'];

        v_draft := public.save_survey(null, '__verify__ Draft only', null,
            '[{"question_text":"Q","question_type":"true_false"}]'::jsonb);

        v_json := public.activate_survey(v_id);
        v_slug := v_json ->> 'public_slug';
        r := r || array['Instructor: activation sets Active and an 8-char slug',
                        (v_json ->> 'status' = 'active' and v_slug ~ '^[2-9a-z]{8}$')::text, coalesce(v_slug, 'null')];

        select count(*) into v_n from public.surveys where status = 'active';
        r := r || array['Instructor: only one of their surveys is Active', (v_n = 1)::text, ''];

        begin
            perform public.save_survey(v_id, 'x', null, '[]'::jsonb);
            r := r || array['Instructor: Active survey cannot be edited', 'false', 'save succeeded'];
        exception when others then
            r := r || array['Instructor: Active survey cannot be edited', (sqlerrm = 'SURVEY_NOT_EDITABLE')::text, sqlerrm];
        end;

        begin
            insert into public.questions (survey_id, question_text, question_type, position)
            values (v_id, 'sneaky', 'true_false', 99);
            r := r || array['Instructor: questions of an Active survey cannot be changed directly', 'false', 'insert succeeded'];
        exception when others then
            r := r || array['Instructor: questions of an Active survey cannot be changed directly',
                            (sqlerrm = 'SURVEY_NOT_EDITABLE')::text, sqlerrm];
        end;

        select id into v_q1 from public.questions where survey_id = v_id and position = 1;
        select id into v_q2 from public.questions where survey_id = v_id and position = 2;
        select id into v_c1 from public.choices where question_id = v_q1 and position = 1;
        select id into v_tf from public.choices where question_id = v_q2 and position = 1;
        select id into v_c_other from public.choices where question_id = v_q2 and position = 2;

        -- ============== Student (anon) =================================
        perform set_config('role', 'anon', true);
        perform set_config('request.jwt.claims', '{"role":"anon"}', true);

        select count(*) into v_n from public.surveys where id in (v_id, v_draft);
        r := r || array['Student: can read only the Active survey (not drafts)', (v_n = 1)::text, v_n || ' visible'];

        select count(*) into v_n from public.questions where survey_id = v_draft;
        r := r || array['Student: cannot read questions of a Draft survey', (v_n = 0)::text, ''];

        v_json := public.get_public_survey(v_slug);
        r := r || array['Student: get_public_survey returns the active survey',
                        (v_json ->> 'status' = 'active'
                         and jsonb_array_length(v_json -> 'data' -> 'questions') = 2)::text, ''];

        v_json := public.get_public_survey('nosuchslug');
        r := r || array['Student: unknown link reports not_found', (v_json ->> 'status' = 'not_found')::text, ''];

        v_json := public.submit_survey_response(v_id, 'verify-token-1', jsonb_build_array(
            jsonb_build_object('question_id', v_q1, 'choice_id', v_c1),
            jsonb_build_object('question_id', v_q2, 'choice_id', v_tf)));
        r := r || array['Student: submission is stored', (v_json ->> 'success' = 'true')::text, ''];

        foreach v_err in array array['DUPLICATE_RESPONSE', 'INVALID_CHOICE', 'MISSING_REQUIRED_ANSWER', 'INVALID_QUESTION'] loop
            begin
                if v_err = 'DUPLICATE_RESPONSE' then
                    perform public.submit_survey_response(v_id, 'verify-token-1', jsonb_build_array(
                        jsonb_build_object('question_id', v_q1, 'choice_id', v_c1),
                        jsonb_build_object('question_id', v_q2, 'choice_id', v_tf)));
                elsif v_err = 'INVALID_CHOICE' then   -- choice from another question
                    perform public.submit_survey_response(v_id, 'verify-token-2', jsonb_build_array(
                        jsonb_build_object('question_id', v_q1, 'choice_id', v_c_other),
                        jsonb_build_object('question_id', v_q2, 'choice_id', v_tf)));
                elsif v_err = 'MISSING_REQUIRED_ANSWER' then
                    perform public.submit_survey_response(v_id, 'verify-token-2', jsonb_build_array(
                        jsonb_build_object('question_id', v_q1, 'choice_id', v_c1)));
                else
                    perform public.submit_survey_response(v_id, 'verify-token-2', jsonb_build_array(
                        jsonb_build_object('question_id', gen_random_uuid(), 'choice_id', v_c1)));
                end if;
                r := r || array['Student: rejected with ' || v_err, 'false', 'call succeeded'];
            exception when others then
                r := r || array['Student: rejected with ' || v_err, (sqlerrm = v_err)::text, sqlerrm];
            end;
        end loop;

        -- Students must not see results or modify anything.
        -- Students must not see results or modify anything: {label, sql} pairs.
        for i in 1 .. array_length(v_denied, 1) loop
            v_denied[i][2] := replace(replace(v_denied[i][2], ':sid', v_id::text), ':qid', v_q1::text);
            v_denied[i][2] := replace(v_denied[i][2], ':did', v_draft::text);
        end loop;
        for i in 1 .. array_length(v_denied, 1) loop
            begin
                execute v_denied[i][2];
                r := r || array['Student: cannot ' || v_denied[i][1], 'false', 'statement succeeded'];
            exception when insufficient_privilege then
                r := r || array['Student: cannot ' || v_denied[i][1], 'true', sqlerrm];
            end;
        end loop;

        -- ============== Another instructor (B) ==========================
        perform set_config('role', 'authenticated', true);
        perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);

        select count(*) into v_n from public.surveys where id in (v_id, v_draft);
        r := r || array['Other instructor: cannot see another instructor''s surveys', (v_n = 0)::text, v_n || ' visible'];

        select count(*) into v_n from public.responses where survey_id = v_id;
        r := r || array['Other instructor: cannot see another instructor''s responses', (v_n = 0)::text, ''];

        select count(*) into v_n from public.questions where survey_id in (v_id, v_draft);
        r := r || array['Other instructor: cannot see another instructor''s questions', (v_n = 0)::text, ''];

        v_json := public.get_survey_results(v_id);
        r := r || array['Other instructor: get_survey_results returns nothing', (v_json is null)::text, coalesce(v_json::text, 'null')];

        update public.surveys set title = 'hijacked' where id in (v_id, v_draft);
        get diagnostics v_rows = row_count;
        r := r || array['Other instructor: cannot rename another instructor''s survey', (v_rows = 0)::text, v_rows || ' rows'];

        delete from public.surveys where id in (v_id, v_draft);
        get diagnostics v_rows = row_count;
        r := r || array['Other instructor: cannot delete another instructor''s survey', (v_rows = 0)::text, v_rows || ' rows'];

        foreach v_err in array array['save', 'activate', 'close', 'duplicate', 'archive'] loop
            begin
                case v_err
                    when 'save' then perform public.save_survey(v_draft, 'x', null, '[]'::jsonb);
                    when 'activate' then perform public.activate_survey(v_draft);
                    when 'close' then perform public.close_survey(v_id);
                    when 'duplicate' then perform public.duplicate_survey(v_id);
                    else perform public.archive_survey(v_draft);
                end case;
                r := r || array['Other instructor: cannot ' || v_err || ' another instructor''s survey', 'false', 'call succeeded'];
            exception when others then
                r := r || array['Other instructor: cannot ' || v_err || ' another instructor''s survey',
                                (sqlerrm = 'SURVEY_NOT_FOUND')::text, sqlerrm];
            end;
        end loop;

        begin
            insert into public.questions (survey_id, question_text, question_type, position)
            values (v_draft, 'injected', 'true_false', 50);
            r := r || array['Other instructor: cannot add questions to another instructor''s survey', 'false', 'insert succeeded'];
        exception when others then
            r := r || array['Other instructor: cannot add questions to another instructor''s survey', 'true', sqlerrm];
        end;

        begin
            insert into public.surveys (title, owner_id) values ('impersonation', v_a);
            r := r || array['Other instructor: cannot create a survey owned by someone else', 'false', 'insert succeeded'];
        exception when others then
            r := r || array['Other instructor: cannot create a survey owned by someone else', 'true', sqlerrm];
        end;

        -- B can run their own survey at the same time as A.
        v_b_survey := public.save_survey(null, '__verify__ B survey', null,
            '[{"question_text":"Q","question_type":"true_false"}]'::jsonb);
        perform public.activate_survey(v_b_survey);
        select owner_id = v_b into v_ok from public.surveys where id = v_b_survey;
        r := r || array['Other instructor: new survey is owned by its creator', coalesce(v_ok, false)::text, ''];

        perform set_config('role', 'none', true);
        select count(*) into v_n from public.surveys where id in (v_id, v_b_survey) and status = 'active';
        r := r || array['Each instructor can have their own Active survey at the same time', (v_n = 2)::text, v_n || ' active'];

        -- ============== Instructor again ================================
        perform set_config('role', 'authenticated', true);
        perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);

        v_json := public.get_survey_results(v_id);
        r := r || array['Instructor: results retrieved from the database',
                        ((v_json ->> 'response_count')::int = 1
                         and (v_json -> 'questions' -> 0 -> 'choices' -> 0 ->> 'count')::int = 1
                         and (v_json -> 'questions' -> 0 -> 'choices' -> 0 ->> 'percentage')::numeric = 100)::text,
                        v_json ->> 'response_count' || ' response(s)'];

        select count(*) into v_n from public.answers a join public.responses rr on rr.id = a.response_id
        where rr.survey_id = v_id;
        r := r || array['Instructor: can read responses and answers', (v_n = 2)::text, v_n || ' answers'];

        begin
            update public.surveys set owner_id = v_b where id = v_draft;
            r := r || array['Instructor: cannot transfer a survey to someone else', 'false', 'update succeeded'];
        exception when others then
            r := r || array['Instructor: cannot transfer a survey to someone else', 'true', sqlerrm];
        end;

        perform public.close_survey(v_id);
        perform set_config('role', 'anon', true);
        perform set_config('request.jwt.claims', '{"role":"anon"}', true);
        begin
            perform public.submit_survey_response(v_id, 'verify-token-3', jsonb_build_array(
                jsonb_build_object('question_id', v_q1, 'choice_id', v_c1),
                jsonb_build_object('question_id', v_q2, 'choice_id', v_tf)));
            r := r || array['Student: submission fails after close', 'false', 'call succeeded'];
        exception when others then
            r := r || array['Student: submission fails after close', (sqlerrm = 'SURVEY_NOT_ACTIVE')::text, sqlerrm];
        end;
        v_json := public.get_public_survey(v_slug);
        r := r || array['Student: closed survey reports closed', (v_json ->> 'status' = 'closed')::text, ''];
        select count(*) into v_n from public.surveys where id = v_id;
        r := r || array['Student: closed survey is no longer readable', (v_n = 0)::text, ''];

        perform set_config('role', 'authenticated', true);
        perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
        v_id := public.duplicate_survey(v_id);
        select count(*) into v_n from public.questions where survey_id = v_id;
        r := r || array['Instructor: duplicate copies questions as a Draft',
                        (v_n = 2 and (select status from public.surveys where id = v_id) = 'draft')::text, ''];

        delete from public.surveys where title like '__verify__%';
        select count(*) into v_n from public.responses rr
        where not exists (select 1 from public.surveys s where s.id = rr.survey_id);
        r := r || array['Instructor: deleting a survey cascades to its data', (v_n = 0)::text, ''];

        raise exception 'VERIFY_ROLLBACK';
    exception when others then
        if sqlerrm <> 'VERIFY_ROLLBACK' then
            r := r || array['Script error (stopped early)', 'false', sqlerrm];
        end if;
    end;

    perform set_config('role', 'none', true);
    for i in 1 .. array_length(r, 1) / 3 loop
        insert into _checks (check_name, result, detail)
        values (r[i*3-2], case when r[i*3-1] = 'true' then 'PASS' else 'FAIL' end, r[i*3]);
    end loop;
end $$;

select check_name, result, detail from _checks order by n;
