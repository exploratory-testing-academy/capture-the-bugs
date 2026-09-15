// A requirement spec for E-Primer, written the way a product owner might hand
// it over before testing starts: what the system shall do, not what it
// currently does. Grounded in the same "what is this app for" understanding
// as testStrategy.js and userStories.js, but in "shall" form so it reads as
// an oracle a tester can check actual behaviour against.

export const requirements = {
  title: 'Requirements for E-Primer',
  sections: [
    {
      heading: 'Core analysis',
      items: [
        'The system shall accept free-text input of any length for analysis.',
        'The system shall detect every conjugated form of the verb "to be" — ' +
          'be, being, been, am, is, are, was, were — and their standard ' +
          'contractions and negations.',
        'The system shall treat equivalent contractions of the same to-be ' +
          'form consistently, regardless of which apostrophe character or ' +
          'quoting style was used to type them.',
        'The system shall not flag a word as a to-be violation merely ' +
          'because it contains or ends with letters that spell a to-be ' +
          'form — word boundaries, acronyms, and possessive endings shall ' +
          'be respected.',
        'The system shall report an accurate count of the words in the input.',
        'The system shall report an accurate count of discouraged words and ' +
          'possible violations, consistent with what is actually highlighted.'
      ]
    },
    {
      heading: 'Input handling',
      items: [
        'The system shall treat any standard whitespace character — space, ' +
          'tab, and newline — as a word separator.',
        'The system shall produce the same analysis for text regardless of ' +
          'which line-ending or whitespace convention it was typed or ' +
          'pasted with.',
        'The system shall handle non-English and non-Latin characters ' +
          'without corrupting word boundaries or counts.'
      ]
    },
    {
      heading: 'Output and display',
      items: [
        'The system shall display the input text back exactly as written, ' +
          'without interpreting it as markup or losing any characters.',
        'The system shall update the displayed results only in response to ' +
          'the text currently in the input, never showing a stale result ' +
          'from a previous check.',
        'The system shall present results in a way that fits the viewport, ' +
          'without requiring horizontal scrolling to read them.'
      ]
    },
    {
      heading: 'Accessibility and compatibility',
      items: [
        'The system shall remain fully operable using only a keyboard, with ' +
          'a visible indicator of which control currently has focus.',
        'The system shall announce updated results to assistive technology ' +
          'when a check completes.',
        'The system shall not rely on color alone to distinguish a hard ' +
          'violation from a possible one.',
        'The system shall render usably on both desktop and mobile screen ' +
          'sizes.'
      ]
    }
  ]
};
