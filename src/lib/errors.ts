/**
 * Error codes shared by the database RPCs (raised as exception messages)
 * and the demo backend. See docs/API.md §10 and §13.
 */
export type ErrorCode =
  | 'NETWORK_ERROR'
  | 'AUTH_REQUIRED'
  | 'INVALID_CREDENTIALS'
  | 'SURVEY_NOT_FOUND'
  | 'SURVEY_NOT_ACTIVE'
  | 'SURVEY_NOT_EDITABLE'
  | 'INVALID_TRANSITION'
  | 'DUPLICATE_RESPONSE'
  | 'INVALID_QUESTION'
  | 'INVALID_CHOICE'
  | 'MISSING_REQUIRED_ANSWER'
  | 'VALIDATION_ERROR'
  | 'UNEXPECTED'

export class AppError extends Error {
  readonly code: ErrorCode
  constructor(code: ErrorCode, detail?: string) {
    super(detail ?? code)
    this.code = code
    this.name = 'AppError'
  }
}

const MESSAGES: Record<ErrorCode, string> = {
  NETWORK_ERROR: 'Could not reach the server. Check your connection and try again.',
  AUTH_REQUIRED: 'Please log in to continue.',
  INVALID_CREDENTIALS: 'Incorrect email or password.',
  SURVEY_NOT_FOUND: 'Survey not found.',
  SURVEY_NOT_ACTIVE: 'This survey is no longer accepting responses.',
  SURVEY_NOT_EDITABLE: 'Only draft surveys can be edited. Duplicate this survey to make changes.',
  INVALID_TRANSITION: 'That action is not allowed for the survey in its current state.',
  DUPLICATE_RESPONSE: 'You have already submitted a response to this survey.',
  INVALID_QUESTION: 'The survey has changed. Please reload the page and try again.',
  INVALID_CHOICE: 'The survey has changed. Please reload the page and try again.',
  MISSING_REQUIRED_ANSWER: 'Please answer every question before submitting.',
  VALIDATION_ERROR: 'Some information is missing or invalid.',
  UNEXPECTED: 'Something went wrong. Please try again.',
}

const KNOWN_CODES = Object.keys(MESSAGES) as ErrorCode[]

/** Normalise anything thrown (Supabase errors, fetch failures, AppError) into an AppError. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err
  const message =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message)
      : String(err)
  const code = KNOWN_CODES.find((c) => message.includes(c))
  if (code) return new AppError(code, message)
  if (/invalid login credentials/i.test(message))
    return new AppError('INVALID_CREDENTIALS', message)
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(message))
    return new AppError('NETWORK_ERROR', message)
  if (/invalid input syntax for type uuid/i.test(message))
    return new AppError('SURVEY_NOT_FOUND', message)
  if (/jwt|not authenticated|permission denied/i.test(message))
    return new AppError('AUTH_REQUIRED', message)
  return new AppError('UNEXPECTED', message)
}

/** Friendly, user-facing message. Never exposes raw database text. */
export function friendlyMessage(err: unknown): string {
  return MESSAGES[toAppError(err).code]
}
