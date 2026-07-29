# Capture the Bugs

An exploratory testing exercise. Pick a target application, explore it, write up
the bugs you find, and get scored against a known bug list — plus a report on
which *classes of input* you actually tried.

**→ [exploratory-testing-academy.github.io/capture-the-bugs](https://exploratory-testing-academy.github.io/capture-the-bugs/)**

Everything runs in your browser. An embedding model (`all-MiniLM-L6-v2`, ~30 MB,
downloaded once) matches your free-text reports against the bug list, so no
session data leaves your machine.

## How a session goes

1. Choose a target. It loads in the left panel, with your findings on the right.
2. Explore. Write up each bug in your own words — the matching is semantic, so
   you don't need to guess anyone's phrasing.
3. Submit for evaluation. You get bugs found, points, and input coverage.

## Input coverage

The exercise tracks which classes of input you put through the app, because a
class you never tried is a set of bugs you had no way of seeing. Coverage is
reported at the end alongside the bug score, and can be shown live while you
explore via the **Hints** control in the findings panel:

| Level | Shows while exploring |
| --- | --- |
| `off` | nothing |
| `count` | a progress sentence only (the default) |
| `detail` | also names the classes you have already exercised |
| `all` | the full checklist, with a sample you can copy into the app |

Even at `detail` the panel only ever names what you have already tried — never
what you are missing. Append `?hints=off` to the URL to fix the level for a
session, which overrides whatever the browser remembers.

## Running locally

No build step. Serve the directory over HTTP — ES modules and `fetch` will not
work from `file://`:

```bash
python3 -m http.server 8000
# then open http://127.0.0.1:8000/index.html
```

## Tests

Playwright covers the harness (input capture, coverage scoring, hint levels,
the report) and characterises the answer key:

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
