# Contributing to WC-Fantasy

Thanks for wanting to help! Here's the quick path to getting a change merged.

## Workflow (fork-based)

1. **Fork** this repo via the *Fork* button on GitHub.
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/WC-Fantasy.git
   cd WC-Fantasy
   ```
3. **Create a branch** with a descriptive name:
   ```bash
   git checkout -b feat/dark-mode
   ```
4. Install deps and run locally — see [README.md](README.md#2-local-dev) for the Supabase + env-var setup.
5. Make your changes. Commit with a clear message:
   ```bash
   git commit -m "feat: add dark-mode toggle to settings"
   ```
   We follow [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`.
6. **Push** to your fork:
   ```bash
   git push origin feat/dark-mode
   ```
7. Open a **Pull Request** from your fork's branch into `MonJ0J/WC-Fantasy:main`.
8. Fill in the PR template. CI will run the build and tests on every push.
9. The maintainer reviews → merges → Azure auto-redeploys.

## Code standards

- **TypeScript strict mode is non-negotiable.** `npm run build` must pass.
- **No new dependencies** without a comment in the PR explaining why.
- **Tailwind classes only** for styling; no new CSS files unless absolutely needed.
- **Keep the bundle small.** Avoid adding heavy libraries (chart libs, date libs we already have, etc.).
- **All Postgres writes go through `security definer` RPCs.** Never call `INSERT` / `UPDATE` directly from the client; add an RPC.
- **Migrations are append-only.** Add a new numbered file under `supabase/migrations/`; don't edit existing ones.

## What to work on

Good first issues are tagged `good first issue` on GitHub. Other ideas:

- 📱 PWA manifest + offline shell so the app can be added to home screen
- 🌍 Internationalization (Spanish + Portuguese first)
- 📊 Per-day breakdown of points on the leaderboard
- 🎨 Per-team brand colors on match cards
- 🔔 Push notifications when a match you predicted finishes

## Reporting bugs

Open an issue with:
- What you expected vs what happened
- Steps to reproduce
- Browser + OS
- A screenshot if visual

## Code of conduct

Be kind. We're here to have fun predicting football matches.

## Questions

Open a Discussion on GitHub or ping the maintainer.
