import { expect, test, type Page } from '@playwright/test';

import { ADMIN, MockBackend, UNPRIVILEGED } from './fixtures/mock-backend';

test.describe('admin panel', () => {
  let backend: MockBackend;

  test.beforeEach(async ({ page }) => {
    backend = new MockBackend();
    await backend.install(page);
  });

  async function signIn(page: Page, email: string, password: string) {
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
  }

  test('requires signing in and rejects wrong credentials', async ({ page }) => {
    await page.goto('/admin/queue');
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fqueue/);
    await expect(page.getByText(/There is no public sign-up/)).toBeVisible();

    await signIn(page, ADMIN.email, 'wrong-password');
    await expect(page.getByText('Incorrect email or password.')).toBeVisible();
  });

  test('refuses accounts without a staff role', async ({ page }) => {
    await page.goto('/admin/login');
    await signIn(page, UNPRIVILEGED.email, UNPRIVILEGED.password);
    await expect(page.getByText('This account isn’t authorised')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Live queue' })).toHaveCount(0);
  });

  test('processes paid orders through the live queue', async ({ page }) => {
    const first = backend.addPaidOrder('Kabir');
    await page.goto('/admin/login?next=%2Fadmin%2Fqueue');
    await signIn(page, ADMIN.email, ADMIN.password);
    await expect(page).toHaveURL(/\/admin\/queue$/);
    await expect(page.getByRole('status').filter({ hasText: 'Live' })).toBeVisible();

    const newColumn = page.getByRole('region', { name: /New \/ confirmed/ });
    const firstCard = newColumn.getByRole('article', { name: new RegExp(first.order_number) });
    await expect(firstCard).toBeVisible();
    await expect(firstCard.getByText('Paid · verified')).toBeVisible();

    // A new order arrives over Realtime and is highlighted.
    const second = backend.addPaidOrder('Rohan');
    await expect(page.getByText(`New order ${second.order_number}`)).toBeVisible();
    await expect(
      newColumn.getByRole('article', { name: new RegExp(`${second.order_number}, new`) }),
    ).toBeVisible();

    // Move the first order through the workflow.
    await firstCard.getByRole('button', { name: 'Start preparing' }).click();
    const preparing = page.getByRole('region', { name: 'Preparing' });
    const preparingCard = preparing.getByRole('article', { name: new RegExp(first.order_number) });
    await expect(preparingCard).toBeVisible();
    await preparingCard.getByRole('button', { name: 'Mark ready' }).click();
    const ready = page.getByRole('region', { name: 'Ready for pickup' });
    await ready
      .getByRole('article', { name: new RegExp(first.order_number) })
      .getByRole('button', { name: 'Complete pickup' })
      .click();
    await expect(
      page
        .getByRole('region', { name: 'Completed' })
        .getByRole('article', { name: new RegExp(first.order_number) }),
    ).toBeVisible();
    expect(backend.orders.find((order) => order.id === first.id)?.status).toBe('completed');
  });

  test('shows dashboard figures from verified payments', async ({ page }) => {
    backend.addPaidOrder('Kabir');
    await page.goto('/admin/login');
    await signIn(page, ADMIN.email, ADMIN.password);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('Net revenue')).toBeVisible();
    await expect(page.getByText('₹30').first()).toBeVisible();
  });
});
