import { test, expect } from '@playwright/test';
import { openApp, startTarget } from './helpers.js';

// Reference material to bring into a session — a simple user-story brief, a
// test strategy, and a "shall" requirement spec — surfaced as three buttons
// under the Hints panel. Unlike everything else there, this content never
// changes as the tester works, so these tests are only about the buttons
// showing, hiding and swapping it.

const storiesBtn = '#user-stories-btn';
const strategyBtn = '#test-strategy-btn';
const requirementsBtn = '#requirements-btn';
const content = '#guidance-content';

test.describe('guidance', () => {
  test('is reachable but closed before anything is clicked', async ({ page }) => {
    await openApp(page);
    await startTarget(page);

    await expect(page.locator(storiesBtn)).toBeVisible();
    await expect(page.locator(strategyBtn)).toBeVisible();
    await expect(page.locator(requirementsBtn)).toBeVisible();
    await expect(page.locator(content)).toBeHidden();
  });

  test('opens the user stories', async ({ page }) => {
    await openApp(page);
    await startTarget(page);

    await page.locator(storiesBtn).click();
    await expect(page.locator(content)).toBeVisible();
    await expect(page.locator(content)).toContainText('User stories for E-Primer');
    await expect(page.locator(content)).toContainText('As a writer');
    await expect(page.locator(storiesBtn)).toHaveAttribute('aria-expanded', 'true');
  });

  test('opens the test strategy, with its risks and approach', async ({ page }) => {
    await openApp(page);
    await startTarget(page);

    await page.locator(strategyBtn).click();
    await expect(page.locator(content)).toBeVisible();
    await expect(page.locator(content)).toContainText('Test strategy for E-Primer');
    await expect(page.locator(content)).toContainText('What are the key potential risks?');
    await expect(page.locator(content)).toContainText(
      'How could we test the product so as to evaluate the actual risks associated with it?'
    );
    await expect(page.locator(strategyBtn)).toHaveAttribute('aria-expanded', 'true');
  });

  test('opens the requirements, as "shall" statements', async ({ page }) => {
    await openApp(page);
    await startTarget(page);

    await page.locator(requirementsBtn).click();
    await expect(page.locator(content)).toBeVisible();
    await expect(page.locator(content)).toContainText('Requirements for E-Primer');
    await expect(page.locator(content)).toContainText('shall');
    await expect(page.locator(requirementsBtn)).toHaveAttribute('aria-expanded', 'true');
  });

  test('clicking the open button again closes it', async ({ page }) => {
    await openApp(page);
    await startTarget(page);

    await page.locator(storiesBtn).click();
    await expect(page.locator(content)).toBeVisible();
    await page.locator(storiesBtn).click();
    await expect(page.locator(content)).toBeHidden();
    await expect(page.locator(storiesBtn)).toHaveAttribute('aria-expanded', 'false');
  });

  test('switches content instead of stacking it', async ({ page }) => {
    await openApp(page);
    await startTarget(page);

    await page.locator(storiesBtn).click();
    await page.locator(strategyBtn).click();

    await expect(page.locator(content)).toContainText('Test strategy for E-Primer');
    await expect(page.locator(content)).not.toContainText('User stories for E-Primer');
    await expect(page.locator(storiesBtn)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator(strategyBtn)).toHaveAttribute('aria-expanded', 'true');

    await page.locator(requirementsBtn).click();
    await expect(page.locator(content)).toContainText('Requirements for E-Primer');
    await expect(page.locator(content)).not.toContainText('Test strategy for E-Primer');
    await expect(page.locator(strategyBtn)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator(requirementsBtn)).toHaveAttribute('aria-expanded', 'true');
  });
});
