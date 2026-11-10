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

test.skip(({ isMobile }) => isMobile, 'Weekly booking journey runs once, on desktop');

const carerEmail = `wk.carer.${run}@example.com`;
const familyEmail = `wk.family.${run}@example.com`;
let publicId = '';

test.beforeAll(async () => {
  const rootEmail = `root.wk.${run}@nuriva.test`;
  const rootPw = staff(rootEmail, 'superadmin');
  const admin = await pwRequest.newContext({ baseURL: ADMIN });
  await admin.post('/api/v1/auth/login', { data: { email: rootEmail, password: rootPw } });
  const carer = await pwRequest.newContext({ baseURL: WEB });
  const reg = await carer.post('/api/v1/auth/register', { data: { role: 'caregiver', divisions: ['kids'], email: carerEmail, name: `Rosa Wk${run}`, password: PW, acceptTerms: true, locale: 'es' } });
  const carerId = (await reg.json()).user.id;
  await carer.put('/api/v1/caregiver/profile', { data: { divisions: ['kids'], headline: `Niñera semanal ${run}`, bio: 'Educadora infantil con seis años cuidando niños de 2 a 10 años en Brickell y Coral Gables.',
    hourlyRateCents: 2500, yearsExperience: 6, languages: ['es'], services: ['occasional'], zip: '33131' } });
  await carer.put('/api/v1/caregiver/availability', { data: { windows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, start: '08:00', end: '22:00' })) } });
  for (const step of STEPS) await admin.post(`/api/v1/admin/caregivers/${carerId}/vetting`, { data: { step, status: 'passed', reference: `${step} ${run}` } });
  await admin.post('/api/v1/admin/compliance/services', { data: { division: 'kids', service: 'occasional', active: true, complianceRef: `WK-${run}` } });
  const family = await pwRequest.newContext({ baseURL: WEB });
  await family.post('/api/v1/auth/register', { data: { role: 'client', email: familyEmail, name: 'Ana López', password: PW, acceptTerms: true, locale: 'es' } });
  await family.post('/api/v1/household/dependents', { data: { kind: 'child', name: 'Sofía', details: { ageYears: 4, allergies: '', medications: '', notes: '' } } });
  publicId = (await (await family.get('/api/v1/caregivers/search?division=kids')).json()).results.find((r: { headline: string }) => r.headline === `Niñera semanal ${run}`).id;
});

async function signIn(page: import('@playwright/test').Page, email: string) {
  await page.goto(`${WEB}/es/signin`);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PW);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/es\/account$/);
}

test('a family books the same caregiver every week; she accepts all at once; the family cancels the later visits (ES)', async ({ browser }) => {
  const fam = await (await browser.newContext()).newPage();
  await signIn(fam, familyEmail);
  await fam.goto(`${WEB}/es/book/${publicId}`);
  await fam.getByRole('button', { name: 'Sofía' }).click();
  await fam.getByLabel('Fecha').fill(dayPlus(4));
  await fam.getByLabel('Hora de inicio').selectOption('17:00');
  await fam.getByLabel('Hora de fin').selectOption('20:00');
  await fam.getByLabel('Dirección', { exact: true }).fill('1200 Brickell Bay Dr, Apt 14B, Miami FL');
  await fam.getByText('Repetir cada semana').click();
  await fam.getByLabel('Durante cuántas semanas').selectOption('3');
  await expect(fam.getByText('Enviaremos 3 solicitudes, una por semana:')).toBeVisible();
  await expect(fam.locator('.repeat-box .n-chip')).toHaveCount(3);
  // 3 h × $25 = $75 + 10 % fee = $82.50 per visit; 3 visits = $247.50
  await expect(fam.getByText('Total estimado de las 3 visitas')).toBeVisible();
  await expect(fam.getByText('$247.50')).toBeVisible();
  await fam.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(fam).toHaveURL(/\/es\/bookings\/\d+\?sent=1$/);
  await expect(fam.getByText('Reserva semanal: visita 1 de 3')).toBeVisible();
  await fam.goto(`${WEB}/es/bookings`);
  await expect(fam.locator('.series-tag')).toHaveText(['↻ Semanal · 3/3', '↻ Semanal · 2/3', '↻ Semanal · 1/3']);

  const cg = await (await browser.newContext()).newPage();
  await signIn(cg, carerEmail);
  await cg.goto(`${WEB}/es/bookings`);
  await cg.locator('.booking-card', { hasText: 'Semanal · 1/3' }).click();
  await cg.getByRole('button', { name: 'Aceptar todas las visitas pendientes' }).click();
  await expect(cg.getByText('3 visitas actualizadas.')).toBeVisible();
  await expect(cg.getByText('Confirmada').first()).toBeVisible();

  await fam.locator('.booking-card', { hasText: 'Semanal · 2/3' }).click();
  await fam.getByRole('button', { name: 'Cancelar esta y las siguientes' }).click();
  await fam.getByRole('alertdialog').getByRole('button', { name: /Sí, cancelar/ }).click();
  await expect(fam.getByText('2 visitas actualizadas.')).toBeVisible();
  await fam.goto(`${WEB}/es/bookings`);
  const statuses = await fam.locator('.booking-card .n-badge').allInnerTexts();
  expect(statuses).toEqual(['Cancelada', 'Cancelada', 'Confirmada']);
});
