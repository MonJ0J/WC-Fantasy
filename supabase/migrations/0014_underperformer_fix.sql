-- =====================================================================
-- Migration 0014 — fix underperformer "ready" check
--
-- Bug: `ko_started` was true as soon as ANY R32 match had a home_team_id,
-- which incorrectly marked Pot 1/2 teams as "underperformed" before their
-- own group stage had finished. (Canada was being shown as underperformer
-- after Group A/D/E were filled, even though Group B wasn't done yet.)
--
-- Fix: only consider the underperformer evaluation "ready" when EVERY R32
-- slot (home + away on all 16 matches) is populated. That's the true
-- moment the group stage is fully decided.
--
-- Patches both `recalc_scores` (scoring) and `get_outright_results`
-- (UI green/red feedback).
-- =====================================================================

-- --------- get_outright_results ---------
create or replace function get_outright_results()
returns table (
  bet_type    outright_bet_type,
  bet_subkey  text,
  team_id     text,
  resolved    boolean
)
language sql stable security definer set search_path = public as $$
  with
  final_match as (
    select home_team_id, away_team_id, home_score, away_score, winner_team_id, status
      from matches where id = 104
  ),
  champ as (
    select case
      when fm.status = 'FINISHED' and fm.winner_team_id is not null then fm.winner_team_id
      when fm.status = 'FINISHED' and fm.home_score > fm.away_score then fm.home_team_id
      when fm.status = 'FINISHED' and fm.away_score > fm.home_score then fm.away_team_id
      else null
    end as team,
    fm.status = 'FINISHED' as resolved
    from final_match fm
  ),
  runner as (
    select case
      when c.team is null then null
      when c.team = fm.home_team_id then fm.away_team_id
      else fm.home_team_id
    end as team,
    c.resolved
    from final_match fm, champ c
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
  ),
  sf_status as (
    select not exists (
      select 1 from matches
       where id in (101, 102)
         and (home_team_id is null or away_team_id is null)
    ) as resolved
  ),
  sf_teams as (
    select home_team_id as team from matches where id in (101, 102) and home_team_id is not null
    union
    select away_team_id from matches where id in (101, 102) and away_team_id is not null
  ),
  -- Underperformer resolves only when ALL R32 slots are filled
  -- (i.e. the group stage is fully decided, including 3rd-place teams).
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
    select 'CHAMPION'::outright_bet_type as bet_type, null::text as bet_subkey,
      c.team, c.resolved from champ c
    union all
    select 'RUNNER_UP'::outright_bet_type, null, r.team, r.resolved from runner r
    union all
    select 'GROUP_WINNER'::outright_bet_type, gw.letter, gw.team, gw.team is not null
      from group_winners gw
    union all
    select 'SEMIFINALIST'::outright_bet_type, null, t.team,
           (select resolved from sf_status)
      from sf_teams t
    union all
    select 'UNDERPERFORMER'::outright_bet_type, null, u.team,
           (select ready from ko_started)
      from underperformers u
  )
  select bet_type, bet_subkey, team_id, coalesce(resolved, false) from rows;
$$;


-- --------- recalc_scores (same underperformer fix) ---------
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
  -- FIX: only fire underperformer scoring once ALL R32 slots are filled.
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

-- Recompute everyone now so any premature underperformer points are removed.
select recalc_scores(null);
