# Phase 5 — Test and Debug

All automated tests run against the **live Supabase project** and the real UI.

```bash
npm run test:phase5      # 26 scenarios: QR, submissions, persistence, errors, devices
npm run test:e2e         # Phase 4 workflow (10 checks)
npm run test:integration # Phase 4 workflow via the data layer (9 checks)
npm test                 # 22 unit tests
```

Run a subset with `ONLY="QR" npm run test:phase5`. Screenshots are written to
`e2e/screenshots/phase5/` (git-ignored). Test surveys are titled `[E2E] …` and
deleted afterwards.

## Devices tested (automated)

Chromium with device emulation (screen size, pixel density, touch, mobile user agent):

| Device | Viewport | Pages checked |
|---|---|---|
| iPhone SE | 320 × 568 | student survey, dashboard, editor, present, results |
| iPhone 13 | 390 × 844 | student survey (most scenarios run as this phone) |
| Pixel 7 | 412 × 915 | student survey, LAN QR flow, instructor pages |
| iPad (gen 7) | 810 × 1080 | all pages |
| Desktop | 1280–1440 wide | all pages; instructor flows |

On every device: no sideways scrolling, and on the student page every answer and
button is at least 44 px tall.

## Results by focus area

### QR-code access
| Scenario | Result |
|---|---|
| The QR code **as rendered on screen** is decoded (like a phone camera would) and matches the URL shown; opening it on a phone loads the survey | ✅ |
| The downloaded PNG decodes to the same URL | ✅ |
| Opened via the computer's network address (`npm run dev:lan`): the QR code encodes that address and a phone can open it and submit | ✅ after fix #1, #4 |
| A QR code pointing at `localhost` shows a warning that phones can't open it | ✅ after fix #1 |
| If the survey is closed or replaced elsewhere, the projector stops showing the dead QR code | ✅ after fix #2 |

### Student submissions
| Scenario | Result |
|---|---|
| Unanswered questions are highlighted; chosen answers are kept | ✅ |
| Network failure on Submit: clear message, answers kept, retry stores exactly one response | ✅ |
| Response saved but the reply is lost, then the student retries: "already submitted", still one row | ✅ |
| Double tap + Enter while submitting: one request, one row | ✅ |
| Survey closed while a student is answering: friendly "no longer accepting responses" | ✅ |
| Second tab in the same browser: "already submitted" | ✅ |
| Different students (iPhone SE, iPhone 13, Pixel 7) each submit once | ✅ |
| Keyboard-only student (Tab / Space / Enter) | ✅ |
| 40 students submitting at the same instant: all 40 stored, results exact | ✅ |

### Database persistence
| Scenario | Result |
|---|---|
| Results and login survive page reloads; after logout, pages redirect to login; a new browser sees the same data | ✅ |
| Editor changes (text edit + question reorder) survive a reload | ✅ |
| Editing an active survey's choices directly (bypassing the UI) is refused by the database | ✅ |

### Error handling
| Scenario | Result |
|---|---|
| Unknown, malformed or SQL-looking survey links show "Survey not found." | ✅ |
| Student page with the network down shows "Could not reach the server" + **Try again**, and recovers | ✅ |
| A server error with internal details shows only "Something went wrong"; raw database text is never shown | ✅ |
| Instructor pages with a non-existent or malformed ID show "Survey not found."; dashboard offline shows a retry | ✅ |
| Login: wrong password and no network give distinct, clear messages | ✅ |
| Removed or expired session redirects to login | ✅ |
| A page that fails to load (e.g. after a redeploy) shows a recovery screen, not a blank page | ✅ after fix #3 |
| No uncaught JavaScript errors during the whole run | ✅ |

## Bugs found and fixed

| # | Problem | Impact | Fix |
|---|---|---|---|
| 1 | When the app runs on a laptop, the QR code encodes `http://localhost:…`, which a phone can't open; nothing warned the instructor | Students scanning the code in class get an error | Presentation page shows a warning for localhost links; new `npm run dev:lan` serves the app on the network address so QR codes work on phones |
| 2 | The presentation page polled only the response count. If the survey was closed or another survey was activated in another tab, the projector kept showing a QR code for a closed survey | Students scan a dead code | The page also polls the survey status and refreshes when it changes; shows "Connection lost. Reconnecting…" when polling fails |
| 3 | Any rendering error or failed page download (e.g. after a redeploy) left a **blank white page** | Instructor stuck mid-class | Added an error boundary with **Reload page** / **Home** buttons; it resets on navigation |
| 4 | `crypto.randomUUID()` doesn't exist on plain-HTTP network addresses (browsers allow it only on HTTPS/localhost). The **editor crashed**, and **student submissions would crash** when testing on a phone over Wi-Fi | Real-phone testing impossible without HTTPS | New `randomId()` that falls back to `crypto.getRandomValues`; unit test covers the fallback |
| 5 | Choice inputs in the editor shrank to ~70 px on small phones because the ↑ ↓ ✕ buttons shared the row | Hard to edit on a phone | On narrow screens the buttons wrap below the input |
| 6 | The dashboard date filter compared the survey's **UTC** date with the **local** date from the date picker. In US time zones, an evening survey counted as the next day | Surveys missing from date filters | Compare local calendar dates (`localDateKey`); unit test passes in Los Angeles, UTC and Tokyo |

### Investigated, not a bug
- **Instructor pages take about 7 s to show "Could not reach the server" when offline.**
  supabase-js automatically retries failed *reads* (GET) with exponential backoff, which
  helps on patchy classroom Wi-Fi. Student submissions are POST requests and are
  **never** retried automatically, so retries can't create duplicate responses.

## Manual test on a real phone (please do this once)

The automated runs use Chromium only (no Safari/WebKit in this environment) and
emulated phones. Before class, check on your own phone:

1. Connect the laptop and phone to the **same Wi-Fi**, then run:

   ```bash
   npm run dev:lan
   ```

   Open the **Network** URL it prints (e.g. `http://192.168.1.20:5173`) on the laptop,
   **not** `localhost`.
2. Log in, create a two-question survey, and click **Save & Activate**. The presentation
   page should show **no** yellow warning.
3. Scan the QR code with the phone camera (iPhone/Safari and Android/Chrome if you can):
   - [ ] the survey opens, text is readable, and choices are easy to tap;
   - [ ] submitting with a question unanswered highlights it;
   - [ ] after submitting you see **Thank you!**, and the laptop count goes up within 5 s;
   - [ ] scanning again shows **already submitted**;
   - [ ] in airplane mode, Submit shows *Could not reach the server* and works after reconnecting.
4. Click **Close Survey**, then refresh the phone: *no longer accepting responses*.
5. Open **Results**, check the numbers, and **Export CSV**; open the file in Excel or
   Google Sheets.

Some school or campus networks block device-to-device traffic. If the phone can't
open the Network URL, use a phone hotspot or test after deployment.
