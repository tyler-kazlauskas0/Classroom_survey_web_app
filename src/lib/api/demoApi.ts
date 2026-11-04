/**
 * In-browser demo backend used when Supabase is not configured.
 * Data lives in localStorage and follows the same rules as the database
 * functions (one active survey, draft-only editing, duplicate protection),
 * so every page can be exercised locally. Not secure — demo only.
 */
import { AppError } from '../errors'
import { computeResults } from '../results'
import { generateSlug } from '../slug'
import type {
  Choice,
  ExportData,
  InstructorSession,
  PublicSurveyLookup,
  Question,
  Survey,
  SurveyDraft,
  SurveyStatus,
} from '../types'
import type { SurveyApi } from './types'
import { randomId } from '../id'

export const DEMO_EMAIL = 'instructor@example.com'
export const DEMO_PASSWORD = 'demo1234'

const DB_KEY = 'cs.demo.db'
const SESSION_KEY = 'cs.demo.session'

interface Row<T> {
  [id: string]: T
}
interface DemoDb {
  surveys: Row<Survey>
  questions: Row<Omit<Question, 'choices'>>
  choices: Row<Choice>
  responses: Row<{ id: string; survey_id: string; anonymous_token: string; submitted_at: string }>
  answers: Row<{ id: string; response_id: string; question_id: string; choice_id: string | null }>
}

const uuid = () => randomId()
const now = () => new Date().toISOString()
const delay = (ms = 120) =>
  import.meta.env.MODE === 'test' ? Promise.resolve() : new Promise((r) => setTimeout(r, ms))

function emptyDb(): DemoDb {
  return { surveys: {}, questions: {}, choices: {}, responses: {}, answers: {} }
}

function insertContent(db: DemoDb, surveyId: string, draft: SurveyDraft): void {
  draft.questions.forEach((q, qi) => {
    const qid = uuid()
    db.questions[qid] = {
      id: qid,
      survey_id: surveyId,
      question_text: q.question_text,
      question_type: q.question_type,
      position: qi + 1,
    }
    q.choices.forEach((c, ci) => {
      const cid = uuid()
      db.choices[cid] = { id: cid, question_id: qid, choice_text: c.choice_text, position: ci + 1 }
    })
  })
}

function seed(): DemoDb {
  const db = emptyDb()
  const mk = (title: string, description: string, status: SurveyStatus, daysAgo: number) => {
    const id = uuid()
    const t = new Date(Date.now() - daysAgo * 86_400_000).toISOString()
    db.surveys[id] = {
      id,
      title,
      description,
      status,
      public_slug: status === 'draft' ? null : generateSlug(),
      created_at: t,
      updated_at: t,
    }
    return id
  }
  const recursion = mk('Recursion Concept Check', 'Quick understanding check', 'draft', 0)
  insertContent(db, recursion, {
    title: '',
    description: '',
    questions: [
      {
        question_text: 'What is required for a recursive function?',
        question_type: 'multiple_choice',
        choices: [
          { choice_text: 'A base case' },
          { choice_text: 'A pointer' },
          { choice_text: 'A loop' },
          { choice_text: 'A compiler' },
        ],
      },
      {
        question_text: 'Every recursive function needs a stopping condition.',
        question_type: 'true_false',
        choices: [{ choice_text: 'True' }, { choice_text: 'False' }],
      },
    ],
  })

  const pointers = mk('Pointer Review', 'End-of-week review', 'closed', 7)
  insertContent(db, pointers, {
    title: '',
    description: '',
    questions: [
      {
        question_text: 'What does the & operator return in C?',
        question_type: 'multiple_choice',
        choices: [
          { choice_text: 'The address of a variable' },
          { choice_text: 'The value at an address' },
          { choice_text: 'A bitwise OR' },
        ],
      },
      {
        question_text: 'A NULL pointer can be safely dereferenced.',
        question_type: 'true_false',
        choices: [{ choice_text: 'True' }, { choice_text: 'False' }],
      },
    ],
  })
  // Simulated class responses for the closed survey.
  const qs = Object.values(db.questions).filter((q) => q.survey_id === pointers)
  const weights = [
    [18, 4, 2],
    [3, 21],
  ]
  for (let i = 0; i < 24; i++) {
    const rid = uuid()
    db.responses[rid] = {
      id: rid,
      survey_id: pointers,
      anonymous_token: `seed-${i}`,
      submitted_at: new Date(Date.now() - 7 * 86_400_000 + i * 20_000).toISOString(),
    }
    qs.forEach((q, qi) => {
      const choices = Object.values(db.choices)
        .filter((c) => c.question_id === q.id)
        .sort((a, b) => a.position - b.position)
      let n = i
      let pick = 0
      while (pick < weights[qi].length - 1 && n >= weights[qi][pick]) n -= weights[qi][pick++]
      const aid = uuid()
      db.answers[aid] = {
        id: aid,
        response_id: rid,
        question_id: q.id,
        choice_id: choices[pick].id,
      }
    })
  }

  mk('Big-O Warm-up', 'Archived from last term', 'archived', 120)
  return db
}

function load(): DemoDb {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) return JSON.parse(raw) as DemoDb
  } catch {
    /* fall through */
  }
  const db = seed()
  save(db)
  return db
}
function save(db: DemoDb): void {
  localStorage.setItem(DB_KEY, JSON.stringify(db))
}

function requireSurvey(db: DemoDb, id: string): Survey {
  const s = db.surveys[id]
  if (!s) throw new AppError('SURVEY_NOT_FOUND')
  return s
}

function questionsFor(db: DemoDb, surveyId: string): Question[] {
  return Object.values(db.questions)
    .filter((q) => q.survey_id === surveyId)
    .sort((a, b) => a.position - b.position)
    .map((q) => ({
      ...q,
      choices: Object.values(db.choices)
        .filter((c) => c.question_id === q.id)
        .sort((a, b) => a.position - b.position),
    }))
}

function deleteContent(db: DemoDb, surveyId: string): void {
  for (const q of Object.values(db.questions).filter((q) => q.survey_id === surveyId)) {
    for (const c of Object.values(db.choices)) if (c.question_id === q.id) delete db.choices[c.id]
    delete db.questions[q.id]
  }
}

function setStatus(s: Survey, status: SurveyStatus): void {
  s.status = status
  s.updated_at = now()
}

const listeners = new Set<(s: InstructorSession | null) => void>()
function currentSession(): InstructorSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as InstructorSession) : null
  } catch {
    return null
  }
}
function requireAuth(): void {
  if (!currentSession()) throw new AppError('AUTH_REQUIRED')
}

export function resetDemoData(): void {
  localStorage.removeItem(DB_KEY)
}

export const demoApi: SurveyApi = {
  mode: 'demo',

  async signIn(email, password) {
    await delay(300)
    if (email.trim().toLowerCase() !== DEMO_EMAIL || password !== DEMO_PASSWORD)
      throw new AppError('INVALID_CREDENTIALS')
    const session = { email: DEMO_EMAIL }
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    listeners.forEach((l) => l(session))
    return session
  },
  async signOut() {
    localStorage.removeItem(SESSION_KEY)
    listeners.forEach((l) => l(null))
  },
  async getSession() {
    return currentSession()
  },
  onAuthStateChange(cb) {
    listeners.add(cb)
    return () => listeners.delete(cb)
  },

  async listSurveys() {
    await delay()
    requireAuth()
    const db = load()
    const counts = new Map<string, number>()
    for (const r of Object.values(db.responses))
      counts.set(r.survey_id, (counts.get(r.survey_id) ?? 0) + 1)
    return Object.values(db.surveys)
      .map((s) => ({ ...s, response_count: counts.get(s.id) ?? 0 }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  },

  async getSurvey(id) {
    await delay()
    requireAuth()
    const db = load()
    return { ...requireSurvey(db, id), questions: questionsFor(db, id) }
  },

  async saveSurvey(id, draft) {
    await delay(250)
    requireAuth()
    const db = load()
    let survey: Survey
    if (id === null) {
      const t = now()
      survey = {
        id: uuid(),
        title: draft.title,
        description: draft.description || null,
        status: 'draft',
        public_slug: null,
        created_at: t,
        updated_at: t,
      }
      db.surveys[survey.id] = survey
    } else {
      survey = requireSurvey(db, id)
      if (survey.status !== 'draft') throw new AppError('SURVEY_NOT_EDITABLE')
      survey.title = draft.title
      survey.description = draft.description || null
      survey.updated_at = now()
      deleteContent(db, id)
    }
    insertContent(db, survey.id, draft)
    save(db)
    return survey.id
  },

  async deleteSurvey(id) {
    await delay()
    requireAuth()
    const db = load()
    const s = requireSurvey(db, id)
    if (s.status === 'active') throw new AppError('INVALID_TRANSITION')
    const responseIds = new Set(
      Object.values(db.responses)
        .filter((r) => r.survey_id === id)
        .map((r) => r.id),
    )
    for (const a of Object.values(db.answers))
      if (responseIds.has(a.response_id)) delete db.answers[a.id]
    responseIds.forEach((rid) => delete db.responses[rid])
    deleteContent(db, id)
    delete db.surveys[id]
    save(db)
  },

  async archiveSurvey(id) {
    await delay()
    requireAuth()
    const db = load()
    const s = requireSurvey(db, id)
    if (s.status !== 'draft' && s.status !== 'closed') throw new AppError('INVALID_TRANSITION')
    setStatus(s, 'archived')
    save(db)
  },

  async unarchiveSurvey(id) {
    await delay()
    requireAuth()
    const db = load()
    const s = requireSurvey(db, id)
    if (s.status !== 'archived') throw new AppError('INVALID_TRANSITION')
    // Never-activated surveys return to Draft; others to Closed.
    setStatus(s, s.public_slug ? 'closed' : 'draft')
    save(db)
  },

  async duplicateSurvey(id) {
    await delay(250)
    requireAuth()
    const db = load()
    const src = requireSurvey(db, id)
    const t = now()
    const copy: Survey = {
      id: uuid(),
      title: `Copy of ${src.title}`,
      description: src.description,
      status: 'draft',
      public_slug: null,
      created_at: t,
      updated_at: t,
    }
    db.surveys[copy.id] = copy
    insertContent(db, copy.id, {
      title: copy.title,
      description: copy.description ?? '',
      questions: questionsFor(db, id),
    })
    save(db)
    return copy.id
  },

  async activateSurvey(id) {
    await delay(250)
    requireAuth()
    const db = load()
    const s = requireSurvey(db, id)
    if (s.status === 'active') return s
    if (s.status === 'archived') throw new AppError('INVALID_TRANSITION')
    if (questionsFor(db, id).length === 0) throw new AppError('VALIDATION_ERROR')
    for (const other of Object.values(db.surveys))
      if (other.status === 'active') setStatus(other, 'closed')
    s.public_slug ??= generateSlug()
    setStatus(s, 'active')
    save(db)
    return s
  },

  async closeSurvey(id) {
    await delay()
    requireAuth()
    const db = load()
    const s = requireSurvey(db, id)
    if (s.status !== 'active') throw new AppError('INVALID_TRANSITION')
    setStatus(s, 'closed')
    save(db)
  },

  async getResponseCount(id) {
    requireAuth()
    return Object.values(load().responses).filter((r) => r.survey_id === id).length
  },

  async getSurveyStatus(id) {
    requireAuth()
    return requireSurvey(load(), id).status
  },

  async getResults(id) {
    await delay()
    return computeResults(await this.getExportData(id))
  },

  async getExportData(id): Promise<ExportData> {
    requireAuth()
    const db = load()
    const survey = requireSurvey(db, id)
    const responses = Object.values(db.responses).filter((r) => r.survey_id === id)
    const ids = new Set(responses.map((r) => r.id))
    return {
      survey,
      questions: questionsFor(db, id),
      responses: responses.map(({ id, submitted_at }) => ({ id, submitted_at })),
      answers: Object.values(db.answers).filter((a) => ids.has(a.response_id)),
    }
  },

  async getPublicSurvey(slug): Promise<PublicSurveyLookup> {
    await delay()
    const db = load()
    const s = Object.values(db.surveys).find((x) => x.public_slug === slug)
    if (!s) return { status: 'not_found' }
    if (s.status !== 'active') return { status: 'closed' }
    return {
      status: 'active',
      data: {
        survey: { id: s.id, title: s.title, description: s.description },
        questions: questionsFor(db, s.id).map((q) => ({
          id: q.id,
          question_text: q.question_text,
          question_type: q.question_type,
          position: q.position,
          choices: q.choices.map(({ id, choice_text, position }) => ({
            id,
            choice_text,
            position,
          })),
        })),
      },
    }
  },

  async submitResponse(surveyId, anonymousToken, answers) {
    await delay(400)
    const db = load()
    const s = db.surveys[surveyId]
    if (!s || s.status !== 'active') throw new AppError('SURVEY_NOT_ACTIVE')
    if (
      Object.values(db.responses).some(
        (r) => r.survey_id === surveyId && r.anonymous_token === anonymousToken,
      )
    )
      throw new AppError('DUPLICATE_RESPONSE')
    const qs = questionsFor(db, surveyId)
    for (const a of answers) {
      const q = qs.find((x) => x.id === a.question_id)
      if (!q) throw new AppError('INVALID_QUESTION')
      if (!q.choices.some((c) => c.id === a.choice_id)) throw new AppError('INVALID_CHOICE')
    }
    if (qs.some((q) => !answers.some((a) => a.question_id === q.id)))
      throw new AppError('MISSING_REQUIRED_ANSWER')
    if (new Set(answers.map((a) => a.question_id)).size !== answers.length)
      throw new AppError('INVALID_QUESTION')

    const rid = uuid()
    db.responses[rid] = {
      id: rid,
      survey_id: surveyId,
      anonymous_token: anonymousToken,
      submitted_at: now(),
    }
    for (const a of answers) {
      const aid = uuid()
      db.answers[aid] = { id: aid, response_id: rid, ...a }
    }
    save(db)
    return { success: true, response_id: rid }
  },
}
