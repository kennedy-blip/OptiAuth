-- Run as a privileged database owner in the Supabase SQL editor.
create extension if not exists vector;

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text unique not null,
  phone text,
  role_or_org text,
  eye_embedding vector(64) not null,
  created_at timestamptz not null default now()
);
create index if not exists user_profiles_eye_embedding_hnsw
  on public.user_profiles using hnsw (eye_embedding vector_cosine_ops);
alter table public.user_profiles enable row level security;
revoke all on table public.user_profiles from anon, authenticated;

-- Only the server's service-role client may invoke this function. Never expose
-- biometric vectors or permit anonymous callers to enumerate profile matches.
create or replace function public.match_eye_user(query_embedding vector(64), match_threshold float)
returns table (id uuid, full_name text, email text, phone text, role_or_org text, created_at timestamptz, confidence float)
language sql stable security definer set search_path = public, extensions
as $$
  select p.id, p.full_name, p.email, p.phone, p.role_or_org, p.created_at,
         (1 - (p.eye_embedding <=> query_embedding))::float as confidence
  from public.user_profiles p
  where (p.eye_embedding <=> query_embedding) < match_threshold
  order by p.eye_embedding <=> query_embedding
  limit 1;
$$;
revoke all on function public.match_eye_user(vector, float) from public, anon, authenticated;
grant execute on function public.match_eye_user(vector, float) to service_role;
grant all on table public.user_profiles to service_role;

-- Serialize all enrollment attempts using this function, so two concurrent
-- requests through the application cannot both pass the duplicate check.
-- Direct service-role inserts bypass this safeguard and must not be used.
create or replace function public.enroll_eye_user(
  profile_full_name text, profile_email text, profile_phone text,
  profile_role_or_org text, query_embedding vector(64), match_threshold float
) returns text
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if match_threshold <= 0 or match_threshold >= 1 then
    raise exception 'Invalid threshold';
  end if;
  perform pg_advisory_xact_lock(831694125);
  -- Disable approximate index scans for the duplicate check. An HNSW search
  -- may otherwise miss an existing near neighbor.
  perform set_config('enable_indexscan', 'off', true);
  perform set_config('enable_bitmapscan', 'off', true);
  if exists (select 1 from public.user_profiles p where p.eye_embedding <=> query_embedding < match_threshold) then
    return 'duplicate_eye';
  end if;
  begin
    insert into public.user_profiles (full_name, email, phone, role_or_org, eye_embedding)
    values (profile_full_name, profile_email, profile_phone, profile_role_or_org, query_embedding);
  exception when unique_violation then
    return 'duplicate_email';
  end;
  return 'created';
end;
$$;
revoke all on function public.enroll_eye_user(text, text, text, text, vector, float) from public, anon, authenticated;
grant execute on function public.enroll_eye_user(text, text, text, text, vector, float) to service_role;
