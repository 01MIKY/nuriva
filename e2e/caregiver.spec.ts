import { expect, test } from '@playwright/test';

test('caregiver completes the application profile (EN)', async ({ page }, info) => {
  await page.goto('/en/signup?role=caregiver');
  await page.getByText('NURIVA Kids').click();
  await page.getByLabel('Full name').fill('María Rodríguez');
  await page.getByLabel('Email').fill(`carer.profile.${info.project.name}.${Date.now()}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery-1');
  await page.getByText('I agree to the Terms of Service').click();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/en\/account$/);

  await expect(page.getByRole('heading', { name: 'To finish your application' })).toBeVisible();
  await page.getByRole('link', { name: 'Edit my profile' }).click();
  await expect(page).toHaveURL(/\/en\/care\/profile$/);

  const form = page.getByRole('form', { name: 'My caregiver profile' });
  // Client-side validation
  await form.getByLabel('Hourly rate (USD)').fill('9');
  await form.getByRole('button', { name: 'Save profile' }).click();
  await expect(form.getByText('Enter a rate between $15 and $200.')).toBeVisible();
  await expect(form.getByText('Use at least 10 characters.')).toBeVisible();
  await expect(form.getByText('Enter a 5-digit ZIP code.')).toBeVisible();

  // Adding Pets reveals pet services
  await form.getByText('NURIVA Pets').click();
  await form.getByRole('button', { name: 'Dog walking' }).click();
  await expect(form.getByRole('button', { name: 'Dog walking' })).toHaveAttribute('aria-pressed', 'true');
  await form.getByRole('button', { name: 'Date night' }).click();
  await form.getByRole('button', { name: 'Spanish' }).click();
  await form.getByLabel('Hourly rate (USD)').fill('26');
  await form.getByLabel('Years of experience').fill('6');
  await form.getByLabel('Headline').fill('Bilingual nanny and dog lover');
  await form.getByLabel('About me').fill('Early-childhood educator with six years caring for kids aged 2 to 10, and a calm walker for dogs of every size.');
  await form.getByLabel('ZIP code').fill('33131');
  await form.getByRole('button', { name: 'Save profile' }).click();

  await expect(page.getByText('Profile saved')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Application complete' })).toBeVisible();

  // Persisted, and the approval tracker still shows nothing approved (NURIVA controls vetting)
  await page.reload();
  await expect(page.getByLabel('Headline')).toHaveValue('Bilingual nanny and dog lover');
  await page.goto('/en/account');
  await expect(page.getByRole('heading', { name: 'Application complete' })).toBeVisible();
  await expect(page.locator('.n-step').filter({ hasText: 'Not started' })).toHaveCount(6);
});

test('clients are sent away from the caregiver profile', async ({ page }, info) => {
  await page.goto('/en/signup?role=client');
  await page.getByLabel('Full name').fill('Luis Pérez');
  await page.getByLabel('Email').fill(`client.care.${info.project.name}.${Date.now()}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery-1');
  await page.getByText('I agree to the Terms of Service').click();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/en\/account$/);
  await page.goto('/en/care/profile');
  await expect(page).toHaveURL(/\/en\/account$/);
});
