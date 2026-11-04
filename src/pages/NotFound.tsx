import { ButtonLink } from '../components/ui'

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
      <h1 className="text-2xl font-bold text-slate-900">Page not found.</h1>
      <ButtonLink to="/">Go home</ButtonLink>
    </main>
  )
}
