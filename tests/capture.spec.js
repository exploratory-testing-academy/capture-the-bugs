import { test, expect } from '@playwright/test';
import {
  openApp, startTarget, typeInput, submitInput, captured,
  FRAME, INPUT, CHECK, DEBOUNCE_MS
} from './helpers.js';

test.describe('input capture', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await startTarget(page);
  });

  test('records a submitted value as committed', async ({ page }) => {
    await submitInput(page, 'to be or not to be');

    const entries = await captured(page);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      key: '#inputtext',
      label: 'Text',
      tag: 'textarea',
      value: 'to be or not to be',
      committed: true
    });
  });

  test('records typed values without a submit, marked uncommitted', async ({ page }) => {
    await typeInput(page, 'nothing here');

    const entries = await captured(page);
    expect(entries).toHaveLength(1);
    expect(entries[0].value).toBe('nothing here');
    expect(entries[0].committed).toBe(false);
  });

  test('collapses a typed value into what it grew into', async ({ page }) => {
    await typeInput(page, 'This is');
    await typeInput(page, 'This is a human being');

    // The prefix is superseded rather than kept as a separate attempt.
    const entries = await captured(page);
    expect(entries).toHaveLength(1);
    expect(entries[0].value).toBe('This is a human being');
  });

  test('keeps a committed value even when typing continues past it', async ({ page }) => {
    await submitInput(page, 'This is');
    await typeInput(page, 'This is a human being');

    const values = (await captured(page)).map(e => e.value);
    expect(values).toEqual(['This is', 'This is a human being']);
  });

  test('records an empty submission, since submitting nothing is a real test', async ({ page }) => {
    await page.frameLocator(FRAME).locator(CHECK).click();

    const entries = await captured(page);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ value: '', committed: true });
  });

  test('does not record an empty box that was never submitted', async ({ page }) => {
    await page.frameLocator(FRAME).locator(INPUT).click();
    await page.waitForTimeout(DEBOUNCE_MS + 150);

    expect(await captured(page)).toHaveLength(0);
  });

  test('does not double-record the same value submitted twice', async ({ page }) => {
    await submitInput(page, 'to be');
    await page.frameLocator(FRAME).locator(CHECK).click();

    expect(await captured(page)).toHaveLength(1);
  });

  test('preserves whitespace-only input exactly', async ({ page }) => {
    await submitInput(page, '\n');

    const entries = await captured(page);
    expect(entries[0].value).toBe('\n');
  });

  test('survives a page reload', async ({ page }) => {
    await submitInput(page, "Hamlet's dilemma");
    await page.reload();
    await startTarget(page);

    const values = (await captured(page)).map(e => e.value);
    expect(values).toContain("Hamlet's dilemma");
  });

  test('reset discards captured inputs', async ({ page }) => {
    await submitInput(page, 'to be or not to be');
    expect(await captured(page)).toHaveLength(1);

    await page.locator('#cov-reset').click();

    expect(await captured(page)).toHaveLength(0);
    await expect(page.locator('#coverage-live')).toContainText('We expect you to try');
  });

  test('capture does not modify the app under test', async ({ page, context }) => {
    // The target must behave exactly as it would standalone: instrumenting it
    // would change the very thing testers are hunting bugs in. Comparing the
    // two runs avoids baking in either the correct or the buggy counts.
    const input = "To be or not to be - Hamlet's dilemma";
    const read = async (scope) => ({
      words: await scope.locator('#wordCount').textContent(),
      discouraged: await scope.locator('#discouragedWordCount').textContent(),
      violations: await scope.locator('#possibleViolationCount').textContent()
    });

    await submitInput(page, input);
    const instrumented = await read(page.frameLocator(FRAME));

    const bare = await context.newPage();
    await bare.goto('/targets/eprimer/app/index.html');
    await bare.locator(INPUT).fill(input);
    await bare.locator(CHECK).click();
    const standalone = await read(bare);
    await bare.close();

    expect(instrumented).toEqual(standalone);
  });
});
