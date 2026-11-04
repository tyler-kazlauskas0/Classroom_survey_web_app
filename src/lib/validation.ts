import type { SurveyDraft } from './types'

export const MIN_CHOICES = 2
export const MAX_CHOICES = 10

/**
 * Field-keyed validation errors for the editor, e.g.
 *   title, questions, q0.text, q0.choices, q0.c1
 */
export type DraftErrors = Record<string, string>

export function validateDraft(
  draft: SurveyDraft,
  opts: { forActivation?: boolean } = {},
): DraftErrors {
  const errors: DraftErrors = {}
  if (!draft.title.trim()) errors.title = 'Title is required.'
  if (opts.forActivation && draft.questions.length === 0)
    errors.questions = 'Add at least one question before activating.'

  draft.questions.forEach((q, qi) => {
    if (!q.question_text.trim()) errors[`q${qi}.text`] = 'Question text is required.'
    if (q.question_type === 'multiple_choice') {
      if (q.choices.length < MIN_CHOICES)
        errors[`q${qi}.choices`] = `Add at least ${MIN_CHOICES} choices.`
      const seen = new Set<string>()
      q.choices.forEach((c, ci) => {
        const text = c.choice_text.trim()
        if (!text) errors[`q${qi}.c${ci}`] = 'Choice text is required.'
        else if (seen.has(text.toLowerCase())) errors[`q${qi}.c${ci}`] = 'Duplicate choice.'
        seen.add(text.toLowerCase())
      })
    }
  })
  return errors
}

/** Normalise editor state before saving (trim, fixed True/False choices). */
export function normaliseDraft(draft: SurveyDraft): SurveyDraft {
  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    questions: draft.questions.map((q) => ({
      question_text: q.question_text.trim(),
      question_type: q.question_type,
      choices:
        q.question_type === 'true_false'
          ? [{ choice_text: 'True' }, { choice_text: 'False' }]
          : q.choices.map((c) => ({ choice_text: c.choice_text.trim() })),
    })),
  }
}
