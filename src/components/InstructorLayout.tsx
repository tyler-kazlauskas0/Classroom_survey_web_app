import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { DemoBanner } from './DemoBanner'
import { Button } from './ui'

export function InstructorLayout() {
  const { session, signOut } = useAuth()
  return (
    <div className="min-h-screen bg-slate-50">
      <DemoBanner />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/dashboard" className="text-lg font-bold text-slate-900 hover:text-blue-800">
            Classroom Survey
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:inline">
              Signed in as <span className="font-medium text-slate-800">{session?.email}</span>
            </span>
            <Button variant="ghost" onClick={() => void signOut()}>
              Log out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  )
}
