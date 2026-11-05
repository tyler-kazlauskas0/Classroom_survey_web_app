-- =====================================================================
-- Classroom Survey — inspect stored data (Database Verification)
--
-- Run these one at a time in the Supabase SQL Editor (select a query and
-- press Run) after using the app, to show that data is really stored.
-- Read-only.
-- =====================================================================

-- 1. Creating a survey stores its information in the database.
select s.id, s.title, s.status, s.public_slug, u.email as owner, s.created_at, s.updated_at
from surveys s
left join auth.users u on u.id = s.owner_id
order by s.created_at desc;

-- 2. Adding questions creates corresponding records (with their choices).
select s.title as survey, q.position, q.question_type, q.question_text,
       c.position as choice_pos, c.choice_text
from surveys s
join questions q on q.survey_id = s.id
join choices c on c.question_id = q.id
order by s.created_at desc, q.position, c.position;

-- 3. Student submissions are stored persistently.
select s.title as survey, r.id as response_id, r.submitted_at,
       q.question_text, c.choice_text as answer
from responses r
join surveys s on s.id = r.survey_id
join answers a on a.response_id = r.id
join questions q on q.id = a.question_id
left join choices c on c.id = a.choice_id
order by r.submitted_at desc, q.position;

-- 4. Survey results can be retrieved from the database
--    (same function the Results page uses; replace the title).
select get_survey_results(id) as results
from surveys
where title = 'Recursion Concept Check';

-- 5. Row counts per table.
select 'surveys' as table_name, count(*) from surveys
union all select 'questions', count(*) from questions
union all select 'choices', count(*) from choices
union all select 'responses', count(*) from responses
union all select 'answers', count(*) from answers;

-- 6. Row Level Security is enabled on every table.
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('surveys', 'questions', 'choices', 'responses', 'answers');
