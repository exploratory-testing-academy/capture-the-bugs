# Capture the Bugs

An exploratory testing exercise. Pick a target application, explore it, write up
the bugs you find, and get scored against a known bug list.

**→ [exploratory-testing-academy.github.io/capture-the-bugs](https://exploratory-testing-academy.github.io/capture-the-bugs/)**

An embedding model (`all-MiniLM-L6-v2`, ~30 MB, downloaded once) matches your
free-text reports against the bug list in your browser, so the scoring itself
happens on your machine.

## Recording

**Sessions are recorded, and the recordings are public.** The inputs you try,
the findings you write and what the evaluator made of them are saved to a
Supabase database, so the exercise can be studied and improved — and they are
readable by anyone, not only by whoever runs this. `stats.html` displays them.

There is no name, login, e-mail or cohort token anywhere in this. A session
carries a random code like `keen-ember-2407`, shown while you work and again on
your results. Share it if you want your session looked at; keep it and nothing
connects the session to you. The code is per attempt: start over and you get a
new one. Your browser keeps a list of the codes it has produced so you can hand
over several if you like, and that list is never sent.

Worth being straight about: the *content* can identify even though the fields
don't. Findings are free prose, and people type all sorts of things into a text
box to see what happens — and here that prose is published, not merely stored.
The one thing held back is the browser fingerprint (user agent, language,
timezone, viewport), which the read views strip.

`?record=off` disables recording for a run, and it is off automatically in
automated browsers so test runs stay out of the data.

The schema is one append-only table. The browser holds a publishable key with
`INSERT` on that table and no `UPDATE` or `DELETE`, so a page can add to a
session but never edit or remove one — which is why nothing session-level is
stored as mutable state and `session_summary` derives it in SQL instead.

Reading goes through two views, `events_public` and `session_summary_public`,
which the key may `SELECT`; the base table stays unreadable to it. Putting the
read behind views is what makes the fingerprint redaction stick — a grant on the
table itself could be walked straight around.

Apply both migrations in `supabase/migrations/` with `supabase db push`, or
paste them into the SQL editor in filename order.

## Stats

`stats.html` reads the sessions back: how many people tried it, how far they
got, which bugs get found and which nobody ever matches, and which classes of
input go untried. The last two are the interesting ones — a bug matched by no
one is either genuinely invisible or worded in the answer key in a way no tester
would reach for, and that distinction is the difference between a hard bug and a
bad `matchText`.

It is not linked from the exercise, so nobody stumbles into the answer key
mid-session, but it is a published page like any other and reachable by URL.
The per-bug and per-class rollups join database ids against the answer key in
`targets/<id>/`, in the browser — the key is JavaScript, not database rows, so
that join cannot happen in SQL.

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
