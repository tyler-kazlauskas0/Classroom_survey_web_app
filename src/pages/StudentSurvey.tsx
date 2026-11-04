import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { Button, ErrorMessage, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { friendlyMessage, toAppError } from '../lib/errors'
import { getAnonymousToken, hasSubmitted, markSubmitted } from '../lib/token'
import type { PublicSurvey } from '../lib/types'

type View =
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'closed' }
  | { kind: 'already' }
  | { kind: 'error'; error: unknown }
  | { kind: 'form'; data: PublicSurvey }
  | { kind: 'success' }

/** Public, login-free survey page for students (mobile first). */
export default function StudentSurvey() {
  const { slug = '' } = useParams<{ slug: string }>()
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setView({ kind: 'loading' })
    api
      .getPublicSurvey(slug)
      .then((res) => {
        if (cancelled) return
        if (res.status === 'not_found') setView({ kind: 'not_found' })
        else if (res.status === 'closed') setView({ kind: 'closed' })
        else if (hasSubmitted(res.data.survey.id)) setView({ kind: 'already' })
        else setView({ kind: 'form', data: res.data })
      })
      .catch((error) => !cancelled && setView({ kind: 'error', error }))
    return () => {
      cancelled = true
    }
  }, [slug, attempt])

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-xl px-4 py-6 sm:py-10">
        {view.kind === 'loading' && <Spinner label="Loading survey..." />}
        {view.kind === 'not_found' && <Message title="Survey not found." />}
        {view.kind === 'closed' && (
          <Message title="This survey is no longer accepting responses." />
        )}
        {view.kind === 'already' && (
          <Message title="You have already submitted a response to this survey." icon="✓" />
        )}
        {view.kind === 'success' && (
          <Message title="Thank you!" icon="✓">
            Your response has been recorded.
          </Message>
        )}
        {view.kind === 'error' && (
          <ErrorMessage error={view.error} onRetry={() => setAttempt((n) => n + 1)} />
        )}
        {view.kind === 'form' && (
          <SurveyForm data={view.data} onDone={(outcome) => setView({ kind: outcome })} />
        )}
      </main>
    </div>
  )
}

function Message({
  title,
  icon,
  children,
}: {
  title: string
  icon?: string
  children?: ReactNode
}) {
  return (
    <div role="status" className="mt-16 text-center">
      {icon && (
        <div
          aria-hidden="true"
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-800"
        >
          {icon}
        </div>
      )}
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      {children && <p className="mt-3 text-lg text-slate-700">{children}</p>}
    </div>
  )
}

function SurveyForm({
  data,
  onDone,
}: {
  data: PublicSurvey
  onDone: (outcome: 'success' | 'already' | 'closed') => void
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [missing, setMissing] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const surveyId = data.survey.id

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const unanswered = data.questions.filter((q) => !answers[q.id]).map((q) => q.id)
    setMissing(new Set(unanswered))
    if (unanswered.length > 0) {
      setError(
        `Please answer ${unanswered.length === 1 ? 'the highlighted question' : `all ${unanswered.length} highlighted questions`}.`,
      )
      document
        .getElementById(`q-${unanswered[0]}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await api.submitResponse(
        surveyId,
        getAnonymousToken(),
        data.questions.map((q) => ({ question_id: q.id, choice_id: answers[q.id] })),
      )
      markSubmitted(surveyId)
      onDone('success')
    } catch (err) {
      const code = toAppError(err).code
      if (code === 'DUPLICATE_RESPONSE') {
        markSubmitted(surveyId)
        onDone('already')
      } else if (code === 'SURVEY_NOT_ACTIVE') {
        onDone('closed')
      } else {
        setError(friendlyMessage(err))
        setSubmitting(false)
      }
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{data.survey.title}</h1>
      {data.survey.description && (
        <p className="mt-2 text-lg text-slate-700">{data.survey.description}</p>
      )}

      <div className="mt-6 space-y-6">
        {data.questions.map((q, i) => {
          const isMissing = missing.has(q.id) && !answers[q.id]
          return (
            <fieldset
              key={q.id}
              id={`q-${q.id}`}
              aria-describedby={isMissing ? `q-${q.id}-err` : undefined}
              className={`rounded-xl border bg-white p-4 shadow-sm ${isMissing ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-200'}`}
            >
              <legend className="float-left w-full text-lg font-semibold text-slate-900">
                {i + 1}. {q.question_text}
              </legend>
              {isMissing && (
                <p
                  id={`q-${q.id}-err`}
                  className="clear-both pt-1 text-sm font-medium text-red-700"
                >
                  Please choose an answer.
                </p>
              )}
              <div className="clear-both space-y-2 pt-3">
                {q.choices.map((c) => {
                  const checked = answers[q.id] === c.id
                  return (
                    <label
                      key={c.id}
                      className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-base transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-blue-600 ${
                        checked
                          ? 'border-blue-700 bg-blue-50 font-medium text-blue-950'
                          : 'border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name={q.id}
                        value={c.id}
                        checked={checked}
                        disabled={submitting}
                        onChange={() => setAnswers((a) => ({ ...a, [q.id]: c.id }))}
                        className="h-5 w-5 shrink-0 accent-blue-700"
                      />
                      <span>{c.choice_text}</span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          )
        })}
      </div>

      {error && (
        <div className="mt-6">
          <ErrorMessage message={error} />
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        disabled={submitting}
        className="mt-6 w-full py-4 text-lg"
      >
        {submitting ? 'Submitting...' : 'Submit'}
      </Button>
    </form>
  )
}
