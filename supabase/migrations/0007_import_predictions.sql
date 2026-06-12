-- =====================================================================
-- Migration 0007 — import predictions from another group
--
-- Copies a player's match + outright predictions from one group to another.
-- The player must belong to BOTH groups. Bypasses the per-match / outright
-- lock checks because the source picks were already recorded pre-lock; this
-- is a copy, not a new decision.
-- =====================================================================

create or replace function import_predictions_from_group(
  p_player_id       uuid,
  p_source_group_id uuid,
  p_dest_group_id   uuid
)
returns table (matches_copied int, outrights_copied int)
language plpgsql security definer set search_path = public as $$
declare
  m_count int := 0;
  o_count int := 0;
begin
  if p_source_group_id = p_dest_group_id then
    raise exception 'source and destination groups must differ';
  end if;
  perform _assert_membership(p_player_id, p_source_group_id);
  perform _assert_membership(p_player_id, p_dest_group_id);

  -- Match predictions
  with copied as (
    insert into match_predictions (
      player_id, group_id, match_id, predicted_outcome,
      predicted_home_score, predicted_away_score
    )
    select
      p_player_id, p_dest_group_id, src.match_id, src.predicted_outcome,
      src.predicted_home_score, src.predicted_away_score
    from match_predictions src
    where src.player_id = p_player_id
      and src.group_id  = p_source_group_id
    on conflict (player_id, group_id, match_id) do update set
      predicted_outcome    = excluded.predicted_outcome,
      predicted_home_score = excluded.predicted_home_score,
      predicted_away_score = excluded.predicted_away_score,
      updated_at           = now()
    returning 1
  )
  select count(*) into m_count from copied;

  -- Outright predictions
  with copied as (
    insert into outright_predictions (
      player_id, group_id, bet_type, bet_subkey, predicted_team_id
    )
    select
      p_player_id, p_dest_group_id, src.bet_type, src.bet_subkey, src.predicted_team_id
    from outright_predictions src
    where src.player_id = p_player_id
      and src.group_id  = p_source_group_id
    on conflict on constraint outright_unique do update set
      predicted_team_id = excluded.predicted_team_id,
      updated_at        = now()
    returning 1
  )
  select count(*) into o_count from copied;

  -- Recompute the destination leaderboard so the imported predictions show up
  -- immediately.
  perform recalc_scores(p_dest_group_id);

  return query select m_count, o_count;
end;
$$;

grant execute on function import_predictions_from_group(uuid, uuid, uuid)
  to anon, authenticated;
