import { test, expect } from '@playwright/test';
import { openApp, startTarget, submitInput, typeInput } from './helpers.js';

// The end-of-run report normally follows a ~30 MB model download, so these
// tests render the coverage block directly. The AI matching is out of scope.
const preview = (page) => page.evaluate(() => window.__ctb.previewCoverage());

test.describe('coverage in the report', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await startTarget(page);
  });

  test('reports the class score alongside the bug score', async ({ page }) => {
    await submitInput(page, "you're late");
    await preview(page);

    const { coveredCount, totalCount } =
      await page.evaluate(() => window.__ctb.coverage());
    await expect(page.locator('#coverage-section')).toBeVisible();
    await expect(page.locator('#score-classes')).toHaveText(String(coveredCount));
    await expect(page.locator('#score-total-classes')).toHaveText(String(totalCount));
  });

  test('groups exercised, typed-only and never-tried classes', async ({ page }) => {
    await submitInput(page, "you're late");
    await typeInput(page, 'Tom & Jerry');
    await preview(page);

    const list = page.locator('#coverage-list');
    await expect(list).toContainText('Exercised');
    await expect(list).toContainText('Typed but not submitted');
    await expect(list).toContainText('Never tried');
  });

  test('shows the inputs that earned each exercised class', async ({ page }) => {
    await submitInput(page, "you're late");
    await preview(page);

    const row = page.locator('#coverage-list details')
      .filter({ hasText: "Contractions ending 're" });
    await row.locator('summary').click();
    await expect(row.locator('.cov-value')).toHaveText("you're late");
  });

  test('offers a copy-pasteable sample for every never-tried class', async ({ page }) => {
    // Regression: the report renders projected class objects, which once
    // dropped sample/sampleNote and left these rows with an empty note.
    await submitInput(page, "you're late");
    await preview(page);

    const { coveredCount, totalCount } =
      await page.evaluate(() => window.__ctb.coverage());
    const missed = page.locator('#coverage-list .cov-missed');
    const count = await missed.count();
    expect(count).toBe(totalCount - coveredCount);

    // Every missed row must offer something actionable, never a blank.
    const copyable = await page.locator('#coverage-list .cov-missed button.cov-copy').count();
    const noted = await page.locator('#coverage-list .cov-missed .cov-sample-note').count();
    expect(copyable + noted).toBe(count);

    const row = missed.filter({ hasText: 'Emoji' });
    await row.locator('summary').click();
    await expect(row.locator('code')).not.toBeEmpty();
  });

  test('explains why an untried class matters', async ({ page }) => {
    await submitInput(page, 'nothing');
    await preview(page);

    const row = page.locator('#coverage-list .cov-missed')
      .filter({ hasText: 'Digits touching letters' });
    await row.locator('summary').click();
    await expect(row).toContainText('7am');
  });

  test('renders captured markup as text, never as live HTML', async ({ page }) => {
    await submitInput(page, '<img src=x onerror=alert(1)><b>bold</b>');
    await preview(page);

    const row = page.locator('#coverage-list details')
      .filter({ hasText: 'HTML tags or script markup' });
    await row.locator('summary').click();

    // The captured value is shown verbatim as text...
    await expect(row.locator('.cov-value')).toContainText('<b>bold</b>');
    // ...and no element from it ends up in the document.
    await expect(page.locator('#coverage-list img')).toHaveCount(0);
    await expect(page.locator('#coverage-list b')).toHaveCount(0);
  });

  test('truncates a very long captured value', async ({ page }) => {
    await submitInput(page, 'x'.repeat(1000));
    await preview(page);

    const row = page.locator('#coverage-list details')
      .filter({ hasText: 'One very long unbroken word' });
    await row.locator('summary').click();

    const shown = await row.locator('.cov-value').textContent();
    expect(shown).toContain('1000 chars');
    expect(shown.length).toBeLessThan(200);
  });

  test('makes whitespace-only input visible rather than blank', async ({ page }) => {
    await submitInput(page, '\n');
    await preview(page);

    const row = page.locator('#coverage-list details')
      .filter({ hasText: 'Whitespace only, with a newline' });
    await row.locator('summary').click();
    await expect(row.locator('.cov-value')).toContainText('↵');
  });

  test('labels an empty submission instead of showing an empty row', async ({ page }) => {
    await page.frameLocator('#target-frame').locator('#CheckForEPrimeButton').click();
    await preview(page);

    const row = page.locator('#coverage-list details').filter({ hasText: 'Empty input' });
    await row.locator('summary').click();
    await expect(row.locator('.cov-value')).toContainText('submitted empty');
  });
});
