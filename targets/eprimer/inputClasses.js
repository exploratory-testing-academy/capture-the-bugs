// Classes of input a tester should exercise against E-Primer.
//
// Derived from the parametrized Playwright suite for this app: each entry here
// corresponds to one of that suite's test ids, which is where the *reason* for
// the input lives. Detection is property-based rather than string equality —
// a tester typing their own curly-apostrophe example should count as covering
// "typesetters apostrophe", not just the exact fixture.

// ── Shared matchers ──────────────────────────────────────────────────────────

// Global variants are kept separate: .test() on a /g/ regex is stateful, so
// reusing one for both counting and testing gives alternating results.
const TO_BE_SRC = String.raw`\b(be|being|been|am|is|are|was|were)\b`;
const NEGATED_SRC = String.raw`\b(is|are|was|were|am|ai)n['’]t\b`;

const TO_BE = new RegExp(TO_BE_SRC, 'i');
const TO_BE_G = new RegExp(TO_BE_SRC, 'gi');
const NEGATED = new RegExp(NEGATED_SRC, 'i');
const NEGATED_G = new RegExp(NEGATED_SRC, 'gi');
const SLANG = /\b(ain|amn)['’]t\b/i;
const CURLY = /[‘’]/;

// Apostrophe forms of to-be, split by suffix. The app's discouraged list holds
// whole words, so which suffix a contraction uses decides whether it is caught
// as a violation, merely warned about, or missed entirely.
const CONTRACTION_AM = /\bi['’]m\b/i;

const IS_STEMS = [
  'he', 'she', 'it', 'there', 'here', 'where', 'how', 'what', 'who', 'that',
  'this'
];
const CONTRACTION_IS = new RegExp(`\\b(${IS_STEMS.join('|')})['’]s\\b`, 'i');

const ARE_STEMS = ['you', 'we', 'they', 'there', 'these', 'those', 'who', 'what'];
const CONTRACTION_ARE = new RegExp(`\\b(${ARE_STEMS.join('|')})['’]re\\b`, 'i');

function hasContraction(v) {
  return CONTRACTION_AM.test(v) || CONTRACTION_IS.test(v) ||
    CONTRACTION_ARE.test(v) || NEGATED.test(v);
}

// Stems whose 's is a contraction rather than possession — "it's" is not
// ownership. Wider than IS_STEMS: "let's" is no possessive either.
const NON_POSSESSIVE_STEMS = new Set([...IS_STEMS, 'one', 'let']);

function words(v) {
  const t = v.trim();
  return t.length === 0 ? [] : t.split(/\s+/);
}

function nonBlankLines(v) {
  return v.split('\n').filter(l => l.trim().length > 0).length;
}

function countMatches(v, re) {
  return (v.match(re) || []).length;
}

function distinctToBeForms(v) {
  const found = new Set();
  for (const m of v.match(TO_BE_G) || []) found.add(m.toLowerCase());
  for (const m of v.match(NEGATED_G) || []) found.add(m.toLowerCase().replace('’', "'"));
  return found.size;
}

// A word + 's where the stem isn't a pronoun contraction, e.g. Hanna's.
function hasPossessive(v) {
  const matches = v.matchAll(/([\p{L}]+)['’]s\b/giu);
  for (const [, stem] of matches) {
    if (!NON_POSSESSIVE_STEMS.has(stem.toLowerCase())) return true;
  }
  return false;
}

function hasAnyToBe(v) {
  return TO_BE.test(v) || hasContraction(v);
}

// ── The app's own two classifiers, ported ────────────────────────────────────
// eprime.js tokenizes on letters plus the straight apostrophe only, so digits,
// hyphens and curly apostrophes all split a word. A token in the discouraged
// list renders red (.ep_violation); otherwise a token whose apostrophe begins
// "'s" renders blue (.ep_warning). Red is tested first and wins.

const DISCOURAGED = new Set([
  'be', 'being', 'been', 'am', 'is', 'are', 'was', 'were',
  "isn't", "aren't", "wasn't", "weren't", "ain't", "amn't", "i'm"
]);

function appTokens(v) {
  return v.split(/[^A-Za-z']+/).filter(t => t.length > 0);
}

export function hasRedHighlight(v) {
  return appTokens(v).some(t => DISCOURAGED.has(t.toLowerCase()));
}

export function hasBlueHighlight(v) {
  return appTokens(v).some(t => {
    if (DISCOURAGED.has(t.toLowerCase())) return false;
    const at = t.indexOf("'");
    return at !== -1 && t.slice(at).toLowerCase() === "'s";
  });
}

// ── The classes ──────────────────────────────────────────────────────────────
// `why` states what the input probes. `example` is the suite's fixture,
// shown to the tester only after evaluation.

export const inputClasses = [
  {
    id: 'empty',
    label: 'Empty input',
    why: 'Submitting nothing at all — does it count zero words or fall over?',
    example: '""',
    sample: '',
    sampleNote: 'Click Check with the box empty',
    detect: v => v.length === 0
  },
  {
    id: 'not eprime',
    label: 'Plain text, no to-be forms',
    why: 'A clean baseline: nothing should be flagged.',
    example: '"nothing"',
    sample: 'nothing',
    detect: v => words(v).length >= 1 && !hasAnyToBe(v)
  },
  {
    id: 'hamlet',
    label: 'Repeated to-be forms',
    why: 'The same discouraged word more than once — are all occurrences counted?',
    example: '"to be or not to be"',
    sample: 'to be or not to be',
    detect: v => countMatches(v, TO_BE_G) >= 2
  },
  {
    id: 'demo',
    label: 'Both highlight colours at once',
    why: 'Shows a confirmed violation (red) and a possible violation (blue) in the same output — exercises both code paths together.',
    example: '"To be or not to be - Hamlet\'s dilemma"',
    sample: "To be or not to be - Hamlet's dilemma",
    detect: v => hasRedHighlight(v) && hasBlueHighlight(v)
  },
  {
    id: 'be in forms',
    label: 'Many to-be forms enumerated',
    why: 'Every conjugation and its negated contraction — checks the discouraged-word list for gaps.',
    example: '"be, being, been, am, is, isn\'t, are, aren\'t, was, ..."',
    sample: "be, being, been, am, is, isn't, are, aren't, was, wasn't, were, and weren't.",
    detect: v => distinctToBeForms(v) >= 4
  },
  // The suite's single 'contractions' fixture mixes three behaviours: of its 15
  // contractions, 1 comes back red, 11 blue and 3 produce nothing. Split so a
  // tester who only tried one suffix doesn't read as having covered all three.
  {
    id: 'contraction -m / -n\'t',
    label: "Contractions of am and negated forms",
    why: "I'm, isn't, aren't, wasn't — whole-word apostrophe forms that the tool's discouraged list holds outright.",
    example: '"I\'m, isn\'t, aren\'t, wasn\'t, weren\'t"',
    sample: "I'm, isn't, aren't, wasn't, weren't",
    detect: v => CONTRACTION_AM.test(v) || NEGATED.test(v)
  },
  {
    id: "contraction -'s",
    label: "Contractions ending 's",
    why: "it's, he's, there's, that's — the same suffix a possessive uses, so the tool has to tell ownership from a hidden \"is\".",
    example: '"he\'s, she\'s, it\'s, there\'s, that\'s"',
    sample: "he's, she's, it's, there's, here's, where's, how's, what's, who's, that's",
    detect: v => CONTRACTION_IS.test(v)
  },
  {
    id: "contraction -'re",
    label: "Contractions ending 're",
    why: "you're, we're, they're — a contraction of \"are\" with a suffix the discouraged list has no entry for.",
    example: '"you\'re, we\'re, they\'re"',
    sample: "you're, we're, they're",
    detect: v => CONTRACTION_ARE.test(v)
  },
  {
    id: 'slang',
    label: 'Slang contractions',
    why: "ain't and amn't — non-standard forms of to be.",
    example: '"ain\'t, amn\'t"',
    sample: "ain't, amn't",
    detect: v => SLANG.test(v)
  },
  {
    id: 'possessive',
    label: 'Possessive apostrophes',
    why: "A trailing 's that means ownership, not \"is\" — false positives live here.",
    example: '"Hanna\'s Esa\'s Meera\'s Süëss-O\'Reggio\'s or Okechukwu\'s"',
    sample: "Hanna's Esa's Meera's Süëss-O'Reggio's or Okechukwu's",
    detect: hasPossessive
  },
  {
    id: 'quoted be',
    label: 'Discouraged word in quotes',
    why: 'Quote marks becoming part of the word, hiding a violation.',
    example: `"'be'"`,
    sample: "'be'",
    detect: v => /['’](be|being|been|am|is|are|was|were)['’]/i.test(v)
  },
  {
    id: 'not verb',
    label: '"being" used as a noun',
    why: 'A human being is not a verb — context awareness.',
    example: '"human being"',
    sample: 'a human being is a living being',
    detect: v =>
      /\b(a|an|the|human|living|new|every|another|social|supreme|sentient)\s+beings?\b/i.test(v)
  },
  {
    id: 'typewriters apostrophe',
    label: 'Straight apostrophe',
    why: 'The plain keyboard apostrophe, as a baseline for the curly one.',
    example: '"typewriter\'s apostrophe"',
    sample: "typewriter's apostrophe",
    detect: v => v.includes("'")
  },
  {
    id: 'typesetters apostrophe',
    label: 'Curly / smart apostrophe',
    why: 'What you get pasting from Word or a phone — often handled differently.',
    example: '"typesetter’s apostrophe"',
    sample: 'typesetter’s apostrophe and it’s isn’t I’m',
    detect: v => CURLY.test(v)
  },
  {
    id: 'newline',
    label: 'Whitespace only, with a newline',
    why: 'A newline and nothing else — does an empty line count as a word?',
    example: '"\\n"',
    sample: '\n',
    sampleNote: 'A single newline, nothing else',
    detect: v => v.includes('\n') && v.trim().length === 0
  },
  // Two shapes that look alike on screen and fail in opposite directions.
  // Only a literal ' ' ever resets the counter's processingSpaces flag, and a
  // newline is rewritten to '' before that comparison — so '' reads as "not a
  // space". A break reached mid-word leaves the counter inside a word and the
  // next word goes uncounted; a break reached just after a space is itself
  // counted as a word start. Measured: "first\nsecond" → 1, "first \nsecond" →
  // 2, "first \n second" → 3, all for two words. The 2 is right only by
  // accident — the counted newline cancels the uncounted word — which is why
  // the sample below puts a space on both sides and shows the 3. bugs.js keys
  // these separately too (#11 vs #21), so one class covering both lets a tester
  // read as done having probed neither.
  {
    id: 'newline with words',
    label: 'Newline as the only separator between words',
    why: 'A line break with no space beside it — the counter stays mid-word across the break, so what follows goes uncounted and runs together in the output.',
    example: '"first\\nsecond"',
    sample: 'first\nsecond',
    detect: v => /[^ ]\n/.test(v) && nonBlankLines(v) >= 2
  },
  {
    id: 'space before newline',
    label: 'Space before a line break',
    why: 'A line ending in a space before Enter — the break itself gets counted as a word, so the count is inflated rather than short, and the stray space shifts the output.',
    example: '"first \\n second"',
    sample: 'first \n second',
    sampleNote: 'Note the space before the line break',
    detect: v => / +\n/.test(v)
  },
  // A break on an empty line has no pending word to glue, so it surfaces in the
  // output instead: every newline emits "</p><p>", so a blank line becomes an
  // empty paragraph and a visible gap. Whitespace-only input is excluded — that
  // is the 'newline' class above; this one needs real text for the blank line to
  // sit before or between.
  {
    id: 'blank lines',
    label: 'Blank lines before or between text',
    why: 'A line with nothing on it — each blank line emits an empty paragraph into the output, and a leading break is counted as a word nobody typed.',
    example: '"\\n\\nfirst second"',
    sample: '\n\nfirst second',
    sampleNote: 'Two blank lines before the text',
    detect: v => v.trim().length > 0 && /^[ \t]*\n|\n[ \t]*\n/.test(v)
  },
  {
    id: 'long word',
    label: 'One very long unbroken word',
    why: 'No whitespace to wrap on — layout and performance pressure.',
    example: '1000 × "x"',
    sample: 'x'.repeat(1000),
    sampleNote: '1000 × x',
    detect: v => words(v).some(w => w.length >= 100)
  },
  {
    id: 'file',
    label: 'Large multi-paragraph text',
    why: 'Realistic document-sized input rather than a phrase.',
    example: 'sample.txt (508 words)',
    sampleNote: 'Paste any document of 250+ words',
    detect: v => words(v).length >= 250
  },
  {
    id: 'bible',
    label: 'Very large text',
    why: 'Tens of thousands of words — where performance and counters break.',
    example: 'bible.txt (31,172 words)',
    sampleNote: 'Paste 10,000+ words',
    detect: v => words(v).length >= 10000
  },

  // ── Word splitting ─────────────────────────────────────────────────────────
  // The tokenizer accepts only ASCII letters and the straight apostrophe, so
  // every other character silently ends a word.
  {
    id: 'digits beside letters',
    label: 'Digits touching letters',
    why: 'A digit ends a word, so "7am" splits into "7" and "am" — and "am" then counts as a discouraged word the tester never wrote.',
    example: '"I woke at 7am"',
    sample: 'I woke at 7am and left at 8pm, is2be',
    detect: v => /\d[A-Za-z]|[A-Za-z]\d/.test(v)
  },
  {
    id: 'hyphenated words',
    label: 'Hyphenated words',
    why: 'A hyphen splits the word, so "well-being" becomes "well" + "being" and the noun gets flagged as a verb.',
    example: '"well-being"',
    sample: 'well-being and self-esteem for a light-being',
    detect: v => /[A-Za-z]-[A-Za-z]/.test(v)
  },
  {
    id: 'to-be as substring',
    label: 'To-be forms inside longer words',
    why: 'before, maybe, beam, island — these merely contain a to-be spelling and must not be flagged.',
    example: '"before maybe beam island"',
    sample: 'before maybe beam island this misery',
    detect: v => appTokens(v).some(t => {
      const l = t.toLowerCase();
      return l.length > 2 && !DISCOURAGED.has(l) && /be|is|am|are|was|were/.test(l);
    })
  },

  // ── Apostrophe edge cases ──────────────────────────────────────────────────
  {
    id: 'plural possessive',
    label: 'Plural possessive (trailing apostrophe)',
    why: "boys' ends in a bare apostrophe rather than 's, so it takes a different path from boy's.",
    example: '"the boys\' toys"',
    sample: "the boys' toys and the girls' books",
    detect: v => /[A-Za-z]s['’](?![A-Za-z])/.test(v)
  },
  {
    id: 'bare or leading apostrophe',
    label: 'Leading or standalone apostrophe',
    why: "An apostrophe with no word before it — 'tis, or an apostrophe on its own.",
    example: `"'tis ' ''"`,
    sample: "'tis ' '' o'clock",
    detect: v => /(^|\s)['’]/.test(v)
  },
  {
    id: 'non-to-be contractions',
    label: 'Contractions unrelated to to-be',
    why: "don't, can't, won't — same n't shape as isn't but no to-be in them, so none should be flagged.",
    example: '"don\'t, can\'t, won\'t"',
    sample: "don't, can't, won't, shouldn't, we'll, I'd",
    detect: v => /\b(do|does|did|ca|wo|should|could|would|have|has|had|must|need|dare)n['’]t\b/i.test(v)
  },

  // ── Quoting and markup ─────────────────────────────────────────────────────
  // Output is written with innerHTML and only < and > are escaped.
  {
    id: 'double-quoted to-be',
    label: 'Discouraged word in double quotes',
    why: 'Double quotes split the word, so "is" is caught while \'is\' is not — the contrast exposes the inconsistency.',
    example: '"\\"is\\" versus \'is\'"',
    sample: `"is" versus 'is'`,
    detect: v => /"(be|being|been|am|is|are|was|were)"/i.test(v)
  },
  {
    id: 'ampersands and entities',
    label: 'Ampersands and HTML entities',
    why: 'Only < and > get escaped, so a typed &lt; comes back out as a literal < and an & can corrupt the output.',
    example: '"&lt;is&gt; &amp;"',
    sample: '&lt;is&gt; &amp; &#39; Tom & Jerry',
    detect: v => v.includes('&')
  },
  {
    id: 'html or script markup',
    label: 'HTML tags or script markup',
    why: 'Tags reach an innerHTML sink; they also add false word counts and violations.',
    example: '"<b>is</b>"',
    sample: '<b>is</b> <i>being</i> <img src=x onerror=alert(1)>',
    detect: v => /<[^>]+>/.test(v)
  },

  // ── Whitespace beyond the space character ──────────────────────────────────
  // Word counting only ever compares a character against ' '.
  {
    id: 'spaces only',
    label: 'Spaces only, no newline',
    why: 'Whitespace with nothing in it — distinct from an empty box and from a bare newline.',
    example: '"   "',
    sample: '   ',
    sampleNote: 'Three spaces',
    detect: v => v.length > 0 && v.trim().length === 0 && !v.includes('\n')
  },
  {
    id: 'tabs',
    label: 'Tab-separated words',
    why: 'A tab is not a space, so "one\\ttwo" counts as one word instead of two.',
    example: '"one\\ttwo\\tthree"',
    sample: 'one\ttwo\tthree',
    sampleNote: 'Tab-separated (copy to keep the tabs)',
    detect: v => v.includes('\t')
  },
  {
    id: 'non-breaking space',
    label: 'Non-breaking space',
    why: 'Looks exactly like a space but is U+00A0, so the word count silently disagrees with what you see.',
    example: '"one\\u00A0two"',
    sample: ['is', 'being', 'here'].join('\u00A0'),
    sampleNote: 'Words joined by non-breaking spaces',
    detect: v => /\u00A0/.test(v)
  },
  {
    id: 'zero width characters',
    label: 'Zero-width / invisible characters',
    why: 'Invisible characters split words with nothing on screen to explain the counts.',
    example: '"is\\u200Bbeing"',
    sample: 'is\u200Bbeing\uFEFF here',
    sampleNote: 'Contains zero-width characters',
    detect: v => /[\u200B-\u200D\uFEFF]/.test(v)
  },

  // ── Character sets ─────────────────────────────────────────────────────────
  {
    id: 'accented latin',
    label: 'Accented Latin letters',
    why: 'Accented letters fall outside the accepted character set, so they split words mid-string.',
    example: '"café naïve Süëss"',
    sample: 'café naïve Süëss Öland',
    detect: v => /[\u00C0-\u024F]/.test(v)
  },
  {
    id: 'non-latin script',
    label: 'Non-Latin scripts',
    why: 'Cyrillic, CJK, Arabic and Hebrew have no accepted characters at all — every word count collapses, and RTL text also tests rendering.',
    example: '"Привет 你好 مرحبا שלום"',
    sample: 'Привет 你好 مرحبا שלום こんにちは',
    detect: v => /[\u0370-\u03FF\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0900-\u097F\u3040-\u30FF\u4E00-\u9FFF]/.test(v)
  },
  {
    id: 'emoji',
    label: 'Emoji',
    why: 'Multi-code-point characters that split words and can break counting per code unit rather than per character.',
    example: '"is 🎉 being 👨‍👩‍👧‍👦"',
    sample: 'is 🎉 being 👨‍👩‍👧‍👦 be 🇷🇴',
    detect: v => /\p{Extended_Pictographic}/u.test(v)
  }
];

export const totalClasses = inputClasses.length;
