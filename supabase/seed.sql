-- Optional sample data: one Draft survey to try the app with.
-- Run in the Supabase SQL Editor after the migrations. Safe to skip.
-- The survey is given to the oldest instructor account (create one first).
begin;
select set_config(
    'request.jwt.claims',
    json_build_object('sub', (select id from auth.users order by created_at limit 1))::text,
    true
);
select save_survey(
    null,
    'Recursion Concept Check',
    'Quick understanding check',
    '[
      {"question_text": "What is required for a recursive function?",
       "question_type": "multiple_choice",
       "choices": [{"choice_text": "A base case"}, {"choice_text": "A pointer"},
                   {"choice_text": "A loop"}, {"choice_text": "A compiler"}]},
      {"question_text": "Every recursive function needs a stopping condition.",
       "question_type": "true_false"}
    ]'::jsonb
) as new_survey_id;
commit;
