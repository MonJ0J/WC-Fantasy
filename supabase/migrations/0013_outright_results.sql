-- Migration 0013 — expose outright results for the UI
--
-- Mirrors the CTEs in recalc_scores() but returns them as a queryable view so
-- the Outrights page can show users which of their bets are already correct
-- (green), already wrong (red), or still pending (neutral).
--
-- A bet is "resolved" when its outcome can no longer change:
--   GROUP_WINNER      — once that group's R32 home slot has a team_id
--   SEMIFINALIST      — once matches 101 + 102 have both teams populated
--                       (i.e. all 4 semifinalists known)
--   UNDERPERFORMER    — once R32 teams are populated (group stage finished)
--   CHAMPION          — once match 104 is FINISHED
--   RUNNER_UP         — once match 104 is FINISHED

create or replace function get_outright_results()
returns table (
  bet_type    outright_bet_type,
  bet_subkey  text,
  team_id     text,
  resolved    boolean
)
language sql stable security definer set search_path = public as $$
  with
  -- ----- CHAMPION / RUNNER_UP -----
  final_match as (
    select home_team_id, away_team_id, home_score, away_score, winner_team_id, status
      from matches where id = 104
  ),
  champ as (
    select case
      when status = 'FINISHED' and winner_team_id is not null then winner_team_id
      when status = 'FINISHED' and home_score > away_score    then home_team_id
      when status = 'FINISHED' and away_score > home_score    then away_team_id
    end as team
    from final_match
  ),
  runner_up as (
    select case
      when (select team from champ) is null then null
      when (select team from champ) = home_team_id then away_team_id
      when (select team from champ) = away_team_id then home_team_id
    end as team
    from final_match
  ),
  -- ----- GROUP_WINNER -----
  group_winner_map (letter, match_id) as (values
    ('A', 79), ('B', 85), ('C', 76), ('D', 81),
    ('E', 74), ('F', 75), ('G', 82), ('H', 84),
    ('I', 77), ('J', 86), ('K', 87), ('L', 80)
  ),
  group_winners as (
    select gwm.letter, m.home_team_id as team
      from group_winner_map gwm
      join matches m on m.id = gwm.match_id
  ),
  -- ----- SEMIFINALIST -----
  sf_status as (
    select bool_and(home_team_id is not null and away_team_id is not null) as resolved
      from matches where id in (101, 102)
  ),
  sf_teams as (
    select home_team_id as team from matches where id in (101, 102) and home_team_id is not null
    union
    select away_team_id from matches where id in (101, 102) and away_team_id is not null
  ),
  -- ----- UNDERPERFORMER -----
  -- The bet only resolves once EVERY R32 slot has a team (both home and away
  -- on all 16 R32 matches = 32 teams known = group stage fully decided
  -- including the 8 best 3rd-placed teams). Otherwise we'd incorrectly mark
  -- a Pot 1/2 team as "underperformed" just because its R32 slot hasn't been
  -- populated yet.
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
  rows as (
    -- Champion (one row, possibly with null team if final hasn't finished)
    select 'CHAMPION'::outright_bet_type as bet_type, null::text as bet_subkey,
           (select team from champ) as team_id,
           (select status = 'FINISHED' from final_match) as resolved
    union all
    select 'RUNNER_UP'::outright_bet_type, null,
           (select team from runner_up),
           (select status = 'FINISHED' from final_match)
    union all
    -- Group winners (12 rows). Resolved when the R32 home slot has a team.
    select 'GROUP_WINNER'::outright_bet_type, gw.letter, gw.team, gw.team is not null
      from group_winners gw
    union all
    -- Semifinalists (0..4 rows, one per team that reached the semis). Resolved
    -- only once both 101 and 102 have both teams.
    select 'SEMIFINALIST'::outright_bet_type, null, t.team,
           (select resolved from sf_status)
      from sf_teams t
    union all
    -- Underperformer (0..N rows, one per pot 1/2 team eliminated at group stage).
    -- Resolved once R32 teams are populated.
    select 'UNDERPERFORMER'::outright_bet_type, null, u.team,
           (select ready from ko_started)
      from underperformers u
  )
  select bet_type, bet_subkey, team_id, coalesce(resolved, false) from rows;
$$;

grant execute on function get_outright_results() to anon, authenticated;
