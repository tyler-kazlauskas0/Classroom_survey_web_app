/**
 * Browser end-to-end test of the Phase 4 workflow against the real Supabase
 * project, driving the actual UI:
 *
 *   1. Instructor creates a survey          5. Students submit answers
 *   2. ...adds questions and choices        6. Responses are saved in the database
 *   3. ...activates the survey              7. Instructor views the results
 *   4. Student opens the survey (separate browser profile, phone size)
 *
 * Each step is also checked directly in the database with supabase-js.
 *
 *   npm run test:e2e
 *
 * Needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, E2E_INSTRUCTOR_EMAIL,
 * E2E_INSTRUCTOR_PASSWORD (env or .env). Creates one "[E2E]" survey and
 * deletes it afterwards; a previously active survey is re-activated.
 * Screenshots: e2e/screenshots/ (git-ignored) or E2E_SCREENSHOT_DIR.
 */
import { createClient } from '@supabase/supabase-js'
import { chromium, devices } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { createServer, loadEnv } from 'vite'

const env = { ...loadEnv('development', process.cwd(), ''), ...process.env }
const URL_ = (env.VITE_SUPABASE_URL ?? '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/(rest|auth)\/v1$/, '')
const KEY = env.VITE_SUPABASE_ANON_KEY
const EMAIL = env.E2E_INSTRUCTOR_EMAIL
const PASSWORD = env.E2E_INSTRUCTOR_PASSWORD
if (!URL_ || !KEY || !EMAIL || !PASSWORD) {
  console.error(
    'Missing VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, E2E_INSTRUCTOR_EMAIL or E2E_INSTRUCTOR_PASSWORD',
  )
  process.exit(1)
}
const SHOTS = env.E2E_SCREENSHOT_DIR || 'e2e/screenshots'
mkdirSync(SHOTS, { recursive: true })

const TITLE = `[E2E] Recursion Check ${new Date().toISOString().slice(0, 19)}`
const Q1 = 'What is required for a recursive function?'
const Q2 = 'Every recursive function needs a stopping condition.'

// Direct database access as the instructor, for verification only.
const db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
{
  const { error } = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error) throw new Error(`Instructor login failed: ${error.message}`)
}
const q = async (p) => {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data
}

let passed = 0
const step = (label, detail = '') => {
  passed++
  console.log(`✓ ${label}${detail ? `  — ${detail}` : ''}`)
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(`Assertion failed: ${msg}`)
}

const previousActive =
  (await q(db.from('surveys').select('id, title').eq('status', 'active')))[0] ?? null
if (previousActive)
  console.log(`(note) "${previousActive.title}" is active; it will be re-activated afterwards`)

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' })
await server.listen()
const BASE = 'http://localhost:5199'

const browser = await chromium.launch()
const errors = []
let surveyId = null

try {
  // ------------------------------------------------------------- instructor
  const instructor = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  })
  const page = await instructor.newPage()
  page.on('pageerror', (e) => errors.push(`instructor: ${e}`))
  const shot = (p, name) => p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })

  await page.goto(`${BASE}/login`)
  assert((await page.locator('text=Demo mode').count()) === 0, 'app is not in demo mode')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log In' }).click()
  await page.waitForURL('**/dashboard')
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor()
  step('Instructor logs in with Supabase Auth')

  // 1. Create the survey
  await page.getByRole('link', { name: '+ New Survey' }).click()
  await page.getByLabel(/Survey Title/).fill(TITLE)
  await page.getByLabel('Description').fill('Phase 4 end-to-end test')
  await page.getByRole('button', { name: 'Delete Question' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete Question' }).click()
  await page.getByRole('button', { name: 'Save Draft' }).click()
  await page.waitForURL(/\/surveys\/[0-9a-f-]{36}\/edit$/)
  surveyId = page.url().split('/').at(-2)
  let row = await q(db.from('surveys').select('*').eq('id', surveyId).single())
  assert(row.title === TITLE && row.status === 'draft', 'survey row stored as draft')
  await shot(page, '1-survey-created')
  step('1. Instructor creates a survey', `surveys row ${surveyId.slice(0, 8)}… status=draft`)

  // 2. Add questions and choices
  await page.getByRole('button', { name: '+ Add Question' }).click()
  await page.getByLabel('Question text').nth(0).fill(Q1)
  await page.getByLabel('Choice 1 of question 1', { exact: true }).fill('A base case')
  await page.getByLabel('Choice 2 of question 1', { exact: true }).fill('A pointer')
  await page.getByRole('button', { name: '+ Add Choice' }).click()
  await page.getByLabel('Choice 3 of question 1', { exact: true }).fill('A loop')
  await page.getByRole('button', { name: '+ Add Question' }).click()
  await page.getByLabel('Question text').nth(1).fill(Q2)
  await page.locator('#type-q1').selectOption('true_false')
  await page.getByRole('button', { name: 'Save Draft' }).click()
  await page.getByText('Saved', { exact: true }).waitFor()
  const questions = await q(
    db
      .from('questions')
      .select('id, position, question_type, question_text, choices(id, position, choice_text)')
      .eq('survey_id', surveyId)
      .order('position'),
  )
  assert(questions.length === 2, '2 question rows')
  assert(
    questions[0].choices.length === 3 && questions[1].choices.length === 2,
    '3 + 2 choice rows',
  )
  await shot(page, '2-questions-added')
  step('2. Instructor adds questions and answer choices', 'questions=2, choices=5 in database')

  // 3. Activate
  await page.getByRole('button', { name: 'Save & Activate' }).click()
  await page.waitForURL('**/present')
  await page.getByAltText(/QR code/).waitFor()
  const surveyUrl = await page.locator('a[href*="/s/"]').getAttribute('href')
  row = await q(db.from('surveys').select('status, public_slug').eq('id', surveyId).single())
  assert(row.status === 'active' && surveyUrl.endsWith(`/s/${row.public_slug}`), 'active with slug')
  const activeCount = (await q(db.from('surveys').select('id').eq('status', 'active'))).length
  assert(activeCount === 1, 'exactly one active survey')
  await page.getByText('Responses: 0').waitFor()
  await shot(page, '3-activated-present')
  step('3. Instructor activates the survey', `slug=${row.public_slug}, QR → ${surveyUrl}`)

  // 4 + 5. Two students on separate phones
  const answersFor = [
    { [Q1]: 'A base case', [Q2]: 'True' },
    { [Q1]: 'A loop', [Q2]: 'True' },
  ]
  for (const [i, picks] of answersFor.entries()) {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] })
    const phone = await ctx.newPage()
    phone.on('pageerror', (e) => errors.push(`student ${i + 1}: ${e}`))
    await phone.goto(surveyUrl)
    await phone.getByRole('heading', { name: TITLE }).waitFor()
    assert((await phone.getByRole('group').count()) === 2, 'student sees 2 questions')
    if (i === 0) {
      await phone.screenshot({ path: `${SHOTS}/4-student-opens.png`, fullPage: true })
      step('4. Student opens the survey (no login)', 'title and 2 questions rendered')
    }
    for (const [question, choice] of Object.entries(picks)) {
      await phone.getByRole('group', { name: question }).getByLabel(choice, { exact: true }).check()
    }
    await phone.getByRole('button', { name: 'Submit' }).click()
    await phone.getByText('Thank you!').waitFor()
    if (i === 0) {
      await phone.screenshot({ path: `${SHOTS}/5-student-submitted.png`, fullPage: true })
      await phone.reload()
      await phone.getByText('You have already submitted').waitFor()
    }
    await ctx.close()
  }
  step('5. Students submit answers', '2 students; resubmission blocked on reload')

  // 6. Stored in the database
  const responses = await q(
    db
      .from('responses')
      .select('id, submitted_at, anonymous_token, answers(question_id, choices(choice_text))')
      .eq('survey_id', surveyId),
  )
  assert(responses.length === 2, '2 response rows')
  const stored = responses
    .map((r) =>
      r.answers
        .map((a) => a.choices.choice_text)
        .sort()
        .join('+'),
    )
    .sort()
  assert(
    JSON.stringify(stored) === JSON.stringify(['A base case+True', 'A loop+True']),
    `answers stored: ${stored}`,
  )
  assert(
    responses.every((r) => r.anonymous_token),
    'tokens stored',
  )
  step('6. Responses are saved in the database', `responses=2, answers=4: ${stored.join(', ')}`)

  await page.getByText('Responses: 2').waitFor({ timeout: 15_000 })
  await shot(page, '6-present-count')
  step('   Presentation page shows the live count', 'Responses: 2')

  // 7. Results
  await page.getByRole('link', { name: 'View Results' }).click()
  await page.waitForURL('**/results')
  await page.getByText('2 responses', { exact: true }).waitFor()
  const rowText = async (choice) =>
    (
      await page
        .locator('tr', { has: page.getByRole('cell', { name: choice, exact: true }) })
        .first()
        .innerText()
    )
      .replace(/\s+/g, ' ')
      .trim()
  assert((await rowText('A base case')) === 'A base case 1 50.0%', 'base case 1 / 50%')
  assert((await rowText('A loop')) === 'A loop 1 50.0%', 'loop 1 / 50%')
  assert((await rowText('A pointer')) === 'A pointer 0 0.0%', 'pointer 0 / 0%')
  assert((await rowText('True')) === 'True 2 100.0%', 'true 2 / 100%')
  await shot(page, '7-results')
  await page.reload()
  await page.getByText('2 responses', { exact: true }).waitFor()
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export CSV' }).click(),
  ])
  const csv = readFileSync(await dl.path(), 'utf8')
    .trim()
    .split(/\r\n/)
  assert(csv.length === 3 && csv[0].includes(Q1), 'CSV header + 2 rows')
  step(
    '7. Instructor views the results',
    'counts/percentages correct, survive reload, CSV has 2 rows',
  )

  // Close: students are turned away
  await page.goto(`${BASE}/surveys/${surveyId}/present`)
  await page.getByRole('button', { name: 'Close Survey' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Close Survey' }).click()
  await page.waitForURL('**/results')
  const late = await browser.newContext({ ...devices['iPhone 13'] })
  const latePage = await late.newPage()
  await latePage.goto(surveyUrl)
  await latePage.getByText('no longer accepting responses').waitFor()
  await late.close()
  step('   Closing the survey turns students away')

  assert(errors.length === 0, `no page errors: ${errors.join('; ')}`)
  console.log(`\nAll ${passed} checks passed. Screenshots in ${SHOTS}/`)
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks: ${err.message}`)
  if (errors.length) console.error('Page errors:', errors)
  process.exitCode = 1
} finally {
  // Cleanup: remove the test survey (cascades) and restore the previous active survey.
  if (surveyId) {
    await db.from('surveys').update({ status: 'closed' }).eq('id', surveyId).eq('status', 'active')
    const { error } = await db.from('surveys').delete().eq('id', surveyId)
    console.log(error ? `cleanup failed: ${error.message}` : 'cleanup: test survey deleted')
  }
  if (previousActive) {
    const { error } = await db.rpc('activate_survey', { p_survey_id: previousActive.id })
    console.log(
      error
        ? `could not re-activate previous survey: ${error.message}`
        : 'cleanup: previous survey re-activated',
    )
  }
  await db.auth.signOut({ scope: 'local' })
  await browser.close()
  await server.close()
}
