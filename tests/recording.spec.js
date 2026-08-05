import { test, expect } from '@playwright/test';
import { startTarget, submitInput } from './helpers.js';

// Recording is on by default in a real browser and off under automation, so these
// force it on with ?record=on and intercept the Supabase endpoint. Nothing here
// reaches the network.
//
// The evaluation case uses __ctb.previewEvaluation() for the same reason
// report.spec.js uses previewCoverage: a real run means a ~30 MB model download.
// That covers the results-to-payload mapping but not the call site inside
// runEvaluation.
const ENDPOINT = '**/rest/v1/events*';
const CODE_SHAPE = /^[a-z]+-[a-z]+-\d{4}$/;

// Collects every event posted, answering as PostgREST does for return=minimal.
async function interceptEvents(page) {
  const posted = [];
  await page.route(ENDPOINT, async (route) => {
    const body = route.request().postDataJSON();
    posted.push(...(Array.isArray(body) ? body : [body]));
    await route.fulfill({ status: 201, body: '' });
  });
  return posted;
}

async function open(page, { record = 'on' } = {}) {
  await page.goto('/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.goto(record ? `/index.html?record=${record}` : '/index.html');
  await expect(page.locator('#target-list .target-card')).toHaveCount(1);
}

// The flush interval is ten seconds; ask for one instead of waiting.
const flush = (page) => page.evaluate(() => window.__ctb.flushRecording());
const inputs = (posted, field = '#inputtext') =>
  posted.filter(e => e.type === 'input' && e.payload.field === field);

test.describe('session recording', () => {
  test('is off under automation, and posts nothing', async ({ page }) => {
    const posted = await interceptEvents(page);
    await open(page, { record: null });
    await startTarget(page);
    await submitInput(page, 'first\nsecond');
    await flush(page);

    expect(posted).toEqual([]);
    await expect(page.locator('#session-bar')).toBeHidden();
    expect(await page.evaluate(() => window.__ctb.session().recording)).toBe(false);
  });

  test('?record=off keeps it off', async ({ page }) => {
    const posted = await interceptEvents(page);
    await open(page, { record: 'off' });
    await startTarget(page);
    await submitInput(page, 'first\nsecond');
    await flush(page);

    expect(posted).toEqual([]);
    await expect(page.locator('#session-bar')).toBeHidden();
  });

  test('shows a shareable code and opens the session with it', async ({ page }) => {
    const posted = await interceptEvents(page);
    await open(page);
    await startTarget(page);
    await flush(page);

    const shown = await page.locator('#session-code').textContent();
    expect(shown).toMatch(CODE_SHAPE);
    await expect(page.locator('#session-bar')).toBeVisible();

    const start = posted.find(e => e.type === 'session_start');
    expect(start).toBeTruthy();
    expect(start.session_code).toBe(shown);
    expect(start.seq).toBe(0);
    expect(start.payload.target_id).toBe('eprimer');
    // A session exists before any input does, so an abandoned attempt is still
    // visible as an attempt.
    expect(posted.some(e => e.type === 'input')).toBe(false);
  });

  test('records submitted inputs verbatim', async ({ page }) => {
    const posted = await interceptEvents(page);
    await open(page);
    await startTarget(page);
    await submitInput(page, 'first \n second');
    await flush(page);

    const recorded = inputs(posted);
    expect(recorded).toHaveLength(1);
    // Whitespace is the whole point in this app, so the value must be exact.
    expect(recorded[0].payload.value).toBe('first \n second');
    expect(recorded[0].payload.committed).toBe(true);
    expect(recorded[0].payload.chars).toBe('first \n second'.length);
    expect(recorded[0].payload.clipped).toBe(false);
  });

  test('records the findings a tester writes', async ({ page }) => {
    const posted = await interceptEvents(page);
    await open(page);
    await startTarget(page);

    await page.locator('.finding-text').first()
      .fill('The word count is wrong when text contains newlines.');
    await flush(page);

    const findings = posted.filter(e => e.type === 'finding');
    expect(findings).toHaveLength(1);
    expect(findings[0].payload.value)
      .toBe('The word count is wrong when text contains newlines.');
    expect(findings[0].payload.index).toBe(0);
  });

  test('does not record the empty finding the app opens with', async ({ page }) => {
    const posted = await interceptEvents(page);
    await open(page);
    await startTarget(page);
    await flush(page);

    expect(posted.some(e => e.type === 'finding')).toBe(false);
  });

  test('records the evaluation outcome and shows the code on the results', async ({ page }) => {
    const posted = await interceptEvents(page);
    await open(page);
    await startTarget(page);
    await submitInput(page, 'first\nsecond');
    await page.locator('.finding-text').first().fill('Words on separate lines glue together.');

    await page.evaluate(() => window.__ctb.previewEvaluation());
    await flush(page);

    const evaluated = posted.find(e => e.type === 'evaluate');
    expect(evaluated).toBeTruthy();
    expect(evaluated.payload.total_count).toBeGreaterThan(0);
    expect(evaluated.payload.matched_bug_ids).toHaveLength(2);
    expect(evaluated.payload.classes_total).toBeGreaterThan(30);
    expect(evaluated.payload.coverage_percent).toBeGreaterThan(0);
    // Which report matched which bug: the raw material for asking later whether
    // phrasing changes the match.
    expect(evaluated.payload.report_matches).toHaveLength(1);
    expect(evaluated.payload.report_matches[0].score).toBeCloseTo(0.7123);

    const code = await page.locator('#session-code').textContent();
    await expect(page.locator('#session-section')).toBeVisible();
    await expect(page.locator('#results-session-code')).toHaveText(code);
  });

  test('a reload resumes the session without re-sending its inputs', async ({ page }) => {
    const posted = await interceptEvents(page);
    await open(page);
    await startTarget(page);
    await submitInput(page, 'first\nsecond');
    await flush(page);

    const before = inputs(posted).length;
    expect(before).toBe(1);
    const code = await page.locator('#session-code').textContent();

    await page.goto('/index.html?record=on');
    await startTarget(page);
    await flush(page);

    expect(await page.locator('#session-code').textContent()).toBe(code);
    expect(posted.some(e => e.type === 'session_resume')).toBe(true);
    // capture.js restores the entry from localStorage; it must not be sent twice.
    expect(inputs(posted)).toHaveLength(before);
  });

  test('a reset is recorded and keeps the same session', async ({ page }) => {
    const posted = await interceptEvents(page);
    await open(page);
    await startTarget(page);
    await submitInput(page, 'first\nsecond');
    const code = await page.locator('#session-code').textContent();

    await page.locator('#cov-reset').click();
    await flush(page);

    const reset = posted.find(e => e.type === 'reset');
    expect(reset).toBeTruthy();
    expect(reset.payload.inputs_discarded).toBe(1);
    // The input was captured before it vanished.
    expect(inputs(posted)).toHaveLength(1);
    // A reset recounts coverage; it does not start a new session.
    expect(await page.locator('#session-code').textContent()).toBe(code);

    // And the emptied list is not diffed against the old baseline.
    await submitInput(page, 'first \n second');
    await flush(page);
    expect(inputs(posted).at(-1).payload.value).toBe('first \n second');
  });

  test('the code is copyable', async ({ page }) => {
    await interceptEvents(page);
    await open(page);
    await startTarget(page);
    const code = await page.locator('#session-code').textContent();

    await page.locator('#session-copy').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
  });

  test('ending a session mints a new code, linked only locally', async ({ page }) => {
    const posted = await interceptEvents(page);
    await open(page);
    await startTarget(page);
    const first = await page.locator('#session-code').textContent();

    await page.evaluate(() => window.__ctb.endSession());
    await expect.poll(() => posted.some(e => e.type === 'restart')).toBe(true);

    await page.goto('/index.html?record=on');
    await startTarget(page);
    await flush(page);
    const second = await page.locator('#session-code').textContent();
    expect(second).toMatch(CODE_SHAPE);
    expect(second).not.toBe(first);

    // Both codes are in this browser's local log...
    const log = await page.evaluate(() => window.__ctb.session().log.map(e => e.code));
    expect(log).toContain(first);
    expect(log).toContain(second);

    // ...and nothing sent to the server connects them.
    expect(new Set(posted.map(e => e.session_code))).toEqual(new Set([first, second]));
    for (const e of posted) {
      expect(JSON.stringify(e.payload)).not.toContain(first === e.session_code ? second : first);
    }
  });
});
