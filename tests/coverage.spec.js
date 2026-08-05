import { test, expect } from '@playwright/test';
import { openApp, startTarget, submitInput, typeInput, coverage } from './helpers.js';

// Each case submits one input and names the classes that input must land in.
// Kept deliberately narrow: a detector that fires on everything is as broken as
// one that never fires, so the tests assert what must NOT match too.
const CASES = [
  {
    name: "'re contractions are their own class",
    input: "you're, we're, they're",
    expect: ["contraction -'re"],
    reject: ["contraction -'s", "contraction -m / -n't", 'slang']
  },
  {
    name: "'s contractions are their own class",
    input: "he's, she's, it's",
    expect: ["contraction -'s"],
    reject: ["contraction -'re", "contraction -m / -n't"]
  },
  {
    name: 'negated contractions are their own class',
    input: "isn't, aren't, wasn't",
    expect: ["contraction -m / -n't"],
    reject: ["contraction -'s", "contraction -'re"]
  },
  {
    name: 'digits touching letters',
    input: 'I woke at 7am',
    expect: ['digits beside letters'],
    reject: ['hyphenated words', 'emoji']
  },
  {
    name: 'hyphenated words',
    input: 'well-being and self-esteem',
    expect: ['hyphenated words'],
    reject: ['digits beside letters']
  },
  {
    name: 'tabs are not spaces',
    input: 'one\ttwo\tthree',
    expect: ['tabs'],
    reject: ['spaces only', 'newline']
  },
  {
    name: 'curly apostrophes are distinct from straight ones',
    input: 'typesetter’s apostrophe',
    expect: ['typesetters apostrophe'],
    reject: ['typewriters apostrophe']
  },
  {
    name: 'straight apostrophes are distinct from curly ones',
    input: "typewriter's apostrophe",
    expect: ['typewriters apostrophe'],
    reject: ['typesetters apostrophe']
  },
  {
    name: 'markup',
    input: '<b>is</b>',
    expect: ['html or script markup'],
    reject: ['emoji', 'accented latin']
  },
  {
    name: 'ampersands',
    input: 'Tom & Jerry',
    expect: ['ampersands and entities'],
    reject: ['html or script markup']
  },
  {
    name: 'plural possessive differs from singular',
    input: "the boys' toys",
    expect: ['plural possessive'],
    reject: ['possessive']
  },
  {
    name: 'non-Latin scripts',
    input: 'Привет 你好',
    expect: ['non-latin script'],
    reject: ['accented latin', 'emoji']
  },
  {
    name: 'emoji',
    input: 'is 🎉 being',
    expect: ['emoji'],
    reject: ['non-latin script']
  },
  {
    name: 'both highlight colours at once',
    input: "To be or not to be - Hamlet's dilemma",
    expect: ['demo', 'hamlet', 'possessive'],
    reject: ["contraction -'re", 'emoji']
  },
  {
    name: 'empty submission',
    input: '',
    expect: ['empty'],
    reject: ['not eprime', 'spaces only']
  },
  {
    name: 'spaces only is not an empty box',
    input: '   ',
    expect: ['spaces only'],
    reject: ['empty', 'newline']
  },
  // These two differ by one space and land on opposite word-count bugs, so
  // neither may stand in for the other.
  {
    name: 'a bare newline between words is its own class',
    input: 'first\nsecond',
    expect: ['newline with words'],
    reject: ['space before newline', 'newline', 'spaces only']
  },
  {
    name: 'a space before the newline is its own class',
    input: 'first \nsecond',
    expect: ['space before newline'],
    reject: ['newline with words', 'newline', 'spaces only']
  },
  {
    name: 'a leading blank line is its own class',
    input: '\nfirst second',
    expect: ['blank lines'],
    reject: ['newline with words', 'space before newline', 'newline', 'spaces only']
  },
  {
    // Overlap on purpose: a blank line between words both swallows the second
    // word and emits the empty paragraph, so it genuinely is both.
    name: 'a blank line between words counts as both newline classes',
    input: 'first\n\nsecond',
    expect: ['blank lines', 'newline with words'],
    reject: ['space before newline', 'newline', 'spaces only']
  }
];

test.describe('input class coverage', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await startTarget(page);
  });

  for (const c of CASES) {
    test(c.name, async ({ page }) => {
      await submitInput(page, c.input);
      const cov = await coverage(page);

      for (const id of c.expect) expect(cov.covered).toContain(id);
      for (const id of c.reject) expect(cov.covered).not.toContain(id);
    });
  }

  test('starts at zero with nothing submitted', async ({ page }) => {
    const cov = await coverage(page);
    expect(cov.coveredCount).toBe(0);
    expect(cov.totalCount).toBeGreaterThanOrEqual(35);
    expect(cov.missed).toHaveLength(cov.totalCount);
  });

  test('a typed-but-unsubmitted value counts as typedOnly, not covered', async ({ page }) => {
    await typeInput(page, "you're late");

    const cov = await coverage(page);
    expect(cov.typedOnly).toContain("contraction -'re");
    expect(cov.covered).not.toContain("contraction -'re");
    expect(cov.coveredCount).toBe(0);
  });

  test('submitting after typing promotes typedOnly to covered', async ({ page }) => {
    await typeInput(page, "you're late");
    await submitInput(page, "you're late");

    const cov = await coverage(page);
    expect(cov.covered).toContain("contraction -'re");
    expect(cov.typedOnly).not.toContain("contraction -'re");
  });

  test('percent tracks covered over total', async ({ page }) => {
    await submitInput(page, 'nothing');
    const cov = await coverage(page);
    expect(cov.percent).toBe(Math.round((cov.coveredCount / cov.totalCount) * 100));
  });
});
