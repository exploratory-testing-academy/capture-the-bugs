# Capture the Bugs

An exploratory testing exercise. Pick a target application, explore it, write up
the bugs you find, and get scored against a known bug list.

**→ [exploratory-testing-academy.github.io/capture-the-bugs](https://exploratory-testing-academy.github.io/capture-the-bugs/)**

An embedding model (`all-MiniLM-L6-v2`, ~30 MB, downloaded once) matches your
free-text reports against the bug list in your browser, so the scoring itself
happens on your machine.

## Recording

**Sessions are recorded.** The inputs you try, the findings you write and what
the evaluator made of them are saved to a Supabase database, so the exercise can
be studied and improved.

There is no name, login, e-mail or cohort token anywhere in this. A session
carries a random code like `keen-ember-2407`, shown while you work and again on
your results. Share it if you want your session looked at; keep it and nothing
connects the session to you. The code is per attempt: start over and you get a
new one. Your browser keeps a list of the codes it has produced so you can hand
over several if you like, and that list is never sent.

Worth being straight about: the *content* can identify even though the fields
don't. Findings are free prose, and people type all sorts of things into a text
box to see what happens.

`?record=off` disables recording for a run, and it is off automatically in
automated browsers so test runs stay out of the data.

The schema is one append-only table. The browser holds a publishable key whose
only privilege is `INSERT`, so a page cannot read, edit or delete any session —
which is why nothing session-level is stored as mutable state and
`session_summary` derives it in SQL instead. Apply
`supabase/migrations/20260805120000_recording.sql` with `supabase db push`, or
paste it into the SQL editor.

## How a session goes

1. Choose a target. It loads in the left panel, with your findings on the right.
2. Explore. Write up each bug in your own words — the matching is semantic, so
   you don't need to guess anyone's phrasing.
3. Submit for evaluation. You get the bugs you found, the ones you missed, and
   your score.

## Running locally

No build step. Serve the directory over HTTP — ES modules and `fetch` will not
work from `file://`:

```bash
python3 -m http.server 8000
# then open http://127.0.0.1:8000/index.html
```

## Tests

Playwright covers the harness and characterises the answer key:

```bash
npm install
npx playwright install chromium
npm test
```

`tests/bugs.spec.js` deliberately asserts the target's **current, buggy**
behaviour, with the correct value noted alongside. A failure there means a bug
stopped reproducing and `bugs.js` needs updating — not that the app regressed.

## Adding a target

Targets are self-contained under `targets/<id>/`:

| Path | Purpose |
| --- | --- |
| `app/` | the application under test, vendored as-is |
| `meta.json` | name, description, paths, attribution |
| `bugs.js` | the answer key — `matchText` is what the model embeds |
| `inputClasses.js` | optional; classes of input worth trying, each with a `detect(value)` predicate |

Add the id to `targets/index.json` and it appears on the welcome screen. A
target without `inputClasses.js` simply has no coverage reporting.

## Credits

The E-Primer target comes from the collections of
[Alan Richardson (eviltester)](https://github.com/eviltester/TestingApp).
