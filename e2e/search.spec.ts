import { execFileSync } from 'node:child_process';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { request as pwRequest } from '@playwright/test';

const WEB = 'http://localhost:3100';
const ADMIN = 'http://localhost:3200';
const DB = process.env.TEST_DATABASE_URL ?? 'postgres://nuriva_dev:nuriva_dev_local_only@localhost:5432/nuriva_test';
const run = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const STEPS = ['identity', 'background', 'interview', 'training', 'agreement', 'final_approval'];

let approvedHeadline = '';
let pendingHeadline = '';

async function caregiver(name: string, headline: string, extra: object = {}): Promise<{ api: APIRequestContext; id: number }> {
  const api = await pwRequest.newContext({ baseURL: WEB });
  const reg = await api.post('/api/v1/auth/register', { data: { role: 'caregiver', divisions: ['kids'], email: `${name.split(' ')[0]!.toLowerCase()}.${run}@example.com`, name, password: 'correct-horse-battery-1', acceptTerms: true } });
  expect(reg.status()).toBe(201);
  const prof = await api.put('/api/v1/caregiver/profile', { data: {
    divisions: ['kids'], headline, bio: 'Educadora infantil con seis años cuidando niños de 2 a 10 años en Brickell y Coral Gables.',
    hourlyRateCents: 2400, yearsExperience: 7, languages: ['es', 'en'], services: ['occasional', 'school_pickup'], zip: '33131', ...extra } });
  expect(prof.status()).toBe(200);
  return { api, id: (await reg.json()).user.id };
}

test.beforeAll(async () => {
  approvedHeadline = `Niñera bilingüe ${run}`;
  pendingHeadline = `Pendiente ${run}`;
  const out = execFileSync('pnpm', ['--silent', '--filter', '@nuriva/api', 'create-staff', '--email', `root.search.${run}@nuriva.test`, '--name', 'Root Search', '--roles', 'superadmin'],
    { env: { ...process.env, DATABASE_URL: DB }, encoding: 'utf8' });
  const pw = out.match(/Temporary password \(shown once\): (\S+)/)![1]!;
  const admin = await pwRequest.newContext({ baseURL: ADMIN });
  expect((await admin.post('/api/v1/auth/login', { data: { email: `root.search.${run}@nuriva.test`, password: pw } })).status()).toBe(200);

  const ok = await caregiver('Camila Duarte Soto', approvedHeadline);
  await caregiver('Rosa Pendiente', pendingHeadline);
  for (const step of STEPS) {
    const r = await admin.post(`/api/v1/admin/caregivers/${ok.id}/vetting`, { data: { step, status: 'passed', reference: `${step} ${run}` } });
    expect(r.status()).toBe(200);
  }
  for (const service of ['occasional', 'school_pickup']) {
    expect((await admin.post('/api/v1/admin/compliance/services', { data: { division: 'kids', service, active: true, complianceRef: `E2E-${run}` } })).status()).toBe(201);
  }
});

test('families find approved caregivers and open their public profile (ES)', async ({ page }) => {
  await page.goto('/es');
  await page.locator('.hero-panel').getByRole('link', { name: /Niños/ }).click();
  await expect(page).toHaveURL(/\/es\/search\?division=kids/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Niñeras en Miami');

  const card = page.getByRole('link', { name: /Ver perfil: Camila D\./ }).filter({ hasText: approvedHeadline });
  await expect(card).toBeVisible();
  await expect(card.getByText('Verificado por NURIVA')).toBeVisible();
  await expect(card.getByText('$24/hora')).toBeVisible();
  await expect(page.getByText(pendingHeadline)).toHaveCount(0); // not approved → never listed

  // Service chip filter keeps the caregiver; an unmatched language shows the filtered empty state
  await page.getByRole('link', { name: 'Recogida escolar' }).click();
  await expect(page).toHaveURL(/service=school_pickup/);
  await expect(page.getByText(approvedHeadline)).toBeVisible();
  await page.getByLabel('Habla').selectOption('ru');
  await expect(page).toHaveURL(/language=ru/);
  await expect(page.getByText('Ningún cuidador coincide con estos filtros. Prueba a quitar alguno.')).toBeVisible();
  await page.getByRole('link', { name: 'Quitar filtros' }).click();

  // Public profile
  await page.getByRole('link', { name: /Ver perfil: Camila D\./ }).filter({ hasText: approvedHeadline }).click();
  await expect(page).toHaveURL(/\/es\/caregivers\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Camila D.');
  await expect(page.getByText('Controles completados por NURIVA')).toBeVisible();
  await expect(page.locator('.checks-list li')).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'Reservar' })).toBeDisabled();
  await expect(page.getByText('Las reservas abren pronto.')).toBeVisible();
  const html = await page.content();
  expect(html).not.toContain(`camila.${run}@example.com`);
  expect(html).not.toContain('Duarte Soto');
  expect(html).not.toContain('33131');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('profiles of caregivers who are not listed return not found', async ({ page }) => {
  const res = await page.goto('/en/caregivers/00000000-0000-4000-8000-000000000000');
  expect(res?.status()).toBe(404);
});
