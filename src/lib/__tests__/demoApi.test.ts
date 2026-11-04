import { beforeEach, describe, expect, it } from 'vitest'
import { DEMO_EMAIL, DEMO_PASSWORD, demoApi as api, resetDemoData } from '../api/demoApi'

const draft = {
  title: 'Recursion',
  description: '',
  questions: [
    {
      question_text: 'Needs?',
      question_type: 'multiple_choice' as const,
      choices: [{ choice_text: 'Base case' }, { choice_text: 'Loop' }],
    },
    {
      question_text: 'Stops?',
      question_type: 'true_false' as const,
      choices: [{ choice_text: 'True' }, { choice_text: 'False' }],
    },
  ],
}

beforeEach(async () => {
  localStorage.clear()
  resetDemoData()
  await api.signIn(DEMO_EMAIL, DEMO_PASSWORD)
})

async function answersFor(slug: string) {
  const pub = await api.getPublicSurvey(slug)
  if (pub.status !== 'active') throw new Error('not active')
  return {
    surveyId: pub.data.survey.id,
    answers: pub.data.questions.map((q) => ({ question_id: q.id, choice_id: q.choices[0].id })),
  }
}

describe('demo backend', () => {
  it('rejects bad credentials and requires auth for instructor calls', async () => {
    await api.signOut()
    await expect(api.signIn(DEMO_EMAIL, 'wrong')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    })
    await expect(api.listSurveys()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
  })

  it('runs the full lifecycle: create → activate → submit → close → results', async () => {
    const id = await api.saveSurvey(null, draft)
    const s = await api.activateSurvey(id)
    expect(s.status).toBe('active')
    expect(s.public_slug).toMatch(/^[a-z2-9]{8}$/)

    const { surveyId, answers } = await answersFor(s.public_slug!)
    await api.submitResponse(surveyId, 'tok-1', answers)
    await expect(api.submitResponse(surveyId, 'tok-1', answers)).rejects.toMatchObject({
      code: 'DUPLICATE_RESPONSE',
    })
    await expect(api.submitResponse(surveyId, 'tok-2', answers.slice(1))).rejects.toMatchObject({
      code: 'MISSING_REQUIRED_ANSWER',
    })
    expect(await api.getResponseCount(id)).toBe(1)

    await api.closeSurvey(id)
    expect((await api.getPublicSurvey(s.public_slug!)).status).toBe('closed')
    await expect(api.submitResponse(surveyId, 'tok-3', answers)).rejects.toMatchObject({
      code: 'SURVEY_NOT_ACTIVE',
    })

    const results = await api.getResults(id)
    expect(results.response_count).toBe(1)
    expect(results.questions[0].choices[0]).toMatchObject({ count: 1, percentage: 100 })
  })

  it('keeps only one survey active', async () => {
    const a = await api.saveSurvey(null, draft)
    const b = await api.saveSurvey(null, { ...draft, title: 'Other' })
    await api.activateSurvey(a)
    await api.activateSurvey(b)
    const active = (await api.listSurveys()).filter((s) => s.status === 'active')
    expect(active.map((s) => s.id)).toEqual([b])
  })

  it('only allows editing drafts and duplicates as a draft copy', async () => {
    const id = await api.saveSurvey(null, draft)
    await api.activateSurvey(id)
    await expect(api.saveSurvey(id, draft)).rejects.toMatchObject({ code: 'SURVEY_NOT_EDITABLE' })
    const copyId = await api.duplicateSurvey(id)
    const copy = await api.getSurvey(copyId)
    expect(copy).toMatchObject({ title: 'Copy of Recursion', status: 'draft', public_slug: null })
    expect(copy.questions).toHaveLength(2)
    expect(copy.questions[1].choices.map((c) => c.choice_text)).toEqual(['True', 'False'])
  })

  it('does not allow deleting or archiving the active survey', async () => {
    const id = await api.saveSurvey(null, draft)
    await api.activateSurvey(id)
    await expect(api.deleteSurvey(id)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
    await expect(api.archiveSurvey(id)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
  })

  it('reports unknown slugs as not found', async () => {
    expect((await api.getPublicSurvey('nope')).status).toBe('not_found')
  })
})
