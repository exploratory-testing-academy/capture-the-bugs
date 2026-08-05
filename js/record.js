// Records a session to Supabase so the exercise itself can be studied: which
// inputs testers try, how they word their findings, what the evaluator made of
// them.
//
// Three properties shape everything here:
//
//   Append-only. The publishable key below is granted INSERT on public.events
//   and nothing else, so this module never reads or edits a row. Anything
//   session-level is derived in SQL (see supabase/migrations/).
//
//   Pseudonymous. No name, login or cohort token. A session carries a random
//   word-triple code, shown on screen, and the tester decides whether to share
//   it. The list of codes a browser has produced stays in localStorage and is
//   never sent, so nothing links one attempt to another server-side.
//
//   Never load-bearing. Recording being off, blocked or broken must not affect
//   the exercise, so every entry point swallows its own errors and the backlog
//   is bounded.

const SUPABASE_URL = 'https://ilzxtnnulegilgkjnhli.supabase.co';
// Publishable ("anon") key: public by design and safe in client source, because
// RLS gives it INSERT on one table and no way to read anything back.
const SUPABASE_KEY = 'sb_publishable_0KnLRfm7L1aRwo6f-YWDLg_mYKKXyDJ';
const ENDPOINT = `${SUPABASE_URL}/rest/v1/events`;

const FLUSH_MS = 10000;
const MAX_VALUE_CHARS = 4000;   // a bible.txt paste is a real input; rows stay small
const MAX_QUEUE = 500;          // bound the backlog when offline
// fetch(keepalive) caps the body at 64 KB, so an unload flush sends the most
// recent events and lets the rest go: a lost tail beats a dropped request.
const MAX_KEEPALIVE_EVENTS = 50;

const SESSION_KEY = id => `ctb-session-${id}`;
const CODE_LOG_KEY = 'ctb-session-log';
const MAX_LOGGED_CODES = 20;

// ── Session codes ────────────────────────────────────────────────────────────
// Read aloud across a room and typed into chat by hand, so: no digits that look
// like letters, no words that sting when paired with another. The SQL side pins
// this shape with a check constraint.

const ADJECTIVES = [
  'amber', 'bold', 'brave', 'brisk', 'calm', 'clear', 'clever', 'coral',
  'crisp', 'deft', 'eager', 'early', 'fair', 'fleet', 'gentle', 'glad',
  'grand', 'keen', 'kind', 'lively', 'loyal', 'lucid', 'mellow', 'merry',
  'mild', 'noble', 'proud', 'quick', 'quiet', 'rapid', 'ready', 'solid',
  'spry', 'steady', 'sunny', 'swift', 'tidy', 'true', 'vivid', 'warm', 'wise'
];
const NOUNS = [
  'alder', 'badger', 'beacon', 'birch', 'bison', 'brook', 'cedar', 'comet',
  'crane', 'delta', 'eagle', 'ember', 'falcon', 'ferry', 'fjord', 'harbor',
  'heron', 'ibex', 'island', 'jasper', 'kestrel', 'lantern', 'marten',
  'meadow', 'otter', 'pine', 'quarry', 'raven', 'ridge', 'river', 'saffron',
  'shore', 'sparrow', 'spruce', 'stork', 'summit', 'thistle', 'tundra',
  'vale', 'willow'
];

function randomInt(n) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % n;
}

function newCode() {
  const adj = ADJECTIVES[randomInt(ADJECTIVES.length)];
  const noun = NOUNS[randomInt(NOUNS.length)];
  return `${adj}-${noun}-${1000 + randomInt(9000)}`;
}

// ── State ────────────────────────────────────────────────────────────────────

let enabled = false;
let code = null;
let targetId = null;
let seq = 0;
let queue = [];
let timer = null;

let getInputs = () => [];
let getFindings = () => [];
let getHintLevel = () => null;

// What we last sent, per index, so a flush ships only what changed. Hashed
// rather than stored verbatim: these are persisted, and a value can be 30,000
// words long.
let sentInputs = [];
let sentFindings = [];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

// ── Enablement ───────────────────────────────────────────────────────────────

// Recording is on by default. `?record=off` opts out for a run; `?record=on`
// forces it back on, which is how the tests exercise the wire format.
function recordingEnabled() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return false;
  const flag = new URLSearchParams(location.search).get('record');
  if (flag === 'off') return false;
  if (flag === 'on') return true;
  // Automated browsers would otherwise fill the table with test runs.
  return !navigator.webdriver;
}

// ── Persistence ──────────────────────────────────────────────────────────────
// The code and the sent-signature baseline survive a reload, because re-entering
// a target resumes the same session and the restored inputs must not be sent
// twice.

function readSession(id) {
  try {
    const raw = localStorage.getItem(SESSION_KEY(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.code === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function persistSession() {
  if (!code || !targetId) return;
  try {
    localStorage.setItem(SESSION_KEY(targetId), JSON.stringify({
      code, seq, inputs: sentInputs, findings: sentFindings
    }));
  } catch { /* a full quota must not stop the exercise */ }
}

function clearStoredSession() {
  if (!targetId) return;
  try { localStorage.removeItem(SESSION_KEY(targetId)); } catch { /* ignore */ }
}

// Codes this browser has produced, newest first. Local only — never sent, so
// nothing on the server links one attempt to another.
export function localSessionLog() {
  try {
    const log = JSON.parse(localStorage.getItem(CODE_LOG_KEY) || '[]');
    return Array.isArray(log) ? log : [];
  } catch {
    return [];
  }
}

function logCode(newest, id) {
  try {
    const log = [{ code: newest, target_id: id, at: new Date().toISOString() }]
      .concat(localSessionLog().filter(e => e.code !== newest));
    localStorage.setItem(CODE_LOG_KEY, JSON.stringify(log.slice(0, MAX_LOGGED_CODES)));
  } catch { /* ignore */ }
}

// ── Event queue ──────────────────────────────────────────────────────────────

function clip(text) {
  const s = String(text ?? '');
  if (s.length <= MAX_VALUE_CHARS) return { value: s, chars: s.length, clipped: false };
  return { value: s.slice(0, MAX_VALUE_CHARS), chars: s.length, clipped: true };
}

function push(type, payload = {}) {
  if (!enabled || !code) return;
  queue.push({
    session_code: code,
    seq: seq++,
    at: new Date().toISOString(),
    type,
    payload
  });
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
}

// capture.js grows an entry in place while someone types, so the diff runs at
// flush time rather than per keystroke burst: the row that lands is the value
// they settled on, not every prefix of it.
function queueInputDiffs() {
  const entries = getInputs();
  entries.forEach((e, i) => {
    const signature = `${e.key}|${e.committed ? 1 : 0}|${hash(String(e.value))}`;
    if (sentInputs[i] === signature) return;
    sentInputs[i] = signature;
    const { value, chars, clipped } = clip(e.value);
    push('input', {
      index: i,
      field: e.key,
      label: e.label,
      field_type: e.type,
      committed: Boolean(e.committed),
      value,
      chars,
      clipped,
      typed_at: e.at ? new Date(e.at).toISOString() : null
    });
  });
  sentInputs.length = entries.length;
}

function queueFindingDiffs() {
  const items = getFindings();
  items.forEach((text, i) => {
    const t = String(text ?? '');
    const signature = hash(t);
    if (sentFindings[i] === signature) return;
    sentFindings[i] = signature;
    // The app opens with one empty finding card; that is not a report.
    if (t.trim().length === 0) return;
    const { value, chars, clipped } = clip(t);
    push('finding', { index: i, value, chars, clipped });
  });
  sentFindings.length = items.length;
}

async function flush({ keepalive = false } = {}) {
  if (!enabled) return;
  try {
    queueInputDiffs();
    queueFindingDiffs();
  } catch { /* a broken diff must not block events already queued */ }
  if (queue.length === 0) return;

  const batch = keepalive ? queue.slice(-MAX_KEEPALIVE_EVENTS) : queue;
  queue = [];
  persistSession();

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      keepalive,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        // Without this PostgREST returns the inserted rows, which would need a
        // SELECT privilege the anon role deliberately does not have.
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(batch)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    // Hold them for the next attempt rather than losing the session. On an
    // unload flush there is no next attempt, which is what the cap above is for.
    if (!keepalive) queue = batch.concat(queue).slice(-MAX_QUEUE);
  }
}

function startTimer() {
  stopTimer();
  timer = setInterval(() => { flush(); }, FLUSH_MS);
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

// A closed tab is the common ending, so flush on the way out. Both are no-ops
// while recording is off.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush({ keepalive: true });
});
window.addEventListener('pagehide', () => flush({ keepalive: true }));

// ── Public API ───────────────────────────────────────────────────────────────

export function isRecording() {
  return enabled;
}

// Send whatever is queued without waiting for the interval. The timer and the
// unload handlers call this on their own; exposed for DevTools and for tests
// that would rather not wait ten seconds.
export function flushNow() {
  return flush();
}

export function currentCode() {
  return code;
}

// Begin or resume the session for a target. Returns the code to show, or null
// when recording is off.
export function startSession(id, hooks = {}) {
  try {
    enabled = recordingEnabled();
    targetId = id;
    getInputs = hooks.getInputs || (() => []);
    getFindings = hooks.getFindings || (() => []);
    getHintLevel = hooks.getHintLevel || (() => null);
    if (!enabled) {
      code = null;
      return null;
    }

    const stored = readSession(id);
    code = stored ? stored.code : newCode();
    seq = stored && Number.isFinite(stored.seq) ? stored.seq : 0;
    sentInputs = stored && Array.isArray(stored.inputs) ? stored.inputs : [];
    sentFindings = stored && Array.isArray(stored.findings) ? stored.findings : [];

    push(stored ? 'session_resume' : 'session_start', {
      target_id: id,
      hint_level: getHintLevel(),
      user_agent: navigator.userAgent,
      language: navigator.language,
      tz_offset_minutes: new Date().getTimezoneOffset(),
      viewport: `${window.innerWidth}x${window.innerHeight}`
    });
    if (!stored) logCode(code, id);

    persistSession();
    startTimer();
    flush();
    return code;
  } catch {
    enabled = false;
    code = null;
    return null;
  }
}

// The tester discarded the captured inputs. Record what is about to vanish,
// then drop the baseline so the emptied list is not diffed against it.
export function noteReset() {
  try {
    if (!enabled) return;
    queueInputDiffs();
    push('reset', { inputs_discarded: getInputs().length });
    flush();
    // Only now drop the baseline. flush() diffs before it sends, so clearing it
    // any earlier makes the discarded inputs land a second time.
    sentInputs = [];
    persistSession();
  } catch { /* ignore */ }
}

export function noteEvaluation(results, coverage) {
  try {
    if (!enabled) return;
    push('evaluate', {
      matched_count: results.matchedCount,
      total_count: results.totalCount,
      earned_points: results.earnedPoints,
      matched_bug_ids: results.matchedBugs.map(b => b.id),
      missed_bug_ids: results.missedBugs.map(b => b.id),
      // Which report matched which bug, and how confidently — the raw material
      // for asking whether phrasing changes the match.
      report_matches: results.reportDetails.map((rd, i) => ({
        index: i,
        bug_id: rd.topMatch ? rd.topMatch.bug.id : null,
        score: rd.topMatch ? Number(rd.topMatch.score.toFixed(4)) : null
      })),
      coverage_percent: coverage ? coverage.percent : null,
      classes_covered: coverage ? coverage.coveredCount : null,
      classes_total: coverage ? coverage.totalCount : null,
      covered_class_ids: coverage ? coverage.covered.map(c => c.id) : null,
      hint_level: getHintLevel()
    });
    flush();
  } catch { /* ignore */ }
}

// Start Over: the attempt is finished, so close the session out and forget the
// code. Re-entering a target mints a new one.
export function endSession() {
  try {
    if (!enabled) return;
    queueInputDiffs();
    queueFindingDiffs();
    push('restart', {});
    flush({ keepalive: true });
    clearStoredSession();
    stopTimer();
    code = null;
  } catch { /* ignore */ }
}
