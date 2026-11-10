import { expect, test } from '@playwright/test';

const WEB = 'http://localhost:3100';
const ADMIN = 'http://localhost:3200';

test.skip(({ isMobile }) => isMobile, 'Platform checks run once, on desktop');

test('health checks answer without calling the API', async ({ request }) => {
  for (const base of [WEB, ADMIN]) {
    const r = await request.get(`${base}/api/healthz`);
    expect(r.status()).toBe(200);
    expect((await r.json()).ok).toBe(true);
  }
});

test('the apps forward only the address their edge saw, never a client-forged chain', async ({ request }) => {
  const forged = await request.get(`${WEB}/api/healthz`, { headers: { 'x-forwarded-for': '203.0.113.9, 198.51.100.7' } });
  expect((await forged.json()).ip).toBe('198.51.100.7');
  const garbage = await request.get(`${ADMIN}/api/healthz`, { headers: { 'x-forwarded-for': 'not-an-ip' } });
  expect((await garbage.json()).ip).toBeNull();
});
