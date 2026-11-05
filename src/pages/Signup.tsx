import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { DemoBanner } from '../components/DemoBanner'
import { Button, Card, ErrorMessage, FieldError, inputClass } from '../components/ui'
import { useAuth } from '../lib/auth'
import { isSignupEnabled } from '../lib/config'

const MIN_PASSWORD = 8

export default function Signup() {
  const { session, signUp } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [checkEmail, setCheckEmail] = useState(false)

  if (session) return <Navigate to="/dashboard" replace />
  if (!isSignupEnabled) return <Navigate to="/login" replace />

  function validate(): Record<string, string> {
    const e: Record<string, string> = {}
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) e.email = 'Enter a valid email address.'
    if (password.length < MIN_PASSWORD) e.password = `Use at least ${MIN_PASSWORD} characters.`
    if (confirm !== password) e.confirm = 'Passwords do not match.'
    return e
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const v = validate()
    setErrors(v)
    setError(null)
    if (Object.keys(v).length) {
      document.getElementById(`signup-${Object.keys(v)[0]}`)?.focus()
      return
    }
    setBusy(true)
    try {
      const result = await signUp(email.trim(), password)
      if (result.status === 'signed_in') navigate('/dashboard', { replace: true })
      else setCheckEmail(true)
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
            {checkEmail ? (
              <div role="status">
                <h1 className="text-2xl font-bold text-slate-900">Check your email</h1>
                <p className="mt-3 text-slate-700">
                  We sent a confirmation link to <strong>{email.trim()}</strong>. Open it, then log
                  in.
                </p>
                <Link
                  to="/login"
                  className="mt-6 inline-block font-medium text-blue-800 hover:underline"
                >
                  Go to login
                </Link>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-slate-900">Create instructor account</h1>
                <p className="mt-2 text-sm text-slate-600">
                  Your surveys and results are private to your account.
                </p>
                <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
                  <div>
                    <label
                      htmlFor="signup-email"
                      className="mb-1 block text-sm font-medium text-slate-800"
                    >
                      Email
                    </label>
                    <input
                      id="signup-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      aria-invalid={!!errors.email}
                      aria-describedby={errors.email ? 'signup-email-err' : undefined}
                      className={inputClass}
                    />
                    <FieldError id="signup-email-err" message={errors.email} />
                  </div>
                  <div>
                    <label
                      htmlFor="signup-password"
                      className="mb-1 block text-sm font-medium text-slate-800"
                    >
                      Password
                    </label>
                    <input
                      id="signup-password"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      aria-invalid={!!errors.password}
                      aria-describedby="signup-password-hint"
                      className={inputClass}
                    />
                    {errors.password ? (
                      <FieldError id="signup-password-hint" message={errors.password} />
                    ) : (
                      <p id="signup-password-hint" className="mt-1 text-sm text-slate-500">
                        At least {MIN_PASSWORD} characters.
                      </p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="signup-confirm"
                      className="mb-1 block text-sm font-medium text-slate-800"
                    >
                      Confirm password
                    </label>
                    <input
                      id="signup-confirm"
                      type="password"
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      aria-invalid={!!errors.confirm}
                      aria-describedby={errors.confirm ? 'signup-confirm-err' : undefined}
                      className={inputClass}
                    />
                    <FieldError id="signup-confirm-err" message={errors.confirm} />
                  </div>
                  {error != null && <ErrorMessage error={error} />}
                  <Button type="submit" variant="primary" className="w-full" disabled={busy}>
                    {busy ? 'Creating account...' : 'Create account'}
                  </Button>
                </form>
                <p className="mt-4 text-center text-sm text-slate-600">
                  Already have an account?{' '}
                  <Link to="/login" className="font-medium text-blue-800 hover:underline">
                    Log in
                  </Link>
                </p>
              </>
            )}
          </Card>
        </div>
      </main>
    </div>
  )
}
