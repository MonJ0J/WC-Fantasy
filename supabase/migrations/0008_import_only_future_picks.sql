-- =====================================================================
-- Migration 0008 — import only "future" predictions
--
-- When a player joins a new group and imports picks from another group,
-- only copy predictions for matches whose kickoff is AFTER the destination
-- group's creation time. Same rule for outright bets: only import if the
-- outrights lock hadn't fired yet when the destination group was created.
--
-- This prevents a head-start: the importer can only carry forward picks
-- that the new group's other members ALSO had a fair chance to make.
-- =====================================================================

create or replace function import_predictions_from_group(
  p_player_id       uuid,
  p_source_group_id uuid,
  p_dest_group_id   uuid
)
returns table (matches_copied int, outrights_copied int)
language plpgsql security definer set search_path = public as $$
declare
  m_count       int := 0;
  o_count       int := 0;
  dest_created  timestamptz;
  outrights_at  timestamptz;
begin
  if p_source_group_id = p_dest_group_id then
    raise exception 'source and destination groups must differ';
  end if;
  perform _assert_membership(p_player_id, p_source_group_id);
  perform _assert_membership(p_player_id, p_dest_group_id);

  select created_at into dest_created
    from groups_sessions where id = p_dest_group_id;
  if dest_created is null then
    raise exception 'destination group not found';
  end if;

  -- Outrights lock time (override or match #1 fallback) — match the same
  -- logic as _outrights_locked() so we don't import past-lock big bets.
  select coalesce(
    (select value::timestamptz from app_settings where key = 'outrights_lock_at'),
    (select kickoff_at from matches where id = 1)
  ) into outrights_at;

  -- Match predictions: only copy ones whose match kickoff is after the dest
  -- group's creation time (i.e. matches that hadn't kicked off yet when the
  -- group started — so everyone in the new pool had the same opportunity).
  with copied as (
    insert into match_predictions (
      player_id, group_id, match_id, predicted_outcome,
      predicted_home_score, predicted_away_score
    )
    select
      p_player_id, p_dest_group_id, src.match_id, src.predicted_outcome,
      src.predicted_home_score, src.predicted_away_score
    from match_predictions src
    join matches m on m.id = src.match_id
    where src.player_id = p_player_id
      and src.group_id  = p_source_group_id
      and m.kickoff_at  > dest_created
    on conflict (player_id, group_id, match_id) do update set
      predicted_outcome    = excluded.predicted_outcome,
      predicted_home_score = excluded.predicted_home_score,
      predicted_away_score = excluded.predicted_away_score,
      updated_at           = now()
    returning 1
  )
  select count(*) into m_count from copied;

  -- Outright predictions: only copy if the outrights lock hadn't fired yet
  -- when the destination group was created.
  if outrights_at is null or outrights_at > dest_created then
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
  end if;

  -- Recompute the destination leaderboard so the imported predictions show
  -- up immediately.
  perform recalc_scores(p_dest_group_id);

  return query select m_count, o_count;
end;
$$;

grant execute on function import_predictions_from_group(uuid, uuid, uuid)
  to anon, authenticated;
