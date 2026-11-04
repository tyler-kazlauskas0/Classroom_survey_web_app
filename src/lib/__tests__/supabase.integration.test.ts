/**
 * Live integration test: runs the Phase 4 workflow against the real
 * Supabase project using the app's own data layer (supabaseApi).
 *
 *   npm run test:integration
 *
 * Needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, E2E_INSTRUCTOR_EMAIL and
 * E2E_INSTRUCTOR_PASSWORD. Creates one "[E2E]" survey and deletes it at the
 * end. If another survey was active, it is re-activated afterwards.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { supabaseApi as api } from '../api/supabaseApi'
import { isSupabaseConfigured } from '../config'
import type { PublicSurvey } from '../types'

const email = process.env.E2E_INSTRUCTOR_EMAIL ?? ''
const password = process.env.E2E_INSTRUCTOR_PASSWORD ?? ''
const enabled = isSupabaseConfigured && Boolean(email && password)

const TITLE = `[E2E] Workflow ${new Date().toISOString()}`

describe.runIf(enabled).sequential('Supabase workflow (live)', () => {
  let surveyId = ''
  let slug = ''
  let previousActiveId: string | null = null
  let pub: PublicSurvey

  beforeAll(async () => {
    await api.signIn(email, password)
    previousActiveId = (await api.listSurveys()).find((s) => s.status === 'active')?.id ?? null
  })

  afterAll(async () => {
    await api.signIn(email, password)
    if (surveyId) {
      const s = await api.getSurvey(surveyId).catch(() => null)
      if (s?.status === 'active') await api.closeSurvey(surveyId)
      if (s) await api.deleteSurvey(surveyId)
    }
    if (previousActiveId) await api.activateSurvey(previousActiveId)
    await api.signOut()
  })

  it('1. instructor creates a survey', async () => {
    surveyId = await api.saveSurvey(null, {
      title: TITLE,
      description: 'Automated Phase 4 check',
      questions: [],
    })
    const s = await api.getSurvey(surveyId)
    expect(s).toMatchObject({ title: TITLE, status: 'draft', public_slug: null })
    expect(s.questions).toHaveLength(0)
    const listed = await api.listSurveys()
    expect(listed.some((x) => x.id === surveyId)).toBe(true)
  })

  it('2. instructor adds questions and answer choices', async () => {
    await api.saveSurvey(surveyId, {
      title: TITLE,
      description: 'Automated Phase 4 check',
      questions: [
        {
          question_text: 'What is required for a recursive function?',
          question_type: 'multiple_choice',
          choices: [
            { choice_text: 'A base case' },
            { choice_text: 'A pointer' },
            { choice_text: 'A loop' },
          ],
        },
        {
          question_text: 'Every recursive function needs a stopping condition.',
          question_type: 'true_false',
          choices: [{ choice_text: 'True' }, { choice_text: 'False' }],
        },
      ],
    })
    const s = await api.getSurvey(surveyId)
    expect(s.questions.map((q) => [q.position, q.question_type, q.choices.length])).toEqual([
      [1, 'multiple_choice', 3],
      [2, 'true_false', 2],
    ])
    expect(s.questions[0].choices.map((c) => c.choice_text)).toEqual([
      'A base case',
      'A pointer',
      'A loop',
    ])
  })

  it('3. instructor activates the survey', async () => {
    const s = await api.activateSurvey(surveyId)
    expect(s.status).toBe('active')
    expect(s.public_slug).toMatch(/^[2-9a-z]{8}$/)
    slug = s.public_slug!
    const active = (await api.listSurveys()).filter((x) => x.status === 'active')
    expect(active.map((x) => x.id)).toEqual([surveyId])
  })

  it('4. student (not logged in) opens the survey', async () => {
    await api.signOut()
    expect(await api.getSession()).toBeNull()
    const res = await api.getPublicSurvey(slug)
    expect(res.status).toBe('active')
    if (res.status !== 'active') return
    pub = res.data
    expect(pub.survey.title).toBe(TITLE)
    expect(pub.questions).toHaveLength(2)
    expect(JSON.stringify(pub)).not.toMatch(/response/i)
    expect((await api.getPublicSurvey('doesnotexist')).status).toBe('not_found')
  })

  it('5. students submit answers (duplicates rejected)', async () => {
    const [mc, tf] = pub.questions
    const submit = (token: string, mcIdx: number, tfIdx: number) =>
      api.submitResponse(surveyId, token, [
        { question_id: mc.id, choice_id: mc.choices[mcIdx].id },
        { question_id: tf.id, choice_id: tf.choices[tfIdx].id },
      ])
    const tokens = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]
    const r1 = await submit(tokens[0], 0, 0) // base case, True
    await submit(tokens[1], 0, 0) // base case, True
    await submit(tokens[2], 2, 1) // loop, False
    expect(r1).toMatchObject({ success: true })
    expect(r1.response_id).toMatch(/^[0-9a-f-]{36}$/)

    await expect(submit(tokens[0], 1, 1)).rejects.toMatchObject({ code: 'DUPLICATE_RESPONSE' })
    await expect(
      api.submitResponse(surveyId, crypto.randomUUID(), [
        { question_id: mc.id, choice_id: mc.choices[0].id },
      ]),
    ).rejects.toMatchObject({ code: 'MISSING_REQUIRED_ANSWER' })
    await expect(
      api.submitResponse(surveyId, crypto.randomUUID(), [
        { question_id: mc.id, choice_id: tf.choices[0].id },
        { question_id: tf.id, choice_id: tf.choices[0].id },
      ]),
    ).rejects.toMatchObject({ code: 'INVALID_CHOICE' })
  })

  it('   students cannot read results or responses', async () => {
    await expect(api.getResults(surveyId)).rejects.toBeTruthy()
    await expect(api.getResponseCount(surveyId)).rejects.toBeTruthy()
    await expect(api.getExportData(surveyId)).rejects.toBeTruthy()
  })

  it('6. responses are saved in the database', async () => {
    await api.signIn(email, password)
    expect(await api.getResponseCount(surveyId)).toBe(3)
    const data = await api.getExportData(surveyId)
    expect(data.responses).toHaveLength(3)
    expect(data.answers).toHaveLength(6)
    const listed = (await api.listSurveys()).find((s) => s.id === surveyId)
    expect(listed?.response_count).toBe(3)
  })

  it('7. instructor views the results', async () => {
    const r = await api.getResults(surveyId)
    expect(r.response_count).toBe(3)
    const [mc, tf] = r.questions
    expect(mc.response_count).toBe(3)
    expect(mc.choices.map((c) => [c.choice_text, c.count, c.percentage])).toEqual([
      ['A base case', 2, 66.7],
      ['A pointer', 0, 0],
      ['A loop', 1, 33.3],
    ])
    expect(tf.choices.map((c) => [c.choice_text, c.count, c.percentage])).toEqual([
      ['True', 2, 66.7],
      ['False', 1, 33.3],
    ])
  })

  it('   closing the survey stops submissions immediately', async () => {
    await api.closeSurvey(surveyId)
    await api.signOut()
    expect((await api.getPublicSurvey(slug)).status).toBe('closed')
    const [mc, tf] = pub.questions
    await expect(
      api.submitResponse(surveyId, crypto.randomUUID(), [
        { question_id: mc.id, choice_id: mc.choices[0].id },
        { question_id: tf.id, choice_id: tf.choices[0].id },
      ]),
    ).rejects.toMatchObject({ code: 'SURVEY_NOT_ACTIVE' })
  })
})
