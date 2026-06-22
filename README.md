# WC-Fantasy ⚽🏆

[![CI](https://github.com/MonJ0J/WC-Fantasy/actions/workflows/ci.yml/badge.svg)](https://github.com/MonJ0J/WC-Fantasy/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A tiny **2026 FIFA World Cup prediction site** for groups of friends. Pick the winner (and optional score) of every match, lock in your full knockout bracket before R32 kicks off, and watch the leaderboard rank you against your group.

- **Stack:** React + Vite + TypeScript + Tailwind, [Supabase](https://supabase.com) (Postgres + RPCs), [Azure Static Web Apps](https://learn.microsoft.com/en-us/azure/static-web-apps/) for hosting.
- **Auth:** No accounts. Pick a display name; identity persists in your browser's localStorage. Join a group with a short invite code (e.g. `WC-NEIGH7`).
- **Per-match scoring:** Group stage = 3 pts outcome + 2 bonus exact score. Knockouts escalate: R32 5+3, R16 8+5, QF 12+8, SF 18+10, FINAL 25+15. Third-place 10.
- **Outright bets (lock at first kickoff):** Champion +50, Runner-up +30, Group Winners +5 × 12, Semifinalists +10 × 4, Underperformer (Pot 1/2 only) +20. Max bonus ~205 pts.
- **Lock:** Per-match predictions lock 15 minutes before kickoff. Outright bets lock when the first match kicks off.

## Setup — first time

### 1. Supabase

1. Create a free project at <https://supabase.com>.
2. Open the **SQL editor** in your Supabase dashboard and run, in order:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_per_match_and_outrights.sql`
   - `supabase/migrations/0003_sync_infra.sql`
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

### B. Auto-sync (Phase 3 — deployed via Supabase Edge Function)

The Edge Function at `supabase/functions/sync-wc-matches/index.ts` pulls scores from
[football-data.org](https://www.football-data.org)'s free `WC` competition feed every 5 minutes via
pg_cron, upserts them through the security-definer RPCs, and triggers `recalc_scores()` when a match
finalizes.

**One-time setup:**

1. Sign up for a free [football-data.org](https://www.football-data.org/client/register) account.
   Grab your **X-Auth-Token** from the dashboard.
2. Install the [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase`)
   and authenticate with `supabase login`.
3. Link your project once: `supabase link --project-ref YOUR-PROJECT-REF`.
4. Push the function and its secrets:
   ```bash
   supabase functions deploy sync-wc-matches --no-verify-jwt
   supabase secrets set FOOTBALL_DATA_API_KEY=your-football-data-token
   supabase secrets set ADMIN_KEY=same-value-as-app_settings.admin_key
   ```
5. Schedule the cron job (uncomment the block at the bottom of
   `0003_sync_infra.sql`, fill in your project ref + service-role key, run it). The function will
   then auto-run every 5 minutes.
6. (Optional) Trigger a one-off run to verify:
   ```bash
   curl -X POST -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
        https://YOUR-REF.supabase.co/functions/v1/sync-wc-matches
   ```
   You should see a JSON response with `matchesSeen`, `matchesUpdated`, etc. The `/admin?key=...`
   page also shows the latest sync status.

The Matches tab subscribes to Supabase Realtime, so scores tick into every connected browser without
a refresh.

## Repo tour

```
src/
  routes/         Pages (Landing, Group tabs, Bracket, Admin, Me…)
  components/     MatchCard, PredictionWidget, Primitives
  lib/            supabase client, api wrappers, scoring + timezone helpers
  stores/         Zustand store for the localStorage identity
supabase/
  migrations/     0001_init.sql, 0002_per_match_and_outrights.sql, 0003_sync_infra.sql
  seed.sql        48 teams + all 104 matches
  functions/sync-wc-matches/   Edge Function: football-data.org → our matches table
.github/workflows/azure-static-web-apps.yml
staticwebapp.config.json  SPA fallback for Azure
```

## Architecture notes

- All writes go through Postgres `security definer` RPCs (`create_group`, `join_group`, `submit_match_prediction`, `submit_bracket_prediction`, `set_match_result`). The client's only "credential" is the `playerId` in localStorage; the RPCs verify membership server-side.
- The leaderboard is materialized into `leaderboard_cache` by the SQL `recalc_scores()` function, called from `set_match_result`. This is the single source of truth for points — the client mirrors the formula only for the instant feedback after a match finishes.
- Predictions are revealed to other group members via the `match_predictions_public` view, which filters to matches whose kickoff has already passed.

## What's still ahead

- Push notifications when matches kick off / when your prediction scores.
- Per-team brand colors on cards.
- Group chat / reactions / comments.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full PR workflow.

## Contributing

Pull requests welcome! See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the fork → branch → PR workflow. CI runs on every PR; all merges into `main` require:

- A green CI build (`npm run build` passes)
- Maintainer review + approval

For security disclosures, see [`SECURITY.md`](SECURITY.md).

## License

[MIT](LICENSE) © 2026 Juan Esteban Junco

