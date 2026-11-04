import { describe, expect, it } from 'vitest'
import { buildResultsCsv, csvFilename, escapeCsvCell } from '../csv'
import { AppError, friendlyMessage, toAppError } from '../errors'
import { computeResults, percent } from '../results'
import type { ExportData } from '../types'
import { normaliseDraft, validateDraft } from '../validation'

const data: ExportData = {
  survey: {
    id: 's1',
    title: 'T',
    description: null,
    status: 'closed',
    public_slug: 'abc',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  questions: [
    {
      id: 'q2',
      survey_id: 's1',
      question_text: 'Second, "quoted"',
      question_type: 'true_false',
      position: 2,
      choices: [
        { id: 't', question_id: 'q2', choice_text: 'True', position: 1 },
        { id: 'f', question_id: 'q2', choice_text: 'False', position: 2 },
      ],
    },
    {
      id: 'q1',
      survey_id: 's1',
      question_text: 'First',
      question_type: 'multiple_choice',
      position: 1,
      choices: [
        { id: 'b', question_id: 'q1', choice_text: '=SUM(A1)', position: 2 },
        { id: 'a', question_id: 'q1', choice_text: 'A base case', position: 1 },
      ],
    },
  ],
  responses: [
    { id: 'r2', submitted_at: '2026-01-01T00:02:00Z' },
    { id: 'r1', submitted_at: '2026-01-01T00:01:00Z' },
    { id: 'r3', submitted_at: '2026-01-01T00:03:00Z' },
  ],
  answers: [
    { response_id: 'r1', question_id: 'q1', choice_id: 'a' },
    { response_id: 'r1', question_id: 'q2', choice_id: 't' },
    { response_id: 'r2', question_id: 'q1', choice_id: 'a' },
    { response_id: 'r2', question_id: 'q2', choice_id: 'f' },
    { response_id: 'r3', question_id: 'q1', choice_id: 'b' },
  ],
}

describe('results', () => {
  it('rounds percentages to one decimal and handles zero', () => {
    expect(percent(45, 52)).toBe(86.5)
    expect(percent(0, 0)).toBe(0)
  })
  it('aggregates by question in position order', () => {
    const r = computeResults(data)
    expect(r.response_count).toBe(3)
    expect(r.questions.map((q) => q.question_id)).toEqual(['q1', 'q2'])
    expect(r.questions[0].choices).toMatchObject([
      { choice_id: 'a', count: 2, percentage: 66.7 },
      { choice_id: 'b', count: 1, percentage: 33.3 },
    ])
    expect(r.questions[1].response_count).toBe(2)
    expect(r.questions[1].choices.map((c) => c.percentage)).toEqual([50, 50])
  })
})

describe('csv', () => {
  it('escapes quotes, commas, newlines and formula prefixes', () => {
    expect(escapeCsvCell('plain')).toBe('plain')
    expect(escapeCsvCell('a,b')).toBe('"a,b"')
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""')
    expect(escapeCsvCell('line\nbreak')).toBe('"line\nbreak"')
    expect(escapeCsvCell('=1+1')).toBe("'=1+1")
    expect(escapeCsvCell('-5')).toBe("'-5")
    expect(escapeCsvCell(null)).toBe('')
  })
  it('writes one row per response, ordered by time, with question headers', () => {
    const lines = buildResultsCsv(data).trimEnd().split('\r\n')
    expect(lines[0]).toBe('response_id,submitted_at,Q1: First,"Q2: Second, ""quoted"""')
    expect(lines[1]).toBe('r1,2026-01-01T00:01:00Z,A base case,True')
    expect(lines[2]).toBe('r2,2026-01-01T00:02:00Z,A base case,False')
    expect(lines[3]).toBe("r3,2026-01-01T00:03:00Z,'=SUM(A1),")
  })
  it('builds a safe filename', () => {
    expect(csvFilename('Recursion: Check #1', new Date('2026-08-17T10:00:00Z'))).toBe(
      'recursion-check-1-results-2026-08-17.csv',
    )
  })
})

describe('validation', () => {
  it('requires title, question text and two distinct choices', () => {
    const errs = validateDraft({
      title: ' ',
      description: '',
      questions: [
        { question_text: '', question_type: 'multiple_choice', choices: [{ choice_text: 'A' }] },
        {
          question_text: 'Q',
          question_type: 'multiple_choice',
          choices: [{ choice_text: 'A' }, { choice_text: 'a ' }],
        },
        { question_text: 'TF', question_type: 'true_false', choices: [] },
      ],
    })
    expect(Object.keys(errs).sort()).toEqual(['q0.choices', 'q0.text', 'q1.c1', 'title'])
  })
  it('requires a question only for activation', () => {
    const draft = { title: 'T', description: '', questions: [] }
    expect(validateDraft(draft)).toEqual({})
    expect(validateDraft(draft, { forActivation: true })).toHaveProperty('questions')
  })
  it('normalises true/false choices', () => {
    const d = normaliseDraft({
      title: ' T ',
      description: '',
      questions: [
        { question_text: ' Q ', question_type: 'true_false', choices: [{ choice_text: 'x' }] },
      ],
    })
    expect(d.title).toBe('T')
    expect(d.questions[0].choices).toEqual([{ choice_text: 'True' }, { choice_text: 'False' }])
  })
})

describe('errors', () => {
  it('maps database exception text to codes without leaking raw messages', () => {
    expect(toAppError({ message: 'P0001: DUPLICATE_RESPONSE' }).code).toBe('DUPLICATE_RESPONSE')
    expect(toAppError(new TypeError('Failed to fetch')).code).toBe('NETWORK_ERROR')
    expect(friendlyMessage({ message: 'relation "x" does not exist' })).toBe(
      'Something went wrong. Please try again.',
    )
    expect(toAppError(new AppError('SURVEY_NOT_FOUND')).code).toBe('SURVEY_NOT_FOUND')
  })
})

describe('localDateKey', () => {
  it('uses the local calendar day, not the UTC day', async () => {
    const { localDateKey } = await import('../format')
    expect(localDateKey(new Date(2026, 0, 1, 23, 30).toISOString())).toBe('2026-01-01')
    expect(localDateKey(new Date(2026, 0, 2, 0, 15).toISOString())).toBe('2026-01-02')
  })
})

describe('randomId', () => {
  it('returns a v4 UUID even when crypto.randomUUID is unavailable (plain-HTTP pages)', async () => {
    const { randomId } = await import('../id')
    const original = crypto.randomUUID
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
    try {
      const ids = new Set(Array.from({ length: 1000 }, randomId))
      expect(ids.size).toBe(1000)
      for (const id of ids)
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true })
    }
  })
})
