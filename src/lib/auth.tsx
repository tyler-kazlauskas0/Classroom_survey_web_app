import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from './api'
import type { InstructorSession, SignUpResult } from './types'

interface AuthState {
  session: InstructorSession | null
  loading: boolean
  signIn(email: string, password: string): Promise<void>
  signUp(email: string, password: string): Promise<SignUpResult>
  signOut(): Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<InstructorSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    api
      .getSession()
      .then((s) => active && setSession(s))
      .catch(() => active && setSession(null))
      .finally(() => active && setLoading(false))
    const unsubscribe = api.onAuthStateChange((s) => setSession(s))
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      session,
      loading,
      async signIn(email, password) {
        setSession(await api.signIn(email, password))
      },
      async signUp(email, password) {
        const result = await api.signUp(email, password)
        if (result.status === 'signed_in') setSession(result.session)
        return result
      },
      async signOut() {
        await api.signOut()
        setSession(null)
      },
    }),
    [session, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
