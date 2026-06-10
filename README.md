# WC-Fantasy ⚽🏆

A tiny **2026 FIFA World Cup prediction site** for groups of friends. Pick the winner (and optional score) of every match, lock in your full knockout bracket before R32 kicks off, and watch the leaderboard rank you against your group.

- **Stack:** React + Vite + TypeScript + Tailwind, [Supabase](https://supabase.com) (Postgres + RPCs), [Azure Static Web Apps](https://learn.microsoft.com/en-us/azure/static-web-apps/) for hosting.
- **Auth:** No accounts. Pick a display name; identity persists in your browser's localStorage. Join a group with a short invite code (e.g. `WC-NEIGH7`).
- **Scoring:** Group stage = 3 pts correct outcome + 2 pts bonus exact score. Knockout = 5 / 10 / 15 / 20 / 25 pts per correctly-picked advancing team in R32 / R16 / QF / SF / Final.
- **Lock:** Group-stage match predictions lock 1 hour before kickoff. Bracket locks when the first R32 match kicks off (June 28, 2026).

## Setup — first time

### 1. Supabase

1. Create a free project at <https://supabase.com>.
2. Open the **SQL editor** in your Supabase dashboard and run, in order:
   - `supabase/migrations/0001_init.sql`
   - `supabase/seed.sql`
3. In **Project settings → API**, copy your **Project URL** and **anon public** key.
4. **Important:** change the admin key. In the SQL editor:
   ```sql
   update app_settings
   set value = 'pick-a-long-random-string-of-your-own'
   where key = 'admin_key';
   ```

### 2. Local dev

```bash
cp .env.example .env
# edit .env with your Supabase URL/key and the same admin key
npm install
npm run dev
```

Visit <http://localhost:5173>.

### 3. Deploy to Azure Static Web Apps

1. Push this repo to GitHub.
2. In the [Azure Portal](https://portal.azure.com), create a new **Static Web App**:
   - **Plan type:** Free
   - **Source:** GitHub → pick this repo and the `main` branch
   - **Build presets:** *Custom* (or pick "React" if offered)
   - **App location:** `/`
   - **API location:** *(leave blank)*
   - **Output location:** `dist`
3. Azure will commit a workflow file to `.github/workflows/` (this requires the GitHub user/PAT to have `workflow` scope). If you'd rather provide your own, use the template in [`docs/azure-workflow-template.yml`](docs/azure-workflow-template.yml) — copy it to `.github/workflows/azure-static-web-apps.yml` and add a repository secret `AZURE_STATIC_WEB_APPS_API_TOKEN` with the deployment token from the Azure portal.
4. In **Static Web App → Settings → Environment variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_ADMIN_KEY` (same value as the `admin_key` row in Supabase)

That's it — every push to `main` redeploys.

## How to play

1. Visit the deployed URL.
2. **Create a group** — pick a name (e.g. "Neighbors pool") and your display name. You'll get a 9-character invite code.
3. Share the link `https://YOUR-APP.azurestaticapps.net/join?code=WC-XXXXXX` with your friends.
4. Each player picks their predictions in **Matches** and locks in their bracket in **Bracket → Build**.
5. The **Leaderboard** ranks everyone after each finished match.

## Entering match results

Two options:

### A. Manual (always available)

Open `/admin?key=YOUR_ADMIN_KEY` and type final scores. The leaderboard recomputes immediately.

### B. Auto-sync (Phase 3 — optional)

Set up a Supabase Edge Function that calls [football-data.org](https://www.football-data.org)'s `/v4/competitions/WC/matches` every few minutes and calls the `set_match_result` RPC. The free tier covers the World Cup competition.

## Repo tour

```
src/
  routes/         Pages (Landing, Group tabs, Bracket, Admin, Me…)
  components/     MatchCard, PredictionWidget, Primitives
  lib/            supabase client, api wrappers, scoring + timezone helpers
  stores/         Zustand store for the localStorage identity
supabase/
  migrations/     0001_init.sql — schema, RLS, RPCs, scoring function
  seed.sql        48 teams + all 104 matches
.github/workflows/azure-static-web-apps.yml
staticwebapp.config.json  SPA fallback for Azure
```

## Architecture notes

- All writes go through Postgres `security definer` RPCs (`create_group`, `join_group`, `submit_match_prediction`, `submit_bracket_prediction`, `set_match_result`). The client's only "credential" is the `playerId` in localStorage; the RPCs verify membership server-side.
- The leaderboard is materialized into `leaderboard_cache` by the SQL `recalc_scores()` function, called from `set_match_result`. This is the single source of truth for points — the client mirrors the formula only for the instant feedback after a match finishes.
- Predictions are revealed to other group members via the `match_predictions_public` view, which filters to matches whose kickoff has already passed.

## What's still ahead (Phase 3)

- Supabase Edge Function + `pg_cron` job to auto-sync scores.
- Supabase Realtime channel on `matches` updates so the UI ticks live without refresh.
- Auto-populate KO team ids from the API once R32 matchups are known.

See `/memories/session/plan.md` for the full plan if you're contributing.
