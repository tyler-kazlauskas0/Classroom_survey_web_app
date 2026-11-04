/**
 * Phase 5 — test & debug suite (live Supabase + real UI in Chromium).
 *
 *   npm run test:phase5
 *
 * Focus areas: QR-code access, student submissions, database persistence,
 * error handling, on desktop and emulated mobile devices.
 *
 * Needs the same variables as test:e2e. Test surveys are titled "[E2E] …"
 * and deleted afterwards; a previously active survey is re-activated.
 */
import { createClient } from '@supabase/supabase-js'
import jsQR from 'jsqr'
import { mkdirSync, readFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { chromium, devices } from 'playwright'
import { PNG } from 'pngjs'
import { createServer, loadEnv } from 'vite'

const env = { ...loadEnv('development', process.cwd(), ''), ...process.env }
const SUPA = (env.VITE_SUPABASE_URL ?? '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/(rest|auth)\/v1$/, '')
const KEY = env.VITE_SUPABASE_ANON_KEY
const EMAIL = env.E2E_INSTRUCTOR_EMAIL
const PASSWORD = env.E2E_INSTRUCTOR_PASSWORD
if (!SUPA || !KEY || !EMAIL || !PASSWORD) {
  console.error('Missing Supabase / E2E_INSTRUCTOR_* environment variables')
  process.exit(1)
}
const SHOTS = env.E2E_SCREENSHOT_DIR || 'e2e/screenshots/phase5'
mkdirSync(SHOTS, { recursive: true })
const ONLY = env.ONLY ? new RegExp(env.ONLY, 'i') : null

// ---------------------------------------------------------------- helpers
const db = createClient(SUPA, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
{
  const { error } = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error) throw new Error(`Instructor login failed: ${error.message}`)
}
const anon = createClient(SUPA, KEY, { auth: { persistSession: false, autoRefreshToken: false } })

async function q(p) {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}
async function eventually(fn, msg, timeout = 10_000) {
  const end = Date.now() + timeout
  let last
  while (Date.now() < end) {
    try {
      if (await fn()) return
    } catch (e) {
      last = e
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`${msg}${last ? ` (${last.message})` : ''}`)
}

const created = []
const QUESTIONS = [
  {
    question_text: 'What is required for a recursive function?',
    question_type: 'multiple_choice',
    choices: [
      { choice_text: 'A base case' },
      { choice_text: 'A pointer' },
      { choice_text: 'A loop' },
    ],
  },
  { question_text: 'Recursion needs a stopping condition.', question_type: 'true_false' },
]
/** Create (and optionally activate) a survey directly in the database. */
async function fixture(name, { activate = true, questions = QUESTIONS } = {}) {
  const id = await q(
    db.rpc('save_survey', {
      p_survey_id: null,
      p_title: `[E2E] ${name}`,
      p_description: 'Phase 5 test',
      p_questions: questions,
    }),
  )
  created.push(id)
  let slug = null
  if (activate) slug = (await q(db.rpc('activate_survey', { p_survey_id: id }))).public_slug
  const qs = await q(
    db
      .from('questions')
      .select('id, position, choices(id, position, choice_text)')
      .eq('survey_id', id)
      .order('position'),
  )
  qs.forEach((x) => x.choices.sort((a, b) => a.position - b.position))
  return { id, slug, title: `[E2E] ${name}`, questions: qs }
}
const responseCount = async (id) =>
  (await q(db.from('responses').select('id').eq('survey_id', id))).length

function decodeQr(pngBuffer) {
  const png = PNG.sync.read(pngBuffer)
  const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)
  return code?.data ?? null
}

const results = []
async function scenario(name, fn) {
  if (ONLY && !ONLY.test(name)) return
  const t = Date.now()
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`✓ ${name} (${Date.now() - t} ms)`)
  } catch (e) {
    results.push({ name, ok: false, error: e.message })
    console.log(`✗ ${name}\n    ${e.message.split('\n')[0]}`)
  }
}

// ---------------------------------------------------------------- setup
const previousActive = (await q(db.from('surveys').select('id').eq('status', 'active')))[0] ?? null

const PORT = 5198
// Listen on all interfaces, like `npm run dev:lan`, so the LAN scenario can reach it.
const server = await createServer({
  server: { port: PORT, strictPort: true, host: true },
  logLevel: 'error',
})
await server.listen()
const BASE = `http://localhost:${PORT}`

const browser = await chromium.launch()
const pageErrors = []

async function instructorPage(opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
    ...opts,
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => pageErrors.push(`instructor: ${e.message}`))
  await page.goto(`${BASE}/login`)
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log In' }).click()
  await page.waitForURL('**/dashboard')
  return page
}
async function studentPage(device = 'iPhone 13') {
  const ctx = await browser.newContext({ ...devices[device] })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => pageErrors.push(`student: ${e.message}`))
  return page
}
async function answerAll(page, survey, picks = [0, 0]) {
  for (const [i, q] of survey.questions.entries()) {
    const choiceText = q.choices[picks[i]].choice_text
    await page.getByRole('group').nth(i).getByLabel(choiceText, { exact: true }).check()
  }
}
const noHorizontalScroll = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)

// ====================================================================
// QR-CODE ACCESS
// ====================================================================
await scenario('QR: on-screen QR code decodes to the survey URL and opens on a phone', async () => {
  const s = await fixture('QR scan')
  const page = await instructorPage()
  await page.goto(`${BASE}/surveys/${s.id}/present`)
  const img = page.getByAltText(/QR code/)
  await img.waitFor()
  const shownUrl = await page.locator('a[href*="/s/"]').getAttribute('href')
  // Decode what a phone camera would see: a screenshot of the QR element.
  const decoded = decodeQr(await img.screenshot())
  assert(decoded === shownUrl, `QR decodes to ${decoded}, page shows ${shownUrl}`)
  assert(decoded === `${BASE}/s/${s.slug}`, `unexpected QR URL ${decoded}`)
  const phone = await studentPage()
  await phone.goto(decoded)
  await phone.getByRole('heading', { name: s.title }).waitFor()
  await page.screenshot({ path: `${SHOTS}/qr-present.png` })
  await phone.context().close()
  await page.context().close()
})

await scenario('QR: downloaded PNG decodes to the same URL', async () => {
  const s = await fixture('QR download')
  const page = await instructorPage()
  await page.goto(`${BASE}/surveys/${s.id}/present`)
  await page.getByAltText(/QR code/).waitFor()
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download QR (PNG)' }).click(),
  ])
  assert(/\.png$/.test(dl.suggestedFilename()), `filename ${dl.suggestedFilename()}`)
  const decoded = decodeQr(readFileSync(await dl.path()))
  assert(decoded === `${BASE}/s/${s.slug}`, `PNG decodes to ${decoded}`)
  await page.context().close()
})

await scenario('QR: presentation page warns when the QR code points at localhost', async () => {
  const s = await fixture('QR localhost')
  const page = await instructorPage()
  await page.goto(`${BASE}/surveys/${s.id}/present`)
  await page.getByAltText(/QR code/).waitFor()
  await page.getByText(/phones can't open/i).waitFor({ timeout: 3000 })
  await page.context().close()
})

await scenario(
  'QR: opened via the network address (npm run dev:lan), the QR code works for phones',
  async () => {
    const lanIp = Object.values(networkInterfaces())
      .flat()
      .find((i) => i && i.family === 'IPv4' && !i.internal)?.address
    assert(lanIp, 'no network interface found')
    const s = await fixture('QR LAN')
    const LAN = `http://${lanIp}:${PORT}`
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await ctx.newPage()
    await page.goto(`${LAN}/login`)
    await page.getByLabel('Email').fill(EMAIL)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Log In' }).click()
    await page.waitForURL('**/dashboard')
    // Plain-HTTP network addresses are not "secure contexts" in browsers.
  await page.goto(`${LAN}/surveys/new`)
  await page.getByRole('heading', { name: 'New Survey' }).waitFor()
  await page.getByRole('button', { name: '+ Add Question' }).click()
  await page.goto(`${LAN}/surveys/${s.id}/present`)
    const img = page.getByAltText(/QR code/)
    await img.waitFor()
    const decoded = decodeQr(await img.screenshot())
    assert(decoded === `${LAN}/s/${s.slug}`, `QR encodes ${decoded}`)
    assert(
      (await page.getByText(/phones can't open/i).count()) === 0,
      'localhost warning shown for a LAN address',
    )
    const phone = await studentPage('Pixel 7')
    await phone.goto(decoded)
    await answerAll(phone, s)
    await phone.getByRole('button', { name: 'Submit' }).click()
    await phone.getByText('Thank you!').waitFor()
    assert((await responseCount(s.id)) === 1, 'LAN submission not stored')
    await phone.context().close()
    await ctx.close()
  },
)

await scenario(
  'QR: presentation page updates when the survey stops being active elsewhere',
  async () => {
    const a = await fixture('Switch A')
    const page = await instructorPage()
    await page.goto(`${BASE}/surveys/${a.id}/present`)
    await page.getByAltText(/QR code/).waitFor()
    await fixture('Switch B') // activating B closes A
    await page
      .getByText(/no longer accepting responses|closed/i)
      .first()
      .waitFor({ timeout: 15_000 })
    assert(
      (await page.getByAltText(/QR code/).count()) === 0,
      'stale QR code still shown for a closed survey',
    )
    await page.context().close()
  },
)

// ====================================================================
// STUDENT SUBMISSIONS
// ====================================================================
await scenario('Submit: answers are required and kept on screen', async () => {
  const s = await fixture('Required')
  const phone = await studentPage()
  await phone.goto(`${BASE}/s/${s.slug}`)
  await phone.getByRole('group').first().getByLabel('A loop', { exact: true }).check()
  await phone.getByRole('button', { name: 'Submit' }).click()
  await phone.getByText('Please choose an answer.').waitFor()
  assert(await phone.getByLabel('A loop', { exact: true }).isChecked(), 'first answer lost')
  assert((await responseCount(s.id)) === 0, 'incomplete response stored')
  await phone.context().close()
})

await scenario(
  'Submit: network failure shows an error, keeps answers, and retry stores exactly one response',
  async () => {
    const s = await fixture('Offline submit')
    const phone = await studentPage()
    await phone.goto(`${BASE}/s/${s.slug}`)
    await answerAll(phone, s, [0, 1])
    await phone.route('**/rest/v1/rpc/submit_survey_response', (r) =>
      r.abort('internetdisconnected'),
    )
    await phone.getByRole('button', { name: 'Submit' }).click()
    await phone.getByText(/could not reach the server/i).waitFor()
    await phone.screenshot({ path: `${SHOTS}/submit-offline.png`, fullPage: true })
    assert(
      await phone.getByLabel('A base case', { exact: true }).isChecked(),
      'answers lost after error',
    )
    assert(await phone.getByRole('button', { name: 'Submit' }).isEnabled(), 'cannot retry')
    await phone.unroute('**/rest/v1/rpc/submit_survey_response')
    await phone.getByRole('button', { name: 'Submit' }).click()
    await phone.getByText('Thank you!').waitFor()
    assert((await responseCount(s.id)) === 1, 'expected exactly one stored response')
    await phone.context().close()
  },
)

await scenario(
  'Submit: response saved but reply lost → retry shows "already submitted", one row',
  async () => {
    const s = await fixture('Lost reply')
    const phone = await studentPage()
    await phone.goto(`${BASE}/s/${s.slug}`)
    await answerAll(phone, s)
    let first = true
    await phone.route('**/rest/v1/rpc/submit_survey_response', async (route) => {
      if (first) {
        first = false
        await route.fetch() // reaches the database...
        return route.abort('connectionreset') // ...but the phone never sees the reply
      }
      return route.continue()
    })
    await phone.getByRole('button', { name: 'Submit' }).click()
    await phone.getByText(/could not reach the server/i).waitFor()
    await phone.getByRole('button', { name: 'Submit' }).click()
    await phone
      .getByText(/already submitted|thank you/i)
      .first()
      .waitFor()
    assert((await responseCount(s.id)) === 1, 'duplicate row stored')
    await phone.context().close()
  },
)

await scenario('Submit: double tap / Enter while submitting sends only one request', async () => {
  const s = await fixture('Double tap')
  const phone = await studentPage()
  await phone.goto(`${BASE}/s/${s.slug}`)
  await answerAll(phone, s)
  let calls = 0
  await phone.route('**/rest/v1/rpc/submit_survey_response', async (route) => {
    calls++
    await new Promise((r) => setTimeout(r, 1500))
    return route.continue()
  })
  const btn = phone.getByRole('button', { name: 'Submit' })
  await btn.dblclick({ force: true })
  await phone.keyboard.press('Enter')
  await phone.getByText('Thank you!').waitFor()
  assert(calls === 1, `${calls} submit requests sent`)
  assert((await responseCount(s.id)) === 1, 'more than one response stored')
  await phone.context().close()
})

await scenario(
  'Submit: survey closed while student is answering → friendly closed message',
  async () => {
    const s = await fixture('Closed mid-way')
    const phone = await studentPage()
    await phone.goto(`${BASE}/s/${s.slug}`)
    await answerAll(phone, s)
    await q(db.rpc('close_survey', { p_survey_id: s.id }))
    await phone.getByRole('button', { name: 'Submit' }).click()
    await phone.getByText('This survey is no longer accepting responses.').waitFor()
    assert((await responseCount(s.id)) === 0, 'response stored after close')
    await phone.context().close()
  },
)

await scenario('Submit: second tab in the same browser shows "already submitted"', async () => {
  const s = await fixture('Two tabs')
  const phone = await studentPage()
  const tab2 = await phone.context().newPage()
  await phone.goto(`${BASE}/s/${s.slug}`)
  await tab2.goto(`${BASE}/s/${s.slug}`)
  await answerAll(phone, s)
  await phone.getByRole('button', { name: 'Submit' }).click()
  await phone.getByText('Thank you!').waitFor()
  await answerAll(tab2, s, [1, 1])
  await tab2.getByRole('button', { name: 'Submit' }).click()
  await tab2.getByText('You have already submitted a response to this survey.').waitFor()
  assert((await responseCount(s.id)) === 1, 'second tab stored a response')
  await phone.context().close()
})

await scenario('Submit: separate students (browsers) can each submit once', async () => {
  const s = await fixture('Many students')
  for (const device of ['iPhone 13', 'Pixel 7', 'iPhone SE']) {
    const phone = await studentPage(device)
    await phone.goto(`${BASE}/s/${s.slug}`)
    await answerAll(phone, s)
    await phone.getByRole('button', { name: 'Submit' }).click()
    await phone.getByText('Thank you!').waitFor()
    await phone.context().close()
  }
  assert((await responseCount(s.id)) === 3, 'expected 3 responses')
})

await scenario('Submit: keyboard-only student can answer and submit', async () => {
  const s = await fixture('Keyboard')
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/s/${s.slug}`)
  await page.getByRole('heading', { name: s.title }).waitFor()
  await page.keyboard.press('Tab') // first radio of Q1
  await page.keyboard.press('Space')
  await page.keyboard.press('Tab') // Q2 radio group
  await page.keyboard.press('Space')
  await page.keyboard.press('Tab') // Submit
  await page.keyboard.press('Enter')
  await page.getByText('Thank you!').waitFor()
  assert((await responseCount(s.id)) === 1, 'keyboard submission not stored')
  await ctx.close()
})

await scenario('Submit: 40 students submitting at the same moment are all stored', async () => {
  const s = await fixture('Classroom burst')
  const [mc, tf] = s.questions
  const calls = Array.from({ length: 40 }, (_, i) =>
    anon.rpc('submit_survey_response', {
      p_survey_id: s.id,
      p_anonymous_token: crypto.randomUUID(),
      p_answers: [
        { question_id: mc.id, choice_id: mc.choices[i % 3].id },
        { question_id: tf.id, choice_id: tf.choices[i % 2].id },
      ],
    }),
  )
  const res = await Promise.all(calls)
  const failed = res.filter((r) => r.error)
  assert(failed.length === 0, `${failed.length} failed: ${failed[0]?.error?.message}`)
  assert((await responseCount(s.id)) === 40, 'not all 40 stored')
  const r = await q(db.rpc('get_survey_results', { p_survey_id: s.id }))
  assert(r.response_count === 40, 'results count mismatch')
  assert(
    JSON.stringify(r.questions[0].choices.map((c) => c.count)) === '[14,13,13]',
    `MC counts ${r.questions[0].choices.map((c) => c.count)}`,
  )
})

// ====================================================================
// DATABASE PERSISTENCE
// ====================================================================
await scenario(
  'Persistence: data and login survive reloads, logout and a new browser',
  async () => {
    const s = await fixture('Persist')
    const [mc, tf] = s.questions
    await q(
      anon.rpc('submit_survey_response', {
        p_survey_id: s.id,
        p_anonymous_token: crypto.randomUUID(),
        p_answers: [
          { question_id: mc.id, choice_id: mc.choices[0].id },
          { question_id: tf.id, choice_id: tf.choices[0].id },
        ],
      }),
    )
    const page = await instructorPage()
    await page.goto(`${BASE}/surveys/${s.id}/results`)
    await page.getByText('1 response', { exact: true }).waitFor()
    await page.reload()
    await page.getByText('1 response', { exact: true }).waitFor() // still logged in, same data
    await page.goto(`${BASE}/dashboard`)
    await page.getByRole('link', { name: s.title }).waitFor()
    await page.getByRole('button', { name: 'Log out' }).click()
    await page.goto(`${BASE}/surveys/${s.id}/results`)
    await page.waitForURL('**/login')
    await page.context().close()
    const fresh = await instructorPage()
    await fresh.goto(`${BASE}/surveys/${s.id}/results`)
    await fresh.getByText('1 response', { exact: true }).waitFor()
    await fresh.context().close()
  },
)

await scenario('Persistence: editor changes are saved and reload identically', async () => {
  const s = await fixture('Editor persist', { activate: false })
  const page = await instructorPage()
  await page.goto(`${BASE}/surveys/${s.id}/edit`)
  await page.getByLabel('Choice 2 of question 1', { exact: true }).fill('A pointer (edited)')
  await page.getByRole('button', { name: 'Move Question 2 up' }).click()
  await page.getByRole('button', { name: 'Save Draft' }).click()
  await page.getByText('Saved', { exact: true }).waitFor()
  await page.reload()
  await page.getByLabel(/Survey Title/).waitFor()
  const first = await page.getByLabel('Question text').first().inputValue()
  assert(first === 'Recursion needs a stopping condition.', `question order not saved: ${first}`)
  assert(
    (await page.getByLabel('Choice 2 of question 2', { exact: true }).inputValue()) ===
      'A pointer (edited)',
    'choice edit not saved',
  )
  await page.context().close()
})

await scenario(
  'Persistence: the database refuses edits to an active survey even if the UI is bypassed',
  async () => {
    const s = await fixture('Locked')
    const { error } = await db
      .from('choices')
      .update({ choice_text: 'tampered' })
      .eq('id', s.questions[0].choices[0].id)
    assert(error && /SURVEY_NOT_EDITABLE/.test(error.message), `update allowed: ${error?.message}`)
  },
)

// ====================================================================
// ERROR HANDLING
// ====================================================================
await scenario('Errors: unknown and malformed survey links show "Survey not found"', async () => {
  const phone = await studentPage()
  await phone.goto(`${BASE}/s/doesnotexist`)
  await phone.getByText('Survey not found.').waitFor()
  await phone.goto(`${BASE}/s/${encodeURIComponent("'; drop table surveys; --")}`)
  await phone.getByText('Survey not found.').waitFor()
  await phone.goto(`${BASE}/s/`)
  await phone
    .getByText(/not found/i)
    .first()
    .waitFor()
  await phone.context().close()
})

await scenario(
  'Errors: student page shows a retry when the network is down, and recovers',
  async () => {
    const s = await fixture('Load retry')
    const phone = await studentPage()
    await phone.route('**/rest/v1/**', (r) => r.abort('internetdisconnected'))
    await phone.goto(`${BASE}/s/${s.slug}`)
    await phone.getByText(/could not reach the server/i).waitFor()
    await phone.unroute('**/rest/v1/**')
    await phone.getByRole('button', { name: 'Try again' }).click()
    await phone.getByRole('heading', { name: s.title }).waitFor()
    await phone.context().close()
  },
)

await scenario('Errors: unexpected server errors never show raw database text', async () => {
  const s = await fixture('Raw error')
  const phone = await studentPage()
  await phone.goto(`${BASE}/s/${s.slug}`)
  await answerAll(phone, s)
  await phone.route('**/rest/v1/rpc/submit_survey_response', (r) =>
    r.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'XX000',
        message: 'internal: relation "pg_secret" exploded at line 42',
      }),
    }),
  )
  await phone.getByRole('button', { name: 'Submit' }).click()
  await phone.getByText('Something went wrong. Please try again.').waitFor()
  assert((await phone.getByText(/pg_secret|XX000/).count()) === 0, 'raw database error shown')
  await phone.context().close()
})

await scenario(
  'Errors: instructor pages handle bad IDs and network failures gracefully',
  async () => {
    const page = await instructorPage()
    for (const path of [
      `/surveys/00000000-0000-0000-0000-000000000000/results`,
      `/surveys/not-a-uuid/results`,
      `/surveys/00000000-0000-0000-0000-000000000000/edit`,
      `/surveys/not-a-uuid/present`,
    ]) {
      await page.goto(`${BASE}${path}`)
      await page.getByText('Survey not found.').waitFor({ timeout: 8000 })
    }
    await page.route('**/rest/v1/**', (r) => r.abort('internetdisconnected'))
    await page.goto(`${BASE}/dashboard`)
    await page.getByText(/could not reach the server/i).waitFor()
    await page.unroute('**/rest/v1/**')
    await page.getByRole('button', { name: 'Try again' }).click()
    await page.getByRole('heading', { name: 'Dashboard' }).waitFor()
    await page
      .getByRole('button', { name: '+ New Survey' })
      .or(page.getByRole('link', { name: '+ New Survey' }))
      .waitFor()
    await page.context().close()
  },
)

await scenario('Errors: login shows clear messages for wrong password and no network', async () => {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`)
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill('definitely-wrong-password')
  await page.getByRole('button', { name: 'Log In' }).click()
  await page.getByText('Incorrect email or password.').waitFor()
  await page.route('**/auth/v1/**', (r) => r.abort('internetdisconnected'))
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log In' }).click()
  await page.getByText(/could not reach the server/i).waitFor()
  await ctx.close()
})

await scenario(
  'Errors: an expired/removed session sends the instructor back to login',
  async () => {
    const page = await instructorPage()
    await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.startsWith('sb-')) localStorage.removeItem(k)
    })
    await page.goto(`${BASE}/dashboard`)
    await page.waitForURL('**/login')
    await page.context().close()
  },
)

await scenario(
  'Errors: a crash in a page shows a recovery screen instead of a blank page',
  async () => {
    const page = await instructorPage()
    // Simulate a failed lazy-loaded chunk (e.g. after a redeploy).
    await page.route('**/src/pages/Results.tsx*', (r) => r.abort('failed'))
    await page.goto(`${BASE}/surveys/00000000-0000-0000-0000-000000000000/results`)
    await page
      .getByText(/something went wrong/i)
      .first()
      .waitFor({ timeout: 8000 })
    await page.getByRole('button', { name: /reload/i }).waitFor()
    await page.context().close()
  },
)

// ====================================================================
// DEVICES / LAYOUT
// ====================================================================
await scenario(
  'Devices: every page fits phone, tablet and desktop screens without sideways scrolling',
  async () => {
    const s = await fixture('Layout')
    const targets = [
      ['iPhone SE', devices['iPhone SE']],
      ['Pixel 7', devices['Pixel 7']],
      ['iPad (gen 7)', devices['iPad (gen 7)']],
      ['Desktop', { viewport: { width: 1440, height: 900 } }],
    ]
    for (const [name, device] of targets) {
      const page = await instructorPage(device)
      for (const [label, path] of [
        ['dashboard', '/dashboard'],
        ['editor', '/surveys/new'],
        ['present', `/surveys/${s.id}/present`],
        ['results', `/surveys/${s.id}/results`],
      ]) {
        await page.goto(`${BASE}${path}`)
        await page.waitForLoadState('networkidle')
        await page.locator('h1').first().waitFor()
        assert(await noHorizontalScroll(page), `${name} ${label}: horizontal scroll`)
        await page.screenshot({
          path: `${SHOTS}/layout-${name.replace(/\W+/g, '_')}-${label}.png`,
          fullPage: true,
        })
      }
      await page.context().close()
      const ctx = await browser.newContext({ ...device })
      const student = await ctx.newPage()
      await student.goto(`${BASE}/s/${s.slug}`)
      await student.getByRole('heading', { name: s.title }).waitFor()
      assert(await noHorizontalScroll(student), `${name} student: horizontal scroll`)
      const small = await student.$$eval('label:has(input[type=radio]), button', (els) =>
        els.filter((e) => e.getBoundingClientRect().height < 44).map((e) => e.textContent.trim()),
      )
      assert(small.length === 0, `${name} student: touch targets under 44px: ${small.join(', ')}`)
      await student.screenshot({
        path: `${SHOTS}/layout-${name.replace(/\W+/g, '_')}-student.png`,
        fullPage: true,
      })
      await ctx.close()
    }
  },
)

await scenario('Devices: no uncaught page errors during the whole run', async () => {
  assert(pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
})

// ---------------------------------------------------------------- cleanup
for (const id of created) {
  await db.from('surveys').update({ status: 'closed' }).eq('id', id).eq('status', 'active')
  await db.from('surveys').delete().eq('id', id)
}
const leftovers = await q(db.from('surveys').select('id').like('title', '[E2E]%'))
if (previousActive) await db.rpc('activate_survey', { p_survey_id: previousActive.id })
await db.auth.signOut({ scope: 'local' })
await browser.close()
await server.close()

const failed = results.filter((r) => !r.ok)
console.log(
  `\n${results.length - failed.length}/${results.length} scenarios passed` +
    `${leftovers.length ? `; WARNING ${leftovers.length} test surveys left behind` : '; test data cleaned up'}`,
)
process.exitCode = failed.length ? 1 : 0
