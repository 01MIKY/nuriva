import { execFileSync } from 'node:child_process';
import { expect, request as pwRequest, test } from '@playwright/test';

const WEB = 'http://localhost:3100';
const ADMIN = 'http://localhost:3200';
const DB = process.env.TEST_DATABASE_URL ?? 'postgres://nuriva_dev:nuriva_dev_local_only@localhost:5432/nuriva_test';
const PW = 'correct-horse-battery-1';
const run = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const STEPS = ['identity', 'background', 'interview', 'training', 'agreement', 'final_approval'];
const dayPlus = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + n * 86400_000));
const staff = (email: string, roles: string) => execFileSync('pnpm', ['--silent', '--filter', '@nuriva/api', 'create-staff', '--email', email, '--name', `Staff ${roles}`, '--roles', roles],
  { env: { ...process.env, DATABASE_URL: DB }, encoding: 'utf8' }).match(/shown once\): (\S+)/)![1]!;

test.skip(({ isMobile }) => isMobile, 'Reputation journey runs once, on desktop');

const carerEmail = `rep.carer.${run}@example.com`;
let publicId = '';

test.beforeAll(async () => {
  const rootEmail = `root.rep.${run}@nuriva.test`;
  const rootPw = staff(rootEmail, 'superadmin');
  const admin = await pwRequest.newContext({ baseURL: ADMIN });
  await admin.post('/api/v1/auth/login', { data: { email: rootEmail, password: rootPw } });
  const carer = await pwRequest.newContext({ baseURL: WEB });
  const reg = await carer.post('/api/v1/auth/register', { data: { role: 'caregiver', divisions: ['kids'], email: carerEmail, name: `Rosa Nivel${run}`, password: PW, acceptTerms: true, locale: 'es' } });
  const carerId = (await reg.json()).user.id;
  await carer.put('/api/v1/caregiver/profile', { data: { divisions: ['kids'], headline: `Niñera nivel ${run}`, bio: 'Educadora infantil con seis años cuidando niños de 2 a 10 años en Brickell y Coral Gables.',
    hourlyRateCents: 2500, yearsExperience: 6, languages: ['es', 'en'], services: ['occasional'], zip: '33131' } });
  await carer.put('/api/v1/caregiver/availability', { data: { windows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, start: '08:00', end: '22:00' })) } });
  for (const step of STEPS) await admin.post(`/api/v1/admin/caregivers/${carerId}/vetting`, { data: { step, status: 'passed', reference: `${step} ${run}` } });
  await admin.post('/api/v1/admin/compliance/services', { data: { division: 'kids', service: 'occasional', active: true, complianceRef: `REP-${run}` } });
  const family = await pwRequest.newContext({ baseURL: WEB });
  await family.post('/api/v1/auth/register', { data: { role: 'client', email: `rep.family.${run}@example.com`, name: 'Ana López', password: PW, acceptTerms: true, locale: 'es' } });
  const sofia = (await (await family.post('/api/v1/household/dependents', { data: { kind: 'child', name: 'Sofía', details: { ageYears: 4, allergies: '', medications: '', notes: '' } } })).json()).dependent.id;
  publicId = (await (await family.get('/api/v1/caregivers/search?division=kids')).json()).results.find((r: { headline: string }) => r.headline === `Niñera nivel ${run}`).id;
  const ids: number[] = [];
  for (let i = 0; i < 10; i++) {
    const b = await family.post('/api/v1/bookings', { data: { caregiverId: publicId, division: 'kids', service: 'occasional', dependentIds: [sofia], date: dayPlus(3 + i), start: '18:00', end: '20:00', address: '1200 Brickell Bay Dr, Apt 14B, Miami FL', notes: '' } });
    const id = (await b.json()).booking.id;
    expect((await carer.post(`/api/v1/bookings/${id}/accept`)).status()).toBe(200);
    ids.push(id);
  }
  // Test only: the ten services took place.
  execFileSync('psql', [DB, '-q', '-c', `update bookings set status = 'completed' where id in (${ids.join(',')})`]);
  for (const id of ids.slice(0, 3)) expect((await family.post(`/api/v1/bookings/${id}/review`, { data: { rating: 5, comment: 'Excelente' } })).status()).toBe(201);
});

test('levels and badges: families see Silver on the profile and in search; the caregiver sees what is missing for Gold (ES)', async ({ page }) => {
  await page.goto(`${WEB}/es/caregivers/${publicId}`);
  await expect(page.locator('.profile-hero')).toContainText('★ Nivel Plata');
  await expect(page.locator('.profile-hero')).toContainText('10 servicios en NURIVA');
  await expect(page.locator('.profile-hero')).toContainText('Bilingüe');
  await expect(page.locator('.profile-hero')).toContainText('Sin cancelaciones en 90 días');

  await page.goto(`${WEB}/es/search?division=kids`);
  await expect(page.locator('.cg-card', { hasText: `Niñera nivel ${run}` })).toContainText('Nivel Plata');

  await page.goto(`${WEB}/es/signin`);
  await page.getByLabel('Correo electrónico').fill(carerEmail);
  await page.getByLabel('Contraseña').fill(PW);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/es\/account$/);
  const card = page.getByRole('region', { name: 'Tu nivel en NURIVA' });
  await expect(card).toContainText('Plata');
  await expect(card).toContainText('Para llegar a Oro te falta:');
  await expect(card).toContainText('20 servicios completados más');
  await expect(card).toContainText('7 reseñas más de familias');
  await expect(card).toContainText('No cambian tus condiciones.');
});
