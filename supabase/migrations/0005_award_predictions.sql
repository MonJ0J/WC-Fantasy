-- =====================================================================
-- Migration 0005 — award predictions (Top Scorer, Top Player, Top Nation)
--
-- Adds three "outright-style" award picks that lock together with the other
-- outrights at the first kickoff:
--   * TOP_SCORER  — the tournament's leading goal scorer
--   * TOP_PLAYER  — the best player of the tournament (Golden Ball)
--   * TOP_NATION  — a country (references `teams`)
--
-- Player awards are free-text names: the UI offers a short list of likely
-- candidates (`tournament_players`) as suggestions, but the user may type any
-- name. Nation award references the existing `teams` table.
--
-- NOTE: these awards are NOT scored yet. We only store the picks. Scoring
-- (admin winner entry + point values) will be wired up in a later migration.
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
create type award_type as enum ('TOP_SCORER','TOP_PLAYER','TOP_NATION');

create table award_predictions (
  id                    uuid primary key default gen_random_uuid(),
  player_id             uuid not null references players(id) on delete cascade,
  group_id              uuid not null references groups_sessions(id) on delete cascade,
  award_type            award_type not null,
  -- Player awards store a free-text name; nation award stores a team id.
  predicted_player_name text,
  predicted_team_id     text references teams(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (player_id, group_id, award_type),
  constraint award_target_shape check (
    case award_type
      when 'TOP_NATION' then predicted_team_id is not null and predicted_player_name is null
      else predicted_player_name is not null and predicted_team_id is null
    end
  )
);

create index award_predictions_group_idx on award_predictions (group_id);

alter table award_predictions enable row level security;

-- Reveal all group picks publicly once the lock has passed (first kickoff).
create view award_predictions_public as
select ap.id, ap.player_id, ap.group_id, ap.award_type,
       ap.predicted_player_name, ap.predicted_team_id
from award_predictions ap
where exists (select 1 from matches where id = 1 and kickoff_at <= now());

grant select on award_predictions_public to anon, authenticated;

-- ---------- RPCs ----------
-- Awards lock at the first kickoff, same as the other outrights.
create or replace function submit_award_prediction(
  p_player_id    uuid,
  p_group_id     uuid,
  p_award_type   award_type,
  p_player_name  text default null,
  p_team_id      text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_name text := nullif(btrim(p_player_name), '');
begin
  perform _assert_membership(p_player_id, p_group_id);

  if _outrights_locked() then
    raise exception 'award predictions have locked for this tournament';
  end if;

  if p_award_type = 'TOP_NATION' then
    if p_team_id is null then
      raise exception 'TOP_NATION requires a team';
    end if;
    if not exists (select 1 from teams where id = p_team_id) then
      raise exception 'unknown team %', p_team_id;
    end if;
    insert into award_predictions (player_id, group_id, award_type, predicted_team_id)
    values (p_player_id, p_group_id, p_award_type, p_team_id)
    on conflict (player_id, group_id, award_type) do update set
      predicted_team_id     = excluded.predicted_team_id,
      predicted_player_name = null,
      updated_at            = now();
  else
    if v_name is null then
      raise exception '% requires a player name', p_award_type;
    end if;
    insert into award_predictions (player_id, group_id, award_type, predicted_player_name)
    values (p_player_id, p_group_id, p_award_type, v_name)
    on conflict (player_id, group_id, award_type) do update set
      predicted_player_name = excluded.predicted_player_name,
      predicted_team_id     = null,
      updated_at            = now();
  end if;
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
  if _outrights_locked() then
    raise exception 'award predictions have locked for this tournament';
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
  predicted_player_name text,
  predicted_team_id     text
)
language plpgsql security definer set search_path = public as $$
begin
  perform _assert_membership(p_player_id, p_group_id);
  return query
    select ap.award_type, ap.predicted_player_name, ap.predicted_team_id
    from award_predictions ap
    where ap.player_id = p_player_id and ap.group_id = p_group_id;
end;
$$;

-- ---------- GRANTS ----------
grant execute on function
  submit_award_prediction(uuid, uuid, award_type, text, text),
  delete_award_prediction(uuid, uuid, award_type),
  get_my_awards(uuid, uuid)
to anon, authenticated;
