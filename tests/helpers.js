import { expect } from '@playwright/test';

export const TARGET_ID = 'eprimer';
export const FRAME = '#target-frame';
export const INPUT = '#inputtext';
export const CHECK = '#CheckForEPrimeButton';

// The capture layer debounces typing; waiting slightly longer than that makes
// the "value was typed" path deterministic without polling internals.
export const DEBOUNCE_MS = 400;

// Open the app with a clean slate. Storage has to be cleared *before* the app
// boots, otherwise restored inputs from a previous test leak into this one.
export async function openApp(page, { hints = null } = {}) {
  await page.goto('/index.html');
  await page.evaluate(() => localStorage.clear());
  const query = hints ? `?hints=${hints}` : '';
  await page.goto(`/index.html${query}`);
  await expect(page.locator('#target-list .target-card')).toHaveCount(1);
}

export async function startTarget(page) {
  await page.locator('.target-card').first().click();
  await expect(page.locator('#explore')).toHaveClass(/active/);
  // The strip only renders once the target module has loaded.
  await expect(page.locator('#coverage-live')).toBeVisible();
  await expect(page.frameLocator(FRAME).locator(INPUT)).toBeVisible();
  // A visible textarea does not mean capture is attached yet — attachment is
  // asynchronous, and typing before it lands would go unrecorded.
  await expect.poll(() => page.evaluate(() => window.__ctb.capturing()))
    .toBe(true);
}

// Type into the target app without submitting.
export async function typeInput(page, text) {
  await page.frameLocator(FRAME).locator(INPUT).fill(text);
  await page.waitForTimeout(DEBOUNCE_MS + 150);
}

// Type into the target app and click its Check button.
export async function submitInput(page, text) {
  const frame = page.frameLocator(FRAME);
  await frame.locator(INPUT).fill(text);
  await frame.locator(CHECK).click();
}

export const captured = (page) => page.evaluate(() => window.__ctb.inputs());

// computeCoverage output, trimmed to what assertions need (the full object
// carries every captured entry per class).
export const coverage = (page) => page.evaluate(() => {
  const cov = window.__ctb.coverage();
  return {
    coveredCount: cov.coveredCount,
    totalCount: cov.totalCount,
    percent: cov.percent,
    covered: cov.covered.map(c => c.id),
    typedOnly: cov.typedOnly.map(c => c.id),
    missed: cov.missed.map(c => c.id)
  };
});
