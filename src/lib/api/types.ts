import type {
  ExportData,
  InstructorSession,
  PublicSurveyLookup,
  SubmitResult,
  SubmittedAnswer,
  Survey,
  SurveyDraft,
  SurveyResults,
  SurveySummary,
  SurveyWithQuestions,
} from '../types'

/**
 * Everything the UI needs from the backend. Implemented by the Supabase
 * backend (production) and an in-browser demo backend (no Supabase configured).
 */
export interface SurveyApi {
  readonly mode: 'supabase' | 'demo'

  // Auth
  signIn(email: string, password: string): Promise<InstructorSession>
  signOut(): Promise<void>
  getSession(): Promise<InstructorSession | null>
  onAuthStateChange(cb: (session: InstructorSession | null) => void): () => void

  // Instructor
  listSurveys(): Promise<SurveySummary[]>
  getSurvey(id: string): Promise<SurveyWithQuestions>
  /** Create (id = null) or replace a draft survey's content. Returns the survey id. */
  saveSurvey(id: string | null, draft: SurveyDraft): Promise<string>
  deleteSurvey(id: string): Promise<void>
  archiveSurvey(id: string): Promise<void>
  unarchiveSurvey(id: string): Promise<void>
  /** Returns the id of the new Draft copy. */
  duplicateSurvey(id: string): Promise<string>
  activateSurvey(id: string): Promise<Survey>
  closeSurvey(id: string): Promise<void>
  getResponseCount(id: string): Promise<number>
  getResults(id: string): Promise<SurveyResults>
  getExportData(id: string): Promise<ExportData>

  // Student (anonymous)
  getPublicSurvey(slug: string): Promise<PublicSurveyLookup>
  submitResponse(
    surveyId: string,
    anonymousToken: string,
    answers: SubmittedAnswer[],
  ): Promise<SubmitResult>
}
