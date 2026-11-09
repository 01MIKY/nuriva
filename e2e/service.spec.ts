import { execFileSync } from 'node:child_process';
import { expect, request as pwRequest, test, type Browser } from '@playwright/test';

const WEB = 'http://localhost:3100';
const ADMIN = 'http://localhost:3200';
const DB = process.env.TEST_DATABASE_URL ?? 'postgres://nuriva_dev:nuriva_dev_local_only@localhost:5432/nuriva_test';
const PW = 'correct-horse-battery-1';
const run = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const STEPS = ['identity', 'background', 'interview', 'training', 'agreement', 'final_approval'];
const dayPlus = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + n * 86400_000));
const staff = (email: string, roles: string) => execFileSync('pnpm', ['--silent', '--filter', '@nuriva/api', 'create-staff', '--email', email, '--name', `Staff ${roles}`, '--roles', roles],
  { env: { ...process.env, DATABASE_URL: DB }, encoding: 'utf8' }).match(/shown once\): (\S+)/)![1]!;

test.skip(({ isMobile }) => isMobile, 'Service journey runs once, on desktop');

const carerEmail = `svc.carer.${run}@example.com`;
const familyEmail = `svc.family.${run}@example.com`;
const tsEmail = `ts.svc.${run}@nuriva.test`;
let tsPw = '';
let bookingId = 0;
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
  const rootEmail = `root.svc.${run}@nuriva.test`;
  const rootPw = staff(rootEmail, 'superadmin');
  tsPw = staff(tsEmail, 'trust_safety');
  const admin = await pwRequest.newContext({ baseURL: ADMIN });
  await admin.post('/api/v1/auth/login', { data: { email: rootEmail, password: rootPw } });
  const carer = await pwRequest.newContext({ baseURL: WEB });
  const reg = await carer.post('/api/v1/auth/register', { data: { role: 'caregiver', divisions: ['kids'], email: carerEmail, name: `Rosa Svc${run}`, password: PW, acceptTerms: true, locale: 'es' } });
  const carerId = (await reg.json()).user.id;
  await carer.put('/api/v1/caregiver/profile', { data: { divisions: ['kids'], headline: `Niñera ${run}`, bio: 'Educadora infantil con seis años cuidando niños de 2 a 10 años en Brickell y Coral Gables.',
    hourlyRateCents: 2600, yearsExperience: 6, languages: ['es'], services: ['occasional'], zip: '33131' } });
  await carer.put('/api/v1/caregiver/availability', { data: { windows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, start: '08:00', end: '22:00' })) } });
  for (const step of STEPS) await admin.post(`/api/v1/admin/caregivers/${carerId}/vetting`, { data: { step, status: 'passed', reference: `${step} ${run}` } });
  await admin.post('/api/v1/admin/compliance/services', { data: { division: 'kids', service: 'occasional', active: true, complianceRef: `SVC-${run}` } });
  const family = await pwRequest.newContext({ baseURL: WEB });
  await family.post('/api/v1/auth/register', { data: { role: 'client', email: familyEmail, name: 'Ana López', password: PW, acceptTerms: true, locale: 'es' } });
  const sofia = (await (await family.post('/api/v1/household/dependents', { data: { kind: 'child', name: 'Sofía', details: { ageYears: 4, allergies: '', medications: '', notes: '' } } })).json()).dependent.id;
  publicId = (await (await family.get('/api/v1/caregivers/search?division=kids')).json()).results.find((r: { headline: string }) => r.headline === `Niñera ${run}`).id;
  const b = await family.post('/api/v1/bookings', { data: { caregiverId: publicId, division: 'kids', service: 'occasional', dependentIds: [sofia], date: dayPlus(4), start: '18:00', end: '21:00', address: '1200 Brickell Bay Dr, Miami FL', notes: '' } });
  bookingId = (await b.json()).booking.id;
  expect((await carer.post(`/api/v1/bookings/${bookingId}/accept`)).status()).toBe(200);
  // Time travel (test only): the booking starts now, so the caregiver may check in.
  execFileSync('psql', [DB, '-q', '-c', `update bookings set start_at = now() - interval '5 minutes', end_at = now() + interval '3 hours' where id = ${bookingId}`]);
});

test('messages, check-in, care updates, check-out, review, emergency report and Trust & Safety follow-up (ES)', async ({ browser }) => {
  const fam = await signIn(browser, familyEmail);
  await fam.goto(`${WEB}/es/bookings/${bookingId}`);
  const famChat = fam.getByRole('form', { name: 'Mensajes' });
  await famChat.getByPlaceholder('Escribe un mensaje…').fill('Hola Rosa, Sofía cena a las 7.');
  await famChat.getByRole('button', { name: 'Enviar' }).click();
  await expect(fam.locator('.chat li.mine')).toContainText('Sofía cena a las 7.');

  const cg = await signIn(browser, carerEmail);
  await cg.goto(`${WEB}/es/bookings/${bookingId}`);
  await expect(cg.locator('.chat li.theirs')).toContainText('Sofía cena a las 7.');
  await cg.getByRole('form', { name: 'Mensajes' }).getByPlaceholder('Escribe un mensaje…').fill('Perfecto, gracias.');
  await cg.getByRole('form', { name: 'Mensajes' }).getByRole('button', { name: 'Enviar' }).click();
  await cg.getByRole('button', { name: 'Marcar llegada (ya estoy aquí)' }).click();
  await expect(cg.getByText('En curso').first()).toBeVisible();
  const upd = cg.getByRole('form', { name: 'Enviar una novedad a la familia' });
  await upd.getByRole('textbox').fill('Ya cenó y estamos leyendo un cuento.');
  await upd.getByRole('button', { name: 'Enviar' }).click();
  await expect(cg.locator('.timeline')).toContainText('Ya cenó y estamos leyendo un cuento.');
  await cg.getByRole('button', { name: 'Marcar salida (servicio terminado)' }).click();
  await expect(cg.getByText('Completada').first()).toBeVisible();

  await fam.reload();
  await expect(fam.locator('.chat li.theirs')).toContainText('Perfecto, gracias.');
  await expect(fam.locator('.timeline')).toContainText('El cuidador llegó');
  await expect(fam.locator('.timeline')).toContainText('Ya cenó y estamos leyendo un cuento.');
  await expect(fam.locator('.timeline')).toContainText('Servicio terminado');

  const review = fam.getByRole('form', { name: '¿Qué tal fue el servicio?' });
  await review.getByRole('radio', { name: '5 de 5 estrellas' }).click();
  await review.getByLabel('Comentario (opcional, se verá en el perfil del cuidador)').fill('Puntual y muy cariñosa.');
  await review.getByRole('button', { name: 'Publicar reseña' }).click();
  await expect(fam.getByRole('heading', { name: 'Tu reseña' })).toBeVisible();

  await fam.getByRole('button', { name: 'Reportar un problema' }).click();
  const report = fam.getByRole('form', { name: 'Reportar un problema' });
  await report.getByLabel('¿Qué tan grave es?').selectOption('emergency');
  await expect(fam.getByText('Llama al 911 ahora si alguien está en peligro inmediato.')).toBeVisible();
  await expect(fam.getByText('1-800-962-2873')).toBeVisible();
  await report.getByLabel('¿Qué pasó?').fill('Sofía se cayó en el parque y se golpeó la rodilla.');
  await report.getByRole('button', { name: 'Enviar reporte' }).click();
  await expect(fam.getByText('Reporte enviado.')).toBeVisible();

  // Public profile shows the review
  await fam.goto(`${WEB}/es/caregivers/${publicId}`);
  await expect(fam.getByText('Puntual y muy cariñosa.')).toBeVisible();
  await expect(fam.getByText('★ 5 · 1 reseñas')).toBeVisible();

  // Trust & Safety handles the incident
  const ts = await (await browser.newContext()).newPage();
  await ts.goto(`${ADMIN}/es/login`);
  await ts.getByLabel('Correo electrónico').fill(tsEmail);
  await ts.getByLabel('Contraseña').fill(tsPw);
  await ts.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(ts).toHaveURL(/\/es\/caregivers/);
  await ts.getByRole('link', { name: 'Incidentes' }).click();
  const row = ts.getByRole('row', { name: new RegExp(`Reserva n.º ${bookingId}`) });
  await expect(row.getByText('Emergencia')).toBeVisible();
  await row.getByRole('link').click();
  await expect(ts.getByText('Sofía se cayó en el parque y se golpeó la rodilla.')).toBeVisible();
  await ts.getByLabel('Nota (obligatoria, se guarda cifrada)').fill('Hablamos con la familia: rasguño leve, sin atención médica.');
  await ts.getByRole('button', { name: 'Guardar' }).click();
  await expect(ts.getByText('Incidente actualizado')).toBeVisible();
  await expect(ts.getByText('En investigación').first()).toBeVisible();
});
