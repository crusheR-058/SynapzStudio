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

### Moving sign-in to Clerk

Identity is Clerk; the data stays here. Do these in order — the app is safe to
deploy only after the last one.

**In the Clerk dashboard**
1. *Integrations → Supabase → Activate.* This adds the `role: authenticated`
   claim Supabase expects on every session token.
2. *Sessions → Customize session token*, add:
   ```json
   {
     "email": "{{user.primary_email_address}}",
     "email_verified": "{{user.email_verified}}"
   }
   ```
   Needed by step 5: the email is the only link between a person's old account
   and their new one.

**In the Supabase dashboard**
3. *Authentication → Sign In / Providers → Third-Party Auth → Add Clerk*, and
   paste your Clerk domain. Without it Supabase rejects Clerk's tokens and every
   query comes back empty.
4. SQL editor: take the backup described at the top of
   [`clerk-migration.sql`](supabase/clerk-migration.sql), then run that file. It
   moves Row-Level Security from Supabase Auth to Clerk.
5. Run [`clerk-claim-legacy.sql`](supabase/clerk-claim-legacy.sql). People who
   had an account before get a new id from Clerk; this is what hands them their
   existing likes, playlists and history on first sign-in. Skip it and the
   switch looks, to them, like it deleted their library.
6. Run [`social.sql`](supabase/social.sql) — the tables behind the Friends tab.
   Until then that tab reports that it is unavailable; nothing else is affected.

**Where builds run**
7. Set `VITE_CLERK_PUBLISHABLE_KEY` in the Vercel project (Production) and as a
   GitHub Actions repository variable. It is compiled into the bundle, so a key
   that only exists in `.env.local` reaches neither the website nor the desktop
   installers. A build without it runs, but as a guest-only player.

### Notes
- The **anon key is meant to be public** (it ships in the frontend). Your data is
  protected by Row-Level Security in the database, not by hiding the key.
- Sign-in becomes a **Google redirect** (tap "Continue with Google" → Google →
  back to the app) instead of the current popup — standard for Supabase.
- Once live, your current per-browser likes can be **migrated into your account**
  on first sign-in (I'll add a one-time "import your local library" step).
