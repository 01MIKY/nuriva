import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { signTestWebhook } from '@nuriva/integrations';
import { setup, TEST_WEBHOOK_SECRET } from './helpers.js';

let h: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { h = await setup(); });
afterAll(async () => { await h?.close(); });

describe('identity verification (Stripe Identity, fake provider)', () => {
  let carer: Awaited<ReturnType<typeof h.register>>;
  let ops: Awaited<ReturnType<typeof h.admin>>;
  const sessionId = async () => String((await h.db.execute(sql`select identity_session_id from caregiver_profiles where user_id = ${carer.id}`)).rows[0]!.identity_session_id);

  beforeAll(async () => {
    carer = await h.register('caregiver', 'carer.idv@example.com');
    ops = await h.admin('ops.idv@nuriva.test', ['operations']);
  });

  it('starts with no verification', async () => {
    expect((await carer.c.get('/v1/caregiver/identity')).body).toEqual({ status: 'none', errorCode: null });
  });

  it('starts a Stripe-hosted verification with document + selfie and returns to NURIVA', async () => {
    const r = await carer.c.post('/v1/caregiver/identity/start', { locale: 'es' });
    expect(r.status).toBe(200);
    expect(r.body.url).toMatch(/^https:\/\/verify\.stripe\.test\/start\/vs_fake_/);
    expect(decodeURIComponent(r.body.url)).toContain('http://localhost:3000/es/care/identity?return=1');
    const again = await carer.c.post('/v1/caregiver/identity/start', { locale: 'es' });
    expect(again.body.url).toContain(await sessionId()); // resumes the same session
    expect((await carer.c.get('/v1/caregiver/identity')).body.status).toBe('requires_input');
  });

  it('stores only the session id and status — no documents, selfies or personal data', async () => {
    const row = (await h.db.execute(sql`select identity_session_id, identity_status, identity_error_code from caregiver_profiles where user_id = ${carer.id}`)).rows[0]!;
    expect(Object.keys(row).sort()).toEqual(['identity_error_code', 'identity_session_id', 'identity_status']);
  });

  it('a Stripe event updates the status after NURIVA re-reads it from Stripe', async () => {
    const sid = await sessionId();
    h.fakePayments.setVerification(sid, 'verified');
    const payload = JSON.stringify({ id: 'evt_idv_1', object: 'event', type: 'identity.verification_session.verified', data: { object: { id: sid, object: 'identity.verification_session' } } });
    const r = await h.app.inject({ method: 'POST', url: '/v1/webhooks/stripe', headers: { 'content-type': 'application/json', 'stripe-signature': signTestWebhook(payload, TEST_WEBHOOK_SECRET) }, payload });
    expect(r.statusCode).toBe(200);
    expect((await carer.c.get('/v1/caregiver/identity')).body.status).toBe('verified');
    expect((await carer.c.post('/v1/caregiver/identity/start', {})).body.error).toBe('already_verified');
  });

  it('never approves the vetting step by itself; staff see it as evidence', async () => {
    const vet = (await carer.c.get('/v1/caregiver/vetting')).body.steps.find((s: { step: string }) => s.step === 'identity');
    expect(vet.status).toBe('not_started');
    const detail = await ops.c.get(`/v1/admin/caregivers/${carer.id}`);
    expect(detail.body.identityCheck).toMatchObject({ status: 'verified', sessionId: await sessionId() });
  });

  it('records failed attempts so the caregiver can retry', async () => {
    const other = await h.register('caregiver', 'carer.idv2@example.com');
    await other.c.post('/v1/caregiver/identity/start', {});
    const sid = String((await h.db.execute(sql`select identity_session_id from caregiver_profiles where user_id = ${other.id}`)).rows[0]!.identity_session_id);
    h.fakePayments.setVerification(sid, 'requires_input', 'document_expired');
    expect((await other.c.get('/v1/caregiver/identity')).body).toEqual({ status: 'requires_input', errorCode: 'document_expired' });
  });

  it('is caregiver-only and audited', async () => {
    const client = await h.register('client', 'client.idv@example.com');
    expect((await client.c.post('/v1/caregiver/identity/start', {})).status).toBe(403);
    const a = await h.db.execute(sql`select action from audit_log where action in ('identity.started','identity.status')`);
    expect(a.rows.map((r) => r.action)).toEqual(expect.arrayContaining(['identity.started', 'identity.status']));
  });
});
