import { test, expect } from '@playwright/test';

// The stats page is the one part of the exercise that reads from the database,
// so every test here serves it fixtures over page.route and nothing touches the
// network — same posture as recording.spec.js, for the same reason: a test run
// must neither depend on nor disturb the live data.

const SUMMARIES = [
  {
    session_code: 'keen-ember-2407',
    target_id: 'eprimer',
    first_seen: '2026-08-10T10:00:00Z',
    last_seen: '2026-08-10T10:14:00Z',
    inputs: 4, input_events: 9, submitted_inputs: 3, findings: 2,
    evaluations: 1, resets: 0, resumes: 0,
    submitted: true, restarted: false,
    best_matched: 2, best_points: 25, coverage_percent: 11,
    hint_level: 'off'
  },
  {
    session_code: 'quiet-otter-1180',
    target_id: 'eprimer',
    first_seen: '2026-08-11T09:00:00Z',
    last_seen: '2026-08-11T09:03:00Z',
    inputs: 1, input_events: 2, submitted_inputs: 0, findings: 1,
    evaluations: 0, resets: 0, resumes: 0,
    submitted: false, restarted: false,
    best_matched: null, best_points: null, coverage_percent: null,
    hint_level: 'detail'
  }
];

const EVALUATES = [
  {
    session_code: 'keen-ember-2407',
    seq: 20,
    payload: {
      matched_count: 2, total_count: 65, earned_points: 25,
      matched_bug_ids: [1, 2],
      missed_bug_ids: [3, 4],
      coverage_percent: 11,
      covered_class_ids: ['empty'],
      hint_level: 'off'
    }
  }
];

const FINDINGS = [
  { session_code: 'keen-ember-2407', seq: 5, payload: { index: 0, value: 'stale draft', clipped: false } },
  // A later write to the same index supersedes the one above.
  { session_code: 'keen-ember-2407', seq: 9, payload: { index: 0, value: 'word count is off by one', clipped: false } },
  { session_code: 'keen-ember-2407', seq: 11, payload: { index: 1, value: 'undo <script>alert(1)</script> loses text', clipped: false } },
  { session_code: 'quiet-otter-1180', seq: 3, payload: { index: 0, value: 'the UI is ugly', clipped: false } }
];

async function serveStats(page, {
  summaries = SUMMARIES, evaluates = EVALUATES, findings = FINDINGS, inputs = []
} = {}) {
  const json = (route, body) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  // Registered first, so it loses: Playwright matches the most recently added
  // route, so the catch-all only sees requests the specific handlers below do
  // not claim. Anything landing here is the page querying something unexpected.
  await page.route('**/rest/v1/**', route => route.abort());

  await page.route('**/rest/v1/session_summary_public*', route => json(route, summaries));
  await page.route('**/rest/v1/events_public*', route => {
    const url = route.request().url();
    if (url.includes('type=eq.evaluate')) return json(route, evaluates);
    if (url.includes('type=eq.finding')) return json(route, findings);
    if (url.includes('type=eq.input')) return json(route, inputs);
    return json(route, []);
  });
}

async function openStats(page, opts) {
  await serveStats(page, opts);
  await page.goto('/stats.html');
  await expect(page.locator('#stats-body')).toBeVisible();
}

test('summarises every recorded session', async ({ page }) => {
  await openStats(page);

  await expect(page.locator('#stat-sessions')).toHaveText('2');
  // One of the two reached evaluation.
  await expect(page.locator('#stat-submitted')).toHaveText('50%');
  // Three settled findings across two sessions — the superseded draft at index
  // 0 must not be counted twice.
  await expect(page.locator('#stat-findings')).toHaveText('1.5');
  await expect(page.locator('#stat-matched')).toHaveText('2.0');
  await expect(page.locator('#stat-total-bugs')).toHaveText('65');
});

test('rates every bug against the sessions that were scored', async ({ page }) => {
  await openStats(page);

  const rows = page.locator('#bug-stats .bug-item');
  await expect(rows).toHaveCount(65);

  // Two bugs matched by the one scored session; the rest by nobody. Rows sort
  // hardest-first, so the never-found ones lead.
  await expect(page.locator('#bug-stats .stat-zero')).toHaveCount(63);
  await expect(rows.first().locator('.stat-rate')).toHaveText('never');
  await expect(rows.last().locator('.stat-rate')).toHaveText('100% (1)');
});

test('rates input classes the same way', async ({ page }) => {
  await openStats(page);

  const rows = page.locator('#class-stats .bug-item');
  await expect(rows).toHaveCount(37);
  await expect(rows.last().locator('.stat-rate')).toHaveText('100% (1)');
});

test('shows the settled findings text, newest session first', async ({ page }) => {
  await openStats(page);

  const sessions = page.locator('#session-stats details');
  await expect(sessions).toHaveCount(2);
  // quiet-otter started a day later, so it leads.
  await expect(sessions.first().locator('code')).toHaveText('quiet-otter-1180');

  const keen = sessions.nth(1);
  await expect(keen.locator('code')).toHaveText('keen-ember-2407');
  await expect(keen.locator('summary .missed-count')).toContainText('14m');
  await expect(keen.locator('summary .missed-count')).toContainText('2 findings');
  // Singular where it should be, and separated from the code rather than run on.
  await expect(sessions.first()).toContainText('quiet-otter-1180 (3m · 1 finding ·');

  await keen.locator('summary').click();
  const values = keen.locator('.cov-value');
  // The superseded draft is gone; the later write to index 0 survives.
  await expect(values).toHaveCount(2);
  await expect(values.first()).toHaveText('word count is off by one');
  await expect(keen.locator('.cov-body')).not.toContainText('stale draft');
});

test('shows what the evaluator made of each finding', async ({ page }) => {
  await openStats(page, {
    summaries: [SUMMARIES[0]],
    evaluates: [{
      session_code: 'keen-ember-2407',
      seq: 20,
      payload: {
        matched_bug_ids: [1],
        covered_class_ids: [],
        report_matches: [
          { index: 0, bug_id: 1, score: 0.7123 },
          { index: 1, bug_id: null, score: null }
        ]
      }
    }],
    findings: FINDINGS.filter(f => f.session_code === 'keen-ember-2407')
  });

  const body = page.locator('#session-stats details').first();
  await body.locator('summary').click();

  const readings = body.locator('.stat-interp');
  await expect(readings).toHaveCount(2);
  await expect(readings.first()).toContainText("#1 Contractions of 'to be' not detected");
  await expect(readings.first()).toContainText('71% similar');
  await expect(readings.first().locator('.match-yes')).toHaveText('matched');
  await expect(readings.nth(1)).toContainText('nothing cleared the matching threshold');
  await expect(readings.nth(1).locator('.match-no')).toHaveText('no match');
});

test('refuses to pair readings it cannot line up', async ({ page }) => {
  await openStats(page, {
    summaries: [SUMMARIES[0]],
    // Two readings against three written findings: the orders have drifted, so
    // pairing them positionally would credit a match to the wrong report.
    evaluates: [{
      session_code: 'keen-ember-2407',
      seq: 20,
      payload: {
        matched_bug_ids: [1],
        report_matches: [
          { index: 0, bug_id: 1, score: 0.71 },
          { index: 1, bug_id: 2, score: 0.66 }
        ]
      }
    }],
    findings: [
      { session_code: 'keen-ember-2407', seq: 5, payload: { index: 0, value: 'one', clipped: false } },
      { session_code: 'keen-ember-2407', seq: 6, payload: { index: 1, value: 'two', clipped: false } },
      { session_code: 'keen-ember-2407', seq: 7, payload: { index: 2, value: 'three', clipped: false } }
    ]
  });

  const body = page.locator('#session-stats details').first();
  await body.locator('summary').click();

  await expect(body.locator('.hint')).toContainText('credit a match to the wrong report');
  // Still shown, just not attributed.
  await expect(body.locator('.stat-interp')).toHaveCount(2);
  await expect(body.locator('.cov-group').filter({ hasText: 'How the reports were read' })).toBeVisible();
});

test('lists the inputs a session tried, whitespace and all', async ({ page }) => {
  await openStats(page, {
    summaries: [SUMMARIES[0]],
    evaluates: [],
    findings: [],
    inputs: [
      // Superseded by the later write to the same position below.
      { session_code: 'keen-ember-2407', seq: 1, payload: { index: 0, value: 'stale', committed: false, chars: 5, clipped: false } },
      { session_code: 'keen-ember-2407', seq: 2, payload: { index: 0, value: 'first \n second', committed: true, chars: 14, clipped: false } },
      { session_code: 'keen-ember-2407', seq: 4, payload: { index: 1, value: 'half typed', committed: false, chars: 10, clipped: false } }
    ]
  });

  const body = page.locator('#session-stats details').first();
  await expect(body.locator('summary')).toContainText('2 inputs');
  await body.locator('summary').click();

  await expect(body.locator('.cov-group').filter({ hasText: 'Inputs tried' })).toBeVisible();
  const values = body.locator('.cov-value');
  await expect(values).toHaveCount(2);
  // The newline has to stay visible — telling it from a space is the exercise.
  await expect(values.first()).toHaveText('first ↵ second');
  await expect(values.nth(1)).toHaveText('half typed');

  const badges = body.locator('.stat-interp .match-badge');
  await expect(badges.first()).toHaveText('submitted');
  await expect(badges.nth(1)).toHaveText('typed, not submitted');
});

test('distinguishes a whitespace-only input from an empty one', async ({ page }) => {
  await openStats(page, {
    summaries: [SUMMARIES[0]],
    evaluates: [],
    findings: [],
    inputs: [
      { session_code: 'keen-ember-2407', seq: 2, payload: { index: 0, value: '', committed: true, chars: 0, clipped: false } },
      { session_code: 'keen-ember-2407', seq: 3, payload: { index: 1, value: '  ', committed: true, chars: 2, clipped: false } }
    ]
  });

  const body = page.locator('#session-stats details').first();
  await body.locator('summary').click();
  const values = body.locator('.cov-value');

  await expect(values.first()).toHaveText('(submitted empty)');
  // Two spaces would otherwise render as an empty box, identical to the row
  // above, and they are different tests.
  await expect(values.nth(1)).toHaveText('··');
});

test('renders findings prose as text, never as markup', async ({ page }) => {
  const injected = [];
  page.on('dialog', d => { injected.push(d.message()); d.dismiss(); });

  await openStats(page);
  const keen = page.locator('#session-stats details').nth(1);
  await keen.locator('summary').click();

  // The finding contains a script tag; it must survive as literal characters.
  await expect(keen.locator('.cov-value').nth(1))
    .toHaveText('undo <script>alert(1)</script> loses text');
  await expect(page.locator('#session-stats script')).toHaveCount(0);
  expect(injected).toEqual([]);
});

// Both failures a missing migration actually produces: 404 while the views do
// not exist, 401 if they exist without the grant.
for (const [status, code, message] of [
  [404, 'PGRST205', "Could not find the table 'public.session_summary_public' in the schema cache"],
  [401, '42501', 'permission denied for view session_summary_public']
]) {
  test(`points at the unapplied migration on a ${status}`, async ({ page }) => {
    await page.route('**/rest/v1/**', route => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ code, message })
    }));
    await page.goto('/stats.html');

    await expect(page.locator('#stats-error')).toBeVisible();
    await expect(page.locator('#stats-error')).toContainText(String(status));
    await expect(page.locator('#stats-error')).toContainText('has not been applied yet');
    await expect(page.locator('#stats-loading')).toBeHidden();
  });
}

test('copes with no sessions at all', async ({ page }) => {
  await openStats(page, { summaries: [], evaluates: [], findings: [] });

  await expect(page.locator('#stat-sessions')).toHaveText('0');
  await expect(page.locator('#stat-submitted')).toHaveText('—');
  // With no target in the data there is no answer key to rate against.
  await expect(page.locator('#session-stats .empty-state')).toHaveText('Nothing recorded yet.');
  await expect(page.locator('#bug-stats .empty-state')).toBeVisible();
});
