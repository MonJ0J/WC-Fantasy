-- =====================================================================
-- Migration 0005 — player award predictions (Top Goal Scorer, Top Player)
--
-- Adds two "outright-style" award picks, each worth +10 points:
--   * TOP_SCORER  — the tournament's leading goal scorer (Golden Boot)
--   * TOP_PLAYER  — the best player of the tournament (Golden Ball)
--
-- Picks are free-text names: the UI offers a short list of likely candidates
-- (`tournament_players`) as suggestions, but the user may type any name.
-- Both awards lock at Monday, June 15 2026 00:00 (local on the client; a
-- 12:00 UTC backstop is enforced server-side).
--
-- Scoring: when the admin records the actual winner via `set_award_result`,
-- each correct pick earns +10 points (case/whitespace-insensitive match).
-- =====================================================================

-- ---------- Candidate suggestion list (top-scorer favourites) ----------
create table if not exists tournament_players (
  id        text primary key,
  name      text not null,
  team_id   text references teams(id),
  created_at timestamptz not null default now()
);

alter table tournament_players enable row level security;

-- The candidate list is public reference data — anyone can read it.
drop policy if exists tournament_players_read on tournament_players;
create policy tournament_players_read on tournament_players
  for select to anon, authenticated using (true);

-- Seed ~10 favourites for the Golden Boot. These are only dropdown
-- suggestions; the pick itself is stored as free text.
insert into tournament_players (id, name, team_id) values
  ('MBAPPE',   'Kylian Mbappé',    'FRA'),
  ('HAALAND',  'Erling Haaland',   'NOR'),
  ('KANE',     'Harry Kane',       'ENG'),
  ('MESSI',    'Lionel Messi',     'ARG'),
  ('VINICIUS', 'Vinícius Júnior',  'BRA'),
  ('YAMAL',    'Lamine Yamal',     'ESP'),
  ('RONALDO',  'Cristiano Ronaldo','POR'),
  ('ALVAREZ',  'Julián Álvarez',   'ARG'),
  ('LUKAKU',   'Romelu Lukaku',    'BEL'),
  ('DEPAY',    'Memphis Depay',    'NED')
on conflict (id) do nothing;

-- ---------- Award predictions ----------
create type award_type as enum ('TOP_SCORER','TOP_PLAYER');

-- Points awarded for a correct pick.
create or replace function _award_points(p_award_type award_type)
returns int language sql immutable as $$ select 10; $$;

create table award_predictions (
  id                    uuid primary key default gen_random_uuid(),
  player_id             uuid not null references players(id) on delete cascade,
  group_id              uuid not null references groups_sessions(id) on delete cascade,
  award_type            award_type not null,
  predicted_player_name text not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (player_id, group_id, award_type)
);

create index award_predictions_group_idx on award_predictions (group_id);

alter table award_predictions enable row level security;

-- Reveal all group picks publicly once the lock has passed.
create view award_predictions_public as
select ap.id, ap.player_id, ap.group_id, ap.award_type, ap.predicted_player_name
from award_predictions ap
where now() >= timestamptz '2026-06-15 12:00:00+00';

grant select on award_predictions_public to anon, authenticated;

-- ---------- Award results (admin-recorded winners) ----------
create table award_results (
  award_type         award_type primary key,
  winner_player_name text not null,
  updated_at         timestamptz not null default now()
);

alter table award_results enable row level security;
drop policy if exists award_results_read on award_results;
create policy award_results_read on award_results
  for select to anon, authenticated using (true);

-- ---------- RPCs ----------
-- Both player awards lock at Monday, June 15 2026. The client shows/enforces
-- the viewer's local midnight; this 12:00 UTC literal is the server backstop.
-- Adjust the literal below if the deadline changes.
create or replace function _award_locked(p_award_type award_type)
returns boolean
language sql stable as $$
  select now() >= timestamptz '2026-06-15 12:00:00+00';
$$;

create or replace function submit_award_prediction(
  p_player_id    uuid,
  p_group_id     uuid,
  p_award_type   award_type,
  p_player_name  text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_name text := nullif(btrim(p_player_name), '');
begin
  perform _assert_membership(p_player_id, p_group_id);

  if _award_locked(p_award_type) then
    raise exception 'this award prediction has locked';
  end if;

  if v_name is null then
    raise exception '% requires a player name', p_award_type;
  end if;

  insert into award_predictions (player_id, group_id, award_type, predicted_player_name)
  values (p_player_id, p_group_id, p_award_type, v_name)
  on conflict (player_id, group_id, award_type) do update set
    predicted_player_name = excluded.predicted_player_name,
    updated_at            = now();
end;
$$;

create or replace function delete_award_prediction(
  p_player_id  uuid,
  p_group_id   uuid,
  p_award_type award_type
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _assert_membership(p_player_id, p_group_id);
  if _award_locked(p_award_type) then
    raise exception 'this award prediction has locked';
  end if;
  delete from award_predictions
  where player_id = p_player_id
    and group_id = p_group_id
    and award_type = p_award_type;
end;
$$;

create or replace function get_my_awards(p_player_id uuid, p_group_id uuid)
returns table (
  award_type            award_type,
  predicted_player_name text
)
language plpgsql security definer set search_path = public as $$
begin
  perform _assert_membership(p_player_id, p_group_id);
  return query
    select ap.award_type, ap.predicted_player_name
    from award_predictions ap
    where ap.player_id = p_player_id and ap.group_id = p_group_id;
end;
$$;

-- Admin: record (or update) the actual award winner, then rescore everyone.
create or replace function set_award_result(
  p_admin_key  text,
  p_award_type award_type,
  p_winner     text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_name text := nullif(btrim(p_winner), '');
begin
  perform _check_admin_key(p_admin_key);
  if v_name is null then
    delete from award_results where award_type = p_award_type;
  else
    insert into award_results (award_type, winner_player_name)
    values (p_award_type, v_name)
    on conflict (award_type) do update set
      winner_player_name = excluded.winner_player_name,
      updated_at         = now();
  end if;
  perform recalc_scores(null);
end;
$$;

-- ---------- GRANTS ----------
grant execute on function
  submit_award_prediction(uuid, uuid, award_type, text),
  delete_award_prediction(uuid, uuid, award_type),
  get_my_awards(uuid, uuid),
  set_award_result(text, award_type, text)
to anon, authenticated;

-- ---------- Scoring: fold award points into recalc_scores ----------
-- Same as the 0002 definition, plus an `award_scored` CTE that adds +10 per
-- correct player-award pick (case/whitespace-insensitive name match). Award
-- points roll into total_points and the count rolls into outright_correct.
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
        + coalesce(aws.pts, 0)                                              as total_points,
      coalesce(gs.outcomes, 0) + coalesce(ks.ko_correct, 0)                 as correct_outcomes,
      coalesce(gs.exacts,   0) + coalesce(ks.ko_exacts, 0)                  as exact_scores,
      coalesce(ks.ko_correct, 0)                                            as ko_correct,
      coalesce(os.correct, 0) + coalesce(aws.correct, 0)                    as outright_correct
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
