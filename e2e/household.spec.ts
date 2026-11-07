import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'correct-horse-battery-1';

async function signUpFamily(page: Page, tag: string, project: string) {
  await page.goto('/es/signup?role=client');
  await page.getByLabel('Nombre completo').fill('Ana López');
  await page.getByLabel('Correo electrónico').fill(`${tag}.${project}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@example.com`);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByText('Acepto los Términos').click();
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/es\/account$/);
}

test('family manages children, pets and emergency contact (ES)', async ({ page }, info) => {
  await signUpFamily(page, 'home', info.project.name);
  await page.getByRole('link', { name: 'Gestionar mi hogar' }).click();
  await expect(page).toHaveURL(/\/es\/household$/);
  await expect(page.getByText('Aún no has añadido a nadie')).toBeVisible();

  // Add a child — validation first
  await page.getByRole('button', { name: 'Añadir hijo' }).click();
  const childForm = page.getByRole('form', { name: 'Nuevo hijo' });
  await childForm.getByRole('button', { name: 'Guardar' }).click();
  await expect(childForm.getByText('Este campo es obligatorio.')).toBeVisible();
  await expect(childForm.getByText('Escribe una edad de 0 a 17.')).toBeVisible();
  await childForm.getByLabel('Nombre o apodo').fill('Sofía');
  await childForm.getByLabel('Edad (años)').fill('4');
  await childForm.getByLabel('Alergias (opcional)').fill('Maní');
  await childForm.getByLabel('Indicaciones (opcional)').fill('Duerme a las 8:30');
  await childForm.getByRole('button', { name: 'Guardar' }).click();
  const hijos = page.getByRole('region', { name: 'Hijos' });
  await expect(hijos.getByText('Sofía')).toBeVisible();
  await expect(hijos.getByText('Alergia: Maní')).toBeVisible();

  // Add a pet
  await page.getByRole('button', { name: 'Añadir mascota' }).click();
  const petForm = page.getByRole('form', { name: 'Nueva mascota' });
  await petForm.getByLabel('Nombre o apodo').fill('Luna');
  await petForm.getByLabel('Edad (años)').fill('3');
  await petForm.getByLabel('Tipo de mascota').selectOption('dog');
  await petForm.getByLabel('Raza (opcional)').fill('Golden retriever');
  await petForm.getByRole('button', { name: 'Guardar' }).click();
  const mascotas = page.getByRole('region', { name: 'Mascotas' });
  await expect(mascotas.getByText('Perro · Golden retriever · 3 años')).toBeVisible();

  // Edit the child
  await page.getByRole('button', { name: 'Editar Sofía' }).click();
  const editForm = page.getByRole('form', { name: 'Editar a Sofía' });
  await expect(editForm.getByLabel('Alergias (opcional)')).toHaveValue('Maní');
  await editForm.getByLabel('Edad (años)').fill('5');
  await editForm.getByRole('button', { name: 'Guardar' }).click();
  await expect(hijos.getByText('5 años')).toBeVisible();

  // Remove the pet with confirmation (cancel first, then confirm)
  await page.getByRole('button', { name: 'Quitar Luna' }).click();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(mascotas.getByText('Luna')).toBeVisible();
  await page.getByRole('button', { name: 'Quitar Luna' }).click();
  await page.getByRole('button', { name: 'Sí, quitar' }).click();
  await expect(page.getByRole('region', { name: 'Mascotas' })).toHaveCount(0);

  // Emergency contact
  const ec = page.getByRole('form', { name: 'Contacto de emergencia' });
  await ec.getByLabel('Nombre completo').fill('Carlos López');
  await ec.getByLabel('Teléfono').fill('llámame');
  await ec.getByLabel('Relación').fill('Padre');
  await ec.getByRole('button', { name: 'Guardar' }).click();
  await expect(ec.getByText('Escribe un teléfono válido.')).toBeVisible();
  await ec.getByLabel('Teléfono').fill('(305) 555-0143');
  await ec.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Padre · (305) 555-0143')).toBeVisible();

  // Everything persists after reload, and the account shows the summary
  await page.reload();
  await expect(page.getByText('Sofía')).toBeVisible();
  await expect(page.getByText('Carlos López')).toBeVisible();
  await page.goto('/es/account');
  await expect(page.getByText('1 hijo', { exact: true })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('caregivers and visitors cannot open the household page', async ({ page }) => {
  await page.goto('/en/household');
  await expect(page).toHaveURL(/\/en\/signin$/);
});
