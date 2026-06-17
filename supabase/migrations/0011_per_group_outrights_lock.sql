-- Migration 0011 — per-group outrights lock override
--
-- Adds an optional `outrights_lock_at` column on groups_sessions. When set,
-- it overrides the global `app_settings('outrights_lock_at')` for THAT group
-- only. Per-player grace (joined_at + N days) still applies on top.

alter table groups_sessions
  add column if not exists outrights_lock_at timestamptz;

create or replace function get_my_outrights_lock_at(
  p_player_id uuid,
  p_group_id  uuid
)
returns timestamptz
language sql stable security definer set search_path = public as $$
  select greatest(
    -- Effective base lock: per-group override wins over global if set.
    coalesce(
      (select outrights_lock_at from groups_sessions where id = p_group_id),
      (select value::timestamptz from app_settings where key = 'outrights_lock_at'),
      (select kickoff_at from matches where id = 1)
    ),
    -- Per-player grace: joined_at + N days.
    (select m.joined_at + (
        coalesce(
          (select value::int from app_settings where key = 'outrights_grace_days'),
          3
        )::text || ' days'
      )::interval
      from memberships m
      where m.player_id = p_player_id and m.group_id = p_group_id)
  );
$$;

-- Open Bandita (WC-TFNA92) outrights until end of day Wed June 17 PDT
-- (= 2026-06-18 07:00 UTC).
update groups_sessions
   set outrights_lock_at = '2026-06-18T07:00:00Z'
 where invite_code = 'WC-TFNA92';
