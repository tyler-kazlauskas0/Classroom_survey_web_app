export type SurveyStatus = 'draft' | 'active' | 'closed' | 'archived'
export type QuestionType = 'multiple_choice' | 'true_false'

export interface Survey {
  id: string
  title: string
  description: string | null
  status: SurveyStatus
  public_slug: string | null
  created_at: string
  updated_at: string
}

/** Dashboard row: survey plus its response count. */
export interface SurveySummary extends Survey {
  response_count: number
}

export interface Choice {
  id: string
  question_id: string
  choice_text: string
  position: number
}

export interface Question {
  id: string
  survey_id: string
  question_text: string
  question_type: QuestionType
  position: number
  choices: Choice[]
}

export interface SurveyWithQuestions extends Survey {
  questions: Question[]
}

/** Editor payload. Positions are implied by array order. */
export interface DraftChoice {
  choice_text: string
}
export interface DraftQuestion {
  question_text: string
  question_type: QuestionType
  choices: DraftChoice[]
}
export interface SurveyDraft {
  title: string
  description: string
  questions: DraftQuestion[]
}

/** Public (student) view of an active survey. No response data. */
export interface PublicSurvey {
  survey: { id: string; title: string; description: string | null }
  questions: {
    id: string
    question_text: string
    question_type: QuestionType
    position: number
    choices: { id: string; choice_text: string; position: number }[]
  }[]
}

export type PublicSurveyLookup =
  { status: 'active'; data: PublicSurvey } | { status: 'closed' } | { status: 'not_found' }

export interface SubmittedAnswer {
  question_id: string
  choice_id: string
}

export interface SubmitResult {
  success: true
  response_id: string
}

export interface ChoiceResult {
  choice_id: string
  choice_text: string
  count: number
  percentage: number
}
export interface QuestionResult {
  question_id: string
  question_text: string
  question_type: QuestionType
  response_count: number
  choices: ChoiceResult[]
}
export interface SurveyResults {
  survey_id: string
  response_count: number
  questions: QuestionResult[]
}

/** Raw data needed for CSV export (generated in the browser). */
export interface ExportData {
  survey: Survey
  questions: Question[]
  responses: { id: string; submitted_at: string }[]
  answers: { response_id: string; question_id: string; choice_id: string | null }[]
}

export interface InstructorSession {
  email: string
}

/** Outcome of creating an instructor account. */
export type SignUpResult =
  | { status: 'signed_in'; session: InstructorSession }
  /** Supabase "Confirm email" is on: the user must click the emailed link first. */
  | { status: 'confirmation_required' }
