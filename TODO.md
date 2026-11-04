# Classroom Survey Web App — TODO

## Purpose

This roadmap breaks the implementation into small, testable phases ordered from foundational work to advanced features.

---

# Phase 1 — Project Setup

- [ ] Create a new React + TypeScript project with Vite.
- [ ] Add Tailwind CSS.
- [ ] Add React Router.
- [ ] Add Supabase JavaScript client.
- [ ] Add Recharts.
- [ ] Add QR code generation package.
- [ ] Create the initial project folder structure.
- [ ] Add `.env.example` with Supabase environment variable names.
- [ ] Configure ESLint and formatting.
- [ ] Create a basic home page.
- [ ] Verify the project builds successfully.

---

# Phase 2 — Supabase Project and Database

- [ ] Create a Supabase project.
- [ ] Create the `surveys` table.
- [ ] Create the `questions` table.
- [ ] Create the `choices` table.
- [ ] Create the `responses` table.
- [ ] Create the `answers` table.
- [ ] Add foreign-key constraints.
- [ ] Add database indexes.
- [ ] Add timestamps.
- [ ] Add survey-status validation.
- [ ] Create Row Level Security policies.
- [ ] Verify students cannot read survey results.
- [ ] Verify anonymous students can read active surveys.
- [ ] Verify anonymous students can submit responses.
- [ ] Verify authenticated instructors have full access.

---

# Phase 3 — Instructor Authentication

- [ ] Create the instructor login page.
- [ ] Connect login to Supabase Auth.
- [ ] Add logout.
- [ ] Create an authentication context/provider.
- [ ] Create a protected-route component.
- [ ] Redirect unauthenticated users to login.
- [ ] Show the logged-in instructor in the dashboard.

---

# Phase 4 — Instructor Dashboard

- [ ] Create the dashboard layout.
- [ ] Load surveys from Supabase.
- [ ] Display survey title, status, and creation date.
- [ ] Add status badges for Draft, Active, Closed, and Archived.
- [ ] Add a New Survey button.
- [ ] Add Edit action.
- [ ] Add Duplicate action.
- [ ] Add Delete action.
- [ ] Add Archive action.
- [ ] Add View Results action.
- [ ] Add Activate action.
- [ ] Add Close action.
- [ ] Add search by survey title.
- [ ] Add filtering by status.

---

# Phase 5 — Survey Editor

- [ ] Create a survey editor page.
- [ ] Add survey title field.
- [ ] Add optional description field.
- [ ] Add questions dynamically.
- [ ] Support Multiple Choice questions.
- [ ] Support True / False questions.
- [ ] Add answer choices dynamically.
- [ ] Reorder questions.
- [ ] Reorder choices.
- [ ] Delete questions.
- [ ] Delete choices.
- [ ] Validate required fields.
- [ ] Save a survey as Draft.
- [ ] Load an existing survey for editing.
- [ ] Prevent editing an active survey unless it is first closed.

---

# Phase 6 — Survey Activation

- [ ] Add activation logic.
- [ ] Ensure at most one survey is Active.
- [ ] Automatically close the previously active survey.
- [ ] Generate a public survey slug or identifier.
- [ ] Generate the public survey URL.
- [ ] Generate a QR code from the public URL.
- [ ] Create a Present Survey page.
- [ ] Display survey title and QR code.
- [ ] Display a readable fallback URL.
- [ ] Add a Close Survey button.
- [ ] Add a Download QR Code button.

---

# Phase 7 — Student Survey Page

- [ ] Create the public route `/s/:surveyId`.
- [ ] Load the requested active survey.
- [ ] Show an error if the survey does not exist.
- [ ] Show a message if the survey is closed.
- [ ] Render survey title and description.
- [ ] Render Multiple Choice questions.
- [ ] Render True / False questions.
- [ ] Validate required answers.
- [ ] Add Submit button.
- [ ] Store response and answers in Supabase.
- [ ] Show a submission confirmation page.
- [ ] Make the entire experience mobile friendly.

---

# Phase 8 — Duplicate Submission Protection

- [ ] Generate an anonymous browser token.
- [ ] Store the token in local storage.
- [ ] Save the token with each response.
- [ ] Prevent the same token from submitting twice to the same survey.
- [ ] Show a friendly message if a duplicate submission is attempted.
- [ ] Add a database uniqueness constraint if appropriate.

---

# Phase 9 — Results Dashboard

- [ ] Create a results page for each survey.
- [ ] Show total response count.
- [ ] Aggregate answers by question.
- [ ] Show counts for each choice.
- [ ] Show percentages for each choice.
- [ ] Add bar charts using Recharts.
- [ ] Clearly label unanswered questions.
- [ ] Add Refresh Results button.
- [ ] Add link back to the main dashboard.

---

# Phase 10 — Historical Results

- [ ] Allow viewing results for Closed surveys.
- [ ] Allow viewing results for Archived surveys.
- [ ] Add filtering by date.
- [ ] Add filtering by survey title.
- [ ] Preserve all historical response data.

---

# Phase 11 — CSV Export

- [ ] Add Export CSV button.
- [ ] Export survey metadata.
- [ ] Export one row per response.
- [ ] Include submission timestamp.
- [ ] Include each question and answer.
- [ ] Create safe CSV escaping.
- [ ] Test export with spreadsheet applications.

---

# Phase 12 — Survey Duplication

- [ ] Duplicate survey title and description.
- [ ] Duplicate questions.
- [ ] Duplicate answer choices.
- [ ] Create the copy in Draft state.
- [ ] Add "Copy of ..." naming.
- [ ] Redirect to the editor after duplication.

---

# Phase 13 — UI Polish

- [ ] Add consistent page layouts.
- [ ] Improve mobile responsiveness.
- [ ] Add loading states.
- [ ] Add empty states.
- [ ] Add error messages.
- [ ] Add confirmation dialogs for destructive actions.
- [ ] Improve QR-code presentation for classroom projection.
- [ ] Test accessibility and keyboard navigation.
- [ ] Improve color contrast.

---

# Phase 14 — Testing

- [ ] Test instructor login.
- [ ] Test survey creation.
- [ ] Test survey editing.
- [ ] Test activation.
- [ ] Test closing surveys.
- [ ] Test QR-code links.
- [ ] Test student submissions.
- [ ] Test duplicate-submission prevention.
- [ ] Test results calculations.
- [ ] Test CSV export.
- [ ] Test mobile layout.
- [ ] Test with at least two browsers.
- [ ] Test unauthorized access attempts.
- [ ] Test database Row Level Security.

---

# Phase 15 — Deployment

- [ ] Push the project to GitHub.
- [ ] Create the Cloudflare Pages site.
- [ ] Connect Cloudflare Pages to the GitHub repository.
- [ ] Configure production environment variables.
- [ ] Deploy the application.
- [ ] Configure SPA routing.
- [ ] Verify production login.
- [ ] Verify QR codes point to the production URL.
- [ ] Test student submissions in production.
- [ ] Test instructor results in production.

---

# Phase 16 — Post-MVP Enhancements

- [ ] Add live updating results with Supabase Realtime.
- [ ] Add question bank.
- [ ] Add survey import/export as JSON.
- [ ] Add Markdown import.
- [ ] Add short-answer questions.
- [ ] Add checkbox questions.
- [ ] Add rating-scale questions.
- [ ] Add numeric questions.
- [ ] Add AI-assisted question generation.
- [ ] Add LMS integration.
- [ ] Add multiple instructors.
- [ ] Add course and semester organization.
- [ ] Add analytics across multiple surveys.
