import { execFileSync } from 'node:child_process';
import { expect, test, type Browser, type Page } from '@playwright/test';

const ADMIN = 'http://localhost:3200';
const WEB = 'http://localhost:3100';
const DB = process.env.TEST_DATABASE_URL ?? 'postgres://nuriva_dev:nuriva_dev_local_only@localhost:5432/nuriva_test';
const run = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

/** Staff can only be created with the CLI — exactly what an operator would run. */
function createStaff(email: string, roles: string): string {
  const out = execFileSync('pnpm', ['--silent', '--filter', '@nuriva/api', 'create-staff', '--email', email, '--name', `Staff ${roles}`, '--roles', roles],
    { env: { ...process.env, DATABASE_URL: DB }, encoding: 'utf8' });
  const m = out.match(/Temporary password \(shown once\): (\S+)/);
  if (!m) throw new Error(`create-staff failed: ${out}`);
  return m[1]!;
}

async function staffPage(browser: Browser, email: string, password: string, locale = 'es'): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${ADMIN}/${locale}/login`);
  await page.getByLabel(locale === 'es' ? 'Correo electrónico' : 'Email').fill(email);
  await page.getByLabel(locale === 'es' ? 'Contraseña' : 'Password').fill(password);
  await page.getByRole('button', { name: locale === 'es' ? 'Iniciar sesión' : 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/caregivers`));
  return page;
}

test.describe.configure({ mode: 'serial' });
test.skip(({ isMobile }) => isMobile, 'Admin dashboard flow runs once, on desktop');

test('staff review and approve a caregiver end to end', async ({ browser }) => {
  const opsEmail = `ops.${run}@nuriva.test`;
  const tsEmail = `ts.${run}@nuriva.test`;
  const rootEmail = `root.${run}@nuriva.test`;
  const opsPw = createStaff(opsEmail, 'operations');
  const tsPw = createStaff(tsEmail, 'trust_safety');
  const rootPw = createStaff(rootEmail, 'superadmin');

  // A caregiver applies in the web app and completes the profile
  const cgCtx = await browser.newContext();
  const cg = await cgCtx.newPage();
  const cgEmail = `carer.${run}@example.com`;
  await cg.goto(`${WEB}/es`);
  const reg = await cg.request.post(`${WEB}/api/v1/auth/register`, { data: { role: 'caregiver', divisions: ['kids'], email: cgEmail, name: `Valentina ${run}`, password: 'correct-horse-battery-1', acceptTerms: true, locale: 'es' } });
  expect(reg.status()).toBe(201);
  const prof = await cg.request.put(`${WEB}/api/v1/caregiver/profile`, { data: {
    divisions: ['kids'], headline: 'Niñera bilingüe con experiencia', bio: 'Educadora infantil con seis años cuidando niños de 2 a 10 años en Miami.',
    hourlyRateCents: 2600, yearsExperience: 6, languages: ['es', 'en'], services: ['occasional'], zip: '33131' } });
  expect(prof.status()).toBe(200);

  // Operations: finds the caregiver "in review" and opens the file
  const ops = await staffPage(browser, opsEmail, opsPw);
  await expect(ops.getByRole('link', { name: 'Auditoría' })).toHaveCount(0); // no audit.read for operations
  const row = ops.getByRole('row', { name: new RegExp(`Valentina ${run}`) });
  await expect(row.getByText('Completo')).toBeVisible();
  await expect(row.getByText('0/6')).toBeVisible();
  await row.getByRole('link').click();
  await expect(ops.getByRole('heading', { level: 1 })).toHaveText(`Valentina ${run}`);
  await expect(ops.getByText('Niñera bilingüe con experiencia')).toBeVisible();

  // Evidence is mandatory, and background is restricted for operations
  await ops.getByRole('button', { name: 'Actualizar: Identidad' }).click();
  const idForm = ops.getByRole('form', { name: 'Actualizar: Identidad' });
  await idForm.getByLabel('Nuevo estado').selectOption('passed');
  await idForm.getByRole('button', { name: 'Guardar paso' }).click();
  await expect(ops.getByText('Revisa los campos marcados.')).toBeVisible();
  await idForm.getByLabel('Referencia de evidencia').fill('Stripe Identity sandbox vs_test_123');
  await idForm.getByRole('button', { name: 'Guardar paso' }).click();
  await expect(ops.getByText('Paso actualizado')).toBeVisible();
  await expect(ops.locator('.vet-row', { hasText: 'Identidad' }).getByText('Completado')).toBeVisible();
  await expect(ops.getByText('Solo Trust & Safety puede registrar decisiones de antecedentes.')).toBeVisible();
  await expect(ops.getByRole('button', { name: 'Actualizar: Verificación de antecedentes' })).toHaveCount(0);
  await expect(ops.getByRole('heading', { name: 'Historial de selección' })).toHaveCount(0);

  // Final approval is refused while steps are missing
  await ops.getByRole('button', { name: 'Actualizar: Aprobación final' }).click();
  const finalForm = ops.getByRole('form', { name: 'Actualizar: Aprobación final' });
  await finalForm.getByLabel('Nuevo estado').selectOption('passed');
  await finalForm.getByLabel('Referencia de evidencia').fill('Comité 7 nov');
  await finalForm.getByRole('button', { name: 'Guardar paso' }).click();
  await expect(ops.getByText('Primero deben completarse todos los pasos anteriores.')).toBeVisible();
  await finalForm.getByRole('button', { name: 'Cancelar' }).click();

  // Trust & Safety records the background decision and can read the restricted history
  const ts = await staffPage(browser, tsEmail, tsPw);
  await ts.goto(ops.url());
  await ts.getByRole('button', { name: 'Actualizar: Verificación de antecedentes' }).click();
  const bgForm = ts.getByRole('form', { name: 'Actualizar: Verificación de antecedentes' });
  await bgForm.getByLabel('Nuevo estado').selectOption('passed');
  await bgForm.getByLabel('Referencia de evidencia').fill('Checkr sandbox rpt_e2e_456');
  await bgForm.getByRole('button', { name: 'Guardar paso' }).click();
  await expect(ts.getByText('Paso actualizado')).toBeVisible();
  await ts.getByRole('button', { name: 'Ver historial de selección' }).click();
  await expect(ts.getByText('Checkr sandbox rpt_e2e_456')).toBeVisible();
  await expect(ts.getByText('Stripe Identity sandbox vs_test_123')).toBeVisible();

  // Operations completes the remaining steps and grants final approval
  await ops.reload();
  for (const step of ['Entrevista', 'Formación', 'Acuerdo de cuidador', 'Aprobación final']) {
    await ops.getByRole('button', { name: `Actualizar: ${step}` }).click();
    const f = ops.getByRole('form', { name: `Actualizar: ${step}` });
    await f.getByLabel('Nuevo estado').selectOption('passed');
    await f.getByLabel('Referencia de evidencia').fill(`${step} — registro ${run}`);
    await f.getByRole('button', { name: 'Guardar paso' }).click();
    await expect(ops.locator('.vet-row', { hasText: step }).getByText('Completado')).toBeVisible();
  }
  await ops.goto(`${ADMIN}/es/caregivers?filter=approved`);
  await expect(ops.getByRole('row', { name: new RegExp(`Valentina ${run}`) }).getByText('Aprobado')).toBeVisible();

  // The caregiver now sees every step completed and no booking block
  await cg.goto(`${WEB}/es/account`);
  await expect(cg.locator('.n-step').filter({ hasText: 'Completado' })).toHaveCount(6);
  await expect(cg.getByText('Podrás aceptar reservas cuando completes todos los pasos.')).toHaveCount(0);
  await expect(cg.getByText('Checkr')).toHaveCount(0);

  // Compliance: operations cannot change it; the superadmin activates a service with a reference
  await ops.goto(`${ADMIN}/es/compliance`);
  await expect(ops.getByText('Solo un superadmin puede cambiar la activación de servicios.')).toBeVisible();
  await expect(ops.getByRole('button', { name: 'Activar: Cuidado ocasional' })).toHaveCount(0);
  const root = await staffPage(browser, rootEmail, rootPw, 'en');
  await root.goto(`${ADMIN}/en/compliance`);
  const kids = root.getByRole('region', { name: 'NURIVA Kids' });
  await expect(kids.locator('.comp-row', { hasText: 'Special-needs care' }).getByText('Counsel review recommended')).toBeVisible();
  await kids.getByRole('button', { name: 'Activate: Occasional care' }).click();
  const act = kids.getByRole('form', { name: 'Activate: Occasional care' });
  await act.getByLabel('Compliance reference').fill(`LEGAL-MEMO-${run}`);
  await act.getByRole('button', { name: 'Activate' }).click();
  const occasional = kids.locator('.comp-row', { hasText: 'Occasional care' });
  await expect(occasional.getByText('Active', { exact: true })).toBeVisible();
  await expect(occasional.getByText(`Last change: LEGAL-MEMO-${run}`)).toBeVisible();

  // Audit log (Trust & Safety) shows what happened
  await ts.goto(`${ADMIN}/es/audit`);
  await expect(ts.getByRole('cell', { name: 'vetting.update' }).first()).toBeVisible();
  await expect(ts.getByRole('cell', { name: 'compliance.activate' }).first()).toBeVisible();
  await expect(ts.getByRole('cell', { name: 'screening.read' }).first()).toBeVisible();
});

test('non-staff accounts cannot use the admin panel', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${ADMIN}/en/caregivers`);
  await expect(page).toHaveURL(/\/en\/login$/);
  // A client account signs in on the admin app
  await page.request.post(`${ADMIN}/api/v1/auth/register`, { data: { role: 'client', email: `client.${run}@example.com`, name: 'Client User', password: 'correct-horse-battery-1', acceptTerms: true } });
  await page.goto(`${ADMIN}/en/caregivers`);
  await expect(page).toHaveURL(/\/en\/no-access$/);
  await expect(page.getByText('This account does not have access to the admin panel.')).toBeVisible();
  const api = await page.request.get(`${ADMIN}/api/v1/admin/caregivers`);
  expect(api.status()).toBe(403);
});
