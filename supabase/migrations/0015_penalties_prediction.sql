-- =====================================================================
-- Migration 0015 — predicting "match goes to penalties"
--
-- New mechanic for KO matches:
--   * Players can flag a prediction as "this match will go to PKs".
--   * When the flag is on, exact-score prediction is disabled (no scores
--     are stored) and the player still picks the winner (HOME or AWAY).
--   * Scoring: a "correct PK call" replaces the exact-score bonus — i.e.
--     the player gets the same bonus they'd have earned by guessing the
--     final score in regulation, IF the match actually ends in PKs and
--     they picked the right winner.
--
-- Detection of "match went to PKs" comes from football-data.org's
-- `score.duration = PENALTY_SHOOTOUT` (wired in sync-wc-matches).
-- =====================================================================

-- 1. Storage --------------------------------------------------------------

alter table match_predictions
  add column if not exists predicted_penalties boolean not null default false;

alter table matches
  add column if not exists went_to_penalties boolean not null default false;

-- 2. submit_match_prediction — add `p_predicted_penalties` ---------------

-- Drop the old signature so PostgREST doesn't get ambiguous overloads.
drop function if exists submit_match_prediction(uuid, uuid, int, prediction_outcome, int, int);

create or replace function submit_match_prediction(
  p_player_id          uuid,
  p_group_id           uuid,
  p_match_id           int,
  p_outcome            prediction_outcome,
  p_home_score         int default null,
  p_away_score         int default null,
  p_predicted_penalties boolean default false
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  m_kickoff timestamptz;
  m_stage match_stage;
  m_home text;
  m_away text;
  v_home int := p_home_score;
  v_away int := p_away_score;
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

  -- Penalties flag is KO-only and forces scores to NULL.
  if p_predicted_penalties then
    if m_stage = 'GROUP' then
      raise exception 'group-stage matches cannot be predicted to go to penalties';
    end if;
    v_home := null;
    v_away := null;
  end if;

  insert into match_predictions (
    player_id, group_id, match_id, predicted_outcome,
    predicted_home_score, predicted_away_score, predicted_penalties
  )
  values (
    p_player_id, p_group_id, p_match_id, p_outcome,
    v_home, v_away, p_predicted_penalties
  )
  on conflict (player_id, group_id, match_id) do update set
    predicted_outcome    = excluded.predicted_outcome,
    predicted_home_score = excluded.predicted_home_score,
    predicted_away_score = excluded.predicted_away_score,
    predicted_penalties  = excluded.predicted_penalties,
    updated_at           = now();
end;
$$;

grant execute on function
  submit_match_prediction(uuid, uuid, int, prediction_outcome, int, int, boolean)
to anon, authenticated;

-- 3. get_my_predictions — return the new column -------------------------

drop function if exists get_my_predictions(uuid, uuid);

create or replace function get_my_predictions(p_player_id uuid, p_group_id uuid)
returns table (
  match_id              int,
  predicted_outcome     prediction_outcome,
  predicted_home_score  int,
  predicted_away_score  int,
  predicted_penalties   boolean
)
language plpgsql security definer set search_path = public as $$
begin
  perform _assert_membership(p_player_id, p_group_id);
  return query
    select mp.match_id, mp.predicted_outcome,
           mp.predicted_home_score, mp.predicted_away_score,
           mp.predicted_penalties
    from match_predictions mp
    where mp.player_id = p_player_id and mp.group_id = p_group_id;
end;
$$;

grant execute on function get_my_predictions(uuid, uuid) to anon, authenticated;

-- 4. match_predictions_public — expose predicted_penalties --------------

drop view if exists match_predictions_public;

create view match_predictions_public as
select
  mp.id,
  mp.player_id,
  mp.group_id,
  mp.match_id,
  mp.predicted_outcome,
  mp.predicted_home_score,
  mp.predicted_away_score,
  mp.predicted_penalties
from match_predictions mp
join matches m on m.id = mp.match_id
where m.kickoff_at <= now();

grant select on match_predictions_public to anon, authenticated;

-- 5. upsert_match_from_sync — add `p_went_to_penalties` ----------------

drop function if exists upsert_match_from_sync(text, int, int, text, text, int, int, text, match_status, timestamptz);

create or replace function upsert_match_from_sync(
  p_admin_key         text,
  p_match_id          int,
  p_external_id       int,
  p_home_team_id      text,
  p_away_team_id      text,
  p_home_score        int,
  p_away_score        int,
  p_winner_team_id    text,
  p_status            match_status,
  p_kickoff_at        timestamptz default null,
  p_went_to_penalties boolean default null
)
returns table (changed boolean, finalized boolean)
language plpgsql security definer set search_path = public as $$
declare
  cur record;
  did_change boolean := false;
  did_finalize boolean := false;
begin
  perform _check_admin_key(p_admin_key);

  select * into cur from matches where id = p_match_id;
  if cur.id is null then
    raise exception 'unknown match id %', p_match_id;
  end if;

  update matches set
    external_id       = coalesce(p_external_id, external_id),
    home_team_id      = coalesce(p_home_team_id, home_team_id),
    away_team_id      = coalesce(p_away_team_id, away_team_id),
    home_score        = coalesce(p_home_score, home_score),
    away_score        = coalesce(p_away_score, away_score),
    winner_team_id    = coalesce(p_winner_team_id, winner_team_id),
    status            = coalesce(p_status, status),
    kickoff_at        = coalesce(p_kickoff_at, kickoff_at),
    went_to_penalties = coalesce(p_went_to_penalties, went_to_penalties)
  where id = p_match_id
  returning
    (
      coalesce(external_id, -1)        <> coalesce(cur.external_id, -1) or
      coalesce(home_team_id, '')       <> coalesce(cur.home_team_id, '') or
      coalesce(away_team_id, '')       <> coalesce(cur.away_team_id, '') or
      coalesce(home_score, -1)         <> coalesce(cur.home_score, -1) or
      coalesce(away_score, -1)         <> coalesce(cur.away_score, -1) or
      coalesce(winner_team_id, '')     <> coalesce(cur.winner_team_id, '') or
      coalesce(status::text, '')       <> coalesce(cur.status::text, '') or
      coalesce(went_to_penalties,false) <> coalesce(cur.went_to_penalties,false)
    ),
    (status = 'FINISHED' and (cur.status is distinct from 'FINISHED'))
  into did_change, did_finalize;

  return query select did_change, did_finalize;
end;
$$;

grant execute on function
  upsert_match_from_sync(text, int, int, text, text, int, int, text, match_status, timestamptz, boolean)
to anon, authenticated;

-- 6. recalc_scores — "correct PK call" replaces the exact-score bonus ---

create or replace function recalc_scores(p_group_id uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_group_id is null then
    delete from leaderboard_cache where true;
  else
    delete from leaderboard_cache where group_id = p_group_id;
  end if;

  with
  ko_finished as (
    select
      m.id, m.stage,
      m.home_score, m.away_score,
      m.home_team_id, m.away_team_id,
      m.went_to_penalties,
      case
        when m.winner_team_id = m.home_team_id then 'HOME'::prediction_outcome
        when m.winner_team_id = m.away_team_id then 'AWAY'::prediction_outcome
        when m.home_score > m.away_score        then 'HOME'::prediction_outcome
        when m.away_score > m.home_score        then 'AWAY'::prediction_outcome
      end as actual_outcome,
      case
        when m.winner_team_id is not null then m.winner_team_id
        when m.home_score > m.away_score  then m.home_team_id
        when m.away_score > m.home_score  then m.away_team_id
      end as winner
    from matches m
    where m.stage <> 'GROUP'
      and m.status = 'FINISHED'
      and m.home_score is not null and m.away_score is not null
  ),
  group_finished as (
    select
      m.id, m.home_score, m.away_score,
      case
        when m.home_score > m.away_score then 'HOME'::prediction_outcome
        when m.home_score < m.away_score then 'AWAY'::prediction_outcome
        else 'DRAW'::prediction_outcome
      end as actual_outcome
    from matches m
    where m.stage = 'GROUP' and m.status = 'FINISHED'
      and m.home_score is not null and m.away_score is not null
  ),
  group_scored as (
    select
      mp.group_id, mp.player_id,
      sum(case when mp.predicted_outcome = gf.actual_outcome then 3 else 0 end)
        + sum(case when mp.predicted_outcome = gf.actual_outcome
                    and mp.predicted_home_score = gf.home_score
                    and mp.predicted_away_score = gf.away_score
                  then 2 else 0 end) as pts,
      sum(case when mp.predicted_outcome = gf.actual_outcome then 1 else 0 end) as outcomes,
      sum(case when mp.predicted_outcome = gf.actual_outcome
                and mp.predicted_home_score = gf.home_score
                and mp.predicted_away_score = gf.away_score
              then 1 else 0 end) as exacts
    from match_predictions mp
    join group_finished gf on gf.id = mp.match_id
    group by mp.group_id, mp.player_id
  ),
  ko_scored as (
    select
      mp.group_id, mp.player_id,
      sum(case when mp.predicted_outcome = kf.actual_outcome then
        case kf.stage
          when 'R32'   then  5
          when 'R16'   then  8
          when 'QF'    then 12
          when 'SF'    then 18
          when 'THIRD' then 10
          when 'FINAL' then 25
        end
      else 0 end)
      -- Exact-score bonus: either the regulation score matched, OR the
      -- player called "goes to penalties" and the match did go to PKs
      -- (and they picked the correct winner).
      + sum(case
          when mp.predicted_outcome = kf.actual_outcome
            and (
              (mp.predicted_penalties = false
                and mp.predicted_home_score = kf.home_score
                and mp.predicted_away_score = kf.away_score)
              or
              (mp.predicted_penalties = true and kf.went_to_penalties = true)
            )
          then
            case kf.stage
              when 'R32'   then  3
              when 'R16'   then  5
              when 'QF'    then  8
              when 'SF'    then 10
              when 'THIRD' then  0
              when 'FINAL' then 15
            end
          else 0
        end) as pts,
      sum(case when mp.predicted_outcome = kf.actual_outcome then 1 else 0 end) as ko_correct,
      sum(case
        when mp.predicted_outcome = kf.actual_outcome
          and (
            (mp.predicted_penalties = false
              and mp.predicted_home_score = kf.home_score
              and mp.predicted_away_score = kf.away_score)
            or
            (mp.predicted_penalties = true and kf.went_to_penalties = true)
          )
        then 1 else 0 end) as ko_exacts
    from match_predictions mp
    join ko_finished kf on kf.id = mp.match_id
    group by mp.group_id, mp.player_id
  ),
  champion as (
    select winner as team from ko_finished where id = 104
  ),
  runner_up as (
    select case when winner = home_team_id then away_team_id else home_team_id end as team
    from ko_finished where id = 104
  ),
  group_winner_map (letter, match_id) as (values
    ('A', 79), ('B', 85), ('C', 76), ('D', 81),
    ('E', 74), ('F', 75), ('G', 82), ('H', 84),
    ('I', 77), ('J', 86), ('K', 87), ('L', 80)
  ),
  group_winners as (
    select gwm.letter, m.home_team_id as team
    from group_winner_map gwm
    join matches m on m.id = gwm.match_id
    where m.home_team_id is not null
  ),
  sf_teams as (
    select home_team_id as team from matches where id in (101, 102) and home_team_id is not null
    union
    select away_team_id from matches where id in (101, 102) and away_team_id is not null
  ),
  ko_started as (
    select not exists (
      select 1 from matches
       where stage = 'R32'
         and (home_team_id is null or away_team_id is null)
    ) as ready
  ),
  underperformers as (
    select t.id as team
    from teams t, ko_started k
    where k.ready
      and t.seed_position in (1, 2)
      and not exists (
        select 1 from matches m
        where m.stage in ('R32','R16','QF','SF','FINAL','THIRD')
          and (m.home_team_id = t.id or m.away_team_id = t.id)
      )
  ),
  outright_scored as (
    select
      op.group_id, op.player_id,
      sum(case
        when op.bet_type = 'CHAMPION'
          and exists (select 1 from champion c where c.team = op.predicted_team_id) then 50
        when op.bet_type = 'RUNNER_UP'
          and exists (select 1 from runner_up r where r.team = op.predicted_team_id) then 30
        when op.bet_type = 'GROUP_WINNER'
          and exists (select 1 from group_winners gw
                       where gw.letter = op.bet_subkey and gw.team = op.predicted_team_id) then 5
        when op.bet_type = 'SEMIFINALIST'
          and exists (select 1 from sf_teams s where s.team = op.predicted_team_id) then 10
        when op.bet_type = 'UNDERPERFORMER'
          and exists (select 1 from underperformers u where u.team = op.predicted_team_id) then 20
        else 0
      end) as pts,
      sum(case
        when op.bet_type = 'CHAMPION'
          and exists (select 1 from champion c where c.team = op.predicted_team_id) then 1
        when op.bet_type = 'RUNNER_UP'
          and exists (select 1 from runner_up r where r.team = op.predicted_team_id) then 1
        when op.bet_type = 'GROUP_WINNER'
          and exists (select 1 from group_winners gw
                       where gw.letter = op.bet_subkey and gw.team = op.predicted_team_id) then 1
        when op.bet_type = 'SEMIFINALIST'
          and exists (select 1 from sf_teams s where s.team = op.predicted_team_id) then 1
        when op.bet_type = 'UNDERPERFORMER'
          and exists (select 1 from underperformers u where u.team = op.predicted_team_id) then 1
        else 0
      end) as correct
    from outright_predictions op
    group by op.group_id, op.player_id
  ),
  award_scored as (
    select
      ap.group_id, ap.player_id,
      sum(_award_points(ap.award_type)) as pts,
      count(*) as correct
    from award_predictions ap
    join award_results ar on ar.award_type = ap.award_type
     and lower(btrim(ap.predicted_player_name)) = lower(btrim(ar.winner_player_name))
    group by ap.group_id, ap.player_id
  ),
  combined as (
    select
      m.group_id, m.player_id,
      coalesce(gs.pts, 0) + coalesce(ks.pts, 0) + coalesce(os.pts, 0)
        + coalesce(aws.pts, 0) + coalesce(m.starting_bonus, 0)             as total_points,
      coalesce(gs.outcomes, 0) + coalesce(ks.ko_correct, 0)                as correct_outcomes,
      coalesce(gs.exacts,   0) + coalesce(ks.ko_exacts, 0)                 as exact_scores,
      coalesce(ks.ko_correct, 0)                                           as ko_correct,
      coalesce(os.correct, 0) + coalesce(aws.correct, 0)                   as outright_correct
    from memberships m
    left join group_scored    gs  on gs.group_id  = m.group_id and gs.player_id  = m.player_id
    left join ko_scored       ks  on ks.group_id  = m.group_id and ks.player_id  = m.player_id
    left join outright_scored os  on os.group_id  = m.group_id and os.player_id  = m.player_id
    left join award_scored    aws on aws.group_id = m.group_id and aws.player_id = m.player_id
    where p_group_id is null or m.group_id = p_group_id
  )
  insert into leaderboard_cache
    (group_id, player_id, total_points, correct_outcomes, exact_scores, ko_correct, outright_correct)
  select group_id, player_id, total_points, correct_outcomes, exact_scores, ko_correct, outright_correct
  from combined
  on conflict (group_id, player_id) do update set
    total_points     = excluded.total_points,
    correct_outcomes = excluded.correct_outcomes,
    exact_scores     = excluded.exact_scores,
    ko_correct       = excluded.ko_correct,
    outright_correct = excluded.outright_correct,
    updated_at       = now();
end;
$$;
