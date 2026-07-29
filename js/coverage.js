// Scores captured inputs against a target's list of input classes.
//
// Target-agnostic: it only needs each class to expose a `detect(value)`
// predicate. A target without an inputClasses module simply has no coverage.

// Detector results per entry, so the live strip can recompute on every
// captured input without re-scanning large pastes. Keyed on the entry object
// and invalidated when its value changes (typing extends a value in place).
const memo = new WeakMap();

function detects(cls, entry) {
  let rec = memo.get(entry);
  if (!rec || rec.value !== entry.value) {
    rec = { value: entry.value, results: new Map() };
    memo.set(entry, rec);
  }
  if (rec.results.has(cls.id)) return rec.results.get(cls.id);

  let matched = false;
  try {
    matched = Boolean(cls.detect(entry.value));
  } catch {
    matched = false; // a broken predicate must not sink the report
  }
  rec.results.set(cls.id, matched);
  return matched;
}

// This app only recomputes on button click, so a value that was typed but
// never submitted didn't actually exercise anything — tracked separately.
export function computeCoverage(classes, entries) {
  const classResults = classes.map(cls => {
    const hits = [];
    for (const entry of entries) {
      if (detects(cls, entry)) hits.push(entry);
    }

    const submitted = hits.filter(h => h.committed);
    return {
      id: cls.id,
      label: cls.label,
      why: cls.why,
      example: cls.example,
      // Carried through so the report can offer the same copy-pasteable
      // sample the live checklist does.
      sample: cls.sample,
      sampleNote: cls.sampleNote,
      hit: submitted.length > 0,
      typedOnly: submitted.length === 0 && hits.length > 0,
      hits: submitted.length > 0 ? submitted : hits
    };
  });

  const covered = classResults.filter(c => c.hit);
  const typedOnly = classResults.filter(c => c.typedOnly);
  const missed = classResults.filter(c => !c.hit && !c.typedOnly);

  return {
    classResults,
    covered,
    typedOnly,
    missed,
    coveredCount: covered.length,
    totalCount: classResults.length,
    percent: classResults.length
      ? Math.round((covered.length / classResults.length) * 100)
      : 0
  };
}

// Which classes an individual input landed in — useful for showing a tester
// that one well-chosen string covered several at once.
export function classifyValue(classes, value) {
  return classes
    .filter(cls => {
      try {
        return Boolean(cls.detect(value));
      } catch {
        return false;
      }
    })
    .map(cls => cls.id);
}
