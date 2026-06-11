# Security policy

## Reporting a vulnerability

If you find a security vulnerability, **do not open a public GitHub issue**.

Instead, email the maintainer directly (see the GitHub profile of [@MonJ0J](https://github.com/MonJ0J)) with:

- A description of the issue
- Steps to reproduce
- The impact you believe it has

You can expect an acknowledgment within 72 hours and a fix or status update within a week for serious issues.

## Supported versions

Only the `main` branch is supported. Patches are deployed continuously.

## Known security boundaries

- **No user passwords are stored in plaintext.** Bcrypt via `pgcrypto` (cost 10).
- **All writes go through `security definer` RPCs** that validate the caller's player ID belongs to the requested group.
- **The `admin_key`** is a shared secret stored in `app_settings`. Anyone with it can enter match results. Treat it like a service password — rotate it if leaked.
- **The football-data.org API key** is stored as a Supabase secret, never in the repo or the client bundle.

## Out of scope

- Account takeover via guessed weak passwords. We enforce a 6-char minimum but do not rate-limit logins. Choose strong passwords.
- Social-engineering attacks against the maintainer.
