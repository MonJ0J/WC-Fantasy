-- Fixup for migration 0004 — schema-qualify pgcrypto.
-- Run this in the Supabase SQL editor. Idempotent; safe to re-run.

create or replace function _hash_password(p_password text) returns text
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_password is null or length(p_password) < 6 then
    raise exception 'password must be at least 6 characters';
  end if;
  if length(p_password) > 128 then
    raise exception 'password too long';
  end if;
  return extensions.crypt(p_password, extensions.gen_salt('bf', 10));
end;
$$;

create or replace function sign_in(
  p_username text,
  p_password text
)
returns table (player_id uuid, display_name text)
language plpgsql security definer set search_path = public, extensions as $$
declare
  rec record;
begin
  select id, players.display_name, password_hash
    into rec
    from players
   where lower(username) = lower(trim(p_username))
   limit 1;

  if rec.id is null or rec.password_hash is null then
    raise exception 'invalid username or password';
  end if;

  if extensions.crypt(p_password, rec.password_hash) <> rec.password_hash then
    raise exception 'invalid username or password';
  end if;

  return query select rec.id, rec.display_name;
end;
$$;

-- get_my_dashboard: qualify CTE column names to avoid clash with OUT params.
create or replace function get_my_dashboard(p_player_id uuid)
returns table (
  group_id         uuid,
  group_name       text,
  invite_code      text,
  is_creator       boolean,
  joined_at        timestamptz,
  member_count     int,
  total_points     int,
  my_rank          int
)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with my_groups as (
    select gs.id, gs.name, gs.invite_code, gs.creator_player_id, m.joined_at
    from memberships m
    join groups_sessions gs on gs.id = m.group_id
    where m.player_id = p_player_id
  ),
  ranked as (
    select
      lc.group_id  as g_id,
      lc.player_id as p_id,
      lc.total_points,
      rank() over (
        partition by lc.group_id
        order by lc.total_points desc, lc.exact_scores desc, lc.correct_outcomes desc
      ) as r
    from leaderboard_cache lc
    where lc.group_id in (select mg.id from my_groups mg)
  ),
  counts as (
    select mem.group_id as g_id, count(*)::int as n
    from memberships mem
    where mem.group_id in (select mg.id from my_groups mg)
    group by mem.group_id
  )
  select
    g.id          as group_id,
    g.name        as group_name,
    g.invite_code as invite_code,
    (g.creator_player_id = p_player_id) as is_creator,
    g.joined_at   as joined_at,
    coalesce(c.n, 0)::int           as member_count,
    coalesce(r.total_points, 0)::int as total_points,
    coalesce(r.r, 0)::int            as my_rank
  from my_groups g
  left join ranked r on r.g_id = g.id and r.p_id = p_player_id
  left join counts c on c.g_id = g.id
  order by g.joined_at desc;
end;
$$;
