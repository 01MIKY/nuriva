import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';

/** Minimal RFC 6238 generator — plays the role of the user's authenticator app. */
function totpNow(secretB32: string, offset = 0): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const bytes: number[] = [];
  for (const ch of secretB32.replace(/\s/g, '')) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const h = createHmac('sha1', Buffer.from(bytes)).update(msg).digest();
  const o = h[h.length - 1]! & 15;
  const bin = ((h[o]! & 127) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(bin % 1_000_000).padStart(6, '0');
}

const ADMIN = 'http://localhost:3200';
const DB = process.env.TEST_DATABASE_URL ?? 'postgres://nuriva_dev:nuriva_dev_local_only@localhost:5432/nuriva_test';
const PASSWORD = 'correct-horse-battery-1';
const run = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

test.skip(({ isMobile }) => isMobile, 'MFA journeys run once, on desktop');

async function enrol(page: Page, confirmName: string): Promise<{ secret: string; recovery: string[] }> {
  await page.getByRole('button', { name: /two-step verification|verificación en dos pasos/i }).first().click();
  await expect(page.locator('.n-mfa-qr svg')).toBeVisible();
  const secret = (await page.locator('.n-mfa-secret').innerText()).replace(/\s/g, '');
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  const form = page.getByRole('form', { name: confirmName });
  await form.getByRole('textbox').fill('123');
  await form.getByRole('button').last().click();
  await expect(page.getByRole('alert').filter({ hasText: /6 digits|6 dígitos/ })).toBeVisible();
  await form.getByRole('textbox').fill(totpNow(secret));
  await form.getByRole('button').last().click();
  const codesRegion = page.getByRole('region', { name: /recovery codes|códigos de recuperación/i });
  await expect(codesRegion.locator('code')).toHaveCount(10);
  const recovery = await codesRegion.locator('code').allInnerTexts();
  return { secret, recovery };
}

test('a family turns on two-step verification and signs in with a code or a recovery code (EN)', async ({ page }) => {
  const email = `mfa.family.${run}@example.com`;
  await page.goto('/en/signup?role=client');
  await page.getByLabel('Full name').fill('Ana López');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByText('I agree to the Terms of Service').click();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/en\/account$/);

  await page.getByRole('link', { name: 'Security' }).last().click();
  await expect(page).toHaveURL(/\/en\/account\/security$/);
  await expect(page.getByText('Off', { exact: true })).toBeVisible();
  const { secret, recovery } = await enrol(page, 'Confirm');
  await page.getByRole('button', { name: 'I have saved them' }).click();
  await expect(page.getByText('Two-step verification is on.')).toBeVisible();
  await expect(page.getByText('Recovery codes left: 10')).toBeVisible();

  // Sign out, then sign in: password → code
  await page.goto('/en/account');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  // Wait until the session is really closed; otherwise /signin correctly sends a signed-in user to the account.
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await page.goto('/en/signin');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Enter your verification code' })).toBeVisible();
  await page.getByLabel('6-digit code').fill('000000');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText('That code is not valid.')).toBeVisible();
  await page.getByLabel('6-digit code').fill(totpNow(secret, 1)); // the current code was spent on enrolment
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/en\/account$/);

  // Sign out, then sign in with a recovery code
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  // Wait until the session is really closed; otherwise /signin correctly sends a signed-in user to the account.
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await page.goto('/en/signin');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Use a recovery code instead' }).click();
  await page.getByLabel('Recovery code').fill(recovery[0]!);
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/en\/account$/);
  await page.goto('/en/account/security');
  await expect(page.getByText('Recovery codes left: 9')).toBeVisible();
});

test('a staff member enrols in the admin panel and then needs a code to sign in (ES)', async ({ browser }) => {
  const email = `mfa.staff.${run}@nuriva.test`;
  const out = execFileSync('pnpm', ['--silent', '--filter', '@nuriva/api', 'create-staff', '--email', email, '--name', 'Staff MFA', '--roles', 'support'],
    { env: { ...process.env, DATABASE_URL: DB }, encoding: 'utf8' });
  const pw = out.match(/Temporary password \(shown once\): (\S+)/)![1]!;
  const page = await (await browser.newContext()).newPage();
  const login = async () => {
    await page.goto(`${ADMIN}/es/login`);
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña').fill(pw);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  };
  await login();
  await expect(page).toHaveURL(/\/es\/caregivers/);
  await page.getByRole('link', { name: 'Seguridad' }).click();
  const { secret } = await enrol(page, 'Confirmar');
  await page.getByRole('button', { name: 'Ya los guardé' }).click();
  await expect(page.getByText('La verificación en dos pasos está activada.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Desactivar' })).toHaveCount(0); // staff can never turn it off

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await login();
  await expect(page.getByRole('heading', { name: 'Introduce tu código de verificación' })).toBeVisible();
  await page.getByLabel('Código de 6 dígitos').fill(totpNow(secret, 1));
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page).toHaveURL(/\/es\/caregivers/);
});
