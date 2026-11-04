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
  const [connectionLost, setConnectionLost] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const url = survey?.public_slug ? publicSurveyUrl(survey.public_slug) : null
  const isActive = survey?.status === 'active'
  // Phones cannot open "localhost": that address means the phone itself.
  const localOnly = url ? /^https?:\/\/(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(url) : false

  useEffect(() => {
    if (!url) return
    QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: 'M' })
      .then(setQr)
      .catch(() => setQr(null))
  }, [url])

  // Poll the response count and the survey's status. If the survey is closed
  // or replaced elsewhere (another tab, the dashboard), reload so the projector
  // stops showing a QR code that no longer works.
  const status = survey?.status
  useEffect(() => {
    if (!status) return
    let stopped = false
    const tick = async () => {
      try {
        const [n, current] = await Promise.all([
          api.getResponseCount(id),
          status === 'active' ? api.getSurveyStatus(id) : Promise.resolve(status),
        ])
        if (stopped) return
        setCount(n)
        setConnectionLost(false)
        if (current !== status) void reload()
      } catch {
        if (!stopped) setConnectionLost(true)
      }
    }
    void tick()
    const timer = status === 'active' ? setInterval(tick, POLL_MS) : undefined
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [id, status, reload])

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
            {localOnly && (
              <p
                role="alert"
                className="mt-4 max-w-2xl rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-left text-sm text-amber-950"
              >
                <strong>Phones can't open this link.</strong> It points to <code>localhost</code>,
                which on a phone means the phone itself. Open this page using your computer's
                network address (run <code>npm run dev:lan</code>), or set{' '}
                <code>VITE_PUBLIC_SITE_URL</code> to your deployed site.
              </p>
            )}
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
        {connectionLost && (
          <p role="status" className="mt-2 text-sm font-medium text-amber-800">
            Connection lost. Reconnecting… (the count may be out of date)
          </p>
        )}
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
