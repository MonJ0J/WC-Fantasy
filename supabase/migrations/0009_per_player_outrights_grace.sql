-- =====================================================================
-- Migration 0009 — per-player outrights grace window
--
-- Each player's effective outright deadline is:
--   max(global outrights lock, their `memberships.joined_at` + N days)
--
-- where N comes from app_settings.outrights_grace_days (default 3).
--
-- Existing early joiners are unaffected — the global lock still wins for
-- them. Anyone who joins close to or after the global lock gets a 3-day
-- runway to lock in Champion / Runner-up / Group Winners / etc.
--
-- The import-from-group flow keeps using the GLOBAL gate (we don't want
-- a stale outright to time-travel into a fresh group just because the new
-- player still has a grace window).
-- =====================================================================

insert into app_settings (key, value) values
  ('outrights_grace_days', '3')
on conflict (key) do nothing;

-- Per-player effective lock time. Public RPC so the UI can show a personalized
-- countdown to the right player.
create or replace function get_my_outrights_lock_at(
  p_player_id uuid,
  p_group_id  uuid
)
returns timestamptz
language sql stable security definer set search_path = public as $$
  select greatest(
    -- Global deadline (override or match #1 kickoff).
    coalesce(
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

grant execute on function get_my_outrights_lock_at(uuid, uuid)
  to anon, authenticated;

-- Boolean wrapper used by the write RPCs.
create or replace function _outrights_locked_for_player(
  p_player_id uuid,
  p_group_id  uuid
) returns boolean
language sql stable security definer set search_path = public as $$
  select get_my_outrights_lock_at(p_player_id, p_group_id) <= now();
$$;

-- Update submit_outright_prediction to use the per-player lock.
create or replace function submit_outright_prediction(
  p_player_id   uuid,
  p_group_id    uuid,
  p_bet_type    outright_bet_type,
  p_team_id     text,
  p_bet_subkey  text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  team_seed int;
begin
  perform _assert_membership(p_player_id, p_group_id);

  if _outrights_locked_for_player(p_player_id, p_group_id) then
    raise exception 'outright predictions have locked for this player';
  end if;

  -- Validate bet_subkey shape per bet_type.
  if p_bet_type = 'GROUP_WINNER' then
    if p_bet_subkey is null or p_bet_subkey !~ '^[A-L]$' then
      raise exception 'GROUP_WINNER requires bet_subkey = ''A''..''L''';
    end if;
    if not exists (
      select 1 from teams where id = p_team_id and group_letter = p_bet_subkey
    ) then
      raise exception 'team % is not in group %', p_team_id, p_bet_subkey;
    end if;
  elsif p_bet_type = 'SEMIFINALIST' then
    if p_bet_subkey is null or p_bet_subkey !~ '^[1-4]$' then
      raise exception 'SEMIFINALIST requires bet_subkey = ''1''..''4''';
    end if;
  else
    if p_bet_subkey is not null then
      raise exception '% does not take a bet_subkey', p_bet_type;
    end if;
  end if;

  if p_bet_type = 'UNDERPERFORMER' then
    select seed_position into team_seed from teams where id = p_team_id;
    if team_seed not in (1, 2) then
      raise exception 'UNDERPERFORMER must be a Pot 1 or Pot 2 team';
    end if;
  end if;

  insert into outright_predictions (
    player_id, group_id, bet_type, bet_subkey, predicted_team_id
  )
  values (
    p_player_id, p_group_id, p_bet_type, p_bet_subkey, p_team_id
  )
  on conflict (player_id, group_id, bet_type, bet_subkey) do update set
    predicted_team_id = excluded.predicted_team_id,
    updated_at        = now();
end;
$$;

create or replace function delete_outright_prediction(
  p_player_id   uuid,
  p_group_id    uuid,
  p_bet_type    outright_bet_type,
  p_bet_subkey  text default null
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _assert_membership(p_player_id, p_group_id);
  if _outrights_locked_for_player(p_player_id, p_group_id) then
    raise exception 'outright predictions have locked for this player';
  end if;
  delete from outright_predictions
  where player_id = p_player_id
    and group_id  = p_group_id
    and bet_type  = p_bet_type
    and bet_subkey is not distinct from p_bet_subkey;
end;
$$;
