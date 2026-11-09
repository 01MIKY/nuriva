import { expect, test } from '@playwright/test';

test.skip(({ isMobile }) => isMobile, 'Payout setup runs once, on desktop');

test('a caregiver starts payout setup and is sent to the Stripe-hosted onboarding (ES)', async ({ page }) => {
  const run = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  await page.goto('/es');
  const reg = await page.request.post('/api/v1/auth/register', { data: { role: 'caregiver', divisions: ['pets'], email: `payout.${run}@example.com`, name: 'Andrés Pérez', password: 'correct-horse-battery-1', acceptTerms: true, locale: 'es' } });
  expect(reg.status()).toBe(201);
  await page.goto('/es/account');
  await page.getByRole('link', { name: 'Cobros' }).click();
  await expect(page).toHaveURL(/\/es\/care\/payouts$/);
  await expect(page.getByRole('heading', { name: 'Aún no has configurado tus cobros' })).toBeVisible();
  await expect(page.getByText('nunca los ve ni los guarda')).toBeVisible();

  // The fake provider stands in for Stripe in tests: capture the redirect instead of leaving the app.
  await page.route('https://connect.stripe.test/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Stripe onboarding (test double)</h1>' }));
  await page.getByRole('button', { name: 'Configurar cobros con Stripe' }).click();
  await expect(page).toHaveURL(/connect\.stripe\.test\/onboarding\/acct_fake_/);
  expect(decodeURIComponent(page.url())).toContain('http://localhost:3100/es/care/payouts?return=1');

  await page.goto('/es/care/payouts?return=1');
  await expect(page.getByText('Bienvenido de nuevo. Hemos comprobado tu cuenta con Stripe.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Stripe necesita más información' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar en Stripe' })).toBeVisible();
});
