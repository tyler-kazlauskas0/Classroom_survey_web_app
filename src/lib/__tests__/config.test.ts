import { afterEach, describe, expect, it, vi } from 'vitest'

const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '')
const jwt = (role: string) => `${b64({ alg: 'HS256' })}.${b64({ role })}.sig`

async function load(env: Record<string, string | boolean>) {
  vi.resetModules()
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string)
  return import('../config')
}

afterEach(() => vi.unstubAllEnvs())

describe('config', () => {
  it('accepts a URL with an anon or publishable key', async () => {
    for (const key of [jwt('anon'), 'sb_publishable_abc123']) {
      const c = await load({
        VITE_SUPABASE_URL: 'https://x.supabase.co',
        VITE_SUPABASE_ANON_KEY: key,
      })
      expect(c.isSupabaseConfigured).toBe(true)
      expect(c.configProblem()).toBeNull()
    }
  })

  it('refuses service-role and secret keys', async () => {
    for (const key of [jwt('service_role'), 'sb_secret_abc123']) {
      const c = await load({
        VITE_SUPABASE_URL: 'https://x.supabase.co',
        VITE_SUPABASE_ANON_KEY: key,
      })
      expect(c.configProblem()).toMatch(/secret/)
    }
  })

  it('requires both values', async () => {
    const c = await load({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: '' })
    expect(c.configProblem()).toMatch(/both/)
  })

  it('allows demo mode in development but not in production', async () => {
    let c = await load({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', DEV: true })
    expect(c.isDemoAllowed).toBe(true)
    expect(c.configProblem()).toBeNull()
    c = await load({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', DEV: false })
    expect(c.isDemoAllowed).toBe(false)
    expect(c.configProblem()).toMatch(/not configured/)
    c = await load({
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
      DEV: false,
      VITE_ENABLE_DEMO: 'true',
    })
    expect(c.configProblem()).toBeNull()
  })
})
