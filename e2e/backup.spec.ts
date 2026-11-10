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

test.skip(({ isMobile }) => isMobile, 'Backup guarantee journey runs once, on desktop');

const familyEmail = `bk.family.${run}@example.com`;
const ids: Record<string, string> = {};
let bookingId = 0;
const DATE = dayPlus(5);

test.beforeAll(async () => {
  const rootEmail = `root.bk.${run}@nuriva.test`;
  const rootPw = staff(rootEmail, 'superadmin');
  const admin = await pwRequest.newContext({ baseURL: ADMIN });
  await admin.post('/api/v1/auth/login', { data: { email: rootEmail, password: rootPw } });
  await admin.post('/api/v1/admin/compliance/services', { data: { division: 'kids', service: 'occasional', active: true, complianceRef: `BK-${run}` } });
  const carers: Record<string, Awaited<ReturnType<typeof pwRequest.newContext>>> = {};
  for (const [key, name] of [['first', `Rosa Primera${run}`], ['backup', `Carla Suplente${run}`]] as const) {
    const ctx = await pwRequest.newContext({ baseURL: WEB });
    const reg = await ctx.post('/api/v1/auth/register', { data: { role: 'caregiver', divisions: ['kids'], email: `bk.${key}.${run}@example.com`, name, password: PW, acceptTerms: true, locale: 'es' } });
    const id = (await reg.json()).user.id;
    await ctx.put('/api/v1/caregiver/profile', { data: { divisions: ['kids'], headline: `Niñera ${key} ${run}`, bio: 'Educadora infantil con seis años cuidando niños de 2 a 10 años en Brickell y Coral Gables.',
      hourlyRateCents: 2500, yearsExperience: 6, languages: ['es'], services: ['occasional'], zip: '33131' } });
    await ctx.put('/api/v1/caregiver/availability', { data: { windows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, start: '08:00', end: '22:00' })) } });
    for (const step of STEPS) await admin.post(`/api/v1/admin/caregivers/${id}/vetting`, { data: { step, status: 'passed', reference: `${step} ${run}` } });
    carers[key] = ctx;
  }
  const family = await pwRequest.newContext({ baseURL: WEB });
  await family.post('/api/v1/auth/register', { data: { role: 'client', email: familyEmail, name: 'Ana López', password: PW, acceptTerms: true, locale: 'es' } });
  const sofia = (await (await family.post('/api/v1/household/dependents', { data: { kind: 'child', name: 'Sofía', details: { ageYears: 4, allergies: '', medications: '', notes: '' } } })).json()).dependent.id;
  const results = (await (await family.get('/api/v1/caregivers/search?division=kids')).json()).results as Array<{ id: string; headline: string }>;
  for (const key of ['first', 'backup']) ids[key] = results.find((r) => r.headline === `Niñera ${key} ${run}`)!.id;
  const b = await family.post('/api/v1/bookings', { data: { caregiverId: ids.first, division: 'kids', service: 'occasional', dependentIds: [sofia], date: DATE, start: '18:00', end: '21:00', address: '1200 Brickell Bay Dr, Apt 14B, Miami FL', notes: 'Cena a las 7.' } });
  bookingId = (await b.json()).booking.id;
  expect((await carers.first!.post(`/api/v1/bookings/${bookingId}/accept`)).status()).toBe(200);
  expect((await carers.first!.post(`/api/v1/bookings/${bookingId}/cancel`, { data: {} })).status()).toBe(200);
});

test('when the caregiver cancels, the family books a verified backup for the same time in two taps (ES)', async ({ page }) => {
  await page.goto(`${WEB}/es/signin`);
  await page.getByLabel('Correo electrónico').fill(familyEmail);
  await page.getByLabel('Contraseña').fill(PW);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/es\/account$/);

  await page.goto(`${WEB}/es/bookings/${bookingId}`);
  const card = page.getByRole('region', { name: /Garantía de suplente/ });
  await expect(card).toContainText('no puede ir a esta reserva.');
  await expect(card).toContainText('No se te cobra nada por ella.');
  const option = card.locator('.backup-option', { hasText: `Niñera backup ${run}` });
  await expect(card.locator('.backup-option', { hasText: `Niñera first ${run}` })).toHaveCount(0);
  await option.getByRole('link', { name: 'Reservar a la misma hora' }).click();

  await expect(page.getByText('Copiamos los datos y la hora de tu reserva anterior.', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Fecha')).toHaveValue(DATE);
  await expect(page.getByLabel('Hora de inicio')).toHaveValue('18:00');
  await expect(page.getByRole('button', { name: 'Sofía' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Indicaciones para el cuidador (opcional)')).toHaveValue('Cena a las 7.');
  await page.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(page).toHaveURL(/\/es\/bookings\/\d+\?sent=1$/);
  await expect(page.getByText('Carla S.', { exact: false })).toBeVisible();
});
