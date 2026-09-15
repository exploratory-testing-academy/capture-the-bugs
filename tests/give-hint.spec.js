import { test, expect } from '@playwright/test';
import { openApp, startTarget, submitInput } from './helpers.js';

// The button's only source of randomness is Math.random (session codes use
// crypto.getRandomValues instead, so this override cannot touch those).
// Pinning it makes which branch fires, and which pool index gets picked,
// fully deterministic instead of asserting on "one of many possible values".
async function pinRandom(page, value) {
  await page.addInitScript((v) => { Math.random = () => v; }, value);
}

const btn = '#give-hint-btn';
const result = '#give-hint-result';
const kind = '#give-hint-result .give-hint-kind';

test.describe('give me one', () => {
  test('is reachable next to the Hints title before anything is clicked', async ({ page }) => {
    await openApp(page);
    await startTarget(page);

    await expect(page.locator(btn)).toBeVisible();
    await expect(page.locator(result)).toBeHidden();
  });

  test('a low draw names the first untried input class', async ({ page }) => {
    // 0 < 0.5 picks the input branch, and floor(0 * poolLength) picks index 0.
    await pinRandom(page, 0);
    await openApp(page);
    await startTarget(page);

    await page.locator(btn).click();
    await expect(page.locator(kind)).toHaveText('Input');
    await expect(page.locator(result)).toContainText('Empty input');
  });

  test('a high draw names a bug category, never a bug title', async ({ page }) => {
    // 0.999 fails the < 0.5 check (bug branch) and floor(0.999 * 72) lands on
    // the answer key's last entry, category "Code Quality".
    await pinRandom(page, 0.999);
    await openApp(page);
    await startTarget(page);

    await page.locator(btn).click();
    await expect(page.locator(kind)).toHaveText('Bug category');
    await expect(page.locator(result)).toContainText('Code Quality');
    // The answer key's matching text must never leak through this shortcut.
    await expect(page.locator(result)).not.toContainText('charset');
  });

  test('skips an input class already covered in favor of the next untried one', async ({ page }) => {
    await pinRandom(page, 0);
    await openApp(page);
    await startTarget(page);
    // Covers the 'empty' class, which sorts first — without the skip, index 0
    // would still land there.
    await submitInput(page, '');

    await page.locator(btn).click();
    await expect(page.locator(kind)).toHaveText('Input');
    await expect(page.locator(result)).not.toContainText('Empty input');
    await expect(page.locator(result)).toContainText('Plain text, no to-be forms');
  });

  test('re-clicking replaces the previous pick rather than stacking', async ({ page }) => {
    await pinRandom(page, 0);
    await openApp(page);
    await startTarget(page);

    await page.locator(btn).click();
    await page.locator(btn).click();
    await expect(page.locator(result)).toHaveCount(1);
    await expect(page.locator(kind)).toHaveCount(1);
  });

  test('reset hides a revealed hint along with everything else', async ({ page }) => {
    await pinRandom(page, 0);
    await openApp(page);
    await startTarget(page);
    await submitInput(page, 'first\nsecond');

    await page.locator(btn).click();
    await expect(page.locator(result)).toBeVisible();

    await page.locator('#cov-reset').click();
    await expect(page.locator(result)).toBeHidden();
  });
});
