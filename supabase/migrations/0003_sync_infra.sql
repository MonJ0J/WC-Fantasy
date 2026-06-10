-- =====================================================================
-- Migration 0003 — sync infrastructure (Phase 3)
--
-- Adds the plumbing for the football-data.org Edge Function:
--   1. matches.external_id (their match id) for O(1) lookups after the
--      first sync.
--   2. sync_log table for observability (last run, status, counts).
--   3. RPCs: upsert_match_from_sync, get_match_id_by_external,
--      set_match_external_id, log_sync_run.
--   4. pg_cron schedule (commented; the user enables it once the Edge
--      Function is deployed and they have a service-role key in Vault).
-- =====================================================================

-- ---------- external id on matches ----------
alter table matches
  add column if not exists external_id int;

create unique index if not exists matches_external_id_unique
  on matches (external_id)
  where external_id is not null;

-- ---------- sync log ----------
create table if not exists sync_log (
  id              uuid primary key default gen_random_uuid(),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  source          text not null default 'football-data.org',
  matches_seen    int not null default 0,
  matches_updated int not null default 0,
  teams_resolved  int not null default 0,
  finalized_count int not null default 0,
  status          text not null default 'RUNNING' check (status in ('RUNNING','OK','ERROR')),
  error_message   text
);

alter table sync_log enable row level security;
-- Public read so the admin page can show "last synced X minutes ago".
create policy "anon read sync_log" on sync_log for select using (true);

-- ---------- helper RPCs (security-definer, admin-key-gated) ----------

-- Verifies the caller knows the admin key. Returns true or raises.
create or replace function _check_admin_key(p_key text) returns void
language plpgsql security definer set search_path = public as $$
declare
  stored text;
begin
  select value into stored from app_settings where key = 'admin_key';
  if stored is null or stored <> p_key then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
end;
$$;

-- Returns the FIFA match id (1..104) given a football-data.org external id,
-- OR by matching on stage + utcDate (±2h) + tla pair. Falls back to NULL.
create or replace function resolve_match_id(
  p_external_id  int,
  p_stage        match_stage,
  p_utc_date     timestamptz,
  p_home_tla     text,
  p_away_tla     text
)
returns int
language plpgsql security definer set search_path = public as $$
declare
  found_id int;
begin
  -- Direct lookup by external_id (after first sync).
  if p_external_id is not null then
    select id into found_id from matches where external_id = p_external_id;
    if found_id is not null then return found_id; end if;
  end if;

  -- Group stage: match by (stage, home_team_id, away_team_id).
  if p_stage = 'GROUP' and p_home_tla is not null and p_away_tla is not null then
    select id into found_id
    from matches
    where stage = 'GROUP'
      and home_team_id = p_home_tla
      and away_team_id = p_away_tla;
    if found_id is not null then return found_id; end if;
  end if;

  -- KO: match by (stage, kickoff_at within ±2 hours).
  if p_utc_date is not null then
    select id into found_id
    from matches
    where stage = p_stage
      and abs(extract(epoch from (kickoff_at - p_utc_date))) < 2 * 3600
    order by abs(extract(epoch from (kickoff_at - p_utc_date)))
    limit 1;
  end if;

  return found_id;
end;
$$;

-- Upserts a match row from a sync payload. Returns 1 if a row was actually
-- changed (i.e. score, status, teams, or external_id moved); 0 otherwise.
-- Also tracks whether the row transitioned to FINISHED.
create or replace function upsert_match_from_sync(
  p_admin_key      text,
  p_match_id       int,
  p_external_id    int,
  p_home_team_id   text,
  p_away_team_id   text,
  p_home_score     int,
  p_away_score     int,
  p_winner_team_id text,
  p_status         match_status,
  p_kickoff_at     timestamptz default null
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
    external_id     = coalesce(p_external_id, external_id),
    home_team_id    = coalesce(p_home_team_id, home_team_id),
    away_team_id    = coalesce(p_away_team_id, away_team_id),
    home_score      = coalesce(p_home_score, home_score),
    away_score      = coalesce(p_away_score, away_score),
    winner_team_id  = coalesce(p_winner_team_id, winner_team_id),
    status          = coalesce(p_status, status),
    kickoff_at      = coalesce(p_kickoff_at, kickoff_at)
  where id = p_match_id
  returning
    (
      coalesce(external_id, -1)    <> coalesce(cur.external_id, -1) or
      coalesce(home_team_id, '')   <> coalesce(cur.home_team_id, '') or
      coalesce(away_team_id, '')   <> coalesce(cur.away_team_id, '') or
      coalesce(home_score, -1)     <> coalesce(cur.home_score, -1) or
      coalesce(away_score, -1)     <> coalesce(cur.away_score, -1) or
      coalesce(winner_team_id, '') <> coalesce(cur.winner_team_id, '') or
      coalesce(status::text, '')   <> coalesce(cur.status::text, '')
    ),
    (status = 'FINISHED' and (cur.status is distinct from 'FINISHED'))
  into did_change, did_finalize;

  return query select did_change, did_finalize;
end;
$$;

create or replace function log_sync_run(
  p_admin_key       text,
  p_log_id          uuid,
  p_matches_seen    int,
  p_matches_updated int,
  p_teams_resolved  int,
  p_finalized_count int,
  p_status          text,
  p_error_message   text default null
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _check_admin_key(p_admin_key);
  update sync_log set
    finished_at     = now(),
    matches_seen    = p_matches_seen,
    matches_updated = p_matches_updated,
    teams_resolved  = p_teams_resolved,
    finalized_count = p_finalized_count,
    status          = p_status,
    error_message   = p_error_message
  where id = p_log_id;
end;
$$;

create or replace function start_sync_run(p_admin_key text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  perform _check_admin_key(p_admin_key);
  insert into sync_log default values returning id into new_id;
  return new_id;
end;
$$;

-- ---------- GRANTS ----------
grant execute on function
  resolve_match_id(int, match_stage, timestamptz, text, text),
  upsert_match_from_sync(text, int, int, text, text, int, int, text, match_status, timestamptz),
  start_sync_run(text),
  log_sync_run(text, uuid, int, int, int, int, text, text)
to anon, authenticated;

-- ---------- pg_cron schedule (run once you've deployed the Edge Function) ----------
--
-- Replace YOUR-PROJECT-REF and uncomment to enable a 5-minute sync.
-- The Edge Function URL pattern is:
--   https://<ref>.supabase.co/functions/v1/sync-wc-matches
-- The service-role key authenticates pg_net to your own Edge Function.
--
-- 1) enable required extensions (Supabase: Database → Extensions):
--    create extension if not exists pg_cron;
--    create extension if not exists pg_net;
--
-- 2) schedule the job (run in SQL editor):
--    select cron.schedule(
--      'sync-wc-matches-every-5min',
--      '*/5 * * * *',
--      $$
--      select net.http_post(
--        url      := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/sync-wc-matches',
--        headers  := jsonb_build_object(
--          'Content-Type', 'application/json',
--          'Authorization', 'Bearer YOUR-SERVICE-ROLE-KEY'
--        ),
--        body     := jsonb_build_object('trigger', 'cron')
--      );
--      $$
--    );
--
-- 3) to remove later:
--    select cron.unschedule('sync-wc-matches-every-5min');
