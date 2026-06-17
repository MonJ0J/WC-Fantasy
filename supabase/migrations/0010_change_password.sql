-- Migration 0010 — change_password RPC
-- Lets a signed-in user rotate their password by proving they know the old one.

create or replace function change_password(
  p_player_id    uuid,
  p_old_password text,
  p_new_password text
)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  rec record;
begin
  select id, password_hash into rec
    from players
   where id = p_player_id;

  if rec.id is null then
    raise exception 'unknown player';
  end if;
  if rec.password_hash is null then
    raise exception 'this account has no password yet';
  end if;
  if extensions.crypt(p_old_password, rec.password_hash) <> rec.password_hash then
    raise exception 'current password is incorrect';
  end if;

  update players
     set password_hash = _hash_password(p_new_password)
   where id = p_player_id;
end;
$$;

grant execute on function change_password(uuid, text, text) to anon, authenticated;
