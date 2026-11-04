import { DemoBanner } from '../components/DemoBanner'
import { ButtonLink } from '../components/ui'
import { useAuth } from '../lib/auth'

export default function Landing() {
  const { session } = useAuth()
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <DemoBanner />
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Classroom Survey</h1>
          <p className="mt-4 text-lg text-slate-600">Quick in-class understanding checks.</p>
          <p className="mt-2 text-slate-600">
            Create a survey, show the QR code, and see how your class is doing in seconds.
          </p>
          <ButtonLink
            to={session ? '/dashboard' : '/login'}
            variant="primary"
            className="mt-8 px-8 text-base"
          >
            {session ? 'Go to Dashboard' : 'Instructor Login'}
          </ButtonLink>
        </div>
      </main>
    </div>
  )
}
