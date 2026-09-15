// The test strategy a tester could bring into a session with E-Primer:
// what the product is, the risks worth caring about, and how to go looking
// for them. Transcribed from a slide used to brief testers before this
// exercise, not derived from the answer key in bugs.js.

export const testStrategy = {
  title: 'Test strategy for E-Primer',
  sections: [
    {
      heading: 'What is the product?',
      items: [
        'E-Primer is an English text validator that checks text against specific ' +
          'rules around avoiding the verb "to be". It identifies rule breaking in ' +
          'two categories: one that can be checked by a rule, and another that ' +
          'needs human assessment (for now).'
      ]
    },
    {
      heading: 'What are the key potential risks?',
      items: [
        'It suggests the wrong corrections and misses corrections in realistic text samples',
        'It miscounts words in a way that leads us to underappreciate the scale of processing',
        'It looks wrong on some browsers and data samples',
        'It requires too much effort to learn in relation to the value of proofreading it provides'
      ]
    },
    {
      heading: 'How could we test the product so as to evaluate the actual risks associated with it?',
      items: [
        'Understand the rules of e-prime through research',
        'Collect data samples (short and long ones) that represent both e-prime text ' +
          'and text that violates rules of e-prime and run them through the program',
        "Verify common forms of 'to be' are systematically recognized across the samples",
        'Document specification as automation that shows the rules of e-prime and ' +
          'enables running subset of all tests across browsers',
        'Try fooling word count to count less words or more words by specific data samples',
        'Run the web page through a set of html-validators',
        'Visually verify the page with realistic e-prime text samples',
        'Read the code of the application for inspiration focusing on names of ' +
          'functions rather than understanding implementation',
        'Summarize learning obstacles for user and value of the application as comparison sheet'
      ]
    }
  ]
};
