import { Link, useParams } from 'react-router-dom'
import { useState } from 'react'
import { ResultsChart } from '../components/ResultsChart'
import { StatusBadge } from '../components/StatusBadge'
import { Button, ButtonLink, Card, EmptyState, ErrorMessage, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { buildResultsCsv, csvFilename, downloadCsv } from '../lib/csv'
import { friendlyMessage } from '../lib/errors'
import { formatDateTime, plural } from '../lib/format'
import { useAsync } from '../lib/useAsync'

export default function Results() {
  const { id = '' } = useParams<{ id: string }>()
  const { data, error, loading, reload } = useAsync(async () => {
    const [survey, results] = await Promise.all([api.getSurvey(id), api.getResults(id)])
    return { survey, results, loadedAt: new Date() }
  }, [id])
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  async function exportCsv() {
    if (!data) return
    setExporting(true)
    setExportError(null)
    try {
      const exportData = await api.getExportData(id)
      downloadCsv(csvFilename(data.survey.title), buildResultsCsv(exportData))
    } catch (err) {
      setExportError(friendlyMessage(err))
    } finally {
      setExporting(false)
    }
  }

  if (loading && !data) return <Spinner label="Loading results..." />
  if (error || !data) return <ErrorMessage error={error} onRetry={() => void reload()} />

  const { survey, results, loadedAt } = data

  return (
    <>
      <Link to="/dashboard" className="text-sm font-medium text-blue-800 hover:underline">
        ← Back to Dashboard
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{survey.title}</h1>
            <StatusBadge status={survey.status} />
          </div>
          <p className="mt-1 text-lg text-slate-700">
            {plural(results.response_count, 'response')}
          </p>
          <p className="text-sm text-slate-500">Updated {formatDateTime(loadedAt.toISOString())}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void reload()} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button
            onClick={() => void exportCsv()}
            disabled={exporting || results.response_count === 0}
          >
            {exporting ? 'Exporting...' : 'Export CSV'}
          </Button>
          {survey.status === 'active' && (
            <ButtonLink to={`/surveys/${id}/present`} variant="primary">
              Present QR
            </ButtonLink>
          )}
        </div>
      </div>

      {exportError && (
        <div className="mt-4">
          <ErrorMessage message={exportError} />
        </div>
      )}

      <div className="mt-6 space-y-6">
        {results.response_count === 0 && (
          <EmptyState title="No responses yet.">
            {survey.status === 'active' ? (
              <p>Display the QR code so students can join.</p>
            ) : (
              <p>This survey did not receive any responses.</p>
            )}
          </EmptyState>
        )}
        {results.questions.map((q, i) => (
          <Card key={q.question_id}>
            <h2 className="text-lg font-semibold text-slate-900">
              {i + 1}. {q.question_text}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {q.response_count === 0 ? (
                <span className="font-medium text-amber-800">
                  Unanswered — no responses to this question.
                </span>
              ) : (
                plural(q.response_count, 'answer')
              )}
            </p>
            {q.response_count > 0 && <ResultsChart question={q} />}
            <table className="mt-4 w-full text-left text-sm">
              <caption className="sr-only">Results for question {i + 1}</caption>
              <thead className="border-b border-slate-200 text-slate-600">
                <tr>
                  <th scope="col" className="py-2 font-medium">
                    Choice
                  </th>
                  <th scope="col" className="w-20 py-2 text-right font-medium">
                    Count
                  </th>
                  <th scope="col" className="w-24 py-2 text-right font-medium">
                    Percent
                  </th>
                </tr>
              </thead>
              <tbody>
                {q.choices.map((c) => (
                  <tr key={c.choice_id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-2 text-slate-900">{c.choice_text}</td>
                    <td className="py-2 text-right tabular-nums">{c.count}</td>
                    <td className="py-2 text-right tabular-nums">{c.percentage.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>
    </>
  )
}
