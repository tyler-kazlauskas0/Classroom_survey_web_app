# Classroom Survey Web App — Database Design

## Overview

The application uses PostgreSQL through Supabase.

The database stores surveys, questions, answer choices, student submissions, and individual answers.

Students are anonymous. Instructor access is handled through Supabase Auth.

---

# 1. Entity Relationships

```text
surveys
  |
  +---- questions
          |
          +---- choices

surveys
  |
  +---- responses
          |
          +---- answers
                  |
                  +---- questions
                  |
                  +---- choices
```

---

# 2. Survey Status

Allowed values:

```text
draft
active
closed
archived
```

Only one survey should be Active at a time.

---

# 3. Tables

## surveys

Stores survey metadata.

```sql
create table surveys (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    description text,
    status text not null default 'draft'
        check (status in ('draft', 'active', 'closed', 'archived')),
    public_slug text unique,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
```

Recommended index:

```sql
create index surveys_status_idx on surveys(status);
```

---

## questions

Stores questions belonging to surveys.

```sql
create table questions (
    id uuid primary key default gen_random_uuid(),
    survey_id uuid not null references surveys(id) on delete cascade,
    question_text text not null,
    question_type text not null
        check (question_type in ('multiple_choice', 'true_false')),
    position integer not null,
    created_at timestamptz not null default now()
);
```

Recommended index:

```sql
create index questions_survey_id_idx
on questions(survey_id);
```

---

## choices

Stores answer choices.

```sql
create table choices (
    id uuid primary key default gen_random_uuid(),
    question_id uuid not null references questions(id) on delete cascade,
    choice_text text not null,
    position integer not null,
    created_at timestamptz not null default now()
);
```

Recommended index:

```sql
create index choices_question_id_idx
on choices(question_id);
```

---

## responses

Stores one student submission.

```sql
create table responses (
    id uuid primary key default gen_random_uuid(),
    survey_id uuid not null references surveys(id) on delete cascade,
    anonymous_token text,
    submitted_at timestamptz not null default now()
);
```

Recommended indexes:

```sql
create index responses_survey_id_idx
on responses(survey_id);

create index responses_submitted_at_idx
on responses(submitted_at);
```

Optional duplicate-prevention constraint:

```sql
create unique index responses_unique_student_per_survey
on responses(survey_id, anonymous_token)
where anonymous_token is not null;
```

---

## answers

Stores one answer to one question.

```sql
create table answers (
    id uuid primary key default gen_random_uuid(),
    response_id uuid not null references responses(id) on delete cascade,
    question_id uuid not null references questions(id) on delete cascade,
    choice_id uuid references choices(id) on delete set null,
    text_answer text,
    created_at timestamptz not null default now(),
    unique(response_id, question_id)
);
```

Recommended indexes:

```sql
create index answers_response_id_idx
on answers(response_id);

create index answers_question_id_idx
on answers(question_id);

create index answers_choice_id_idx
on answers(choice_id);
```

---

# 4. Updated Timestamp

Create a trigger function:

```sql
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;
```

Apply it:

```sql
create trigger surveys_updated_at
before update on surveys
for each row
execute function update_updated_at_column();
```

---

# 5. Enforcing One Active Survey

A partial unique index can enforce that only one row has status `active`.

```sql
create unique index only_one_active_survey
on surveys ((status))
where status = 'active';
```

Activation should ideally happen in a transaction or database function that:

1. closes the currently active survey;
2. activates the selected survey.

---

# 6. Public Slugs

Each survey may have a short public identifier.

Example:

```text
x7kf2q
```

Public route:

```text
/s/x7kf2q
```

The slug should be:

- unique;
- non-sequential;
- difficult to guess;
- generated when the survey is activated.

UUIDs may also be used directly for the first version.

---

# 7. Row Level Security

Enable RLS:

```sql
alter table surveys enable row level security;
alter table questions enable row level security;
alter table choices enable row level security;
alter table responses enable row level security;
alter table answers enable row level security;
```

---

# 8. Public Student Permissions

Anonymous students should be able to read only Active surveys.

Conceptual policy:

```sql
create policy "students read active surveys"
on surveys
for select
to anon
using (status = 'active');
```

Students should be able to read questions only if their survey is active.

```sql
create policy "students read active survey questions"
on questions
for select
to anon
using (
    exists (
        select 1
        from surveys
        where surveys.id = questions.survey_id
        and surveys.status = 'active'
    )
);
```

Students should be able to read choices only for active surveys.

```sql
create policy "students read active survey choices"
on choices
for select
to anon
using (
    exists (
        select 1
        from questions
        join surveys on surveys.id = questions.survey_id
        where questions.id = choices.question_id
        and surveys.status = 'active'
    )
);
```

---

# 9. Student Submission Permissions

Anonymous users need INSERT access to responses and answers.

For production, prefer a Supabase RPC/database function for survey submission so validation and insertion happen atomically.

The function should:

- verify the survey is Active;
- verify every question belongs to the survey;
- verify every selected choice belongs to its question;
- reject duplicate submissions;
- create the response;
- create all answers;
- return the response ID.

This is safer than allowing unrestricted anonymous inserts.

---

# 10. Instructor Permissions

Authenticated instructor users should be able to:

- read all surveys;
- create surveys;
- edit surveys;
- delete surveys;
- read all responses;
- export all data.

For an initial single-instructor deployment, policies may grant these actions to any authenticated user.

Example:

```sql
create policy "authenticated users manage surveys"
on surveys
for all
to authenticated
using (true)
with check (true);
```

Equivalent authenticated policies should be applied to the other tables.

---

# 11. Recommended Submission RPC

Possible function signature:

```sql
submit_survey_response(
    p_survey_id uuid,
    p_anonymous_token text,
    p_answers jsonb
)
```

Example answer payload:

```json
[
  {
    "question_id": "uuid",
    "choice_id": "uuid"
  }
]
```

The function should execute inside one database transaction.

---

# 12. Results Queries

Total responses:

```sql
select count(*)
from responses
where survey_id = :survey_id;
```

Choice totals:

```sql
select
    q.id as question_id,
    q.question_text,
    c.id as choice_id,
    c.choice_text,
    count(a.id) as answer_count
from questions q
join choices c on c.question_id = q.id
left join answers a on a.choice_id = c.id
where q.survey_id = :survey_id
group by q.id, q.question_text, c.id, c.choice_text, c.position
order by q.position, c.position;
```

---

# 13. Data Retention

Survey responses should not be automatically deleted.

Deleting a survey should delete:

- questions;
- choices;
- responses;
- answers.

Because of this, the UI should strongly encourage Archive instead of Delete for surveys that already have responses.

---

# 14. Future Schema Extensions

Possible future tables:

```text
courses
semesters
question_bank
instructors
survey_instructors
tags
```

These are intentionally excluded from Version 1.
