-- Migration 0012 — shorten match-prediction lock window from 1 hour to 15 minutes.
-- Mirrors the frontend change so server-side enforcement matches the UI countdown.

create or replace function submit_match_prediction(
  p_player_id          uuid,
  p_group_id           uuid,
  p_match_id           int,
  p_outcome            prediction_outcome,
  p_home_score         int default null,
  p_away_score         int default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  m_kickoff timestamptz;
  m_stage match_stage;
  m_home text;
  m_away text;
begin
  perform _assert_membership(p_player_id, p_group_id);

  select kickoff_at, stage, home_team_id, away_team_id
    into m_kickoff, m_stage, m_home, m_away
    from matches where id = p_match_id;
  if m_kickoff is null then
    raise exception 'unknown match';
  end if;

  -- Lock: 15 minutes before kickoff for ALL stages.
  if m_kickoff - interval '15 minutes' <= now() then
    raise exception 'predictions for this match have locked';
  end if;

  -- KO matches can't end in a draw (extra time + penalties decide it).
  if m_stage <> 'GROUP' and p_outcome = 'DRAW' then
    raise exception 'knockout matches cannot be predicted as a draw';
  end if;

  -- KO matches can only be predicted once their teams are populated.
  if m_stage <> 'GROUP' and (m_home is null or m_away is null) then
    raise exception 'this knockout match is not yet ready to predict';
  end if;

  insert into match_predictions (
    player_id, group_id, match_id, predicted_outcome,
    predicted_home_score, predicted_away_score
  )
  values (
    p_player_id, p_group_id, p_match_id, p_outcome,
    p_home_score, p_away_score
  )
  on conflict (player_id, group_id, match_id) do update set
    predicted_outcome    = excluded.predicted_outcome,
    predicted_home_score = excluded.predicted_home_score,
    predicted_away_score = excluded.predicted_away_score,
    updated_at           = now();
end;
$$;
