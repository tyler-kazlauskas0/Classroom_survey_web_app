import { isSupabaseConfigured } from '../config'
import { demoApi } from './demoApi'
import { supabaseApi } from './supabaseApi'
import type { SurveyApi } from './types'

/** Supabase when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set, else demo mode. */
export const api: SurveyApi = isSupabaseConfigured ? supabaseApi : demoApi
export type { SurveyApi }
