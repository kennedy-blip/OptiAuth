-- STAGED ONLY. Apply after 006 in a disposable test database. Do not schedule
-- until legal retention requirements, backups and independent review are complete.
-- A dedicated NOLOGIN role makes the purge exception unavailable to normal
-- service-role table operations. Database owners/superusers can still bypass it.
-- Fails rather than reusing an existing role whose privileges are unknown.
create role optiauth_audit_purger nologin noinherit;
grant usage on schema public to optiauth_audit_purger;
grant select, delete on public.biometric_audit_logs to optiauth_audit_purger;

-- Retain the FK-driven anonymization exception; allow deletes ONLY when the
-- dedicated function owner is active and the row is at least 30 days old.
create or replace function public.guard_biometric_audit() returns trigger
language plpgsql set search_path = pg_catalog
as $$
begin
  if TG_OP = 'DELETE' and current_user = 'optiauth_audit_purger'
     and old.created_at < now() - interval '30 days' then
    return old;
  end if;
  if TG_OP = 'UPDATE' and pg_trigger_depth() > 1 and old.user_id is not null and new.user_id is null
     and new.id is not distinct from old.id
     and new.event_type is not distinct from old.event_type
     and new.cosine_distance is not distinct from old.cosine_distance
     and new.ip_hash is not distinct from old.ip_hash
     and new.user_agent_hash is not distinct from old.user_agent_hash
     and new.created_at is not distinct from old.created_at then
    return new;
  end if;
  raise exception 'Audit records are append-only except for authorized retention cleanup';
end $$;

create function public.purge_expired_biometric_audit_logs(p_retention_days integer default 30)
returns bigint language plpgsql security definer set search_path = pg_catalog
as $$
declare removed bigint;
begin
  -- A hard minimum prevents callers from bypassing the 30-day window.
  if p_retention_days is null or p_retention_days < 30 or p_retention_days > 3650 then
    raise exception 'Retention must be between 30 and 3650 days';
  end if;
  delete from public.biometric_audit_logs where created_at < now() - make_interval(days => p_retention_days);
  get diagnostics removed = row_count;
  return removed;
end $$;
revoke all on function public.purge_expired_biometric_audit_logs(integer) from public, anon, authenticated, service_role;
-- PostgreSQL requires a new owner to have CREATE on the containing schema.
-- Grant it only for the ownership transfer, then immediately remove it.
grant create on schema public to optiauth_audit_purger;
alter function public.purge_expired_biometric_audit_logs(integer) owner to optiauth_audit_purger;
revoke create on schema public from optiauth_audit_purger;
-- Intended only for an operator's scheduled job, not browser clients.
grant execute on function public.purge_expired_biometric_audit_logs(integer) to service_role;
