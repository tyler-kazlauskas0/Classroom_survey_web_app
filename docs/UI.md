# Classroom Survey Web App — UI Specification

## Design Goals

The interface should be:

- simple;
- fast;
- mobile friendly;
- easy to use during class;
- readable from a projector;
- usable without training.

The student experience should require as few taps as possible.

---

# 1. Application Routes

```text
/                    Landing page
/login               Instructor login
/dashboard           Instructor dashboard
/surveys/new         New survey
/surveys/:id/edit    Edit survey
/surveys/:id/present Present active survey
/surveys/:id/results View results
/s/:slug              Public student survey
```

---

# 2. Landing Page

Purpose:

Provide a simple entry point for instructors.

Wireframe:

```text
+--------------------------------------+
|        Classroom Survey              |
|                                      |
|  Quick in-class understanding checks |
|                                      |
|        [ Instructor Login ]          |
+--------------------------------------+
```

No student link is necessary because students use QR codes.

---

# 3. Instructor Login

Fields:

```text
Email
Password
```

Actions:

```text
Login
```

Wireframe:

```text
+--------------------------------------+
| Instructor Login                     |
|                                      |
| Email                                |
| [____________________________]       |
|                                      |
| Password                             |
| [____________________________]       |
|                                      |
| [ Log In ]                           |
+--------------------------------------+
```

---

# 4. Dashboard

Purpose:

Display all surveys and their current states.

Header:

```text
Classroom Survey
Dashboard
[ New Survey ]
[ Logout ]
```

Survey card:

```text
+--------------------------------------------------+
| Recursion Concept Check                         |
| Status: Draft                                   |
| Created: Aug 17, 2026                           |
|                                                  |
| [Edit] [Activate] [Duplicate] [Archive] [...]   |
+--------------------------------------------------+
```

Closed survey:

```text
+--------------------------------------------------+
| Pointer Review                                  |
| Status: Closed                                  |
|                                                  |
| [Results] [Duplicate] [Archive]                 |
+--------------------------------------------------+
```

Dashboard controls:

```text
Search: [________________]
Status: [ All ▼ ]
```

Recommended status badge labels:

```text
Draft
Active
Closed
Archived
```

---

# 5. Survey Editor

Purpose:

Allow surveys to be prepared quickly before class.

Top section:

```text
Survey Title
[________________________________________]

Description
[________________________________________]
```

Question card:

```text
+------------------------------------------------+
| Question 1                                     |
|                                                |
| [ What is required for recursion?           ] |
|                                                |
| Type: [ Multiple Choice ▼ ]                    |
|                                                |
| Choices                                        |
| [ A base case                              ]   |
| [ A pointer                                ]   |
| [ A loop                                   ]   |
| [ A compiler                               ]   |
|                                                |
| [+ Add Choice]                                 |
|                                                |
| [Delete Question]                              |
+------------------------------------------------+
```

Bottom controls:

```text
[ + Add Question ]

[ Save Draft ]    [ Activate ]
```

Editing behavior:

- changes are not lost when reordering questions;
- validation errors appear near the affected field;
- destructive actions require confirmation.

---

# 6. Present Survey Page

Purpose:

Display the QR code during class.

This page should be optimized for a projector.

Wireframe:

```text
+--------------------------------------------------------+
| Recursion Concept Check                                |
|                                                        |
|                 +----------------+                     |
|                 |                |                     |
|                 |    QR CODE     |                     |
|                 |                |                     |
|                 +----------------+                     |
|                                                        |
|                 survey.example/s/x7kf2q                |
|                                                        |
|                  Responses: 42                         |
|                                                        |
| [ View Results ]              [ Close Survey ]         |
+--------------------------------------------------------+
```

Requirements:

- QR code should be large;
- URL should be readable;
- response count should be visible;
- avoid unnecessary navigation elements;
- suitable for full-screen projection.

---

# 7. Student Survey

This is the most important mobile interface.

Requirements:

- no login;
- no menu;
- no distractions;
- large touch targets;
- readable text;
- one-column mobile layout.

Wireframe:

```text
Recursion Concept Check

Quick understanding check

1. What is required for recursion?

( ) A base case
( ) A pointer
( ) A loop
( ) A compiler

2. Every recursive function needs
   a stopping condition.

( ) True
( ) False

[ Submit ]
```

Recommended mobile spacing:

- at least 44px touch targets;
- generous spacing between answer choices;
- Submit button spans most of screen width.

---

# 8. Student Submission States

## Submitting

```text
Submitting...
```

Disable the Submit button.

---

## Success

```text
Thank you!

Your response has been recorded.
```

No additional actions required.

---

## Already Submitted

```text
You have already submitted a response
to this survey.
```

---

## Survey Closed

```text
This survey is no longer accepting responses.
```

---

## Survey Not Found

```text
Survey not found.
```

---

# 9. Results Page

Header:

```text
Recursion Concept Check
52 responses
```

Question result:

```text
What is required for recursion?

A base case
████████████████████  45   86.5%

A pointer
██                     3    5.8%

A loop
█                      2    3.8%

A compiler
█                      2    3.8%
```

Actions:

```text
[ Refresh ]
[ Export CSV ]
[ Present QR ]
[ Back to Dashboard ]
```

Charts:

- use horizontal or vertical bar charts;
- always show counts;
- always show percentages;
- charts should remain readable without relying only on color.

---

# 10. Empty States

No surveys:

```text
You have not created any surveys yet.

[ Create Your First Survey ]
```

No responses:

```text
No responses yet.

Display the QR code so students can join.
```

No search results:

```text
No surveys match your search.
```

---

# 11. Confirmation Dialogs

Use confirmation for:

```text
Delete survey
Archive survey
Close active survey
```

Example:

```text
Delete "Recursion Concept Check"?

This will permanently delete the survey
and all of its responses.

[ Cancel ] [ Delete ]
```

Deleting a survey with responses should receive a stronger warning.

---

# 12. Responsive Design

## Mobile

Student view:

- single column;
- full-width answer controls;
- minimal header.

Instructor dashboard:

- cards stack vertically;
- action buttons may wrap.

## Tablet

- wider survey cards;
- editor remains one column.

## Desktop

- dashboard may use cards or a compact table;
- results can use larger charts.

---

# 13. Accessibility

Requirements:

- semantic HTML;
- visible focus indicators;
- keyboard-accessible controls;
- form labels connected to inputs;
- sufficient color contrast;
- do not rely only on color for survey status;
- charts should also display numeric values.

---

# 14. Visual Style

Recommended characteristics:

```text
Clean
Minimal
Professional
Neutral
Large readable typography
Generous whitespace
```

Avoid:

```text
Decorative animations
Complex gradients
Dense navigation
Small mobile controls
Excessive modal dialogs
```

---

# 15. Loading and Saving Feedback

Use clear feedback for longer operations.

Examples:

```text
Saving...
Saved
Loading results...
Submitting...
```

Do not show success toasts for every minor interaction.

---

# 16. Future UI Enhancements

Possible later screens:

```text
Question Bank
Course Management
Semester Management
Analytics Dashboard
AI Question Generator
Survey Import
Survey Settings
Instructor Management
```

These are outside the MVP.
