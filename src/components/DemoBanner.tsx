import { api } from '../lib/api'

export function DemoBanner() {
  if (api.mode !== 'demo') return null
  return (
    <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-950">
      <strong>Demo mode:</strong> Supabase is not configured, so data is stored only in this
      browser. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to use the
      real database.
    </div>
  )
}
