// Moved to core/ so the web, desktop and mobile apps share one copy.
// Re-exported from here so existing imports keep working unchanged.
//
// The side-effect import registers the web Supabase client and env with core.
// It must happen before any core function runs, and importing it here means
// that holds no matter which module the app reaches first.
import './supabase'

export * from '../../core/tracklink'
