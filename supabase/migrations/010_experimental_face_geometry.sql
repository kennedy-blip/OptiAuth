-- Experimental only. Apply 006 first in a disposable test project.
-- Face and legacy eye templates use distinct tables and must never be compared.
-- A browser-supplied face vector is not an authentication factor.
create table public.face_profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  phone text,
  role_or_org text,
  face_embedding extensions.vector(64) not null,
  created_at timestamptz not null default now()
);
alter table public.face_profiles enable row level security;
revoke all on public.face_profiles from public, anon, authenticated;
create index face_profiles_vector_idx on public.face_profiles using hnsw (face_embedding extensions.vector_cosine_ops);

create function public.match_face_user(query_embedding extensions.vector(64))
returns table (confidence double precision) language sql stable security definer set search_path=pg_catalog, extensions as $$
  select (1 - (p.face_embedding operator(extensions.<=>) query_embedding))::double precision
  from public.face_profiles p
  where (p.face_embedding operator(extensions.<=>) query_embedding) < 0.12
  order by p.face_embedding operator(extensions.<=>) query_embedding limit 1;
$$;
revoke all on function public.match_face_user(extensions.vector) from public, anon, authenticated;
grant execute on function public.match_face_user(extensions.vector) to service_role;

create function public.enroll_face_user(profile_full_name text, profile_email text, profile_phone text, profile_role_or_org text, query_embedding extensions.vector(64))
returns text language plpgsql security definer set search_path=pg_catalog, extensions as $$
begin
  if query_embedding is null or extensions.vector_dims(query_embedding) <> 64 or abs(extensions.vector_norm(query_embedding) - 1.0) > 0.01 then raise exception 'Invalid vector'; end if;
  perform pg_advisory_xact_lock(831694126);
  perform set_config('enable_indexscan','off',true);
  perform set_config('enable_bitmapscan','off',true);
  if exists (select 1 from public.face_profiles p where p.face_embedding operator(extensions.<=>) query_embedding < 0.12) then return 'duplicate_face'; end if;
  begin
    insert into public.face_profiles(full_name,email,phone,role_or_org,face_embedding) values(profile_full_name,profile_email,profile_phone,profile_role_or_org,query_embedding);
  exception when unique_violation then return 'duplicate_email'; end;
  return 'created';
end $$;
revoke all on function public.enroll_face_user(text,text,text,text,extensions.vector) from public, anon, authenticated;
grant execute on function public.enroll_face_user(text,text,text,text,extensions.vector) to service_role;

create table public.user_face_biometrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  face_embedding extensions.vector(64) not null,
  device_label text not null default 'Default device' check (char_length(device_label) between 1 and 100),
  is_active boolean not null default true,
  enrolled_at timestamptz not null default now(),
  last_verified_at timestamptz
);
create index on public.user_face_biometrics(user_id) where is_active;
alter table public.user_face_biometrics enable row level security;
revoke all on public.user_face_biometrics from public, anon, authenticated;

-- Reuse the audit/rate-limit table from 006, but never the eye template table.
create function public.verify_auxiliary_face_signature(
  p_user_id uuid, p_query_vector extensions.vector(64), p_ip_hash text, p_ua_hash text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, extensions
as $$
declare
  n_ip bigint; n_user bigint; selected_id uuid; distance double precision;
  threshold constant double precision := 0.12;
begin
  if p_user_id is null or p_query_vector is null or p_ip_hash is null or p_ua_hash is null
     or p_ip_hash !~ '^[0-9a-f]{64}$' or p_ua_hash !~ '^[0-9a-f]{64}$'
     or extensions.vector_dims(p_query_vector) <> 64
     or abs(extensions.vector_norm(p_query_vector) - 1.0) > 0.01 then
    raise exception 'Invalid request';
  end if;
  -- Distinct lock namespaces and fixed order avoid both pair-only locking and
  -- deadlocks. All code paths writing rate-limit events must use these locks.
  perform pg_advisory_xact_lock(45101, hashtext(p_ip_hash));
  perform pg_advisory_xact_lock(45102, hashtext(p_user_id::text));
  select count(*) filter (where ip_hash=p_ip_hash), count(*) filter (where user_id=p_user_id)
    into n_ip, n_user from public.biometric_audit_logs
    where event_type in ('VERIFY_FAIL_THRESHOLD', 'NO_TEMPLATE') and created_at > now() - interval '15 minutes';
  if n_ip >= 5 or n_user >= 5 then
    insert into public.biometric_audit_logs(user_id,event_type,ip_hash,user_agent_hash) values (p_user_id,'RATE_LIMITED',p_ip_hash,p_ua_hash);
    return jsonb_build_object('status','rate_limited');
  end if;
  select b.id, (b.face_embedding operator(extensions.<=>) p_query_vector) into selected_id, distance
    from public.user_face_biometrics b where b.user_id=p_user_id and b.is_active
    order by b.face_embedding operator(extensions.<=>) p_query_vector limit 1;
  if selected_id is null or distance is null or distance = 'NaN'::float8 then
    insert into public.biometric_audit_logs(user_id,event_type,ip_hash,user_agent_hash) values (p_user_id,'NO_TEMPLATE',p_ip_hash,p_ua_hash);
    return jsonb_build_object('status','no_match');
  end if;
  if distance < threshold then
    insert into public.biometric_audit_logs(user_id,event_type,cosine_distance,ip_hash,user_agent_hash) values (p_user_id,'VERIFY_SUCCESS',distance,p_ip_hash,p_ua_hash);
    update public.user_face_biometrics set last_verified_at=now() where id=selected_id;
    return jsonb_build_object('status','matched');
  end if;
  insert into public.biometric_audit_logs(user_id,event_type,cosine_distance,ip_hash,user_agent_hash) values (p_user_id,'VERIFY_FAIL_THRESHOLD',distance,p_ip_hash,p_ua_hash);
  return jsonb_build_object('status','no_match');
end $$;
revoke all on function public.verify_auxiliary_face_signature(uuid, extensions.vector, text, text) from public, anon, authenticated;
grant execute on function public.verify_auxiliary_face_signature(uuid, extensions.vector, text, text) to service_role;

-- Atomic replacement and audit event; service callers must bind user ID to a
-- verified session. This is not passkey registration or identity verification.
create function public.enroll_auxiliary_face_template(
  p_user_id uuid, p_query_vector extensions.vector(64), p_device_label text, p_ip_hash text, p_ua_hash text
) returns text language plpgsql security definer set search_path = pg_catalog, extensions
as $$
begin
  if p_user_id is null or p_query_vector is null or p_device_label is null
     or length(btrim(p_device_label)) not between 1 and 100
     or p_ip_hash is null or p_ua_hash is null
     or p_ip_hash !~ '^[0-9a-f]{64}$' or p_ua_hash !~ '^[0-9a-f]{64}$'
     or extensions.vector_dims(p_query_vector) <> 64
     or abs(extensions.vector_norm(p_query_vector) - 1.0) > 0.01 then
    raise exception 'Invalid request';
  end if;
  -- Same per-user lock as verification, so replacement cannot race a match.
  perform pg_advisory_xact_lock(45102, hashtext(p_user_id::text));
  -- Wipe old vectors rather than leaving inactive sensitive templates behind.
  delete from public.user_face_biometrics where user_id=p_user_id;
  insert into public.user_face_biometrics(user_id,face_embedding,device_label) values(p_user_id,p_query_vector,btrim(p_device_label));
  insert into public.biometric_audit_logs(user_id,event_type,ip_hash,user_agent_hash) values(p_user_id,'ENROLL',p_ip_hash,p_ua_hash);
  return 'enrolled';
end $$;
revoke all on function public.enroll_auxiliary_face_template(uuid, extensions.vector, text, text, text) from public, anon, authenticated;
grant execute on function public.enroll_auxiliary_face_template(uuid, extensions.vector, text, text, text) to service_role;
