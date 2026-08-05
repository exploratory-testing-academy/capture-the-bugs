import { test, expect } from '@playwright/test';
import { openApp, startTarget, submitInput } from './helpers.js';

const strip = '#coverage-live';
const msg = '#cov-live-msg';
const bar = '#cov-bar';
const chips = '#cov-live-chips';
const list = '#cov-live-list';
const select = '#cov-hint-level';

test.describe('hint levels', () => {
  test('defaults to count: a progress sentence, no class names', async ({ page }) => {
    await openApp(page);
    await startTarget(page);

    await expect(page.locator(select)).toHaveValue('count');
    await expect(page.locator(msg)).toContainText('We expect you to try');
    await expect(page.locator(bar)).toBeVisible();
    await expect(page.locator(chips)).toBeHidden();
    await expect(page.locator(list)).toBeHidden();
  });

  test('off hides the progress entirely but keeps the control reachable', async ({ page }) => {
    await openApp(page);
    await startTarget(page);
    await page.locator(select).selectOption('off');

    await expect(page.locator(msg)).toHaveText('Coverage feedback hidden');
    await expect(page.locator(bar)).toBeHidden();
    await expect(page.locator(chips)).toBeHidden();
    await expect(page.locator(list)).toBeHidden();
    // Recoverable: the selector itself must never disappear.
    await expect(page.locator(select)).toBeVisible();
  });

  test('off reveals no class names even after inputs are submitted', async ({ page }) => {
    await openApp(page, { hints: 'off' });
    await startTarget(page);
    await submitInput(page, "you're late");

    await expect(page.locator(strip)).not.toContainText('Contractions');
    await expect(page.locator(strip)).not.toContainText('kinds of input');
  });

  test('count shows progress but never which classes remain', async ({ page }) => {
    await openApp(page, { hints: 'count' });
    await startTarget(page);
    await submitInput(page, "you're late");

    // "you're late" lands in more than one class, so read the real number
    // rather than assuming a single input covers exactly one thing.
    const { coveredCount, totalCount } =
      await page.evaluate(() => window.__ctb.coverage());
    await expect(page.locator(msg))
      .toContainText(`We expect you've tried ${coveredCount} of ${totalCount}`);
    await expect(page.locator(chips)).toBeHidden();
    await expect(page.locator(list)).toBeHidden();
  });

  test('detail names exercised classes only, never the missing ones', async ({ page }) => {
    await openApp(page, { hints: 'detail' });
    await startTarget(page);
    await submitInput(page, "you're late");

    await expect(page.locator(chips)).toBeVisible();
    await expect(page.locator(chips)).toContainText("Contractions ending 're");
    // The answer key stays hidden: an untried class must not be named.
    await expect(page.locator(chips)).not.toContainText('Emoji');
    await expect(page.locator(list)).toBeHidden();
  });

  test('all reveals the full checklist with a sample per class', async ({ page }) => {
    await openApp(page, { hints: 'all' });
    await startTarget(page);

    await expect(page.locator(list)).toBeVisible();
    await expect(page.locator(chips)).toBeHidden();

    const { totalCount } = await page.evaluate(() => window.__ctb.coverage());
    await expect(page.locator('.cov-live-row')).toHaveCount(totalCount);
    // Every row offers either a copyable sample or a note explaining why not.
    await expect(page.locator('.cov-live-row .cov-sample')).toHaveCount(totalCount);
    const copy = await page.locator('.cov-live-row button.cov-copy').count();
    const notes = await page.locator('.cov-live-row .cov-sample-note').count();
    expect(copy + notes).toBe(totalCount);
  });

  test('all marks exercised classes apart from untried ones', async ({ page }) => {
    await openApp(page, { hints: 'all' });
    await startTarget(page);
    await submitInput(page, "you're late");

    const { coveredCount: n, totalCount } =
      await page.evaluate(() => window.__ctb.coverage());
    await expect(page.locator('.cov-live-hit')).toHaveCount(n);
    await expect(page.locator('.cov-live-hit').filter({ hasText: "Contractions ending 're" }))
      .toHaveCount(1);
    await expect(page.locator('.cov-live-todo')).toHaveCount(totalCount - n);
  });

  test('the level persists across a reload', async ({ page }) => {
    await openApp(page);
    await startTarget(page);
    await page.locator(select).selectOption('detail');

    await page.reload();
    await startTarget(page);
    await expect(page.locator(select)).toHaveValue('detail');
  });

  test('a hints URL parameter overrides the stored level', async ({ page }) => {
    await openApp(page);
    await startTarget(page);
    await page.locator(select).selectOption('detail');

    // A facilitator handing out ?hints=off must win over the browser's memory.
    await page.goto('/index.html?hints=off');
    await startTarget(page);
    await expect(page.locator(select)).toHaveValue('off');
  });
});

test.describe('copy buttons', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, { hints: 'all' });
    await startTarget(page);
  });

  // Row order follows the class list, so look rows up by their label.
  const rowFor = (page, label) =>
    page.locator('.cov-live-row').filter({ hasText: label });

  test('copies a sample verbatim', async ({ page }) => {
    await rowFor(page, "Contractions ending 're").locator('button.cov-copy').click();

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe("you're, we're, they're");
  });

  test('copies real tab characters, not the visible placeholders', async ({ page }) => {
    const row = rowFor(page, 'Tab-separated words');
    // The display escapes whitespace so it stays legible...
    await expect(row.locator('code')).toContainText('Tab-separated');
    await row.locator('button.cov-copy').click();

    // ...while the copied text keeps the actual tabs.
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe('one\ttwo\tthree');
  });

  test('copies invisible characters intact', async ({ page }) => {
    await rowFor(page, 'Non-breaking space').locator('button.cov-copy').click();
    expect(await page.evaluate(() => navigator.clipboard.readText()))
      .toBe(['is', 'being', 'here'].join('\u00A0'));

    await rowFor(page, 'Zero-width').locator('button.cov-copy').click();
    expect(await page.evaluate(() => navigator.clipboard.readText()))
      .toBe('is\u200Bbeing\uFEFF here');
  });

  // The three newline samples differ from each other only in where a space or a
  // blank line sits, so a trim anywhere in the copy path would quietly collapse
  // them back into one class — the very bug the split fixed.
  test('copies the newline samples with their whitespace intact', async ({ page }) => {
    const cases = [
      ['Newline as the only separator', 'first\nsecond'],
      ['Space before a line break', 'first \n second'],
      ['Blank lines before or between text', '\n\nfirst second']
    ];

    for (const [label, expected] of cases) {
      await rowFor(page, label).locator('button.cov-copy').click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
    }
  });

  test('a copied sample actually covers the class it belongs to', async ({ page }) => {
    // The point of the samples: paste one in and the class must register.
    await rowFor(page, 'Digits touching letters').locator('button.cov-copy').click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());

    await submitInput(page, copied);
    const covered = await page.evaluate(() => window.__ctb.coverage().covered.map(c => c.id));
    expect(covered).toContain('digits beside letters');
  });

  test('offers no copy button for the empty-input class', async ({ page }) => {
    const row = rowFor(page, 'Empty input');
    await expect(row.locator('button.cov-copy')).toBeDisabled();
    await expect(row.locator('code')).toContainText('Click Check with the box empty');
  });

  test('shows a note instead of a sample for file-sized inputs', async ({ page }) => {
    const row = rowFor(page, 'Very large text');
    await expect(row.locator('.cov-sample-note')).toContainText('Paste 10,000+ words');
    await expect(row.locator('button.cov-copy')).toHaveCount(0);
  });
});
