// Moved to core/ so the web, desktop and mobile apps share one copy.
// Re-exported from here so existing imports keep working unchanged.
//
// The side-effect import registers the web Supabase client, env and the
// localStorage-backed KV that core/youtube.ts caches searches in — without it
// core falls back to an in-memory store and every reload re-pays the 100-unit
// YouTube search.
import './supabase'

export * from '../../core/youtube'
