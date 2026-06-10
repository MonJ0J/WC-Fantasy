-- =====================================================================
-- Migration 0002 — per-match KO predictions + outright bets
--
-- Switches the engagement model from "locked bracket" to:
--   1. Every match (group + KO) is predicted individually with escalating
--      point values (R32 5+3, R16 8+5, QF 12+8, SF 18+10, FINAL 25+15,
--      THIRD 10).
--   2. Five outright bets locked at the first kickoff of the tournament:
--      Champion (+50), Runner-up (+30), 12 Group Winners (+5 each),
--      4 Semifinalists (+10 each), Underperformer (+20, Pot 1/2 teams only).
--
-- The `bracket_predictions` table is kept in place to preserve any existing
-- data, but it's no longer scored. The `correct_bracket` column is replaced
-- with a `outright_correct` aggregate.
-- =====================================================================

-- ---------- Outright bets ----------
create type outright_bet_type as enum
  ('CHAMPION','RUNNER_UP','GROUP_WINNER','SEMIFINALIST','UNDERPERFORMER');

create table outright_predictions (
  id                  uuid primary key default gen_random_uuid(),
  player_id           uuid not null references players(id) on delete cascade,
  group_id            uuid not null references groups_sessions(id) on delete cascade,
  bet_type            outright_bet_type not null,
  -- 'A'..'L' for GROUP_WINNER, '1'..'4' for SEMIFINALIST, NULL for singletons.
  bet_subkey          text,
  predicted_team_id   text not null references teams(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- NULLS NOT DISTINCT (PG 15+) treats NULL bet_subkey as equal so the
-- singleton bets (CHAMPION, RUNNER_UP, UNDERPERFORMER) get one row per player.
alter table outright_predictions
  add constraint outright_unique
  unique nulls not distinct (player_id, group_id, bet_type, bet_subkey);

-- SEMIFINALIST: can't pick the same team twice across the 4 slots.
create unique index outright_semi_unique_team
  on outright_predictions (player_id, group_id, predicted_team_id)
  where bet_type = 'SEMIFINALIST';

create index outright_predictions_group_idx on outright_predictions (group_id);

alter table outright_predictions enable row level security;

-- Reveal a player's own picks via the RPC `get_my_outrights`; reveal all
-- group picks publicly once the lock has passed (first kickoff).
create view outright_predictions_public as
select op.id, op.player_id, op.group_id, op.bet_type, op.bet_subkey, op.predicted_team_id
from outright_predictions op
where exists (select 1 from matches where id = 1 and kickoff_at <= now());

grant select on outright_predictions_public to anon, authenticated;

-- ---------- KO match support: winner_team_id for penalty-shootout cases ----------
alter table matches add column if not exists winner_team_id text references teams(id);

-- ---------- leaderboard_cache reshape ----------
alter table leaderboard_cache
  drop column if exists correct_bracket;
alter table leaderboard_cache
  add column if not exists ko_correct       int not null default 0,
  add column if not exists outright_correct int not null default 0;

-- ---------- Remove the KO guard in submit_match_prediction ----------
-- Knockout matches can now be predicted directly (no draws, no exact-score
-- bonus from PKs unless the player also got the winner right).
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

  -- Lock: 1 hour before kickoff for ALL stages.
  if m_kickoff - interval '1 hour' <= now() then
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

-- ---------- Outright RPCs ----------

-- Helper: outrights lock at first kickoff.
create or replace function _outrights_locked() returns boolean
language sql stable as $$
  select exists (select 1 from matches where id = 1 and kickoff_at <= now());
$$;

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

  if _outrights_locked() then
    raise exception 'outright predictions have locked for this tournament';
  end if;

  -- Validate bet_subkey shape per bet_type.
  if p_bet_type = 'GROUP_WINNER' then
    if p_bet_subkey is null or p_bet_subkey !~ '^[A-L]$' then
      raise exception 'GROUP_WINNER requires bet_subkey = ''A''..''L''';
    end if;
    -- Pick must actually be a team in that group.
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

  -- UNDERPERFORMER must be a Pot 1 or Pot 2 team (seed_position 1 or 2).
  if p_bet_type = 'UNDERPERFORMER' then
    select seed_position into team_seed from teams where id = p_team_id;
    if team_seed not in (1, 2) then
      raise exception 'UNDERPERFORMER must be a Pot 1 or Pot 2 team';
    end if;
  end if;

  -- Upsert. `nulls not distinct` lets the constraint match NULL subkeys.
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
  if _outrights_locked() then
    raise exception 'outright predictions have locked for this tournament';
  end if;
  delete from outright_predictions
  where player_id = p_player_id
    and group_id = p_group_id
    and bet_type = p_bet_type
    and bet_subkey is not distinct from p_bet_subkey;
end;
$$;

create or replace function get_my_outrights(p_player_id uuid, p_group_id uuid)
returns table (bet_type outright_bet_type, bet_subkey text, predicted_team_id text)
language plpgsql security definer set search_path = public as $$
begin
  perform _assert_membership(p_player_id, p_group_id);
  return query
    select op.bet_type, op.bet_subkey, op.predicted_team_id
    from outright_predictions op
    where op.player_id = p_player_id and op.group_id = p_group_id;
end;
$$;

-- ---------- Scoring (replaces the existing recalc_scores) ----------
--
-- Group:  3 outcome + 2 exact-score bonus  (max 5/match)
-- KO:     5/8/12/18/10/25 outcome + 3/5/8/10/0/15 exact-score bonus
--         per R32/R16/QF/SF/THIRD/FINAL
-- Champion: +50  | Runner-up: +30
-- Group winners: +5 each (max 12 picks → +60)
-- Semifinalists: +10 each (max 4 picks → +40)
-- Underperformer: +20 if a Pot 1/2 pick is eliminated at group stage
--
-- KO `actual_outcome` falls back to `winner_team_id` when scores are level
-- (penalty-shootout case).

create or replace function recalc_scores(p_group_id uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_group_id is null then
    delete from leaderboard_cache;
  else
    delete from leaderboard_cache where group_id = p_group_id;
  end if;

  -- Map of R32 home slot to group winner (apex of each group).
  -- Built from the 2026 bracket structure in seed.sql.
  with
  ko_finished as (
    select
      m.id,
      m.stage,
      m.home_score, m.away_score,
      m.home_team_id, m.away_team_id,
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
      + sum(case when mp.predicted_outcome = kf.actual_outcome
                  and mp.predicted_home_score = kf.home_score
                  and mp.predicted_away_score = kf.away_score
                then
        case kf.stage
          when 'R32'   then  3
          when 'R16'   then  5
          when 'QF'    then  8
          when 'SF'    then 10
          when 'THIRD' then  0
          when 'FINAL' then 15
        end
      else 0 end) as pts,
      sum(case when mp.predicted_outcome = kf.actual_outcome then 1 else 0 end) as ko_correct,
      sum(case when mp.predicted_outcome = kf.actual_outcome
                and mp.predicted_home_score = kf.home_score
                and mp.predicted_away_score = kf.away_score
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
  -- The bracket places each group's winner in a specific R32 home slot.
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
  -- An UNDERPERFORMER pick is correct when a Pot 1/2 team didn't reach
  -- the knockout stage. We only evaluate once R32 teams are populated.
  ko_started as (
    select exists (
      select 1 from matches where stage = 'R32' and home_team_id is not null
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
          and exists (select 1 from champion c where c.team = op.predicted_team_id)
          then 50
        when op.bet_type = 'RUNNER_UP'
          and exists (select 1 from runner_up r where r.team = op.predicted_team_id)
          then 30
        when op.bet_type = 'GROUP_WINNER'
          and exists (select 1 from group_winners gw
                       where gw.letter = op.bet_subkey and gw.team = op.predicted_team_id)
          then 5
        when op.bet_type = 'SEMIFINALIST'
          and exists (select 1 from sf_teams s where s.team = op.predicted_team_id)
          then 10
        when op.bet_type = 'UNDERPERFORMER'
          and exists (select 1 from underperformers u where u.team = op.predicted_team_id)
          then 20
        else 0
      end) as pts,
      sum(case
        when op.bet_type = 'CHAMPION'
          and exists (select 1 from champion c where c.team = op.predicted_team_id)
          then 1
        when op.bet_type = 'RUNNER_UP'
          and exists (select 1 from runner_up r where r.team = op.predicted_team_id)
          then 1
        when op.bet_type = 'GROUP_WINNER'
          and exists (select 1 from group_winners gw
                       where gw.letter = op.bet_subkey and gw.team = op.predicted_team_id)
          then 1
        when op.bet_type = 'SEMIFINALIST'
          and exists (select 1 from sf_teams s where s.team = op.predicted_team_id)
          then 1
        when op.bet_type = 'UNDERPERFORMER'
          and exists (select 1 from underperformers u where u.team = op.predicted_team_id)
          then 1
        else 0
      end) as correct
    from outright_predictions op
    group by op.group_id, op.player_id
  ),
  combined as (
    select
      m.group_id, m.player_id,
      coalesce(gs.pts, 0)   + coalesce(ks.pts, 0)   + coalesce(os.pts, 0)    as total_points,
      coalesce(gs.outcomes, 0) + coalesce(ks.ko_correct, 0)                  as correct_outcomes,
      coalesce(gs.exacts,   0) + coalesce(ks.ko_exacts, 0)                   as exact_scores,
      coalesce(ks.ko_correct, 0)                                              as ko_correct,
      coalesce(os.correct, 0)                                                 as outright_correct
    from memberships m
    left join group_scored    gs on gs.group_id = m.group_id and gs.player_id = m.player_id
    left join ko_scored       ks on ks.group_id = m.group_id and ks.player_id = m.player_id
    left join outright_scored os on os.group_id = m.group_id and os.player_id = m.player_id
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

-- ---------- GRANTS ----------
grant execute on function
  submit_outright_prediction(uuid, uuid, outright_bet_type, text, text),
  delete_outright_prediction(uuid, uuid, outright_bet_type, text),
  get_my_outrights(uuid, uuid)
to anon, authenticated;
