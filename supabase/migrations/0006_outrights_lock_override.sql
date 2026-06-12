-- =====================================================================
-- Migration 0006 — configurable outrights lock deadline
--
-- Adds an app_settings key `outrights_lock_at` (timestamptz). When set,
-- `_outrights_locked()` checks the override first; otherwise it falls back
-- to match #1's kickoff time as before.
-- Also exposes `get_outrights_lock_at()` so the frontend can display the
-- correct countdown without needing direct read access to app_settings.
-- =====================================================================

insert into app_settings (key, value) values
  ('outrights_lock_at', '2026-06-13T07:00:00Z')
on conflict (key) do update set value = excluded.value;

create or replace function _outrights_locked() returns boolean
language sql stable as $$
  select coalesce(
    (select (value::timestamptz <= now())
       from app_settings where key = 'outrights_lock_at'),
    exists (select 1 from matches where id = 1 and kickoff_at <= now())
  );
$$;

create or replace function get_outrights_lock_at()
returns timestamptz
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select value::timestamptz from app_settings where key = 'outrights_lock_at'),
    (select kickoff_at from matches where id = 1)
  );
$$;

grant execute on function get_outrights_lock_at() to anon, authenticated;

