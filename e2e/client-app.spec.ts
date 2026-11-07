import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'correct-horse-battery-1';
const unique = (tag: string, info: { project: { name: string } }) =>
  `${tag}.${info.project.name}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.com`;

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'page should not scroll sideways').toBeLessThanOrEqual(0);
}

test.describe('public home', () => {
  test('redirects / to the visitor language', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'es-US', extraHTTPHeaders: { 'accept-language': 'es-US,es;q=0.9' } });
    const page = await ctx.newPage();
    await page.goto('http://localhost:3100/');
    await expect(page).toHaveURL(/\/es$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await ctx.close();
  });

  test('renders in English and switches to Spanish on the same page', async ({ page }) => {
    await page.goto('/en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trusted care for the ones you love');
    await expect(page.getByText('no screening can guarantee safety').first()).toBeVisible();
    await noHorizontalScroll(page);
    await page.getByRole('button', { name: 'Español' }).click();
    await expect(page).toHaveURL(/\/es$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cuidado de confianza para quienes más quieres');
    await noHorizontalScroll(page);
  });
});

test.describe('client account', () => {
  test('validates the sign-up form in Spanish', async ({ page }) => {
    await page.goto('/es/signup');
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page.getByText('Este campo es obligatorio.')).toBeVisible();
    await expect(page.getByText('Escribe un correo válido.')).toBeVisible();
    await expect(page.getByText('Usa al menos 12 caracteres.')).toBeVisible();
    await expect(page.getByText('Debes aceptar los términos para continuar.')).toBeVisible();
  });

  test('signs up, sees the account, signs out and signs back in', async ({ page }, info) => {
    const email = unique('family', info);
    await page.goto('/en/signup?role=client');
    await page.getByLabel('Full name').fill('Ana López');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByText('I agree to the Terms of Service').click();
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/en\/account$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hello, Ana');
    await expect(page.getByRole('link', { name: 'My account' })).toBeVisible();
    await noHorizontalScroll(page);

    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();

    await page.goto('/en/account');
    await expect(page).toHaveURL(/\/en\/signin$/);

    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('wrong-password-123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('form [role="alert"]')).toHaveText('Incorrect email or password.');

    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/en\/account$/);
  });

  test('shows a localized error for an existing email', async ({ page }, info) => {
    const email = unique('dup', info);
    for (let i = 0; i < 2; i++) {
      await page.context().clearCookies();
      await page.goto('/es/signup');
      await page.getByLabel('Nombre completo').fill('Luis Pérez');
      await page.getByLabel('Correo electrónico').fill(email);
      await page.getByLabel('Contraseña').fill(PASSWORD);
      await page.getByText('Acepto los Términos').click();
      await page.getByRole('button', { name: 'Crear cuenta' }).click();
      if (i === 0) await expect(page).toHaveURL(/\/es\/account$/);
    }
    await expect(page.locator('form [role="alert"]')).toHaveText('Ya existe una cuenta con este correo.');
  });
});

test.describe('caregiver account', () => {
  test('applies and sees an approval tracker with booking blocked', async ({ page }, info) => {
    await page.goto('/es/signup?role=caregiver');
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page.getByText('Elige al menos una opción.')).toBeVisible();

    await page.getByText('NURIVA Pets').click();
    await page.getByLabel('Nombre completo').fill('María Rodríguez');
    await page.getByLabel('Correo electrónico').fill(unique('carer', info));
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByText('Acepto los Términos').click();
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    await expect(page).toHaveURL(/\/es\/account$/);
    await expect(page.getByRole('heading', { name: 'Tu progreso de aprobación' })).toBeVisible();
    const steps = page.locator('.n-step');
    await expect(steps).toHaveCount(6);
    await expect(steps.filter({ hasText: 'Sin empezar' })).toHaveCount(6);
    await expect(page.getByText('Podrás aceptar reservas cuando completes todos los pasos.')).toBeVisible();
    await noHorizontalScroll(page);
  });
});
