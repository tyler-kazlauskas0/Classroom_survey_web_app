import type { ExportData, SurveyResults } from './types'

/** Round to one decimal place (86.538 → 86.5). */
export function percent(count: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((count / total) * 1000) / 10
}

/**
 * Aggregate raw rows into the results shape (docs/API.md §11).
 * Percentages are relative to the number of answers to that question.
 */
export function computeResults(data: ExportData): SurveyResults {
  const questions = [...data.questions].sort((a, b) => a.position - b.position)
  return {
    survey_id: data.survey.id,
    response_count: data.responses.length,
    questions: questions.map((q) => {
      const qAnswers = data.answers.filter((a) => a.question_id === q.id)
      const total = qAnswers.length
      return {
        question_id: q.id,
        question_text: q.question_text,
        question_type: q.question_type,
        response_count: total,
        choices: [...q.choices]
          .sort((a, b) => a.position - b.position)
          .map((c) => {
            const count = qAnswers.filter((a) => a.choice_id === c.id).length
            return {
              choice_id: c.id,
              choice_text: c.choice_text,
              count,
              percentage: percent(count, total),
            }
          }),
      }
    }),
  }
}
