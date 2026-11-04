import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { StatusBadge } from '../components/StatusBadge'
import { Button, ButtonLink, ErrorMessage, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { publicSurveyUrl } from '../lib/config'
import { friendlyMessage } from '../lib/errors'
import { useAsync } from '../lib/useAsync'

const POLL_MS = 5000

/** Projector-friendly page: large QR code, readable URL, live response count. */
export default function Present() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: survey, error, loading, reload } = useAsync(() => api.getSurvey(id), [id])
  const [qr, setQr] = useState<string | null>(null)
  const [count, setCount] = useState<number | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const url = survey?.public_slug ? publicSurveyUrl(survey.public_slug) : null
  const isActive = survey?.status === 'active'

  useEffect(() => {
    if (!url) return
    QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: 'M' })
      .then(setQr)
      .catch(() => setQr(null))
  }, [url])

  useEffect(() => {
    if (!survey) return
    let stopped = false
    const tick = () =>
      api
        .getResponseCount(id)
        .then((n) => !stopped && setCount(n))
        .catch(() => {})
    void tick()
    if (!isActive) return
    const timer = setInterval(tick, POLL_MS)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [id, survey, isActive])

  async function closeSurvey() {
    setBusy(true)
    try {
      await api.closeSurvey(id)
      setConfirmClose(false)
      await reload()
    } catch (err) {
      setActionError(friendlyMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function activate() {
    setBusy(true)
    setActionError(null)
    try {
      await api.activateSurvey(id)
      await reload()
    } catch (err) {
      setActionError(friendlyMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function downloadPng() {
    if (!qr || !survey) return
    const a = document.createElement('a')
    a.href = qr
    a.download = `${survey.title.replace(/[^\w-]+/g, '_')}-qr.png`
    a.click()
  }

  if (loading && !survey)
    return (
      <div className="min-h-screen bg-white">
        <Spinner label="Loading survey..." />
      </div>
    )
  if (error || !survey)
    return (
      <div className="mx-auto max-w-xl p-6">
        <ErrorMessage error={error} />
        <ButtonLink to="/dashboard" className="mt-4">
          Back to Dashboard
        </ButtonLink>
      </div>
    )

  return (
    <div ref={containerRef} className="flex min-h-screen flex-col bg-white">
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-6 text-center">
        <h1 className="max-w-5xl text-3xl font-bold text-slate-900 sm:text-5xl">{survey.title}</h1>

        {isActive && url ? (
          <>
            <p className="mt-3 text-lg text-slate-600 sm:text-2xl">Scan to answer</p>
            {qr ? (
              <img
                src={qr}
                alt={`QR code linking to ${url}`}
                className="mt-4 aspect-square w-[min(70vh,85vw)] max-w-[640px] rounded-lg border border-slate-200"
              />
            ) : (
              <Spinner label="Generating QR code..." />
            )}
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="mt-4 font-mono text-xl font-semibold break-all text-blue-900 underline-offset-4 hover:underline sm:text-3xl"
            >
              {url.replace(/^https?:\/\//, '')}
            </a>
          </>
        ) : (
          <div className="mt-6 space-y-4">
            <StatusBadge status={survey.status} />
            <p className="text-xl text-slate-700">
              {survey.status === 'closed'
                ? 'This survey is closed and no longer accepting responses.'
                : 'This survey is not active. Activate it to display the QR code.'}
            </p>
            {survey.status !== 'archived' && (
              <Button variant="primary" onClick={() => void activate()} disabled={busy}>
                {busy
                  ? 'Activating...'
                  : survey.status === 'closed'
                    ? 'Reopen Survey'
                    : 'Activate Survey'}
              </Button>
            )}
          </div>
        )}

        <p className="mt-6 text-2xl font-semibold text-slate-900 sm:text-4xl" aria-live="polite">
          Responses: <span className="tabular-nums">{count ?? '–'}</span>
        </p>
        {actionError && (
          <div className="mt-4">
            <ErrorMessage message={actionError} />
          </div>
        )}
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <Link
            to="/dashboard"
            className="self-center px-2 text-sm font-medium text-blue-800 hover:underline"
          >
            ← Dashboard
          </Link>
          <ButtonLink to={`/surveys/${id}/results`}>View Results</ButtonLink>
          {isActive && (
            <>
              <Button onClick={downloadPng} disabled={!qr}>
                Download QR (PNG)
              </Button>
              <Button
                onClick={() =>
                  document.fullscreenElement
                    ? void document.exitFullscreen()
                    : void containerRef.current?.requestFullscreen()
                }
              >
                Full screen
              </Button>
            </>
          )}
        </div>
        {isActive && (
          <Button variant="danger" onClick={() => setConfirmClose(true)}>
            Close Survey
          </Button>
        )}
      </footer>

      <ConfirmDialog
        options={
          confirmClose
            ? {
                title: `Close "${survey.title}"?`,
                body: <p>Students will no longer be able to submit responses.</p>,
                confirmLabel: 'Close Survey',
                destructive: true,
              }
            : null
        }
        busy={busy}
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => void closeSurvey().then(() => navigate(`/surveys/${id}/results`))}
      />
    </div>
  )
}
