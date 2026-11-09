import { execFileSync } from 'node:child_process';
import { expect, request as pwRequest, test, type Browser } from '@playwright/test';

const WEB = 'http://localhost:3100';
const ADMIN = 'http://localhost:3200';
const DB = process.env.TEST_DATABASE_URL ?? 'postgres://nuriva_dev:nuriva_dev_local_only@localhost:5432/nuriva_test';
const PW = 'correct-horse-battery-1';
const run = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const STEPS = ['identity', 'background', 'interview', 'training', 'agreement', 'final_approval'];
const dayPlus = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + n * 86400_000));

test.skip(({ isMobile }) => isMobile, 'Booking journey runs once, on desktop');

const carerEmail = `bk.carer.${run}@example.com`;
const familyEmail = `bk.family.${run}@example.com`;
let publicId = '';

async function signIn(browser: Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${WEB}/es/signin`);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PW);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/es\/account$/);
  return page;
}

test.beforeAll(async () => {
  const out = execFileSync('pnpm', ['--silent', '--filter', '@nuriva/api', 'create-staff', '--email', `root.bk.${run}@nuriva.test`, '--name', 'Root Booking', '--roles', 'superadmin'],
    { env: { ...process.env, DATABASE_URL: DB }, encoding: 'utf8' });
  const admin = await pwRequest.newContext({ baseURL: ADMIN });
  await admin.post('/api/v1/auth/login', { data: { email: `root.bk.${run}@nuriva.test`, password: out.match(/shown once\): (\S+)/)![1] } });

  const carer = await pwRequest.newContext({ baseURL: WEB });
  const reg = await carer.post('/api/v1/auth/register', { data: { role: 'caregiver', divisions: ['kids'], email: carerEmail, name: `Lucía Mar${run}`, password: PW, acceptTerms: true, locale: 'es' } });
  const carerId = (await reg.json()).user.id;
  await carer.put('/api/v1/caregiver/profile', { data: {
    divisions: ['kids'], headline: `Niñera ${run}`, bio: 'Educadora infantil con seis años cuidando niños de 2 a 10 años en Brickell y Coral Gables.',
    hourlyRateCents: 2600, yearsExperience: 6, languages: ['es'], services: ['occasional'], zip: '33131' } });
  await carer.put('/api/v1/caregiver/availability', { data: { windows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, start: '08:00', end: '24:00' })) } });
  for (const step of STEPS) expect((await admin.post(`/api/v1/admin/caregivers/${carerId}/vetting`, { data: { step, status: 'passed', reference: `${step} ${run}` } })).status()).toBe(200);
  await admin.post('/api/v1/admin/compliance/services', { data: { division: 'kids', service: 'occasional', active: true, complianceRef: `BK-${run}` } });

  const family = await pwRequest.newContext({ baseURL: WEB });
  await family.post('/api/v1/auth/register', { data: { role: 'client', email: familyEmail, name: 'Ana López', password: PW, acceptTerms: true, locale: 'es' } });
  await family.post('/api/v1/household/dependents', { data: { kind: 'child', name: 'Sofía', details: { ageYears: 4, allergies: 'Maní', medications: '', notes: '' } } });
  const found = await (await family.get('/api/v1/caregivers/search?division=kids')).json();
  publicId = found.results.find((r: { headline: string }) => r.headline === `Niñera ${run}`).id;
});

test('a family requests a booking, the caregiver accepts and then the family cancels (ES)', async ({ browser }) => {
  const fam = await signIn(browser, familyEmail);
  await fam.goto(`${WEB}/es/caregivers/${publicId}`);
  await fam.getByRole('link', { name: 'Reservar' }).click();
  await expect(fam).toHaveURL(new RegExp(`/es/book/${publicId}$`));
  await expect(fam.getByText('Lunes')).toBeVisible(); // caregiver hours are shown

  const form = fam.getByRole('form', { name: /Solicitar una reserva con Lucía M\./ });
  await form.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(form.getByText('Elige al menos uno.')).toBeVisible();
  await form.getByRole('button', { name: 'Sofía' }).click();
  await form.getByLabel('Fecha').fill(dayPlus(5));
  await form.getByLabel('Hora de inicio').selectOption('06:00'); // before the caregiver's hours
  await form.getByLabel('Hora de fin').selectOption('09:00');
  await form.getByLabel('Dirección').fill('1200 Brickell Bay Dr, Apt 14B, Miami');
  await form.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(form.getByText('El cuidador no está disponible a esa hora. Elige otro horario.')).toBeVisible();
  await form.getByLabel('Hora de inicio').selectOption('18:00');
  await form.getByLabel('Hora de fin').selectOption('22:00');
  await expect(fam.getByText('$114.40')).toBeVisible(); // 4 h × $26 + 10 % fee
  await expect(fam.getByText('Todavía no se cobra nada')).toBeVisible();
  await form.getByLabel('Dirección').fill('1200 Brickell Bay Dr, Apt 14B, Miami');
  await form.getByLabel('Indicaciones para el cuidador (opcional)').fill('Cena a las 7');
  await form.getByRole('button', { name: 'Enviar solicitud' }).click();

  await expect(fam).toHaveURL(/\/es\/bookings\/\d+\?sent=1$/);
  await expect(fam.getByText('Solicitud enviada')).toBeVisible();
  await expect(fam.getByText('Solicitada')).toBeVisible();
  const bookingUrl = fam.url().replace('?sent=1', '');

  // The caregiver sees the request, without address or names, and accepts it
  const cg = await signIn(browser, carerEmail);
  await cg.getByRole('link', { name: 'Solicitudes de reserva' }).click();
  await cg.getByRole('link', { name: /Cuidado ocasional/ }).first().click();
  await expect(cg.getByText('de Ana')).toBeVisible();
  await expect(cg.getByText('Visible cuando aceptes').first()).toBeVisible();
  await expect(cg.getByText('Sofía')).toHaveCount(0);
  await expect(cg.getByText('Brickell')).toHaveCount(0);
  await cg.getByRole('button', { name: 'Aceptar' }).click();
  await expect(cg.getByText('Confirmada')).toBeVisible();
  await expect(cg.getByText('1200 Brickell Bay Dr, Apt 14B, Miami')).toBeVisible();
  await expect(cg.getByText('Alergias: Maní')).toBeVisible();
  await expect(cg.getByText('Cena a las 7')).toBeVisible();

  // The family sees it confirmed and cancels (with an in-page confirmation)
  await fam.goto(bookingUrl);
  await expect(fam.getByText('Confirmada')).toBeVisible();
  await fam.getByRole('button', { name: 'Cancelar reserva' }).click();
  await fam.getByRole('button', { name: 'Mantenerla' }).click();
  await expect(fam.getByText('Confirmada')).toBeVisible();
  await fam.getByRole('button', { name: 'Cancelar reserva' }).click();
  await fam.getByRole('button', { name: 'Sí, cancelar' }).click();
  await expect(fam.getByText('Cancelada')).toBeVisible();
});

test('a caregiver edits weekly availability (ES)', async ({ browser }) => {
  const cg = await signIn(browser, carerEmail);
  await cg.getByRole('link', { name: 'Mi disponibilidad' }).click();
  await cg.getByLabel('Disponible: Domingo').uncheck();
  await cg.getByLabel('Desde (Lunes)').selectOption('09:00');
  await cg.getByLabel('Hasta (Lunes)').selectOption('08:00');
  await cg.getByRole('button', { name: 'Guardar disponibilidad' }).click();
  await expect(cg.getByText('La hora de fin debe ser posterior a la de inicio.')).toBeVisible();
  await cg.getByLabel('Hasta (Lunes)').selectOption('17:00');
  await cg.getByRole('button', { name: 'Guardar disponibilidad' }).click();
  await expect(cg.getByText('Disponibilidad guardada')).toBeVisible();
  await cg.reload();
  await expect(cg.getByLabel('Disponible: Domingo')).not.toBeChecked();
  await expect(cg.getByLabel('Hasta (Lunes)')).toHaveValue('17:00');
});
