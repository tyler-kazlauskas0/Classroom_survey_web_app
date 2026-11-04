/**
 * Anonymous browser token used for duplicate-submission protection.
 * Stored in localStorage; the database enforces one response per
 * (survey_id, anonymous_token). Provides protection against accidental
 * resubmission, not against a determined user.
 */
import { randomId } from './id'
const TOKEN_KEY = 'cs.anonymous_token'
const SUBMITTED_KEY = 'cs.submitted_surveys'

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage unavailable (private mode) — DB constraint still applies */
  }
}

let memoryToken: string | null = null

export function getAnonymousToken(): string {
  const existing = safeGet(TOKEN_KEY)
  if (existing) return existing
  memoryToken ??= randomId()
  safeSet(TOKEN_KEY, memoryToken)
  return memoryToken
}

function submittedSet(): Set<string> {
  try {
    return new Set(JSON.parse(safeGet(SUBMITTED_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

export function hasSubmitted(surveyId: string): boolean {
  return submittedSet().has(surveyId)
}

export function markSubmitted(surveyId: string): void {
  const set = submittedSet()
  set.add(surveyId)
  safeSet(SUBMITTED_KEY, JSON.stringify([...set]))
}
