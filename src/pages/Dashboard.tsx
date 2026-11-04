import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ConfirmDialog, type ConfirmOptions } from '../components/ConfirmDialog'
import { STATUS_LABELS, StatusBadge } from '../components/StatusBadge'
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorMessage,
  Spinner,
  inputClass,
} from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { friendlyMessage } from '../lib/errors'
import { formatDate, plural } from '../lib/format'
import type { SurveyStatus, SurveySummary } from '../lib/types'
import { useAsync } from '../lib/useAsync'

type Action = 'delete' | 'archive' | 'unarchive' | 'activate' | 'close' | 'duplicate'

interface Pending {
  action: Action
  survey: SurveySummary
  options: ConfirmOptions | null
}

function confirmOptions(
  action: Action,
  s: SurveySummary,
  active?: SurveySummary,
): ConfirmOptions | null {
  switch (action) {
    case 'delete':
      return {
        title: `Delete "${s.title}"?`,
        body:
          s.response_count > 0 ? (
            <>
              <p className="font-semibold text-red-800">
                This survey has {plural(s.response_count, 'response')}. They will be permanently
                deleted.
              </p>
              <p className="mt-2">Consider archiving instead to keep historical results.</p>
            </>
          ) : (
            <p>This will permanently delete the survey and all of its questions.</p>
          ),
        confirmLabel: 'Delete',
        destructive: true,
      }
    case 'archive':
      return {
        title: `Archive "${s.title}"?`,
        body: <p>Archived surveys are hidden from the default list. Results are kept.</p>,
        confirmLabel: 'Archive',
      }
    case 'close':
      return {
        title: `Close "${s.title}"?`,
        body: <p>Students will no longer be able to submit responses.</p>,
        confirmLabel: 'Close Survey',
        destructive: true,
      }
    case 'activate':
      return active && active.id !== s.id
        ? {
            title: `Activate "${s.title}"?`,
            body: (
              <p>
                Only one survey can be active. <strong>{active.title}</strong> will be closed.
              </p>
            ),
            confirmLabel: 'Activate',
          }
        : null
    default:
      return null
  }
}

export default function Dashboard() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const { data: surveys, error, loading, reload } = useAsync(() => api.listSurveys(), [])

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<SurveyStatus | 'all' | 'current'>('current')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const active = surveys?.find((s) => s.status === 'active')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (surveys ?? []).filter((s) => {
      if (q && !s.title.toLowerCase().includes(q)) return false
      if (status === 'current' && s.status === 'archived') return false
      if (status !== 'all' && status !== 'current' && s.status !== status) return false
      const day = s.created_at.slice(0, 10)
      if (from && day < from) return false
      if (to && day > to) return false
      return true
    })
  }, [surveys, search, status, from, to])

  async function run(action: Action, s: SurveySummary) {
    setBusyId(s.id)
    setActionError(null)
    try {
      switch (action) {
        case 'delete':
          await api.deleteSurvey(s.id)
          break
        case 'archive':
          await api.archiveSurvey(s.id)
          break
        case 'unarchive':
          await api.unarchiveSurvey(s.id)
          break
        case 'close':
          await api.closeSurvey(s.id)
          break
        case 'activate':
          await api.activateSurvey(s.id)
          navigate(`/surveys/${s.id}/present`)
          return
        case 'duplicate': {
          const id = await api.duplicateSurvey(s.id)
          navigate(`/surveys/${id}/edit`)
          return
        }
      }
      await reload()
    } catch (err) {
      setActionError(friendlyMessage(err))
    } finally {
      setBusyId(null)
      setPending(null)
    }
  }

  function request(action: Action, s: SurveySummary) {
    const options = confirmOptions(action, s, active)
    if (options) setPending({ action, survey: s, options })
    else void run(action, s)
  }

  const filtersActive = search || status !== 'current' || from || to

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Dashboard</h1>
          <p className="mt-1 text-slate-600">Welcome, {session?.email}</p>
        </div>
        <ButtonLink to="/surveys/new" variant="primary">
          + New Survey
        </ButtonLink>
      </div>

      {active && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-300 bg-green-50 p-4">
          <p className="text-green-950">
            <span className="font-semibold">Live now:</span> {active.title} ·{' '}
            {plural(active.response_count, 'response')}
          </p>
          <ButtonLink to={`/surveys/${active.id}/present`} variant="primary">
            Present QR
          </ButtonLink>
        </div>
      )}

      <form
        role="search"
        className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]"
        onSubmit={(e) => e.preventDefault()}
      >
        <div>
          <label htmlFor="search" className="mb-1 block text-sm font-medium text-slate-800">
            Search
          </label>
          <input
            id="search"
            type="search"
            placeholder="Survey title"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="status" className="mb-1 block text-sm font-medium text-slate-800">
            Status
          </label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className={inputClass}
          >
            <option value="current">All except archived</option>
            <option value="all">All</option>
            {(Object.keys(STATUS_LABELS) as SurveyStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="from" className="mb-1 block text-sm font-medium text-slate-800">
            Created from
          </label>
          <input
            id="from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="to" className="mb-1 block text-sm font-medium text-slate-800">
            Created to
          </label>
          <input
            id="to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={inputClass}
          />
        </div>
      </form>

      {actionError && (
        <div className="mt-4">
          <ErrorMessage message={actionError} />
        </div>
      )}

      <section className="mt-6" aria-label="Surveys">
        {loading && !surveys ? (
          <Spinner label="Loading surveys..." />
        ) : error ? (
          <ErrorMessage error={error} onRetry={() => void reload()} />
        ) : surveys && surveys.length === 0 ? (
          <EmptyState title="You have not created any surveys yet.">
            <ButtonLink to="/surveys/new" variant="primary" className="mt-2">
              Create Your First Survey
            </ButtonLink>
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState title="No surveys match your search.">
            {filtersActive && (
              <Button
                onClick={() => {
                  setSearch('')
                  setStatus('current')
                  setFrom('')
                  setTo('')
                }}
              >
                Clear filters
              </Button>
            )}
          </EmptyState>
        ) : (
          <ul className="grid gap-4">
            {filtered.map((s) => (
              <li key={s.id}>
                <SurveyCard survey={s} busy={busyId === s.id} onAction={request} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        options={pending?.options ?? null}
        busy={pending ? busyId === pending.survey.id : false}
        onCancel={() => setPending(null)}
        onConfirm={() => pending && void run(pending.action, pending.survey)}
      />
    </>
  )
}

function SurveyCard({
  survey: s,
  busy,
  onAction,
}: {
  survey: SurveySummary
  busy: boolean
  onAction: (a: Action, s: SurveySummary) => void
}) {
  const act = (a: Action) => () => onAction(a, s)
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">
            <Link
              to={s.status === 'draft' ? `/surveys/${s.id}/edit` : `/surveys/${s.id}/results`}
              className="hover:text-blue-800 hover:underline"
            >
              {s.title}
            </Link>
          </h2>
          {s.description && <p className="mt-0.5 text-sm text-slate-600">{s.description}</p>}
        </div>
        <StatusBadge status={s.status} />
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Created {formatDate(s.created_at)} · {plural(s.response_count, 'response')}
      </p>
      <div className="mt-4 flex flex-wrap gap-2" aria-busy={busy}>
        {s.status === 'draft' && (
          <>
            <ButtonLink to={`/surveys/${s.id}/edit`}>Edit</ButtonLink>
            <Button variant="primary" onClick={act('activate')} disabled={busy}>
              Activate
            </Button>
          </>
        )}
        {s.status === 'active' && (
          <>
            <ButtonLink to={`/surveys/${s.id}/present`} variant="primary">
              Present
            </ButtonLink>
            <ButtonLink to={`/surveys/${s.id}/results`}>Results</ButtonLink>
            <Button variant="danger" onClick={act('close')} disabled={busy}>
              Close
            </Button>
          </>
        )}
        {(s.status === 'closed' || s.status === 'archived') && (
          <ButtonLink to={`/surveys/${s.id}/results`}>Results</ButtonLink>
        )}
        {s.status === 'closed' && (
          <Button onClick={act('activate')} disabled={busy}>
            Reopen
          </Button>
        )}
        <Button onClick={act('duplicate')} disabled={busy}>
          Duplicate
        </Button>
        {(s.status === 'draft' || s.status === 'closed') && (
          <Button onClick={act('archive')} disabled={busy}>
            Archive
          </Button>
        )}
        {s.status === 'archived' && (
          <Button onClick={act('unarchive')} disabled={busy}>
            Unarchive
          </Button>
        )}
        {s.status !== 'active' && (
          <Button variant="ghost" className="text-red-800" onClick={act('delete')} disabled={busy}>
            Delete
          </Button>
        )}
      </div>
    </Card>
  )
}
