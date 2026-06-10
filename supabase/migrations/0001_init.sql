-- =====================================================================
-- WC-Fantasy initial schema, RLS, and RPCs
-- Target: Supabase / PostgreSQL 15+
--
-- Design notes:
--   * No Supabase Auth. Identity is just a `players` row + a UUID kept in
--     localStorage. Writes go through SECURITY DEFINER RPCs that verify
--     group membership server-side.
--   * Anon role gets SELECT on the public-facing tables (display names &
--     predictions are part of a fun-pool, not secrets). Predictions for
--     unstarted matches are hidden via a view (`match_predictions_public`).
--   * Group-stage match predictions lock 1 hour before kickoff.
--   * Bracket predictions lock when the first R32 match (id = 73) kicks off.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
create type match_stage as enum
  ('GROUP','R32','R16','QF','SF','THIRD','FINAL');

create type match_status as enum
  ('SCHEDULED','LIVE','FINISHED');

create type prediction_outcome as enum
  ('HOME','DRAW','AWAY');

-- ---------------------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------------------
create table teams (
  id            text primary key,                 -- 3-letter FIFA code
  name          text not null,
  flag_emoji    text not null,
  group_letter  text check (group_letter ~ '^[A-L]$'),
  seed_position int  check (seed_position between 1 and 4),
  fifa_id       int                               -- football-data.org mapping
);

create table matches (
  id               int primary key,               -- FIFA match number 1..104
  stage            match_stage not null,
  group_letter     text check (group_letter ~ '^[A-L]$'),
  home_team_id     text references teams(id),
  away_team_id     text references teams(id),
  home_placeholder text,
  away_placeholder text,
  kickoff_at       timestamptz not null,
  venue            text not null,
  home_score       int,
  away_score       int,
  status           match_status not null default 'SCHEDULED',
  bracket_slot     int                            -- = matches.id for KO rows
);

create index matches_kickoff_idx on matches (kickoff_at);
create index matches_stage_idx   on matches (stage);

create table players (
  id            uuid primary key default gen_random_uuid(),
  display_name  text not null check (length(trim(display_name)) between 1 and 30),
  created_at    timestamptz not null default now()
);

create table groups_sessions (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (length(trim(name)) between 1 and 60),
  invite_code        text not null unique,
  creator_player_id  uuid not null references players(id) on delete restrict,
  created_at         timestamptz not null default now()
);

create table memberships (
  group_id   uuid not null references groups_sessions(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (group_id, player_id)
);
-- Note: uniqueness of display name within a group is enforced by the
-- `join_group` RPC. A pure index expression can't reference another table,
-- so we keep the invariant at the API layer.

create table match_predictions (
  id                    uuid primary key default gen_random_uuid(),
  player_id             uuid not null references players(id) on delete cascade,
  group_id              uuid not null references groups_sessions(id) on delete cascade,
  match_id              int  not null references matches(id),
  predicted_outcome     prediction_outcome not null,
  predicted_home_score  int check (predicted_home_score >= 0 and predicted_home_score <= 20),
  predicted_away_score  int check (predicted_away_score >= 0 and predicted_away_score <= 20),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (player_id, group_id, match_id)
);

create index match_predictions_match_idx on match_predictions (match_id);
create index match_predictions_group_idx on match_predictions (group_id);

create table bracket_predictions (
  id                 uuid primary key default gen_random_uuid(),
  player_id          uuid not null references players(id) on delete cascade,
  group_id           uuid not null references groups_sessions(id) on delete cascade,
  bracket_slot       int  not null check (bracket_slot between 73 and 104),
  predicted_team_id  text not null references teams(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (player_id, group_id, bracket_slot)
);

create index bracket_predictions_group_idx on bracket_predictions (group_id);

create table leaderboard_cache (
  group_id           uuid not null references groups_sessions(id) on delete cascade,
  player_id          uuid not null references players(id) on delete cascade,
  total_points       int  not null default 0,
  correct_outcomes   int  not null default 0,
  exact_scores       int  not null default 0,
  correct_bracket    int  not null default 0,
  updated_at         timestamptz not null default now(),
  primary key (group_id, player_id)
);

-- Tiny key-value table for runtime config (admin key, tournament start ts, etc.)
create table app_settings (
  key   text primary key,
  value text not null
);

insert into app_settings (key, value) values
  ('admin_key', 'change-me-to-a-long-random-string'),
  ('bracket_lock_match_id', '73')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- VIEWS (anon-facing)
-- ---------------------------------------------------------------------

-- Only reveals predictions for matches whose kickoff has already passed.
-- A player's OWN predictions are fetched via the `get_my_predictions` RPC.
create view match_predictions_public as
select
  mp.id,
  mp.player_id,
  mp.group_id,
  mp.match_id,
  mp.predicted_outcome,
  mp.predicted_home_score,
  mp.predicted_away_score
from match_predictions mp
join matches m on m.id = mp.match_id
where m.kickoff_at <= now();

-- Bracket predictions are revealed once the bracket lock has triggered
-- (i.e. first R32 has kicked off).
create view bracket_predictions_public as
select
  bp.id,
  bp.player_id,
  bp.group_id,
  bp.bracket_slot,
  bp.predicted_team_id
from bracket_predictions bp
where exists (
  select 1 from matches m
  where m.id = (select value::int from app_settings where key = 'bracket_lock_match_id')
    and m.kickoff_at <= now()
);

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table teams                 enable row level security;
alter table matches               enable row level security;
alter table players               enable row level security;
alter table groups_sessions       enable row level security;
alter table memberships           enable row level security;
alter table match_predictions     enable row level security;
alter table bracket_predictions   enable row level security;
alter table leaderboard_cache     enable row level security;
alter table app_settings          enable row level security;

-- Public read-only data
create policy "anon read teams"   on teams           for select using (true);
create policy "anon read matches" on matches         for select using (true);
create policy "anon read groups"  on groups_sessions for select using (true);
create policy "anon read members" on memberships     for select using (true);
create policy "anon read players" on players         for select using (true);
create policy "anon read leaderboard" on leaderboard_cache for select using (true);

-- Predictions: NO direct SELECT (use the views above).
-- Mutations: NONE; everything routes through SECURITY DEFINER RPCs below.

-- app_settings is locked down entirely except for the admin_key read inside RPCs.

-- ---------------------------------------------------------------------
-- HELPERS
-- ---------------------------------------------------------------------

-- Generates a short, friendly invite code like "WC-NEIGH7".
create or replace function _gen_invite_code() returns text language plpgsql as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  attempts int := 0;
begin
  loop
    code := 'WC-';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from groups_sessions where invite_code = code);
    attempts := attempts + 1;
    if attempts > 10 then
      raise exception 'Unable to generate unique invite code';
    end if;
  end loop;
  return code;
end;
$$;

-- Asserts the player belongs to the group.
create or replace function _assert_membership(p_player_id uuid, p_group_id uuid)
returns void language plpgsql as $$
begin
  if not exists (
    select 1 from memberships
    where group_id = p_group_id and player_id = p_player_id
  ) then
    raise exception 'not a member of this group' using errcode = '42501';
  end if;
end;
$$;

-- Returns true if the bracket has locked (first R32 has kicked off).
create or replace function _bracket_locked() returns boolean
language sql stable as $$
  select exists (
    select 1 from matches
    where id = (select value::int from app_settings where key = 'bracket_lock_match_id')
      and kickoff_at <= now()
  );
$$;

-- ---------------------------------------------------------------------
-- RPCs — identity
-- ---------------------------------------------------------------------

-- Create a brand-new player (display name). Returns the player_id, which
-- the client persists to localStorage as the identity.
create or replace function create_player(p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  trimmed text := trim(p_display_name);
begin
  if length(trimmed) = 0 then
    raise exception 'display name is required';
  end if;
  insert into players (display_name) values (trimmed) returning id into new_id;
  return new_id;
end;
$$;

-- Updates a player's display name. Used by the Me page.
create or replace function rename_player(p_player_id uuid, p_new_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  trimmed text := trim(p_new_name);
begin
  if length(trimmed) = 0 then
    raise exception 'display name is required';
  end if;
  update players set display_name = trimmed where id = p_player_id;
end;
$$;

-- ---------------------------------------------------------------------
-- RPCs — groups
-- ---------------------------------------------------------------------

-- Creates a new group and adds the creator as a member.
create or replace function create_group(p_player_id uuid, p_group_name text)
returns table (id uuid, invite_code text)
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  new_code text := _gen_invite_code();
begin
  if not exists (select 1 from players where players.id = p_player_id) then
    raise exception 'unknown player';
  end if;

  insert into groups_sessions (name, invite_code, creator_player_id)
  values (trim(p_group_name), new_code, p_player_id)
  returning groups_sessions.id into new_id;

  insert into memberships (group_id, player_id) values (new_id, p_player_id);

  -- Seed the leaderboard row so the creator appears immediately with 0 pts.
  insert into leaderboard_cache (group_id, player_id) values (new_id, p_player_id);

  return query select new_id, new_code;
end;
$$;

-- Joins an existing group via invite code. Idempotent.
create or replace function join_group(p_player_id uuid, p_invite_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  g_id uuid;
  p_name text;
  conflict_count int;
begin
  select gs.id into g_id
  from groups_sessions gs
  where gs.invite_code = upper(trim(p_invite_code));

  if g_id is null then
    raise exception 'invite code not found';
  end if;

  -- Prevent duplicate display name inside the same group (case-insensitive).
  select display_name into p_name from players where id = p_player_id;
  select count(*) into conflict_count
  from memberships m
  join players p2 on p2.id = m.player_id
  where m.group_id = g_id
    and m.player_id <> p_player_id
    and lower(p2.display_name) = lower(p_name);
  if conflict_count > 0 then
    raise exception 'someone in this group already uses the name "%"', p_name;
  end if;

  insert into memberships (group_id, player_id)
  values (g_id, p_player_id)
  on conflict do nothing;

  insert into leaderboard_cache (group_id, player_id)
  values (g_id, p_player_id)
  on conflict do nothing;

  return g_id;
end;
$$;

-- ---------------------------------------------------------------------
-- RPCs — predictions
-- ---------------------------------------------------------------------

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
begin
  perform _assert_membership(p_player_id, p_group_id);

  select kickoff_at, stage into m_kickoff, m_stage from matches where id = p_match_id;
  if m_kickoff is null then
    raise exception 'unknown match';
  end if;

  -- Lock: 1 hour before kickoff.
  if m_kickoff - interval '1 hour' <= now() then
    raise exception 'predictions for this match have locked';
  end if;

  -- We only support direct match predictions for group-stage matches.
  -- Knockout outcomes are predicted via the bracket.
  if m_stage <> 'GROUP' then
    raise exception 'knockout matches are predicted via the bracket';
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

create or replace function submit_bracket_prediction(
  p_player_id    uuid,
  p_group_id     uuid,
  p_bracket_slot int,
  p_team_id      text
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _assert_membership(p_player_id, p_group_id);

  if _bracket_locked() then
    raise exception 'the bracket has locked';
  end if;

  if not exists (select 1 from matches where bracket_slot = p_bracket_slot and stage <> 'GROUP') then
    raise exception 'invalid bracket slot';
  end if;

  if not exists (select 1 from teams where id = p_team_id) then
    raise exception 'unknown team';
  end if;

  insert into bracket_predictions (player_id, group_id, bracket_slot, predicted_team_id)
  values (p_player_id, p_group_id, p_bracket_slot, p_team_id)
  on conflict (player_id, group_id, bracket_slot) do update set
    predicted_team_id = excluded.predicted_team_id,
    updated_at        = now();
end;
$$;

-- Returns a player's own predictions for a given group (any kickoff state).
create or replace function get_my_predictions(p_player_id uuid, p_group_id uuid)
returns table (
  match_id              int,
  predicted_outcome     prediction_outcome,
  predicted_home_score  int,
  predicted_away_score  int
)
language plpgsql security definer set search_path = public as $$
begin
  perform _assert_membership(p_player_id, p_group_id);
  return query
    select mp.match_id, mp.predicted_outcome, mp.predicted_home_score, mp.predicted_away_score
    from match_predictions mp
    where mp.player_id = p_player_id and mp.group_id = p_group_id;
end;
$$;

create or replace function get_my_bracket(p_player_id uuid, p_group_id uuid)
returns table (bracket_slot int, predicted_team_id text)
language plpgsql security definer set search_path = public as $$
begin
  perform _assert_membership(p_player_id, p_group_id);
  return query
    select bp.bracket_slot, bp.predicted_team_id
    from bracket_predictions bp
    where bp.player_id = p_player_id and bp.group_id = p_group_id;
end;
$$;

-- ---------------------------------------------------------------------
-- RPCs — admin / results entry
-- ---------------------------------------------------------------------

create or replace function set_match_result(
  p_admin_key  text,
  p_match_id   int,
  p_home_score int,
  p_away_score int,
  p_status     match_status default 'FINISHED'
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  stored_key text;
begin
  select value into stored_key from app_settings where key = 'admin_key';
  if stored_key is null or stored_key <> p_admin_key then
    raise exception 'unauthorized';
  end if;

  update matches
     set home_score = p_home_score,
         away_score = p_away_score,
         status     = p_status
   where id = p_match_id;

  if p_status = 'FINISHED' then
    perform recalc_scores(null);
  end if;
end;
$$;

-- Lets the admin populate the team ids on a KO match once the prior round
-- has resolved (used in Phase 2 when the bracket comes alive). Same auth
-- shape as set_match_result.
create or replace function set_match_teams(
  p_admin_key  text,
  p_match_id   int,
  p_home_team  text,
  p_away_team  text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  stored_key text;
begin
  select value into stored_key from app_settings where key = 'admin_key';
  if stored_key is null or stored_key <> p_admin_key then
    raise exception 'unauthorized';
  end if;

  update matches
     set home_team_id = p_home_team,
         away_team_id = p_away_team
   where id = p_match_id;
end;
$$;

-- ---------------------------------------------------------------------
-- SCORING
-- ---------------------------------------------------------------------
--
-- Group stage: +3 for correct outcome, +2 extra for exact score (max 5).
-- Knockout:    +5 / +10 / +15 / +20 / +25 per correctly-picked advancing
--              team in R32 / R16 / QF / SF / Final.
--   (THIRD-place playoff is informational; not scored.)
--
-- Tiebreaker: exact_scores > correct_outcomes > earliest membership.
-- The leaderboard view orders by those columns.

create or replace function recalc_scores(p_group_id uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  -- 1. Wipe target rows.
  if p_group_id is null then
    delete from leaderboard_cache;
  else
    delete from leaderboard_cache where group_id = p_group_id;
  end if;

  -- 2. Group-stage points.
  with finished_groups as (
    select id, home_score, away_score,
           case
             when home_score >  away_score then 'HOME'::prediction_outcome
             when home_score <  away_score then 'AWAY'::prediction_outcome
             else 'DRAW'::prediction_outcome
           end as actual_outcome
    from matches
    where stage = 'GROUP' and status = 'FINISHED'
      and home_score is not null and away_score is not null
  ),
  scored as (
    select
      mp.group_id,
      mp.player_id,
      sum(case when mp.predicted_outcome = fg.actual_outcome then 3 else 0 end)
        + sum(case when mp.predicted_outcome = fg.actual_outcome
                    and mp.predicted_home_score = fg.home_score
                    and mp.predicted_away_score = fg.away_score
                  then 2 else 0 end) as group_points,
      sum(case when mp.predicted_outcome = fg.actual_outcome then 1 else 0 end) as correct_outcomes,
      sum(case when mp.predicted_outcome = fg.actual_outcome
                and mp.predicted_home_score = fg.home_score
                and mp.predicted_away_score = fg.away_score
              then 1 else 0 end) as exact_scores
    from match_predictions mp
    join finished_groups fg on fg.id = mp.match_id
    where p_group_id is null or mp.group_id = p_group_id
    group by mp.group_id, mp.player_id
  )
  insert into leaderboard_cache (group_id, player_id, total_points, correct_outcomes, exact_scores)
  select group_id, player_id, group_points, correct_outcomes, exact_scores
  from scored
  on conflict (group_id, player_id) do update set
    total_points     = excluded.total_points,
    correct_outcomes = excluded.correct_outcomes,
    exact_scores     = excluded.exact_scores,
    updated_at       = now();

  -- 3. Knockout (bracket) points.
  with ko_results as (
    select
      m.bracket_slot,
      m.stage,
      case
        when m.home_score >  m.away_score then m.home_team_id
        when m.home_score <  m.away_score then m.away_team_id
        else null  -- draw in KO is impossible at full time + ET + PKs; admin enters the winner manually
      end as winner_id
    from matches m
    where m.stage in ('R32','R16','QF','SF','FINAL')
      and m.status = 'FINISHED'
      and m.home_score is not null and m.away_score is not null
  ),
  ko_scored as (
    select
      bp.group_id,
      bp.player_id,
      sum(case when bp.predicted_team_id = kr.winner_id then
        case kr.stage
          when 'R32'   then 5
          when 'R16'   then 10
          when 'QF'    then 15
          when 'SF'    then 20
          when 'FINAL' then 25
        end
      else 0 end) as ko_points,
      sum(case when bp.predicted_team_id = kr.winner_id then 1 else 0 end) as correct_bracket
    from bracket_predictions bp
    join ko_results kr on kr.bracket_slot = bp.bracket_slot
    where p_group_id is null or bp.group_id = p_group_id
    group by bp.group_id, bp.player_id
  )
  insert into leaderboard_cache (group_id, player_id, total_points, correct_bracket)
  select group_id, player_id, ko_points, correct_bracket
  from ko_scored
  on conflict (group_id, player_id) do update set
    total_points    = leaderboard_cache.total_points + excluded.total_points,
    correct_bracket = excluded.correct_bracket,
    updated_at      = now();

  -- 4. Ensure every member has a row, even with 0 points.
  insert into leaderboard_cache (group_id, player_id, total_points)
  select m.group_id, m.player_id, 0
  from memberships m
  where p_group_id is null or m.group_id = p_group_id
  on conflict (group_id, player_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------
-- GRANTS
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
revoke select on app_settings from anon, authenticated;
grant select on match_predictions_public, bracket_predictions_public to anon, authenticated;

grant execute on function
  create_player(text),
  rename_player(uuid, text),
  create_group(uuid, text),
  join_group(uuid, text),
  submit_match_prediction(uuid, uuid, int, prediction_outcome, int, int),
  submit_bracket_prediction(uuid, uuid, int, text),
  get_my_predictions(uuid, uuid),
  get_my_bracket(uuid, uuid),
  set_match_result(text, int, int, int, match_status),
  set_match_teams(text, int, text, text),
  recalc_scores(uuid)
to anon, authenticated;
