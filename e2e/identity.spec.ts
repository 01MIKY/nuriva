import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

const ADMIN = 'http://localhost:3200';
const DB = process.env.TEST_DATABASE_URL ?? 'postgres://nuriva_dev:nuriva_dev_local_only@localhost:5432/nuriva_test';
test.skip(({ isMobile }) => isMobile, 'Identity journey runs once, on desktop');

test('a caregiver starts identity verification with Stripe (ES); staff see the status next to the Identity step', async ({ page, browser }) => {
  const run = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  await page.goto('/es');
  const reg = await page.request.post('/api/v1/auth/register', { data: { role: 'caregiver', divisions: ['kids'], email: `idv.${run}@example.com`, name: `Lucía Idv${run}`, password: 'correct-horse-battery-1', acceptTerms: true, locale: 'es' } });
  const carerId = (await reg.json()).user.id;
  await page.goto('/es/account');
  await page.getByRole('link', { name: 'Verificación de identidad' }).click();
  await expect(page.getByText('NURIVA nunca recibe tus documentos ni tus fotos')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sin empezar' })).toBeVisible();

  // The fake provider stands in for Stripe: capture the redirect to the hosted page.
  await page.route('https://verify.stripe.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Stripe Identity (test double)</h1>' }));
  await page.getByRole('button', { name: 'Verificar mi identidad' }).click();
  await expect(page).toHaveURL(/verify\.stripe\.test\/start\/vs_fake_/);
  await page.goto('/es/care/identity?return=1');
  await expect(page.getByText('Estamos comprobando el resultado con Stripe.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar la verificación' })).toBeVisible();

  // Staff see the Stripe status beside the Identity step; it does not approve anything by itself.
  const out = execFileSync('pnpm', ['--silent', '--filter', '@nuriva/api', 'create-staff', '--email', `ops.idv.${run}@nuriva.test`, '--name', 'Ops Idv', '--roles', 'operations'],
    { env: { ...process.env, DATABASE_URL: DB }, encoding: 'utf8' });
  const staff = await (await browser.newContext()).newPage();
  await staff.goto(`${ADMIN}/es/login`);
  await staff.getByLabel('Correo electrónico').fill(`ops.idv.${run}@nuriva.test`);
  await staff.getByLabel('Contraseña').fill(out.match(/shown once\): (\S+)/)![1]!);
  await staff.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(staff).toHaveURL(/\/es\/caregivers/); // wait for sign-in to finish before navigating
  await staff.goto(`${ADMIN}/es/caregivers/${carerId}`);
  const row = staff.locator('.vet-row', { hasText: 'Identidad' });
  await expect(row.getByText('Stripe Identity: Falta un paso')).toBeVisible();
  await expect(row.getByText('Sin empezar')).toBeVisible();
  await expect(staff.getByRole('button', { name: 'Usar como evidencia' })).toHaveCount(0); // only once Stripe says verified
});
