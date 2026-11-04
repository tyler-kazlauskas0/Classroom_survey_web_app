export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? ''
export const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? ''
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

/** Base URL encoded in QR codes; falls back to the current origin. */
export function publicSiteUrl(): string {
  const configured = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim()
  return (configured || window.location.origin).replace(/\/+$/, '')
}

export function publicSurveyUrl(slug: string): string {
  return `${publicSiteUrl()}/s/${encodeURIComponent(slug)}`
}
