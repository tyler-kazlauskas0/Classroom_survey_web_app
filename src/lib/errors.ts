/**
 * Error codes shared by the database RPCs (raised as exception messages)
 * and the demo backend. See docs/API.md §10 and §13.
 */
export type ErrorCode =
  | 'NETWORK_ERROR'
  | 'AUTH_REQUIRED'
  | 'INVALID_CREDENTIALS'
  | 'SIGNUP_DISABLED'
  | 'EMAIL_IN_USE'
  | 'WEAK_PASSWORD'
  | 'INVALID_EMAIL'
  | 'RATE_LIMITED'
  | 'EMAIL_NOT_CONFIRMED'
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
  SIGNUP_DISABLED:
    'Creating new accounts is turned off for this site. Ask the site owner for access.',
  EMAIL_IN_USE: 'An account with this email already exists. Log in instead.',
  WEAK_PASSWORD: 'Choose a stronger password (at least 8 characters).',
  INVALID_EMAIL: 'Enter a valid email address.',
  RATE_LIMITED: 'Too many attempts. Please wait a few minutes and try again.',
  EMAIL_NOT_CONFIRMED: 'Please confirm your email address first (check your inbox), then log in.',
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

  // Supabase Auth error codes (AuthApiError.code)
  const authCode =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : ''
  const AUTH_CODES: Record<string, ErrorCode> = {
    signup_disabled: 'SIGNUP_DISABLED',
    email_provider_disabled: 'SIGNUP_DISABLED',
    user_already_exists: 'EMAIL_IN_USE',
    email_exists: 'EMAIL_IN_USE',
    weak_password: 'WEAK_PASSWORD',
    email_address_invalid: 'INVALID_EMAIL',
    validation_failed: 'INVALID_EMAIL',
    over_email_send_rate_limit: 'RATE_LIMITED',
    over_request_rate_limit: 'RATE_LIMITED',
    email_not_confirmed: 'EMAIL_NOT_CONFIRMED',
    invalid_credentials: 'INVALID_CREDENTIALS',
  }
  if (AUTH_CODES[authCode]) return new AppError(AUTH_CODES[authCode], message)
  if (/signups? not allowed/i.test(message)) return new AppError('SIGNUP_DISABLED', message)
  if (/already registered|already exists/i.test(message))
    return new AppError('EMAIL_IN_USE', message)
  if (/password should|weak password/i.test(message)) return new AppError('WEAK_PASSWORD', message)
  if (/rate limit/i.test(message)) return new AppError('RATE_LIMITED', message)
  if (/email not confirmed/i.test(message)) return new AppError('EMAIL_NOT_CONFIRMED', message)
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
