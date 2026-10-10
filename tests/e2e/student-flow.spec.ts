import { expect, test } from '@playwright/test';

import { MockBackend } from './fixtures/mock-backend';

/**
 * Student journey with a controlled payment setup: Razorpay Checkout is
 * replaced by a stub and the backend by an in-memory mock, so no real
 * payment can occur. Server-side verification itself is tested in
 * supabase/tests/edge-functions.test.ts against real Postgres.
 */
test.describe('student ordering flow', () => {
  let backend: MockBackend;

  test.beforeEach(async ({ page }) => {
    backend = new MockBackend();
    await backend.install(page);
  });

  test('browse, customise, pay and receive a digital receipt', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Good food\.\s*Less waiting\./ })).toBeVisible();
    await expect(page.getByText(/Open for orders/)).toBeVisible();

    await page.getByRole('link', { name: 'Browse the menu' }).click();
    await expect(page).toHaveURL(/\/menu$/);

    // Search and filter.
    await page.getByRole('searchbox', { name: 'Search the menu' }).fill('dosa');
    await expect(page.getByRole('article', { name: 'Masala Dosa' })).toBeVisible();
    await expect(page.getByRole('article', { name: 'Masala Chai' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear search' }).click();

    // Sold-out items are visible but cannot be added.
    await expect(page.getByRole('button', { name: 'Aloo Paratha is sold out' })).toBeDisabled();

    // Customise a dosa: butter roast (+₹10), two portions → ₹160.
    await page.getByRole('article', { name: 'Masala Dosa' }).getByRole('button', { name: /^Add/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Butter roast').check();
    await dialog.getByRole('button', { name: 'Increase quantity of Masala Dosa' }).click();
    await dialog.getByRole('button', { name: /Add 2 · ₹160/ }).click();

    // A plain item with the inline stepper.
    await page.getByRole('button', { name: 'Add Masala Chai to cart' }).click();

    // The cart persists across reloads.
    await page.reload();
    await page
      .getByRole('button', { name: /Open cart, 3 items/ })
      .first()
      .click();
    const drawer = page.getByRole('dialog', { name: 'Your order' });
    await expect(drawer.getByText('Butter roast (+₹10)')).toBeVisible();
    await expect(drawer.getByText('₹175', { exact: true })).toBeVisible();
    await drawer.getByRole('link', { name: /Review & checkout/ }).click();

    // Checkout shows the server-confirmed total and test mode.
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByText(/Test mode\./)).toBeVisible();
    await expect(page.getByText(/Prices confirmed by the canteen’s server/)).toBeVisible();

    // Validation: name and terms are required.
    await page.getByRole('button', { name: 'Pay ₹175' }).click();
    await expect(page.getByText('Please enter at least 2 characters.')).toBeVisible();
    await expect(page.getByText('Please accept the ordering terms to continue.')).toBeVisible();
    expect(backend.calls).not.toContain('create-payment-order');

    await page.getByLabel('Name for pickup').fill('Priya');
    await page.getByRole('checkbox', { name: /I agree to the/ }).check();
    await page.getByRole('button', { name: 'Pay ₹175' }).click();

    // Receipt after (mock) server verification.
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
    const receipt = page.getByRole('article', { name: /Receipt for order CT-20261010-\d{4}/ });
    await expect(receipt).toBeVisible();
    await expect(receipt.locator('header').getByText('Paid', { exact: true })).toBeVisible();
    await expect(receipt.getByText('Priya')).toBeVisible();
    await expect(receipt.getByText('pay_E2E', { exact: false })).toBeVisible();
    await expect(receipt.getByRole('img', { name: /Order CT-/ })).toBeVisible(); // QR code
    await expect(page.getByRole('button', { name: 'Print' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save PDF' })).toBeVisible();
    expect(backend.calls).toEqual(['create-payment-order', 'verify-payment']);

    // The receipt survives a refresh and the cart was cleared.
    await page.reload();
    await expect(page.getByRole('article', { name: /Receipt for order/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open cart (empty)' }).first()).toBeVisible();

    // Live status updates arrive without a reload.
    const order = backend.orders[0]!;
    order.status = 'ready';
    order.history.push({ status: 'ready', at: new Date().toISOString() });
    backend.broadcastOrder(order);
    await expect(page.getByText('Your order is ready for pickup!')).toBeVisible();

    // My Orders lists it.
    await page.getByRole('link', { name: 'My Orders' }).first().click();
    await expect(page.getByRole('link', { name: new RegExp(order.order_number) })).toBeVisible();
  });

  test('explains when ordering is paused and blocks checkout', async ({ page }) => {
    backend.orderingOpen = false;
    await page.goto('/menu');
    await expect(page.getByText('Ordering is paused')).toBeVisible();
    await page.getByRole('button', { name: 'Add Masala Chai to cart' }).click();
    await page.goto('/checkout');
    await expect(page.getByText('Back in 15 minutes').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Pay/ })).toBeDisabled();
  });

  test('shows an explicit message when payments are not configured', async ({ page }) => {
    backend.paymentsConfigured = false;
    await page.goto('/menu');
    await page.getByRole('button', { name: 'Add Masala Chai to cart' }).click();
    await page.goto('/checkout');
    await expect(page.getByText('Online payments aren’t set up yet')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Pay/ })).toBeDisabled();
    expect(backend.calls).toEqual([]);
  });

  test('does not show another student’s order', async ({ page }) => {
    const order = backend.addPaidOrder('Someone Else');
    await page.goto(`/orders/${order.id}`);
    await expect(page.getByRole('heading', { name: 'Order not found' })).toBeVisible();
    await expect(page.getByText('Someone Else')).toHaveCount(0);
  });
});
