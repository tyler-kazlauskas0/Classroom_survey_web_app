# Classroom Survey Web Application Specification

## Version

**Version:** 1.0

**Status:** Initial Specification

------------------------------------------------------------------------

# 1. Overview

## Purpose

The Classroom Survey Web Application is designed to allow instructors to
quickly assess student understanding during class.

Students participate by scanning a QR code displayed by the instructor.
The QR code directs them to the currently active survey, where they can
answer one or more questions from their phone, tablet, or laptop.

The instructor can create surveys before class, activate them with a
single click, and immediately collect responses. Survey data is
permanently stored and can be viewed later through an instructor
dashboard.

The application should be inexpensive to operate and use only free
hosting and database services.

------------------------------------------------------------------------

# 2. Goals

-   Extremely easy for students to use
-   Extremely easy for instructors to prepare surveys
-   Mobile friendly
-   Fast enough for an entire classroom
-   No student login required
-   Permanent storage of survey responses
-   Easy visualization of results
-   Free hosting
-   Open source

------------------------------------------------------------------------

# 3. Target Users

## Instructor

The instructor can:

-   Login securely
-   Create, edit, duplicate, delete, and archive surveys
-   Activate and close surveys
-   Display QR codes
-   View live and historical responses
-   Export results

## Student

Students can:

-   Scan a QR code
-   Complete a survey
-   Submit responses
-   Receive confirmation

No student account is required.

------------------------------------------------------------------------

# 4. Functional Requirements

## Survey Management

-   Create, edit, duplicate, archive, and delete surveys.
-   Each survey contains a title, optional description, and one or more
    questions.

## Supported Question Types

Version 1 supports:

-   Multiple Choice
-   True / False

Future versions may add:

-   Checkbox
-   Short Answer
-   Rating Scale
-   Numeric Response

## Survey Lifecycle

Each survey is one of:

-   Draft
-   Active
-   Closed
-   Archived

Only one survey may be Active at any time.

## QR Code

When activated, the application automatically generates:

-   Public survey URL
-   QR Code
-   Downloadable PNG

## Student Survey

Students can answer questions from any modern browser on phones,
tablets, or laptops.

## Results Dashboard

Displays:

-   Response counts
-   Percentages
-   Charts
-   Historical results

## CSV Export

Export all survey results as CSV.

------------------------------------------------------------------------

# 5. Nonfunctional Requirements

-   Responsive mobile interface
-   Support at least 200 simultaneous students
-   Average page load under 2 seconds
-   Secure instructor authentication
-   Free cloud hosting

------------------------------------------------------------------------

# 6. Database Schema

## surveys

-   id
-   title
-   description
-   status
-   created_at

## questions

-   id
-   survey_id
-   question_text
-   question_type
-   position

## choices

-   id
-   question_id
-   choice_text
-   position

## responses

-   id
-   survey_id
-   submitted_at
-   anonymous_token

## answers

-   id
-   response_id
-   question_id
-   choice_id
-   text_answer

------------------------------------------------------------------------

# 7. Technology Stack

Frontend

-   React
-   TypeScript
-   Vite
-   Tailwind CSS

Backend

-   Supabase

Database

-   PostgreSQL

Charts

-   Recharts

QR Code

-   qrcode npm package

Hosting

-   Cloudflare Pages

Version Control

-   GitHub

------------------------------------------------------------------------

# 8. Project Structure

``` text
classroom-survey/
├── src/
│   ├── components/
│   ├── pages/
│   └── lib/
├── supabase/
├── public/
├── README.md
├── SPEC.md
└── TODO.md
```

------------------------------------------------------------------------

# 9. MVP

-   Instructor authentication
-   Survey creation/editing
-   Multiple-choice questions
-   True/False questions
-   QR code generation
-   Student submission page
-   PostgreSQL storage
-   Results dashboard
-   Historical browsing
-   CSV export

------------------------------------------------------------------------

# 10. Future Enhancements

-   Live updating charts
-   AI-generated questions
-   LMS integration
-   Question bank
-   Student authentication
-   Attendance tracking
-   Analytics
-   Multiple instructors
