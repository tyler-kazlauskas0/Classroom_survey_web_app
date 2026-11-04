/**
 * Runtime configuration from Vite environment variables (.env).
 *
 * Only PUBLIC values belong here: the Supabase project URL and the
 * anon / publishable key. Everything prefixed VITE_ is bundled into the
 * JavaScript sent to every browser, so a service-role / secret key must
 * never be used — it bypasses Row Level Security.
 */
const env = import.meta.env

/**
 * Accept either the Project URL (https://<ref>.supabase.co) or the Data API
 * URL shown in the dashboard (https://<ref>.supabase.co/rest/v1/); supabase-js
 * needs the bare project URL and appends /rest/v1 and /auth/v1 itself.
 */
export function normaliseSupabaseUrl(raw: string): string {
  return raw
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/(rest|auth)\/v1$/, '')
}

export const SUPABASE_URL = normaliseSupabaseUrl(
  (env.VITE_SUPABASE_URL as string | undefined) ?? '',
)
export const SUPABASE_ANON_KEY = ((env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '').trim()

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

/** Demo mode is for local development; production builds must opt in explicitly. */
export const isDemoAllowed = !isSupabaseConfigured && (env.DEV || env.VITE_ENABLE_DEMO === 'true')

/** Decode a JWT payload without verifying it (only to read the `role` claim). */
function jwtRole(key: string): string | null {
  const parts = key.split('.')
  if (parts.length !== 3) return null
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    return (JSON.parse(json) as { role?: string }).role ?? null
  } catch {
    return null
  }
}

/** Returns a problem description if the configuration is unsafe or incomplete, else null. */
export function configProblem(): string | null {
  if (SUPABASE_ANON_KEY.startsWith('sb_secret_') || jwtRole(SUPABASE_ANON_KEY) === 'service_role') {
    return 'VITE_SUPABASE_ANON_KEY contains a secret (service-role) key. Use the anon / publishable key instead, and rotate the secret key in Supabase because it may have been exposed.'
  }
  if (Boolean(SUPABASE_URL) !== Boolean(SUPABASE_ANON_KEY)) {
    return 'Set both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  }
  if (SUPABASE_URL && !/^https?:\/\/[^/]+/.test(SUPABASE_URL)) {
    return 'VITE_SUPABASE_URL must be a URL like https://your-project.supabase.co'
  }
  if (!isSupabaseConfigured && !isDemoAllowed) {
    return 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for this deployment.'
  }
  return null
}

/** Base URL encoded in QR codes; falls back to the current origin. */
export function publicSiteUrl(): string {
  const configured = ((env.VITE_PUBLIC_SITE_URL as string | undefined) ?? '').trim()
  return (configured || window.location.origin).replace(/\/+$/, '')
}

export function publicSurveyUrl(slug: string): string {
  return `${publicSiteUrl()}/s/${encodeURIComponent(slug)}`
}
