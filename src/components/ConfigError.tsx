/** Shown instead of the app when the environment configuration is missing or unsafe. */
export function ConfigError({ problem }: { problem: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div
        role="alert"
        className="max-w-lg rounded-xl border border-red-300 bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-bold text-red-800">Configuration error</h1>
        <p className="mt-3 text-slate-800">{problem}</p>
        <p className="mt-3 text-sm text-slate-600">
          See <code>.env.example</code> and <code>docs/SUPABASE_SETUP.md</code>.
        </p>
      </div>
    </main>
  )
}
