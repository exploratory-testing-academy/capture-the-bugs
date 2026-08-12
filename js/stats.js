// Reads the recorded sessions back out and reports on them.
//
// The mirror image of record.js: that module writes and never reads, this one
// reads and never writes. It queries two views — events_public and
// session_summary_public — which exist so that the browser fingerprint recorded
// on session_start can be dropped at the read boundary. public.events itself
// stays unreadable with this key (see supabase/migrations/).
//
// Two rollups here cannot be done in SQL, and that shapes the module: the
// answer key lives in targets/<id>/bugs.js and inputClasses.js, as JavaScript,
// not in the database. The database knows a session matched bug 7; only the
// browser knows bug 7 is "Undo loses text". So the ids come down over the wire
// and the join happens here.

const SUPABASE_URL = 'https://ilzxtnnulegilgkjnhli.supabase.co';
// The same publishable key the exercise writes with. It now also carries SELECT
// on the two _public views, and still has no access to the base table.
const SUPABASE_KEY = 'sb_publishable_0KnLRfm7L1aRwo6f-YWDLg_mYKKXyDJ';
const REST = `${SUPABASE_URL}/rest/v1`;
const HEADERS = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

// PostgREST caps a response well below this on its own; paging explicitly means
// the page grows past that cap without silently reporting on a truncated set.
const PAGE_SIZE = 1000;
const MAX_PAGES = 100;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const loadingEl = document.getElementById('stats-loading');
const loadingText = document.getElementById('stats-loading-text');
const errorEl = document.getElementById('stats-error');
const bodyEl = document.getElementById('stats-body');

// ── Fetching ─────────────────────────────────────────────────────────────────
async function fetchAll(view, query) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${REST}/${view}?${query}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`${view}: HTTP ${res.status} ${detail}`.trim());
    }
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
  return rows;
}

// The answer key is per target and loaded on demand, so a second target added
// later needs no change here — only its id appearing in the data.
async function loadAnswerKey(targetId) {
  const [bugsMod, classMod] = await Promise.all([
    import(`../targets/${targetId}/bugs.js`),
    import(`../targets/${targetId}/inputClasses.js`).catch(() => null)
  ]);
  return {
    bugs: bugsMod.bugs,
    classes: classMod ? classMod.inputClasses : []
  };
}

// ── Shaping ──────────────────────────────────────────────────────────────────
// Findings and inputs are both re-emitted as they change, and deleting one
// shifts every later index down, so a single position can appear many times
// over a session. The last write to it is the settled value.
function latestByIndex(events) {
  const latest = new Map();
  for (const e of events) {
    const key = `${e.session_code} ${e.payload.index}`;
    const prev = latest.get(key);
    if (!prev || e.seq > prev.seq) latest.set(key, e);
  }
  return [...latest.values()];
}

// A session may evaluate more than once. A bug counts as found if any of that
// session's evaluations matched it: the question is whether the tester ever got
// there, not whether their last run happened to include it.
function rollUp(summaries, evaluates, findings, inputs = []) {
  const sessions = new Map();
  for (const s of summaries) {
    sessions.set(s.session_code, {
      ...s,
      elapsedMs: new Date(s.last_seen) - new Date(s.first_seen),
      matchedBugIds: new Set(),
      coveredClassIds: new Set(),
      evaluations: [],
      findings: [],
      inputs: []
    });
  }

  for (const ev of [...evaluates].sort((a, b) => a.seq - b.seq)) {
    const s = sessions.get(ev.session_code);
    if (!s) continue;
    s.evaluations.push(ev);
    for (const id of ev.payload.matched_bug_ids || []) s.matchedBugIds.add(id);
    for (const id of ev.payload.covered_class_ids || []) s.coveredClassIds.add(id);
  }

  for (const f of latestByIndex(findings)) {
    const s = sessions.get(f.session_code);
    if (!s) continue;
    s.findings.push({ index: f.payload.index, value: f.payload.value, clipped: f.payload.clipped });
  }

  for (const i of latestByIndex(inputs)) {
    const s = sessions.get(i.session_code);
    if (!s) continue;
    s.inputs.push({
      index: i.payload.index,
      value: i.payload.value,
      committed: Boolean(i.payload.committed),
      chars: i.payload.chars,
      clipped: i.payload.clipped
    });
  }

  for (const s of sessions.values()) {
    s.findings.sort((a, b) => a.index - b.index);
    s.inputs.sort((a, b) => a.index - b.index);
  }

  return [...sessions.values()];
}

// Pairs each written finding with what the evaluator made of it.
//
// This needs care. report_matches indexes the findings list with blanks
// removed, while a finding event carries its index into the full list, so
// lining the two up positionally is only right when nothing has drifted — a
// finding cleared back to empty emits no event, so its last recorded value
// still reads as written. When the counts disagree the pairing would be
// silently wrong, and a wrong attribution is worse than none, so it gets
// dropped and the matches are shown on their own.
function interpret(session) {
  const last = session.evaluations[session.evaluations.length - 1];
  if (!last) return null;
  const matches = last.payload.report_matches || [];
  const written = session.findings.filter(f => f.value.trim().length > 0);
  return {
    matches,
    paired: written.length === matches.length
      ? written.map((finding, i) => ({ finding, match: matches[i] }))
      : null
  };
}

function rateRows(items, sessions, idOf, has) {
  const scored = sessions.filter(s => s.submitted);
  return items
    .map(item => {
      const hits = scored.filter(s => has(s, idOf(item))).length;
      return { item, hits, rate: scored.length ? hits / scored.length : 0 };
    })
    .sort((a, b) => a.rate - b.rate || String(idOf(a.item)).localeCompare(String(idOf(b.item))));
}

// ── Rendering ────────────────────────────────────────────────────────────────
function pct(n) {
  return `${Math.round(n * 100)}%`;
}

function count(n, noun) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

function duration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// Built with DOM calls rather than markup because most of what lands here is
// tester-written prose, and the answer key is not worth a second code path.
function rateRow(label, sub, hits, rate) {
  const row = document.createElement('div');
  row.className = `bug-item ${rate > 0 ? 'bug-found' : 'bug-missed'}`;

  const title = document.createElement('span');
  title.className = 'bug-title';
  title.textContent = label;
  row.appendChild(title);

  if (sub) {
    const cat = document.createElement('span');
    cat.className = 'bug-cat';
    cat.textContent = sub;
    row.appendChild(cat);
  }

  const bar = document.createElement('div');
  bar.className = 'cov-bar stat-bar';
  const fill = document.createElement('div');
  fill.className = 'cov-bar-fill';
  fill.style.width = `${Math.round(rate * 100)}%`;
  bar.appendChild(fill);
  row.appendChild(bar);

  const value = document.createElement('span');
  value.className = rate > 0 ? 'stat-rate' : 'stat-rate stat-zero';
  value.textContent = rate > 0 ? `${pct(rate)} (${hits})` : 'never';
  row.appendChild(value);

  return row;
}

// Whitespace is the whole point of half the input classes, so it has to stay
// visible. Follows displayValue() in app.js: a whitespace-only submission marks
// every space, since otherwise it renders as an empty box indistinguishable
// from having submitted nothing, while ordinary prose marks only the
// invisibles — dotting every space there would make it unreadable.
function visible(s) {
  if (s.trim().length === 0) {
    return s.replace(/\n/g, '↵').replace(/\t/g, '→').replace(/ /g, '·');
  }
  return s
    .replace(/\r/g, '␍')
    .replace(/\n/g, '↵')
    .replace(/\t/g, '⇥')
    .replace(/\u00A0/g, '␠')
    .replace(/[\u200B\u200C\uFEFF]/g, '∅');
}

function group(body, title, n) {
  const h = document.createElement('h3');
  h.className = 'cov-group';
  h.textContent = title;
  if (n !== undefined) {
    const c = document.createElement('span');
    c.className = 'missed-count';
    c.textContent = ` (${n})`;
    h.appendChild(c);
  }
  body.appendChild(h);
}

function valueBlock(text, whenEmpty) {
  const block = document.createElement('div');
  block.className = 'cov-value';
  if (text.length === 0) {
    block.classList.add('stat-empty');
    block.textContent = whenEmpty;
  } else {
    block.textContent = text;
  }
  return block;
}

function bugLine(id, bugsById) {
  const line = document.createElement('div');
  line.className = 'bug-item bug-found';
  const num = document.createElement('span');
  num.className = 'bug-id';
  num.textContent = `#${id}`;
  const title = document.createElement('span');
  title.className = 'bug-title';
  const bug = bugsById.get(id);
  title.textContent = bug ? bug.title : '(not in the current answer key)';
  line.append(num, title);
  return line;
}

// What the evaluator made of one report: the bug it landed on and how close it
// judged the wording, or that nothing cleared the threshold.
function interpLine(match, bugsById) {
  const line = document.createElement('div');
  line.className = 'stat-interp';

  const matched = Boolean(match) && match.bug_id != null;
  const badge = document.createElement('span');
  badge.className = `match-badge ${matched ? 'match-yes' : 'match-no'}`;
  badge.textContent = matched ? 'matched' : 'no match';
  line.appendChild(badge);

  const text = document.createElement('span');
  if (matched) {
    const bug = bugsById.get(match.bug_id);
    const score = match.score == null ? '' : ` · ${Math.round(match.score * 100)}% similar`;
    text.textContent = `#${match.bug_id} ${bug ? bug.title : '(not in the current answer key)'}${score}`;
  } else {
    text.textContent = 'nothing cleared the matching threshold';
  }
  line.appendChild(text);
  return line;
}

function sessionRow(s, bugsById) {
  const wrap = document.createElement('details');
  wrap.className = 'missed-category';

  const summary = document.createElement('summary');
  const code = document.createElement('code');
  code.textContent = s.session_code;

  const meta = document.createElement('span');
  meta.className = 'missed-count';
  const bits = [duration(s.elapsedMs), count(s.findings.length, 'finding')];
  if (s.inputs.length > 0) bits.push(count(s.inputs.length, 'input'));
  bits.push(s.submitted ? `${s.best_matched ?? 0} matched` : 'not submitted');
  if (s.restarted) bits.push('restarted');
  meta.textContent = `(${bits.join(' · ')})`;

  // The separating space is a node of its own: both siblings are set with
  // textContent, so there is no markup to carry it.
  summary.append(code, ' ', meta);
  wrap.appendChild(summary);

  const body = document.createElement('div');
  body.className = 'cov-body';
  const reading = interpret(s);

  if (s.findings.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No findings written.';
    body.appendChild(empty);
  } else {
    group(body, 'Findings', s.findings.length);
    const paired = reading && reading.paired;
    let written = 0;
    for (const f of s.findings) {
      body.appendChild(valueBlock(f.value + (f.clipped ? ' …[clipped]' : ''), '(empty)'));
      const isWritten = f.value.trim().length > 0;
      if (paired && isWritten) body.appendChild(interpLine(paired[written].match, bugsById));
      if (isWritten) written++;
    }
  }

  // Pairing was refused, so the readings go up whole rather than against the
  // wrong report.
  if (reading && !reading.paired && reading.matches.length > 0) {
    group(body, 'How the reports were read', reading.matches.length);
    const note = document.createElement('p');
    note.className = 'hint';
    note.textContent =
      'Listed on their own: the recorded order no longer lines up with the findings ' +
      'above, so pairing them could credit a match to the wrong report.';
    body.appendChild(note);
    reading.matches.forEach(m => body.appendChild(interpLine(m, bugsById)));
  }

  if (s.inputs.length > 0) {
    group(body, 'Inputs tried', s.inputs.length);
    for (const inp of s.inputs) {
      body.appendChild(valueBlock(visible(inp.value), '(submitted empty)'));
      const note = document.createElement('div');
      note.className = 'stat-interp';
      const badge = document.createElement('span');
      badge.className = `match-badge ${inp.committed ? 'match-yes' : 'match-no'}`;
      badge.textContent = inp.committed ? 'submitted' : 'typed, not submitted';
      note.appendChild(badge);
      if (inp.clipped) {
        const c = document.createElement('span');
        c.textContent = `${inp.chars} chars, stored truncated`;
        note.appendChild(c);
      }
      body.appendChild(note);
    }
  }

  // Wider than the reports above: the evaluator also credits a bug when a
  // second strong match falls out of the same report.
  if (s.matchedBugIds.size > 0) {
    group(body, 'Bugs credited', s.matchedBugIds.size);
    for (const id of [...s.matchedBugIds].sort((a, b) => a - b)) {
      body.appendChild(bugLine(id, bugsById));
    }
  }

  wrap.appendChild(body);
  return wrap;
}

function renderInto(container, rows) {
  container.replaceChildren();
  if (rows.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Nothing recorded yet.';
    container.appendChild(empty);
    return;
  }
  rows.forEach(r => container.appendChild(r));
}

export function render(sessions, keysByTarget) {
  const scored = sessions.filter(s => s.submitted);
  const totalBugs = [...keysByTarget.values()].reduce((n, k) => n + k.bugs.length, 0);

  document.getElementById('stat-sessions').textContent = String(sessions.length);
  document.getElementById('stat-submitted').textContent =
    sessions.length ? pct(scored.length / sessions.length) : '—';
  const avgFindings = sessions.length
    ? sessions.reduce((n, s) => n + s.findings.length, 0) / sessions.length
    : 0;
  document.getElementById('stat-findings').textContent = avgFindings.toFixed(1);
  const avgMatched = scored.length
    ? scored.reduce((n, s) => n + Number(s.best_matched || 0), 0) / scored.length
    : 0;
  document.getElementById('stat-matched').textContent = avgMatched.toFixed(1);
  document.getElementById('stat-total-bugs').textContent = String(totalBugs);

  const bugRows = [];
  const classRows = [];
  const bugsById = new Map();
  const multi = keysByTarget.size > 1;

  for (const [targetId, key] of keysByTarget) {
    const mine = sessions.filter(s => s.target_id === targetId);
    key.bugs.forEach(b => bugsById.set(b.id, b));

    if (multi) {
      for (const list of [bugRows, classRows]) {
        const h = document.createElement('h3');
        h.className = 'cov-group';
        h.textContent = targetId;
        list.push(h);
      }
    }
    rateRows(key.bugs, mine, b => b.id, (s, id) => s.matchedBugIds.has(id))
      .forEach(r => bugRows.push(rateRow(r.item.title, r.item.category, r.hits, r.rate)));
    rateRows(key.classes, mine, c => c.id, (s, id) => s.coveredClassIds.has(id))
      .forEach(r => classRows.push(rateRow(r.item.label, null, r.hits, r.rate)));
  }

  renderInto(document.getElementById('bug-stats'), bugRows);
  renderInto(document.getElementById('class-stats'), classRows);
  renderInto(
    document.getElementById('session-stats'),
    [...sessions]
      .sort((a, b) => new Date(b.first_seen) - new Date(a.first_seen))
      .map(s => sessionRow(s, bugsById))
  );

  loadingEl.style.display = 'none';
  bodyEl.style.display = 'block';
}

function fail(err) {
  loadingEl.style.display = 'none';
  errorEl.style.display = 'block';
  // 404 means the views do not exist, 401 means they exist but the grant did
  // not take. Both point at the same unapplied migration, and saying so beats
  // making someone decode PostgREST's error codes.
  const unapplied = /\b(401|404)\b/.test(err.message);
  errorEl.textContent =
    `Could not read the sessions: ${err.message}` +
    (unapplied
      ? ' — which usually means the read migration ' +
        '(supabase/migrations/20260812093000_public_read.sql) has not been applied yet.'
      : '');
}

// ── Init ─────────────────────────────────────────────────────────────────────
export async function load() {
  try {
    loadingText.textContent = 'Reading sessions…';
    const [summaries, evaluates, findings, inputs] = await Promise.all([
      fetchAll('session_summary_public', 'select=*'),
      fetchAll('events_public', 'select=session_code,seq,payload&type=eq.evaluate'),
      fetchAll('events_public', 'select=session_code,seq,payload&type=eq.finding'),
      fetchAll('events_public', 'select=session_code,seq,payload&type=eq.input')
    ]);

    const sessions = rollUp(summaries, evaluates, findings, inputs);
    const targetIds = [...new Set(sessions.map(s => s.target_id).filter(Boolean))];

    loadingText.textContent = 'Loading the answer key…';
    const keysByTarget = new Map();
    for (const id of targetIds) {
      try {
        keysByTarget.set(id, await loadAnswerKey(id));
      } catch {
        // A target recorded against but since removed should not blank the page.
      }
    }

    render(sessions, keysByTarget);
  } catch (err) {
    fail(err);
  }
}

// Mirrors app.js's window.__ctb hooks: lets the tests drive rendering from
// fixtures, and makes the shaping poke-able from DevTools.
window.__ctbStats = { load, render, rollUp, rateRows };

load();
