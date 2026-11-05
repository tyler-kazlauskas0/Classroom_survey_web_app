/**
 * Live test for instructor accounts (migration 004 + "Create account").
 *
 *   npm run test:accounts
 *
 * Requires in Supabase: migration 004 applied, "Allow new users to sign up" ON,
 * and preferably "Confirm email" OFF. Uses E2E_INSTRUCTOR_EMAIL/PASSWORD as
 * instructor A and creates a new instructor B through the real sign-up page,
 * as A's address with "+e2e-<time>" added. B's surveys are deleted afterwards;
 * the B account itself can only be removed in Supabase → Authentication → Users
 * (the app never holds an admin key), so its address is printed at the end.
 */
import { createClient } from '@supabase/supabase-js'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
import { createServer, loadEnv } from 'vite'

const env = { ...loadEnv('development', process.cwd(), ''), ...process.env }
const SUPA = (env.VITE_SUPABASE_URL ?? '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/(rest|auth)\/v1$/, '')
const KEY = env.VITE_SUPABASE_ANON_KEY
const A_EMAIL = env.E2E_INSTRUCTOR_EMAIL
const A_PASSWORD = env.E2E_INSTRUCTOR_PASSWORD
if (!SUPA || !KEY || !A_EMAIL || !A_PASSWORD) {
  console.error('Missing Supabase / E2E_INSTRUCTOR_* environment variables')
  process.exit(1)
}
const SHOTS = 'e2e/screenshots/accounts'
mkdirSync(SHOTS, { recursive: true })

const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
const B_EMAIL = A_EMAIL.replace('@', `+e2e-${stamp}@`)
const B_PASSWORD = `E2e-${crypto.randomUUID()}`

const client = () =>
  createClient(SUPA, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const dbA = client()
const anon = client()
const q = async (p) => {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data
}
let passed = 0
const ok = (label, detail = '') => {
  passed++
  console.log(`✓ ${label}${detail ? `  — ${detail}` : ''}`)
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

// ---- preconditions ---------------------------------------------------------
await q(dbA.auth.signInWithPassword({ email: A_EMAIL, password: A_PASSWORD }))
{
  const { error } = await dbA.from('surveys').select('owner_id').limit(1)
  if (error) {
    console.error('✗ Migration 004 is not applied (surveys.owner_id missing).')
    console.error(
      '  Run supabase/migrations/20261105000004_instructor_accounts.sql in the SQL Editor.',
    )
    process.exit(1)
  }
}

const previousActive = (await q(dbA.from('surveys').select('id').eq('status', 'active')))[0] ?? null

const server = await createServer({ server: { port: 5194, strictPort: true }, logLevel: 'error' })
await server.listen()
const BASE = 'http://localhost:5194'
const browser = await chromium.launch()
const errors = []
let aSurvey = null
let bClient = null

try {
  // Instructor A: an active survey with one response.
  const aId = await q(
    dbA.rpc('save_survey', {
      p_survey_id: null,
      p_title: `[E2E] Instructor A ${stamp}`,
      p_description: null,
      p_questions: [{ question_text: 'A only?', question_type: 'true_false' }],
    }),
  )
  aSurvey = aId
  await q(dbA.rpc('activate_survey', { p_survey_id: aId }))
  const aq = await q(dbA.from('questions').select('id, choices(id)').eq('survey_id', aId))
  await q(
    anon.rpc('submit_survey_response', {
      p_survey_id: aId,
      p_anonymous_token: crypto.randomUUID(),
      p_answers: [{ question_id: aq[0].id, choice_id: aq[0].choices[0].id }],
    }),
  )
  ok('Instructor A has an active survey with 1 response')

  // Instructor B signs up through the UI.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}/`)
  await page.getByRole('link', { name: 'Create an instructor account' }).click()
  await page.getByLabel('Email').fill(B_EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(B_PASSWORD)
  await page.getByLabel('Confirm password').fill(B_PASSWORD)
  await page.screenshot({ path: `${SHOTS}/1-signup-form.png` })
  await page.getByRole('button', { name: 'Create account' }).click()
  const outcome = await Promise.race([
    page.waitForURL('**/dashboard').then(() => 'dashboard'),
    page
      .getByText('Check your email')
      .waitFor()
      .then(() => 'confirm'),
    page
      .getByRole('alert')
      .waitFor()
      .then(async () => `error: ${await page.getByRole('alert').textContent()}`),
  ])
  if (outcome === 'confirm')
    throw new Error(
      'Supabase "Confirm email" is ON, so the account needs an emailed link. Turn it off (Authentication → Sign In / Providers → Email) to test, or confirm manually.',
    )
  if (outcome !== 'dashboard') throw new Error(`Sign-up failed: ${outcome}`)
  ok('Instructor B creates an account and lands on the dashboard', B_EMAIL.replace(/^[^+]+/, '…'))

  await page.getByText('You have not created any surveys yet.').waitFor()
  assert((await page.getByText(`[E2E] Instructor A ${stamp}`).count()) === 0, "B sees A's survey")
  await page.screenshot({ path: `${SHOTS}/2-new-account-dashboard.png` })
  ok("B's dashboard is empty: A's surveys are not visible")

  for (const path of ['results', 'edit', 'present']) {
    await page.goto(`${BASE}/surveys/${aId}/${path}`)
    await page.getByText('Survey not found.').waitFor()
  }
  ok('B gets "Survey not found" for A\'s results, editor and presentation pages')

  // Direct API attempts as B.
  bClient = client()
  await q(bClient.auth.signInWithPassword({ email: B_EMAIL, password: B_PASSWORD }))
  assert(
    (await q(bClient.from('surveys').select('id').eq('id', aId))).length === 0,
    'B reads A survey via API',
  )
  assert(
    (await q(bClient.from('responses').select('id').eq('survey_id', aId))).length === 0,
    'B reads A responses',
  )
  assert(
    (await q(bClient.rpc('get_survey_results', { p_survey_id: aId }))) === null,
    'B reads A results',
  )
  const upd = await bClient.from('surveys').update({ title: 'hijacked' }).eq('id', aId).select('id')
  assert(!upd.error && upd.data.length === 0, 'B renamed A survey')
  const del = await bClient.from('surveys').delete().eq('id', aId).select('id')
  assert(!del.error && del.data.length === 0, 'B deleted A survey')
  const cls = await bClient.rpc('close_survey', { p_survey_id: aId })
  assert(cls.error && /SURVEY_NOT_FOUND/.test(cls.error.message), 'B closed A survey')
  ok("B cannot read, rename, delete or close A's survey through the API")

  // B creates and activates a survey in the UI; A's stays active.
  await page.goto(`${BASE}/surveys/new`)
  await page.getByLabel(/Survey Title/).fill(`[E2E] Instructor B ${stamp}`)
  await page.getByLabel('Question text').first().fill('B question?')
  await page.locator('#type-q0').selectOption('true_false')
  await page.getByRole('button', { name: 'Save & Activate' }).click()
  await page.waitForURL('**/present')
  await page.getByAltText(/QR code/).waitFor()
  const aStatus = (await q(dbA.from('surveys').select('status').eq('id', aId).single())).status
  assert(aStatus === 'active', `A's survey was closed (${aStatus})`)
  ok("B activates a survey; A's survey stays active (one active survey per instructor)")

  const aSeesB = await q(
    dbA.from('surveys').select('id').like('title', `[E2E] Instructor B ${stamp}`),
  )
  assert(aSeesB.length === 0, "A sees B's survey")
  ok("A cannot see B's survey")

  await page.getByRole('link', { name: '← Dashboard' }).click()
  await page.getByRole('button', { name: 'Log out' }).click()
  await page.goto(`${BASE}/login`)
  await page.getByLabel('Email').fill(B_EMAIL)
  await page.getByLabel('Password').fill(B_PASSWORD)
  await page.getByRole('button', { name: 'Log In' }).click()
  await page.waitForURL('**/dashboard')
  await page.getByRole('link', { name: `[E2E] Instructor B ${stamp}` }).waitFor()
  ok('B logs out and back in; their survey is still there')

  // Duplicate sign-up is refused with a friendly message.
  const ctx2 = await browser.newContext()
  const p2 = await ctx2.newPage()
  await p2.goto(`${BASE}/signup`)
  await p2.getByLabel('Email').fill(B_EMAIL)
  await p2.getByLabel('Password', { exact: true }).fill(B_PASSWORD)
  await p2.getByLabel('Confirm password').fill(B_PASSWORD)
  await p2.getByRole('button', { name: 'Create account' }).click()
  await p2.getByText(/already exists/i).waitFor()
  await ctx2.close()
  ok('Signing up again with the same email shows "already exists"')

  assert(errors.length === 0, `page errors: ${errors.join('; ')}`)
  console.log(`\nAll ${passed} checks passed.`)
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks: ${err.message}`)
  process.exitCode = 1
} finally {
  if (bClient) {
    const mine = await bClient.from('surveys').select('id, status')
    for (const s of mine.data ?? []) {
      if (s.status === 'active') await bClient.rpc('close_survey', { p_survey_id: s.id })
      await bClient.from('surveys').delete().eq('id', s.id)
    }
    await bClient.auth.signOut({ scope: 'local' })
  }
  if (aSurvey) {
    await dbA.rpc('close_survey', { p_survey_id: aSurvey })
    await dbA.from('surveys').delete().eq('id', aSurvey)
  }
  if (previousActive) await dbA.rpc('activate_survey', { p_survey_id: previousActive.id })
  await dbA.auth.signOut({ scope: 'local' })
  await browser.close()
  await server.close()
  console.log(
    `cleanup: test surveys deleted. Test account to remove in Supabase → Authentication → Users: ${B_EMAIL}`,
  )
}
