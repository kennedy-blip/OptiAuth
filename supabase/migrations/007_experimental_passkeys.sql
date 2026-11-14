-- Staged only: independently review and test in a disposable project first.
-- This migration requires the Supabase auth schema. It does not alter legacy data.
create table public.user_passkeys (
  credential_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  public_key text not null,
  label text not null default 'Passkey' check (char_length(label) between 1 and 80),
  counter bigint not null check (counter >= 0),
  transports text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index user_passkeys_user_id_idx on public.user_passkeys(user_id);
alter table public.user_passkeys enable row level security;
revoke all on public.user_passkeys from public, anon, authenticated;
grant select, insert, update, delete on public.user_passkeys to service_role;

create table public.passkey_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  purpose text not null check (purpose in ('registration', 'authentication')),
  challenge text not null,
  expires_at timestamptz not null default (now() + interval '2 minutes')
);
create index passkey_challenges_expiry_idx on public.passkey_challenges(expires_at);
alter table public.passkey_challenges enable row level security;
revoke all on public.passkey_challenges from public, anon, authenticated, service_role;

-- Consumption deletes the row atomically before the signature check. Even an
-- invalid response consumes the challenge, and parallel replays cannot succeed.
create function public.consume_passkey_challenge(p_id uuid, p_user_id uuid, p_session_id uuid, p_purpose text)
returns text language sql security definer set search_path = pg_catalog as $$
  delete from public.passkey_challenges
  where id = p_id and user_id = p_user_id and session_id = p_session_id
    and purpose = p_purpose and expires_at > now()
  returning challenge;
$$;
create function public.create_passkey_challenge(p_user_id uuid, p_session_id uuid, p_purpose text, p_challenge text)
returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare v_id uuid;
begin
  if p_purpose not in ('registration','authentication') or p_challenge !~ '^[A-Za-z0-9_-]{32,128}$' or p_user_id is null or p_session_id is null then
    raise exception 'Invalid challenge';
  end if;
  -- Keep one outstanding challenge per session and purpose.
  perform pg_advisory_xact_lock(46101, hashtext(p_session_id::text));
  delete from public.passkey_challenges where session_id=p_session_id and purpose=p_purpose;
  insert into public.passkey_challenges(user_id,session_id,purpose,challenge) values(p_user_id,p_session_id,p_purpose,p_challenge) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.consume_passkey_challenge(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.create_passkey_challenge(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.consume_passkey_challenge(uuid, uuid, uuid, text) to service_role;
grant execute on function public.create_passkey_challenge(uuid, uuid, text, text) to service_role;
