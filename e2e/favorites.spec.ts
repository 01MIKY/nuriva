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

test.skip(({ isMobile }) => isMobile, 'Favorites journey runs once, on desktop');

const carerEmail = `fav.carer.${run}@example.com`;
const familyEmail = `fav.family.${run}@example.com`;
let publicId = '';
let bookingId = 0;

test.beforeAll(async () => {
  const rootEmail = `root.fav.${run}@nuriva.test`;
  const rootPw = staff(rootEmail, 'superadmin');
  const admin = await pwRequest.newContext({ baseURL: ADMIN });
  await admin.post('/api/v1/auth/login', { data: { email: rootEmail, password: rootPw } });
  const carer = await pwRequest.newContext({ baseURL: WEB });
  const reg = await carer.post('/api/v1/auth/register', { data: { role: 'caregiver', divisions: ['kids'], email: carerEmail, name: `Rosa Fav${run}`, password: PW, acceptTerms: true, locale: 'es' } });
  const carerId = (await reg.json()).user.id;
  await carer.put('/api/v1/caregiver/profile', { data: { divisions: ['kids'], headline: `Niñera fav ${run}`, bio: 'Educadora infantil con seis años cuidando niños de 2 a 10 años en Brickell y Coral Gables.',
    hourlyRateCents: 2600, yearsExperience: 6, languages: ['es'], services: ['occasional'], zip: '33131' } });
  await carer.put('/api/v1/caregiver/availability', { data: { windows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, start: '08:00', end: '22:00' })) } });
  for (const step of STEPS) await admin.post(`/api/v1/admin/caregivers/${carerId}/vetting`, { data: { step, status: 'passed', reference: `${step} ${run}` } });
  await admin.post('/api/v1/admin/compliance/services', { data: { division: 'kids', service: 'occasional', active: true, complianceRef: `FAV-${run}` } });
  const family = await pwRequest.newContext({ baseURL: WEB });
  await family.post('/api/v1/auth/register', { data: { role: 'client', email: familyEmail, name: 'Ana López', password: PW, acceptTerms: true, locale: 'es' } });
  const sofia = (await (await family.post('/api/v1/household/dependents', { data: { kind: 'child', name: 'Sofía', details: { ageYears: 4, allergies: '', medications: '', notes: '' } } })).json()).dependent.id;
  publicId = (await (await family.get('/api/v1/caregivers/search?division=kids')).json()).results.find((r: { headline: string }) => r.headline === `Niñera fav ${run}`).id;
  const b = await family.post('/api/v1/bookings', { data: { caregiverId: publicId, division: 'kids', service: 'occasional', dependentIds: [sofia], date: dayPlus(3), start: '18:00', end: '21:00', address: '1200 Brickell Bay Dr, Apt 14B, Miami FL', notes: 'Cena a las 7.' } });
  bookingId = (await b.json()).booking.id;
  expect((await carer.post(`/api/v1/bookings/${bookingId}/accept`)).status()).toBe(200);
  // Test only: mark the service as done, as if check-out had happened.
  execFileSync('psql', [DB, '-q', '-c', `update bookings set status = 'completed' where id = ${bookingId}`]);
});

test('a family saves a caregiver, finds her in Favorites and books again with the details copied (ES)', async ({ page }) => {
  await page.goto(`${WEB}/es/signin`);
  await page.getByLabel('Correo electrónico').fill(familyEmail);
  await page.getByLabel('Contraseña').fill(PW);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/es\/account$/);

  await page.goto(`${WEB}/es/favorites`);
  await expect(page.getByText('Aún no has guardado a nadie.', { exact: false })).toBeVisible();

  await page.goto(`${WEB}/es/caregivers/${publicId}`);
  const heart = page.getByRole('button', { name: /Guardar en favoritos/ });
  // The heart is optimistic; wait for the save itself before reloading.
  const saved = page.waitForResponse((r) => r.url().includes(`/api/v1/favorites/${publicId}`) && r.request().method() === 'PUT');
  await heart.click();
  expect((await saved).ok()).toBe(true);
  await expect(page.getByRole('button', { name: /En tus favoritos/ })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByRole('button', { name: /En tus favoritos/ })).toBeVisible();

  await page.getByRole('link', { name: 'Favoritos' }).click();
  await expect(page.getByRole('heading', { name: 'Tus cuidadores favoritos' })).toBeVisible();
  const card = page.locator('.fav-card', { hasText: `Niñera fav ${run}` });
  await expect(card.getByRole('link', { name: 'Reservar' })).toHaveAttribute('href', `/es/book/${publicId}`);

  await page.goto(`${WEB}/es/bookings/${bookingId}`);
  // Printable receipt of the completed service (no payment was charged: payments are off in tests)
  await page.getByRole('link', { name: /Ver recibo/ }).click();
  const receipt = page.getByRole('article', { name: 'Comprobante de servicio' });
  await expect(receipt).toContainText(`NUR-${String(bookingId).padStart(6, '0')}`);
  await expect(receipt).toContainText('Cuidado (3 h × $26.00)');
  await expect(receipt).toContainText('$85.80');
  await expect(receipt).toContainText('No se ha cobrado ningún pago por esta reserva.');
  await expect(receipt).toContainText('no es una factura fiscal');
  await expect(page.getByRole('button', { name: 'Imprimir o guardar como PDF' })).toBeVisible();
  await page.getByRole('link', { name: /Volver a la reserva/ }).click();
  await page.getByRole('link', { name: 'Reservar de nuevo' }).click();
  await expect(page.getByText('Copiamos los datos de tu reserva anterior.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sofía' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Dirección', { exact: true })).toHaveValue('1200 Brickell Bay Dr, Apt 14B, Miami FL');
  await expect(page.getByLabel('Hora de inicio')).toHaveValue('18:00');
  await expect(page.getByLabel('Hora de fin')).toHaveValue('21:00');
  await page.getByLabel('Fecha').fill(dayPlus(6));
  await page.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(page).toHaveURL(/\/es\/bookings\/\d+\?sent=1$/);
  expect(page.url()).not.toContain(`/bookings/${bookingId}?`);

  await page.goto(`${WEB}/es/favorites`);
  await page.getByRole('button', { name: /^Quitar/ }).click();
  await expect(page.getByText('Aún no has guardado a nadie.', { exact: false })).toBeVisible();
});
