# Supabase backend — setup (≈ 10 minutes)

This turns on cloud accounts so your **likes, playlists, history & settings sync
across every device**. You do the 4 steps below once; I wire the app to it.

> The app keeps working normally until this is configured — Supabase is optional
> until the env vars below are set.

---

## 1. Create the project
1. Go to **https://supabase.com** → sign in → **New project**.
2. Name it `synapz-music`, pick a strong database password (save it), choose the
   region closest to you → **Create**. Wait ~2 min for it to provision.

## 2. Create the database tables
1. In the project: **SQL Editor → New query**.
2. Open [`supabase/schema.sql`](supabase/schema.sql) from this repo, copy the
   whole file, paste it in, and click **Run**. You should see "Success".
   (It creates the tables + Row-Level Security so each user only sees their own
   data. Safe to re-run.)

## 3. Turn on Google sign-in
1. **Authentication → Providers → Google → enable**.
2. Paste your existing Google OAuth **Client ID** and **Client Secret** (the same
   Google Cloud OAuth client you already use). Click **Save**.
3. Supabase shows a **Callback URL** like
   `https://<your-ref>.supabase.co/auth/v1/callback`. Copy it.
4. In **Google Cloud Console → your OAuth client → Authorized redirect URIs**,
   click **Add URI**, paste that callback URL, **Save**.
5. In Supabase **Authentication → URL Configuration**:
   - **Site URL:** `https://synapz-music.vercel.app`
   - **Redirect URLs:** add both
     `https://synapz-music.vercel.app` and `http://localhost:5173`

## 4. Give me the two keys
In Supabase: **Project Settings → API**. Copy:
- **Project URL** — `https://<your-ref>.supabase.co`
- **anon public** key (the long `eyJ...` one — this is *public/safe*, NOT the
  `service_role` key — never share that one)

Add them in two places:

**`.env`** (local dev — already gitignored):
```
VITE_SUPABASE_URL=https://<your-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

**Vercel → your project → Settings → Environment Variables** (Production), the
same two names/values.

Then tell me — I'll migrate sign-in to Supabase, wire up library/playlists/stats
sync, test locally, and deploy.

---

### Notes
- The **anon key is meant to be public** (it ships in the frontend). Your data is
  protected by Row-Level Security in the database, not by hiding the key.
- Sign-in becomes a **Google redirect** (tap "Continue with Google" → Google →
  back to the app) instead of the current popup — standard for Supabase.
- Once live, your current per-browser likes can be **migrated into your account**
  on first sign-in (I'll add a one-time "import your local library" step).
