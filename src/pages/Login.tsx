import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { DemoBanner } from '../components/DemoBanner'
import { Button, Card, ErrorMessage, inputClass } from '../components/ui'
import { api } from '../lib/api'
import { DEMO_EMAIL, DEMO_PASSWORD } from '../lib/api/demoApi'
import { useAuth } from '../lib/auth'
import { isSignupEnabled } from '../lib/config'

export default function Login() {
  const { session, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  if (session) return <Navigate to={from} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <DemoBanner />
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <Link
            to="/"
            className="mb-6 block text-center text-sm font-medium text-blue-800 hover:underline"
          >
            ← Classroom Survey
          </Link>
          <Card className="p-6">
            <h1 className="text-2xl font-bold text-slate-900">Instructor Login</h1>
            <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
              <div>
                <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-800">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-800">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                />
              </div>
              {error != null && <ErrorMessage error={error} />}
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                disabled={busy || !email || !password}
              >
                {busy ? 'Logging in...' : 'Log In'}
              </Button>
            </form>
            {isSignupEnabled && (
              <p className="mt-4 text-center text-sm text-slate-600">
                New instructor?{' '}
                <Link to="/signup" className="font-medium text-blue-800 hover:underline">
                  Create an account
                </Link>
              </p>
            )}
            {api.mode === 'demo' && (
              <p className="mt-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
                Demo login: <code>{DEMO_EMAIL}</code> / <code>{DEMO_PASSWORD}</code>
              </p>
            )}
          </Card>
        </div>
      </main>
    </div>
  )
}
