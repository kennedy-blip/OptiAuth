-- STAGED / EXPERIMENTAL: use only in an isolated Supabase test project.
-- Not an authentication factor. Requires independent WebAuthn and operational review.
-- This migration deliberately fails on pre-existing table names rather than silently
-- accepting a different schema. The legacy user_profiles table is not migrated.
create schema if not exists extensions;
create extension if not exists vector with schema extensions;
-- IF NOT EXISTS does not relocate an existing extension; fail clearly on drift.
do $$ begin
  if not exists (select 1 from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='vector' and n.nspname='extensions') then
    raise exception 'pgvector must already be installed in the extensions schema';
  end if;
end $$;

create table public.user_biometrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  eye_embedding extensions.vector(64) not null,
  device_label text not null default 'Default device' check (char_length(device_label) between 1 and 100),
  is_active boolean not null default true,
  enrolled_at timestamptz not null default now(),
  last_verified_at timestamptz
);
create index on public.user_biometrics(user_id) where is_active;
alter table public.user_biometrics enable row level security;
revoke all on public.user_biometrics from public, anon, authenticated;

create table public.biometric_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('ENROLL','VERIFY_SUCCESS','VERIFY_FAIL_THRESHOLD','NO_TEMPLATE','RATE_LIMITED')),
  cosine_distance double precision,
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  user_agent_hash text not null check (user_agent_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create index biometric_audit_user_time on public.biometric_audit_logs(user_id, created_at desc);
create index biometric_audit_ip_time on public.biometric_audit_logs(ip_hash, created_at desc);
alter table public.biometric_audit_logs enable row level security;
revoke all on public.biometric_audit_logs from public, anon, authenticated, service_role;

-- No end-user or service-role table writes. The FK may anonymize user_id on
-- deletion; no other column may change. Owners/superusers remain able to tamper
-- with triggers, so this is not a tamper-proof external audit system.
create function public.guard_biometric_audit() returns trigger
language plpgsql set search_path = pg_catalog
as $$
begin
  if TG_OP = 'UPDATE' and pg_trigger_depth() > 1 and old.user_id is not null and new.user_id is null
     and new.id is not distinct from old.id
     and new.event_type is not distinct from old.event_type
     and new.cosine_distance is not distinct from old.cosine_distance
     and new.ip_hash is not distinct from old.ip_hash
     and new.user_agent_hash is not distinct from old.user_agent_hash
     and new.created_at is not distinct from old.created_at then
    return new;
  end if;
  raise exception 'Audit records are append-only';
end $$;
create trigger biometric_audit_guard before update or delete on public.biometric_audit_logs
for each row execute function public.guard_biometric_audit();
revoke all on function public.guard_biometric_audit() from public, anon, authenticated, service_role;

create function public.verify_auxiliary_eye_signature(
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
  select b.id, (b.eye_embedding operator(extensions.<=>) p_query_vector) into selected_id, distance
    from public.user_biometrics b where b.user_id=p_user_id and b.is_active
    order by b.eye_embedding operator(extensions.<=>) p_query_vector limit 1;
  if selected_id is null or distance is null or distance = 'NaN'::float8 then
    insert into public.biometric_audit_logs(user_id,event_type,ip_hash,user_agent_hash) values (p_user_id,'NO_TEMPLATE',p_ip_hash,p_ua_hash);
    return jsonb_build_object('status','no_match');
  end if;
  if distance < threshold then
    insert into public.biometric_audit_logs(user_id,event_type,cosine_distance,ip_hash,user_agent_hash) values (p_user_id,'VERIFY_SUCCESS',distance,p_ip_hash,p_ua_hash);
    update public.user_biometrics set last_verified_at=now() where id=selected_id;
    return jsonb_build_object('status','matched');
  end if;
  insert into public.biometric_audit_logs(user_id,event_type,cosine_distance,ip_hash,user_agent_hash) values (p_user_id,'VERIFY_FAIL_THRESHOLD',distance,p_ip_hash,p_ua_hash);
  return jsonb_build_object('status','no_match');
end $$;
revoke all on function public.verify_auxiliary_eye_signature(uuid, extensions.vector, text, text) from public, anon, authenticated;
grant execute on function public.verify_auxiliary_eye_signature(uuid, extensions.vector, text, text) to service_role;

-- Atomic replacement and audit event; service callers must bind user ID to a
-- verified session. This is not passkey registration or identity verification.
create function public.enroll_auxiliary_eye_template(
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
  delete from public.user_biometrics where user_id=p_user_id;
  insert into public.user_biometrics(user_id,eye_embedding,device_label) values(p_user_id,p_query_vector,btrim(p_device_label));
  insert into public.biometric_audit_logs(user_id,event_type,ip_hash,user_agent_hash) values(p_user_id,'ENROLL',p_ip_hash,p_ua_hash);
  return 'enrolled';
end $$;
revoke all on function public.enroll_auxiliary_eye_template(uuid, extensions.vector, text, text, text) from public, anon, authenticated;
grant execute on function public.enroll_auxiliary_eye_template(uuid, extensions.vector, text, text, text) to service_role;
