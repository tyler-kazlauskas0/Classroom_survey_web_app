import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/**
 * Catches rendering errors and failed lazy page loads (e.g. a new deploy
 * replaced the old JavaScript files) so users see a recovery screen
 * instead of a blank page.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    const chunk = /dynamically imported module|loading chunk|importing a module script/i.test(
      this.state.error.message,
    )
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-4">
        <div role="alert" className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-slate-900">Something went wrong.</h1>
          <p className="mt-3 text-slate-700">
            {chunk
              ? 'The app was updated or the connection dropped while loading this page.'
              : 'This page ran into a problem.'}{' '}
            Reloading usually fixes it. Your saved data is safe.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-11 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Reload page
            </button>
            <a
              href="/"
              className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Home
            </a>
          </div>
        </div>
      </main>
    )
  }
}
