-- =====================================================================
-- Migration 0004 — username + password authentication (no email)
--
-- Adds a globally-unique username + bcrypt password hash to `players`.
-- - sign_up(username, password, display_name): create a new player.
-- - sign_in(username, password): verify and return player_id + display_name.
-- - attach_credentials(player_id, username, password): for legacy anonymous
--   rows created via create_player() to set their username + password later.
-- All passwords are bcrypt-hashed via pgcrypto's crypt() + gen_salt('bf').
-- =====================================================================

-- ---------- new columns ----------
alter table players
  add column if not exists username      text,
  add column if not exists password_hash text;

-- Case-insensitive global uniqueness on username (when set).
create unique index if not exists players_username_unique_ci
  on players (lower(username))
  where username is not null;

-- A username may only be set together with a password_hash.
alter table players
  drop constraint if exists players_username_requires_password;
alter table players
  add  constraint players_username_requires_password
  check ((username is null) = (password_hash is null));

-- Username format constraint: 3-20 chars, letters / numbers / underscores.
alter table players
  drop constraint if exists players_username_format;
alter table players
  add  constraint players_username_format
  check (username is null or username ~ '^[A-Za-z0-9_]{3,20}$');

-- ---------- helpers ----------

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

-- ---------- RPCs ----------

create or replace function sign_up(
  p_username     text,
  p_password     text,
  p_display_name text
)
returns table (player_id uuid, display_name text)
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  uname  text := trim(p_username);
  dname  text := trim(coalesce(p_display_name, p_username));
begin
  if uname !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'username must be 3-20 letters, numbers or underscores';
  end if;
  if length(dname) = 0 or length(dname) > 30 then
    raise exception 'display name must be 1-30 characters';
  end if;

  -- Pre-check for a friendly error message (race condition still caught by unique index).
  if exists (select 1 from players where lower(username) = lower(uname)) then
    raise exception 'that username is already taken';
  end if;

  insert into players (username, password_hash, display_name)
  values (uname, _hash_password(p_password), dname)
  returning players.id into new_id;

  return query select new_id, dname;
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

  -- Constant-ish error message regardless of whether the username exists.
  if rec.id is null or rec.password_hash is null then
    raise exception 'invalid username or password';
  end if;

  if extensions.crypt(p_password, rec.password_hash) <> rec.password_hash then
    raise exception 'invalid username or password';
  end if;

  return query select rec.id, rec.display_name;
end;
$$;

-- Lets an existing anonymous player (created via create_player) attach a
-- username + password so they can sign in on other devices.
-- Caller proves they're "logged in" by passing the existing player_id.
create or replace function attach_credentials(
  p_player_id uuid,
  p_username  text,
  p_password  text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uname text := trim(p_username);
begin
  if not exists (select 1 from players where id = p_player_id) then
    raise exception 'unknown player';
  end if;

  if uname !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'username must be 3-20 letters, numbers or underscores';
  end if;

  if exists (
    select 1 from players where lower(username) = lower(uname) and id <> p_player_id
  ) then
    raise exception 'that username is already taken';
  end if;

  update players
     set username      = uname,
         password_hash = _hash_password(p_password)
   where id = p_player_id;
end;
$$;

-- Returns a dashboard view: one row per group the player belongs to, with
-- their current rank + total points. Used by /me.
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

-- ---------- GRANTS ----------
grant execute on function
  sign_up(text, text, text),
  sign_in(text, text),
  attach_credentials(uuid, text, text),
  get_my_dashboard(uuid)
to anon, authenticated;
