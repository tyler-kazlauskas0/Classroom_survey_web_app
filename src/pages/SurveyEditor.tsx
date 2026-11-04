import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog, type ConfirmOptions } from '../components/ConfirmDialog'
import { StatusBadge } from '../components/StatusBadge'
import {
  Button,
  ButtonLink,
  Card,
  ErrorMessage,
  FieldError,
  Spinner,
  inputClass,
} from '../components/ui'
import { api } from '../lib/api'
import { friendlyMessage } from '../lib/errors'
import type { QuestionType, SurveyDraft, SurveyWithQuestions } from '../lib/types'
import { MAX_CHOICES, normaliseDraft, validateDraft, type DraftErrors } from '../lib/validation'
import { randomId } from '../lib/id'

interface EditorChoice {
  key: string
  choice_text: string
}
interface EditorQuestion {
  key: string
  question_text: string
  question_type: QuestionType
  choices: EditorChoice[]
}
interface EditorState {
  title: string
  description: string
  questions: EditorQuestion[]
}

const key = () => randomId()
const blankChoices = (): EditorChoice[] => [
  { key: key(), choice_text: '' },
  { key: key(), choice_text: '' },
]
const newQuestion = (): EditorQuestion => ({
  key: key(),
  question_text: '',
  question_type: 'multiple_choice',
  choices: blankChoices(),
})

function fromSurvey(s: SurveyWithQuestions): EditorState {
  return {
    title: s.title,
    description: s.description ?? '',
    questions: s.questions.map((q) => ({
      key: q.id,
      question_text: q.question_text,
      question_type: q.question_type,
      choices: q.choices.map((c) => ({ key: c.id, choice_text: c.choice_text })),
    })),
  }
}

function toDraft(s: EditorState): SurveyDraft {
  return {
    title: s.title,
    description: s.description,
    questions: s.questions.map((q) => ({
      question_text: q.question_text,
      question_type: q.question_type,
      choices: q.choices.map((c) => ({ choice_text: c.choice_text })),
    })),
  }
}

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr
  const copy = [...arr]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}

export default function SurveyEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = !id

  const [state, setState] = useState<EditorState>({
    title: '',
    description: '',
    questions: [newQuestion()],
  })
  const [loaded, setLoaded] = useState<SurveyWithQuestions | null>(null)
  const [loading, setLoading] = useState(!isNew)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [errors, setErrors] = useState<DraftErrors>({})
  const [saving, setSaving] = useState<'save' | 'activate' | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [confirm, setConfirm] = useState<{ options: ConfirmOptions; run: () => void } | null>(null)
  // After a failed save, re-validate as the user types so fixed fields clear.
  const [validateMode, setValidateMode] = useState<'save' | 'activate' | null>(null)

  useEffect(() => {
    if (validateMode)
      setErrors(validateDraft(toDraft(state), { forActivation: validateMode === 'activate' }))
  }, [state, validateMode])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    api
      .getSurvey(id)
      .then((s) => {
        if (cancelled) return
        setLoaded(s)
        setState(fromSurvey(s))
        setDirty(false)
      })
      .catch((err) => !cancelled && setLoadError(err))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [id])

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  function update(fn: (s: EditorState) => EditorState) {
    setState(fn)
    setDirty(true)
    setSavedAt(null)
  }
  function updateQuestion(qi: number, fn: (q: EditorQuestion) => EditorQuestion) {
    update((s) => ({ ...s, questions: s.questions.map((q, i) => (i === qi ? fn(q) : q)) }))
  }

  async function save(mode: 'save' | 'activate') {
    const draft = toDraft(state)
    const errs = validateDraft(draft, { forActivation: mode === 'activate' })
    setErrors(errs)
    setSaveError(null)
    if (Object.keys(errs).length > 0) {
      setValidateMode(mode)
      const first = Object.keys(errs)[0]
      document.getElementById(`field-${first}`)?.focus()
      return
    }
    setValidateMode(null)
    setSaving(mode)
    try {
      const surveyId = await api.saveSurvey(id ?? null, normaliseDraft(draft))
      setDirty(false)
      if (mode === 'activate') {
        await api.activateSurvey(surveyId)
        navigate(`/surveys/${surveyId}/present`)
        return
      }
      setSavedAt(new Date())
      if (isNew) navigate(`/surveys/${surveyId}/edit`, { replace: true })
    } catch (err) {
      setSaveError(friendlyMessage(err))
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <Spinner label="Loading survey..." />
  if (loadError) return <ErrorMessage error={loadError} />

  if (loaded && loaded.status !== 'draft') {
    return <ReadOnlyNotice survey={loaded} />
  }

  const busy = saving !== null

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          {isNew ? 'New Survey' : 'Edit Survey'}
        </h1>
        <Link to="/dashboard" className="text-sm font-medium text-blue-800 hover:underline">
          ← Back to Dashboard
        </Link>
      </div>

      <form
        className="mt-6 space-y-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void save('save')
        }}
      >
        <Card className="space-y-4">
          <div>
            <label
              htmlFor="field-title"
              className="mb-1 block text-sm font-semibold text-slate-800"
            >
              Survey Title <span className="text-red-700">*</span>
            </label>
            <input
              id="field-title"
              value={state.title}
              onChange={(e) => update((s) => ({ ...s, title: e.target.value }))}
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? 'err-title' : undefined}
              placeholder="e.g. Recursion Concept Check"
              className={inputClass}
              maxLength={200}
            />
            <FieldError id="err-title" message={errors.title} />
          </div>
          <div>
            <label
              htmlFor="field-description"
              className="mb-1 block text-sm font-semibold text-slate-800"
            >
              Description <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <textarea
              id="field-description"
              value={state.description}
              onChange={(e) => update((s) => ({ ...s, description: e.target.value }))}
              rows={2}
              className={inputClass}
              maxLength={1000}
            />
          </div>
        </Card>

        <section aria-label="Questions" className="space-y-4">
          {state.questions.map((q, qi) => (
            <QuestionCard
              key={q.key}
              q={q}
              index={qi}
              count={state.questions.length}
              errors={errors}
              onChange={(fn) => updateQuestion(qi, fn)}
              onMove={(dir) =>
                update((s) => ({ ...s, questions: move(s.questions, qi, qi + dir) }))
              }
              onDelete={() =>
                setConfirm({
                  options: {
                    title: `Delete Question ${qi + 1}?`,
                    body: (
                      <p>{q.question_text || 'This question'} and its choices will be removed.</p>
                    ),
                    confirmLabel: 'Delete Question',
                    destructive: true,
                  },
                  run: () =>
                    update((s) => ({ ...s, questions: s.questions.filter((_, i) => i !== qi) })),
                })
              }
            />
          ))}
          <FieldError id="err-questions" message={errors.questions} />
          <Button
            onClick={() => update((s) => ({ ...s, questions: [...s.questions, newQuestion()] }))}
            className="w-full border-dashed"
          >
            + Add Question
          </Button>
        </section>

        {saveError && <ErrorMessage message={saveError} />}
        {Object.keys(errors).length > 0 && (
          <p role="alert" className="text-sm font-medium text-red-700">
            Please fix the highlighted fields.
          </p>
        )}

        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-slate-50/95 px-4 py-4 backdrop-blur">
          <span aria-live="polite" className="mr-auto text-sm text-slate-600">
            {saving === 'save' ? 'Saving...' : savedAt ? 'Saved' : dirty ? 'Unsaved changes' : ''}
          </span>
          <Button type="submit" disabled={busy}>
            {saving === 'save' ? 'Saving...' : 'Save Draft'}
          </Button>
          <Button variant="primary" onClick={() => void save('activate')} disabled={busy}>
            {saving === 'activate' ? 'Activating...' : 'Save & Activate'}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        options={confirm?.options ?? null}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          confirm?.run()
          setConfirm(null)
        }}
      />
    </>
  )
}

function QuestionCard({
  q,
  index: qi,
  count,
  errors,
  onChange,
  onMove,
  onDelete,
}: {
  q: EditorQuestion
  index: number
  count: number
  errors: DraftErrors
  onChange: (fn: (q: EditorQuestion) => EditorQuestion) => void
  onMove: (dir: -1 | 1) => void
  onDelete: () => void
}) {
  const textErr = errors[`q${qi}.text`]
  const choicesErr = errors[`q${qi}.choices`]
  const label = `Question ${qi + 1}`

  return (
    <Card>
      <fieldset>
        <legend className="sr-only">{label}</legend>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 aria-hidden="true" className="text-base font-bold text-slate-900">
            {label}
          </h2>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              onClick={() => onMove(-1)}
              disabled={qi === 0}
              aria-label={`Move ${label} up`}
            >
              ↑
            </Button>
            <Button
              variant="ghost"
              onClick={() => onMove(1)}
              disabled={qi === count - 1}
              aria-label={`Move ${label} down`}
            >
              ↓
            </Button>
          </div>
        </div>

        <label
          htmlFor={`field-q${qi}.text`}
          className="mt-3 mb-1 block text-sm font-semibold text-slate-800"
        >
          Question text <span className="text-red-700">*</span>
        </label>
        <textarea
          id={`field-q${qi}.text`}
          rows={2}
          value={q.question_text}
          onChange={(e) => onChange((x) => ({ ...x, question_text: e.target.value }))}
          aria-invalid={!!textErr}
          aria-describedby={textErr ? `err-q${qi}-text` : undefined}
          className={inputClass}
          maxLength={500}
        />
        <FieldError id={`err-q${qi}-text`} message={textErr} />

        <label
          htmlFor={`type-q${qi}`}
          className="mt-4 mb-1 block text-sm font-semibold text-slate-800"
        >
          Type
        </label>
        <select
          id={`type-q${qi}`}
          value={q.question_type}
          onChange={(e) => {
            const type = e.target.value as QuestionType
            onChange((x) => ({
              ...x,
              question_type: type,
              choices:
                type === 'multiple_choice' && x.choices.every((c) => !c.choice_text.trim())
                  ? blankChoices()
                  : x.choices,
            }))
          }}
          className={`${inputClass} sm:w-64`}
        >
          <option value="multiple_choice">Multiple Choice</option>
          <option value="true_false">True / False</option>
        </select>

        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold text-slate-800">Choices</p>
          {q.question_type === 'true_false' ? (
            <ul className="space-y-2 text-slate-700">
              {['True', 'False'].map((t) => (
                <li key={t} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                  {t}
                </li>
              ))}
            </ul>
          ) : (
            <ChoiceList q={q} qi={qi} errors={errors} onChange={onChange} />
          )}
          <FieldError id={`err-q${qi}-choices`} message={choicesErr} />
        </div>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <Button variant="ghost" className="text-red-800" onClick={onDelete}>
            Delete Question
          </Button>
        </div>
      </fieldset>
    </Card>
  )
}

function ChoiceList({
  q,
  qi,
  errors,
  onChange,
}: {
  q: EditorQuestion
  qi: number
  errors: DraftErrors
  onChange: (fn: (q: EditorQuestion) => EditorQuestion) => void
}) {
  const setChoices = (fn: (c: EditorChoice[]) => EditorChoice[]) =>
    onChange((x) => ({ ...x, choices: fn(x.choices) }))

  return (
    <>
      <ol className="space-y-2">
        {q.choices.map((c, ci) => {
          const err = errors[`q${qi}.c${ci}`]
          const name = `Choice ${ci + 1} of question ${qi + 1}`
          return (
            <li key={c.key}>
              <div className="flex flex-wrap items-center gap-1">
                <span aria-hidden="true" className="w-6 text-sm text-slate-500">
                  {String.fromCharCode(65 + ci)}.
                </span>
                <input
                  id={`field-q${qi}.c${ci}`}
                  aria-label={name}
                  value={c.choice_text}
                  onChange={(e) =>
                    setChoices((cs) =>
                      cs.map((x, i) => (i === ci ? { ...x, choice_text: e.target.value } : x)),
                    )
                  }
                  aria-invalid={!!err}
                  aria-describedby={err ? `err-q${qi}-c${ci}` : undefined}
                  className={`${inputClass} min-w-0 flex-1`}
                  maxLength={300}
                />
                {/* On phones the controls wrap under the input so it keeps its width. */}
                <div className="flex w-full justify-end gap-1 sm:w-auto">
                  <Button
                    variant="ghost"
                    className="w-11 px-0"
                    onClick={() => setChoices((cs) => move(cs, ci, ci - 1))}
                    disabled={ci === 0}
                    aria-label={`Move ${name} up`}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-11 px-0"
                    onClick={() => setChoices((cs) => move(cs, ci, ci + 1))}
                    disabled={ci === q.choices.length - 1}
                    aria-label={`Move ${name} down`}
                  >
                    ↓
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setChoices((cs) => cs.filter((_, i) => i !== ci))}
                    aria-label={`Delete ${name}`}
                    className="w-11 px-0 text-red-800"
                  >
                    ✕
                  </Button>
                </div>
              </div>
              <div className="pl-7">
                <FieldError id={`err-q${qi}-c${ci}`} message={err} />
              </div>
            </li>
          )
        })}
      </ol>
      {q.choices.length < MAX_CHOICES && (
        <Button
          className="mt-2"
          onClick={() => setChoices((cs) => [...cs, { key: key(), choice_text: '' }])}
        >
          + Add Choice
        </Button>
      )}
    </>
  )
}

function ReadOnlyNotice({ survey }: { survey: SurveyWithQuestions }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Card className="mx-auto max-w-xl text-center">
      <div className="flex justify-center">
        <StatusBadge status={survey.status} />
      </div>
      <h1 className="mt-3 text-xl font-bold text-slate-900">{survey.title}</h1>
      <p className="mt-3 text-slate-700">
        {survey.status === 'active'
          ? 'This survey is active. Close it before making changes — or duplicate it to edit a copy.'
          : 'Only draft surveys can be edited, so collected results stay accurate. Duplicate this survey to make changes.'}
      </p>
      {error && (
        <div className="mt-4">
          <ErrorMessage message={error} />
        </div>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button
          variant="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              navigate(`/surveys/${await api.duplicateSurvey(survey.id)}/edit`)
            } catch (err) {
              setError(friendlyMessage(err))
              setBusy(false)
            }
          }}
        >
          {busy ? 'Duplicating...' : 'Duplicate & Edit'}
        </Button>
        <ButtonLink to={`/surveys/${survey.id}/results`}>View Results</ButtonLink>
        <ButtonLink to="/dashboard" variant="ghost">
          Back to Dashboard
        </ButtonLink>
      </div>
    </Card>
  )
}
