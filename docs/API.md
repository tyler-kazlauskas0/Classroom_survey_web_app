# Classroom Survey Web App — API and Data Access Specification

## Overview

The application uses Supabase as its backend.

For most instructor operations, the React frontend may use the Supabase JavaScript client directly.

For anonymous student submissions, use a database RPC function so that validation and insertion occur safely in one transaction.

---

# 1. Authentication

Supabase Auth handles instructor authentication.

Required operations:

```text
signInWithPassword
signOut
getSession
onAuthStateChange
```

Students do not authenticate.

---

# 2. Survey Data Model

Example survey object:

```json
{
  "id": "uuid",
  "title": "Recursion Concept Check",
  "description": "Quick in-class survey",
  "status": "active",
  "public_slug": "x7kf2q",
  "created_at": "2026-08-17T12:00:00Z",
  "updated_at": "2026-08-17T12:05:00Z"
}
```

---

# 3. Question Data Model

```json
{
  "id": "uuid",
  "survey_id": "uuid",
  "question_text": "What is required for a recursive function?",
  "question_type": "multiple_choice",
  "position": 1
}
```

---

# 4. Choice Data Model

```json
{
  "id": "uuid",
  "question_id": "uuid",
  "choice_text": "A base case",
  "position": 1
}
```

---

# 5. Response Data Model

```json
{
  "id": "uuid",
  "survey_id": "uuid",
  "anonymous_token": "browser-token",
  "submitted_at": "2026-08-17T12:10:00Z"
}
```

---

# 6. Instructor Operations

## List Surveys

Purpose:

Load the instructor dashboard.

Supabase query:

```ts
supabase
  .from("surveys")
  .select("*")
  .order("created_at", { ascending: false })
```

---

## Get Survey

Purpose:

Load one survey and its questions/choices.

Expected result:

```json
{
  "id": "uuid",
  "title": "Recursion Concept Check",
  "questions": [
    {
      "id": "uuid",
      "question_text": "What is recursion?",
      "question_type": "multiple_choice",
      "position": 1,
      "choices": []
    }
  ]
}
```

---

## Create Survey

Input:

```json
{
  "title": "Recursion Concept Check",
  "description": "In-class poll"
}
```

Initial status:

```text
draft
```

---

## Update Survey

Allowed fields:

```text
title
description
status
public_slug
```

---

## Delete Survey

Deletion cascades to:

- questions;
- choices;
- responses;
- answers.

The UI should ask for confirmation.

---

## Duplicate Survey

Duplication is implemented in application logic or an RPC.

Steps:

1. create a new Draft survey;
2. copy all questions;
3. copy all choices;
4. do not copy responses;
5. redirect to the editor.

---

# 7. Activation API

Recommended database RPC:

```text
activate_survey(p_survey_id uuid)
```

Responsibilities:

1. close any existing Active survey;
2. create a public slug if needed;
3. change the requested survey to Active;
4. return the survey and public slug.

Example output:

```json
{
  "id": "uuid",
  "status": "active",
  "public_slug": "x7kf2q"
}
```

---

# 8. Close Survey API

Recommended RPC:

```text
close_survey(p_survey_id uuid)
```

Result:

```text
status = closed
```

Student submissions must fail immediately after closing.

---

# 9. Public Student Survey

Route:

```text
/s/:slug
```

The frontend resolves the slug to an Active survey.

Needed data:

```json
{
  "survey": {
    "id": "uuid",
    "title": "Recursion Concept Check",
    "description": "Quick check"
  },
  "questions": [
    {
      "id": "uuid",
      "question_text": "What is required for recursion?",
      "question_type": "multiple_choice",
      "position": 1,
      "choices": [
        {
          "id": "uuid",
          "choice_text": "A base case",
          "position": 1
        }
      ]
    }
  ]
}
```

No response data is returned to anonymous users.

---

# 10. Student Submission API

Recommended RPC:

```text
submit_survey_response
```

Input:

```json
{
  "p_survey_id": "uuid",
  "p_anonymous_token": "random-browser-token",
  "p_answers": [
    {
      "question_id": "uuid",
      "choice_id": "uuid"
    }
  ]
}
```

Success response:

```json
{
  "success": true,
  "response_id": "uuid"
}
```

Possible errors:

```text
SURVEY_NOT_ACTIVE
DUPLICATE_RESPONSE
INVALID_QUESTION
INVALID_CHOICE
MISSING_REQUIRED_ANSWER
```

The frontend should map database errors to friendly user messages.

---

# 11. Results API

Instructor-only.

Required data:

```json
{
  "survey_id": "uuid",
  "response_count": 52,
  "questions": [
    {
      "question_id": "uuid",
      "question_text": "What is required for recursion?",
      "response_count": 52,
      "choices": [
        {
          "choice_id": "uuid",
          "choice_text": "A base case",
          "count": 45,
          "percentage": 86.5
        }
      ]
    }
  ]
}
```

This may be computed:

- in React;
- through SQL queries;
- or through a Supabase RPC/view.

For scalability and simpler frontend code, an RPC or database view is preferred.

---

# 12. CSV Export

Instructor-only.

The frontend may fetch:

- survey;
- questions;
- choices;
- responses;
- answers.

It then generates CSV in the browser.

Recommended CSV layout:

```text
response_id,submitted_at,question_1,question_2,question_3
...
```

The first row contains question text.

No server endpoint is required for MVP.

---

# 13. Error Handling

The application should define standard UI handling for:

```text
Network error
Authentication required
Survey not found
Survey closed
Duplicate submission
Database validation error
Unexpected server error
```

Never show raw database exceptions to students.

---

# 14. Loading States

Every asynchronous page should include a loading state.

Examples:

```text
Loading survey...
Loading results...
Saving survey...
Submitting...
```

Buttons that trigger mutations should be disabled while the request is in progress.

---

# 15. Future API Extensions

Possible future operations:

```text
importSurvey
exportSurvey
generateQuestions
listQuestionBank
saveQuestionToBank
createCourse
listCourses
assignSurveyToCourse
getAnalytics
```

These are outside the MVP.
