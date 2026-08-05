import { test, expect } from '@playwright/test';
import { bugs } from '../targets/eprimer/bugs.js';

// Characterisation tests for the answer key.
//
// These assert the app's CURRENT, BUGGY behaviour on purpose — the opposite of
// the pytest suite, which asserts correct values so that its failures reveal
// bugs. Each case names the bug id it backs and the value that would be
// correct. A failure here therefore means "this bug no longer reproduces, so
// bugs.js is stale", not "the app regressed".
//
// They run against the target standalone, with no capture layer involved.
const APP = '/targets/eprimer/app/index.html';

async function check(page, input) {
  await page.locator('#inputtext').fill(input);
  await page.locator('#CheckForEPrimeButton').click();
  return {
    words: await page.locator('#wordCount').textContent(),
    red: await page.locator('#discouragedWordCount').textContent(),
    blue: await page.locator('#possibleViolationCount').textContent(),
    html: await page.locator('#eprimeoutput').innerHTML(),
    text: await page.locator('#eprimeoutput').textContent(),
    flagged: await page.locator('#eprimeoutput .ep_violation').allTextContents(),
    warned: await page.locator('#eprimeoutput .ep_warning').allTextContents()
  };
}

test.describe('answer key still reproduces', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP);
  });

  test('#60 a digit against letters invents a violation', async ({ page }) => {
    const r = await check(page, 'I woke at 7am');
    // Correct would be 0 violations: nobody wrote the verb "am".
    expect(r.red).toBe('1');
    expect(r.flagged).toEqual(['am']);
  });

  test('#61 a hyphen splits the word and flags its second half', async ({ page }) => {
    const r = await check(page, 'well-being');
    // Correct would be 0: "well-being" names a state, not a verb.
    expect(r.red).toBe('1');
    expect(r.flagged).toEqual(['being']);
  });

  test('#62 lone punctuation counts as a word', async ({ page }) => {
    const r = await check(page, 'one - two');
    expect(r.words).toBe('3');   // correct: 2
  });

  test('#63 words either side of a newline are glued together', async ({ page }) => {
    const r = await check(page, 'first\nsecond');
    // Correct: two paragraphs reading "first" and "second".
    expect(r.text).toContain('firstsecond');
    expect(r.html).toBe('<p></p><p>firstsecond</p>');
  });

  // The counterpart to #63: one space before the same line break flips the
  // count the other way, because the newline is then counted as a word itself.
  // Both inputs describe "two words on two lines" and neither gives 2 for the
  // right reason — which is why they are separate input classes.
  test('#21 a space before the newline counts the break as a word', async ({ page }) => {
    const r = await check(page, 'first \n second');
    expect(r.words).toBe('3');                    // correct: 2
    expect(r.html).toBe('<p>first </p><p> second</p>');

    const glued = await check(page, 'first\nsecond');
    expect(glued.words).toBe('1');                // correct: 2, and see #63
  });

  test('#20 blank lines emit empty paragraphs', async ({ page }) => {
    const r = await check(page, '\n\nfirst second');
    // Correct: one paragraph reading "first second", with no leading gap.
    expect(r.html).toBe('<p></p><p></p><p>first second</p>');
    // 2 is right only by accident here — the leading break is counted as a word
    // and "first" is not. Put spaces on the blank line and the phantom shows:
    const spaced = await check(page, '\n   \nfirst second');
    expect(spaced.words).toBe('3');               // correct: 2
  });

  test('#64 a typed HTML entity is decoded on output', async ({ page }) => {
    const r = await check(page, '&lt;is&gt;');
    // Correct: the text typed should come back as typed, "&lt;is&gt;".
    expect(r.text).toContain('<is>');
  });

  test('#65 an invisible character splits a word for detection only', async ({ page }) => {
    const r = await check(page, 'is\u200Bbeing');
    // One word on screen, two violations inside it.
    expect(r.words).toBe('1');
    expect(r.red).toBe('2');
    expect(r.flagged).toEqual(['is', 'being']);
  });

  // ── Pre-existing entries, pinned with the same evidence ───────────────────

  test("#1 're contractions are not detected at all", async ({ page }) => {
    const r = await check(page, "you're, we're, they're");
    // Correct: three violations — 're is a contraction of "are".
    expect(r.red).toBe('0');
    expect(r.blue).toBe('0');
  });

  test('#2 single quotes hide a violation that double quotes expose', async ({ page }) => {
    const quoted = await check(page, "'is'");
    expect(quoted.red).toBe('0');   // correct: 1

    const doubled = await check(page, '"is"');
    expect(doubled.red).toBe('1');  // the inconsistency is the bug
  });

  test('#9 plural possessives behave differently from singular', async ({ page }) => {
    const singular = await check(page, "the boy's toys");
    expect(singular.warned).toEqual(["boy's"]);

    const plural = await check(page, "the boys' toys");
    expect(plural.blue).toBe('0');
  });

  test('#12 only the space character separates words', async ({ page }) => {
    const tabs = await check(page, 'one\ttwo\tthree');
    expect(tabs.words).toBe('1');   // correct: 3

    const nbsp = await check(page, ['one', 'two', 'three'].join('\u00A0'));
    expect(nbsp.words).toBe('1');   // correct: 3
  });

  test('#14 violations can outnumber words', async ({ page }) => {
    const r = await check(page, 'is2be');
    expect(Number(r.red)).toBeGreaterThan(Number(r.words));
  });

  test('#5 "being" as a noun is still flagged', async ({ page }) => {
    const r = await check(page, 'a human being');
    expect(r.red).toBe('1');   // correct: 0
  });

  // Behaviour that is already correct — pinned so a "fix" elsewhere cannot
  // quietly break it, and so the answer key does not grow false entries.
  test('non-ASCII letters do not break the word count', async ({ page }) => {
    expect((await check(page, 'café naïve Süëss')).words).toBe('3');
    expect((await check(page, 'Привет 你好')).words).toBe('2');
  });

  test('typed angle brackets are escaped, so markup cannot execute', async ({ page }) => {
    const r = await check(page, '<img src=x onerror=alert(1)>');
    expect(r.text).toContain('<img src=x onerror=alert(1)>');
    await expect(page.locator('#eprimeoutput img')).toHaveCount(0);
  });
});

test.describe('answer key integrity', () => {
  test('every entry is complete and uniquely numbered', () => {
    const ids = bugs.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const bug of bugs) {
      expect(bug.title, `bug ${bug.id} title`).toBeTruthy();
      expect(bug.category, `bug ${bug.id} category`).toBeTruthy();
      expect(bug.points, `bug ${bug.id} points`).toBeGreaterThan(0);
      // matchText is what the model embeds, so a thin one scores badly.
      expect(bug.matchText.length, `bug ${bug.id} matchText`).toBeGreaterThan(80);
      if (bug.inputTriggerable) {
        expect(bug.triggerPattern, `bug ${bug.id} triggerPattern`).toBeTruthy();
      }
    }
  });
});
