/** Destructive setup: runs only against an explicitly named, fresh local test database. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const url = process.env.OPTIAUTH_TEST_DATABASE_URL;
function validateTestTarget(value: string | undefined) {
  if (process.env.OPTIAUTH_ALLOW_LOCAL_DB_TESTS !== 'yes' || !value) throw new Error('Set OPTIAUTH_ALLOW_LOCAL_DB_TESTS=yes and OPTIAUTH_TEST_DATABASE_URL for a disposable local database.');
  const parsed = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) || parsed.pathname !== '/optiauth_test' || parsed.search || parsed.hash) throw new Error('Refusing database: target must be local and named optiauth_test.');
  return value;
}
const v1 = JSON.stringify([1, ...Array(63).fill(0)]), v2 = JSON.stringify([0, 1, ...Array(62).fill(0)]);
const ua = 'a'.repeat(64);

test('isolated migration, RPC locking, authorization, and account deletion', async () => {
  const pool = new pg.Pool({ connectionString: validateTestTarget(url), max: 12 });
  try {
    // This suite bootstraps minimal Supabase-compatible auth fixtures in a
    // brand-new database; it must not run against an existing application DB.
    const existing = await pool.query("select to_regclass('auth.users') as users, to_regclass('public.user_biometrics') as templates");
    assert.equal(existing.rows[0].users, null, 'auth.users already exists; use a fresh database');
    assert.equal(existing.rows[0].templates, null, 'templates already exist; use a fresh database');
    await pool.query('create schema auth; create table auth.users (id uuid primary key)');
    const migration = await readFile('supabase/migrations/006_auxiliary_biometric_security.sql', 'utf8');
    await pool.query(migration);
    await pool.query(await readFile('supabase/migrations/007_experimental_passkeys.sql', 'utf8'));
    const ids = Array.from({ length: 8 }, () => randomUUID());
    for (const id of ids) await pool.query('insert into auth.users(id) values ($1)', [id]);
    for (const id of ids) await pool.query('select public.enroll_auxiliary_eye_template($1, $2::extensions.vector, $3, $4, $5)', [id, v1, 'Test', 'f'.repeat(64), ua]);
    const verify = async (id: string, ip: string) => (await pool.query('select public.verify_auxiliary_eye_signature($1,$2::extensions.vector,$3,$4) result', [id, v2, ip, ua])).rows[0].result.status as string;
    const sameIp = await Promise.all(ids.slice(0, 6).map(id => verify(id, '1'.repeat(64))));
    assert.equal(sameIp.filter(s => s === 'no_match').length, 5);
    assert.equal(sameIp.filter(s => s === 'rate_limited').length, 1);
    const sameUser = await Promise.all(Array.from({ length: 6 }, (_, i) => verify(ids[6], String(i + 2).repeat(64))));
    assert.equal(sameUser.filter(s => s === 'no_match').length, 5);
    assert.equal(sameUser.filter(s => s === 'rate_limited').length, 1);
    const client = await pool.connect();
    try {
      for (const role of ['anon', 'authenticated']) {
        await client.query(`set role ${role}`);
        try {
          for (const table of ['user_biometrics', 'biometric_audit_logs']) {
            await assert.rejects(client.query(`select * from public.${table}`), (err: unknown) => (err as { code: string }).code === '42501');
            await assert.rejects(client.query(`insert into public.${table} default values`), (err: unknown) => (err as { code: string }).code === '42501');
          }
          await assert.rejects(client.query('select public.verify_auxiliary_eye_signature($1,$2::extensions.vector,$3,$4)', [ids[0], v2, '1'.repeat(64), ua]), (err: unknown) => (err as { code: string }).code === '42501');
        } finally { await client.query('reset role'); }
      }
    } finally { client.release(); }
    const sessionId = randomUUID(), challenge = 'x'.repeat(43);
    const issued = await pool.query('select public.create_passkey_challenge($1,$2,$3,$4) id', [ids[7], sessionId, 'authentication', challenge]);
    const challengeId = issued.rows[0].id as string;
    const consume = async (sid: string) => (await pool.query('select public.consume_passkey_challenge($1,$2,$3,$4) value', [challengeId, ids[7], sid, 'authentication'])).rows[0].value as string | null;
    assert.equal(await consume(randomUUID()), null);
    const results = await Promise.all([consume(sessionId), consume(sessionId)]);
    assert.equal(results.filter(value => value === challenge).length, 1);
    assert.equal(results.filter(value => value === null).length, 1);
    const before = await pool.query('select count(*)::int n from public.biometric_audit_logs where user_id=$1', [ids[0]]);
    assert.ok(before.rows[0].n > 0);
    await pool.query('delete from auth.users where id=$1', [ids[0]]);
    const after = await pool.query('select count(*)::int n from public.biometric_audit_logs where user_id is null');
    assert.equal(after.rows[0].n, before.rows[0].n);
    assert.equal((await pool.query('select count(*)::int n from public.user_biometrics where user_id=$1', [ids[0]])).rows[0].n, 0);
    await assert.rejects(pool.query("delete from public.biometric_audit_logs where user_id is null"), /append-only/);
  } finally { await pool.end(); }
});
