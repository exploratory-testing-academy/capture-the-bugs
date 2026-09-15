// A simple, deliberately minimal set of user-story requirements for E-Primer,
// written the way a product brief might hand them over before testing starts.
// Kept separate from bugs.js and inputClasses.js: those describe what the
// answer key already knows about the app, this describes what the app is
// meant to do in the first place.

export const userStories = {
  title: 'User stories for E-Primer',
  items: [
    'As a writer, I want to paste or type my text into the tool, so that I can check it for uses of the verb "to be".',
    'As a writer, I want the tool to flag each violation of the E-Prime rule, so that I know exactly which sentences to revise.',
    'As a writer, I want to see a running count of violations, so that I can gauge how much rewriting is left to do.',
    'As a writer, I want the tool to tell me when something needs my own judgement rather than a fixed rule, so that I do not treat every flag as equally certain.',
    'As a writer, I want to check text of any length, from a single sentence to a full document, so that the tool is useful for both quick checks and full drafts.'
  ]
};
