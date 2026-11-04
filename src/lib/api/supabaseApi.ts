/**
 * Production backend: Supabase Auth + PostgREST + database RPCs.
 * Student operations go only through SECURITY DEFINER RPCs
 * (get_public_survey, submit_survey_response); see docs/PHASE1_REVIEW.md.
 */
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config'
import { AppError, toAppError } from '../errors'
import type {
  ExportData,
  InstructorSession,
  PublicSurveyLookup,
  Question,
  SubmitResult,
  Survey,
  SurveyResults,
  SurveySummary,
  SurveyWithQuestions,
} from '../types'
import type { SurveyApi } from './types'

let client: SupabaseClient | null = null
function sb(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  return client
}

/** Unwrap a Supabase `{ data, error }` result, normalising errors. */
function unwrap<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw toAppError(res.error)
  return res.data as T
}

function toSession(s: Session | null): InstructorSession | null {
  return s?.user ? { email: s.user.email ?? 'Instructor' } : null
}

const PAGE = 1000
/** PostgREST caps rows per request; page through large result sets. */
async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const page = unwrap(await query(from, from + PAGE - 1)) ?? []
    rows.push(...page)
    if (page.length < PAGE) return rows
  }
}

function sortQuestions(questions: Question[]): Question[] {
  return [...questions]
    .sort((a, b) => a.position - b.position)
    .map((q) => ({ ...q, choices: [...q.choices].sort((a, b) => a.position - b.position) }))
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    throw toAppError(err)
  }
}

export const supabaseApi: SurveyApi = {
  mode: 'supabase',

  signIn: (email, password) =>
    guard(async () => {
      const { data, error } = await sb().auth.signInWithPassword({ email, password })
      if (error) throw error
      const session = toSession(data.session)
      if (!session) throw new AppError('INVALID_CREDENTIALS')
      return session
    }),

  signOut: () =>
    guard(async () => {
      const { error } = await sb().auth.signOut()
      if (error) throw error
    }),

  getSession: () =>
    guard(async () => {
      const { data } = await sb().auth.getSession()
      return toSession(data.session)
    }),

  onAuthStateChange(cb) {
    const { data } = sb().auth.onAuthStateChange((_event, session) => cb(toSession(session)))
    return () => data.subscription.unsubscribe()
  },

  listSurveys: () =>
    guard(async () => {
      const rows = unwrap(
        await sb()
          .from('surveys')
          .select('*, responses(count)')
          .order('created_at', { ascending: false }),
      ) as (Survey & { responses: { count: number }[] })[]
      return rows.map(({ responses, ...s }): SurveySummary => ({
        ...s,
        response_count: responses?.[0]?.count ?? 0,
      }))
    }),

  getSurvey: (id) =>
    guard(async () => {
      const row = unwrap(
        await sb().from('surveys').select('*, questions(*, choices(*))').eq('id', id).maybeSingle(),
      ) as SurveyWithQuestions | null
      if (!row) throw new AppError('SURVEY_NOT_FOUND')
      return { ...row, questions: sortQuestions(row.questions) }
    }),

  saveSurvey: (id, draft) =>
    guard(
      async () =>
        unwrap(
          await sb().rpc('save_survey', {
            p_survey_id: id,
            p_title: draft.title,
            p_description: draft.description || null,
            p_questions: draft.questions,
          }),
        ) as string,
    ),

  deleteSurvey: (id) =>
    guard(async () => {
      unwrap(await sb().from('surveys').delete().eq('id', id).neq('status', 'active'))
    }),

  archiveSurvey: (id) =>
    guard(async () => {
      unwrap(await sb().rpc('archive_survey', { p_survey_id: id }))
    }),

  unarchiveSurvey: (id) =>
    guard(async () => {
      unwrap(await sb().rpc('unarchive_survey', { p_survey_id: id }))
    }),

  duplicateSurvey: (id) =>
    guard(async () => unwrap(await sb().rpc('duplicate_survey', { p_survey_id: id })) as string),

  activateSurvey: (id) =>
    guard(async () => unwrap(await sb().rpc('activate_survey', { p_survey_id: id })) as Survey),

  closeSurvey: (id) =>
    guard(async () => {
      unwrap(await sb().rpc('close_survey', { p_survey_id: id }))
    }),

  getResponseCount: (id) =>
    guard(async () => {
      const { count, error } = await sb()
        .from('responses')
        .select('id', { count: 'exact', head: true })
        .eq('survey_id', id)
      if (error) throw error
      return count ?? 0
    }),

  getResults: (id) =>
    guard(
      async () =>
        unwrap(await sb().rpc('get_survey_results', { p_survey_id: id })) as SurveyResults,
    ),

  getExportData: (id) =>
    guard(async (): Promise<ExportData> => {
      const survey = await supabaseApi.getSurvey(id)
      const responses = await fetchAll<{ id: string; submitted_at: string }>((from, to) =>
        sb()
          .from('responses')
          .select('id, submitted_at')
          .eq('survey_id', id)
          .order('submitted_at')
          .range(from, to),
      )
      const answers = await fetchAll<{
        response_id: string
        question_id: string
        choice_id: string | null
      }>((from, to) =>
        sb()
          .from('answers')
          .select('response_id, question_id, choice_id, responses!inner(survey_id)')
          .eq('responses.survey_id', id)
          .order('id')
          .range(from, to),
      )
      const { questions, ...meta } = survey
      return {
        survey: meta,
        questions,
        responses,
        answers: answers.map(({ response_id, question_id, choice_id }) => ({
          response_id,
          question_id,
          choice_id,
        })),
      }
    }),

  getPublicSurvey: (slug) =>
    guard(
      async () =>
        unwrap(await sb().rpc('get_public_survey', { p_slug: slug })) as PublicSurveyLookup,
    ),

  submitResponse: (surveyId, anonymousToken, answers) =>
    guard(
      async () =>
        unwrap(
          await sb().rpc('submit_survey_response', {
            p_survey_id: surveyId,
            p_anonymous_token: anonymousToken,
            p_answers: answers,
          }),
        ) as SubmitResult,
    ),
}
