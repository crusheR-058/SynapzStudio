// Supabase client for the MOBILE build — the platform half of the split that
// core/supabase.ts describes. Two options differ from web and both matter:
//
//   storage             React Native has no localStorage, so without an
//                       AsyncStorage adapter the session is lost on every cold
//                       start and the user is signed out each launch.
//   detectSessionInUrl  There is no URL to read a token back from. Left true,
//                       supabase-js looks for one and the OAuth return breaks;
//                       expo-auth-session hands us the tokens directly instead.

import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { setSupabase } from '@core/supabase'
import { configure } from '@core/config'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const supabase: SupabaseClient | null =
  url && anon
    ? createClient(url, anon, {
        auth: {
          storage: AsyncStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null

setSupabase(supabase)

// Mobile ships no backend of its own, so every /api and /yt call is pointed at
// the hosted origin. This is exactly the case core/apiBase.ts was built for.
configure({
  apiBase: process.env.EXPO_PUBLIC_API_BASE || 'https://synapz-music.vercel.app',
  webOrigin: process.env.EXPO_PUBLIC_WEB_ORIGIN || 'https://synapz-music.vercel.app',
})

export const supabaseEnabled = !!supabase
