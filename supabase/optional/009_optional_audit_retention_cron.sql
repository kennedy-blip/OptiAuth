-- OPTIONAL: Do not apply until 008 has passed isolation tests and an operator
-- has enabled pg_cron, confirmed the scheduler's DB role and approved retention.
-- Run once as the intended cron owner. A duplicate name is an error rather than
-- modifying or replacing an existing job. Monitor cron.job_run_details for failures.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron must be enabled by the database operator';
  end if;
  if exists (select 1 from cron.job where jobname = 'optiauth-audit-retention-v1') then
    raise exception 'Audit retention job already exists; inspect before changes';
  end if;
end $$;
select cron.schedule('optiauth-audit-retention-v1', '0 2 * * *',
  'select public.purge_expired_biometric_audit_logs(30)');
