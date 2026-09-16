// A minimal set of manual test cases for E-Primer, written the way a tester
// might jot them down from requirements.js before a session: just enough to
// exercise the core behaviour and a few edge cases, not an exhaustive suite.
// Each item names the input, the action, and the expected result in one line
// so it can be run by hand without extra setup.

export const testCases = {
  title: 'Test cases for E-Primer',
  sections: [
    {
      heading: 'Core analysis',
      items: [
        'Enter a sentence with no form of "to be" (e.g. "The cat sat on the mat.") — expect zero violations reported.',
        'Enter a sentence using a plain form of "to be" (e.g. "The cat is on the mat.") — expect exactly one violation, on "is".',
        'Enter a sentence using a contraction (e.g. "It\'s raining.") — expect the contraction flagged as a violation.',
        'Enter several sentences mixing violating and non-violating forms — expect the violation count to match only the "to be" occurrences.',
        'Enter a sentence containing a word that merely looks like a to-be form (e.g. "IS" as part of an acronym, or "bee") — expect it not to be flagged.'
      ]
    },
    {
      heading: 'Input handling',
      items: [
        'Enter a single word with no punctuation — expect the tool to analyze it without error.',
        'Paste in a large block of text (several paragraphs) — expect the tool to complete analysis without freezing or losing text.',
        'Enter text with mixed line endings and extra blank lines between sentences — expect the same violations and word count as the same text with normal spacing.',
        'Clear the input after checking text with violations — expect the results to update to show no violations, not the previous results.'
      ]
    },
    {
      heading: 'Display',
      items: [
        'Enter text with a violation and confirm the flagged word is visibly distinguished from the rest of the text.',
        'Enter text and confirm the displayed word count matches a manual count of the words entered.'
      ]
    }
  ]
};
