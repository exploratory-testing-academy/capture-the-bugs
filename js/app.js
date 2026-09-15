import { loadModel, evaluateReports } from './evaluator.js';
import {
  startCapture, stopCapture, getCapturedInputs, clearCapturedInputs, onCapture,
  isCapturing
} from './capture.js';
import { computeCoverage, classifyValue } from './coverage.js';
import {
  startSession, endSession, noteReset, noteEvaluation, noteGuidance, currentCode,
  isRecording, localSessionLog, flushNow
} from './record.js';

// ── State ────────────────────────────────────────────────────────────────────
let findings = [];
let target = null;   // { meta, bugs, totalPoints }

// ── DOM refs ─────────────────────────────────────────────────────────────────
const views = {
  welcome: document.getElementById('welcome'),
  explore: document.getElementById('explore'),
  results: document.getElementById('results')
};
const targetList    = document.getElementById('target-list');
const findingsList  = document.getElementById('findings-list');
const findingCount  = document.getElementById('finding-count');
const evaluateBtn   = document.getElementById('evaluate-btn');
const loading       = document.getElementById('loading');
const loadingText   = document.getElementById('loading-text');
const scorecard     = document.getElementById('scorecard');
const restartBtn    = document.getElementById('restart-btn');

// ── View management ──────────────────────────────────────────────────────────
function showView(name) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[name].classList.add('active');
}

// ── Target loading ───────────────────────────────────────────────────────────
async function loadTargetList() {
  const res = await fetch('targets/index.json');
  const targetIds = await res.json();

  const metas = await Promise.all(
    targetIds.map(async id => {
      const r = await fetch(`targets/${id}/meta.json`);
      return r.json();
    })
  );

  targetList.innerHTML = '';
  for (const meta of metas) {
    const card = document.createElement('button');
    card.className = 'target-card';
    card.innerHTML = `
      <strong>${meta.name}</strong>
      <span>${meta.description}</span>
    `;
    card.addEventListener('click', () => startTarget(meta));
    targetList.appendChild(card);
  }
}

async function startTarget(meta) {
  const bugsModule = await import(`../${meta.bugsModule}`);

  // Optional per-target list of input classes a tester should exercise.
  let inputClasses = [];
  if (meta.inputClassesModule) {
    const mod = await import(`../${meta.inputClassesModule}`);
    inputClasses = mod.inputClasses;
  }

  // Optional per-target guidance: none of these are derived from the answer
  // key, so a target that has not written them yet simply has nothing to show.
  let userStories = null;
  if (meta.userStoriesModule) {
    const mod = await import(`../${meta.userStoriesModule}`);
    userStories = mod.userStories;
  }
  let testStrategy = null;
  if (meta.testStrategyModule) {
    const mod = await import(`../${meta.testStrategyModule}`);
    testStrategy = mod.testStrategy;
  }
  let requirements = null;
  if (meta.requirementsModule) {
    const mod = await import(`../${meta.requirementsModule}`);
    requirements = mod.requirements;
  }

  target = {
    meta,
    bugs: bugsModule.bugs,
    totalPoints: bugsModule.totalPoints,
    inputClasses,
    userStories,
    testStrategy,
    requirements
  };

  // Restore findings for this target
  findings = JSON.parse(
    localStorage.getItem(`ctb-findings-${meta.id}`) || '[]'
  );

  // Set up the explore view
  document.getElementById('target-name').textContent = meta.name;
  const frame = document.getElementById('target-frame');
  // Attach before setting src so the target's first load is observed.
  startCapture(frame, meta.id);
  frame.src = meta.appPath;

  // Recording starts with the session, not with the first input, so an attempt
  // that produces nothing is still visible as an attempt.
  startSession(meta.id, {
    getInputs: getCapturedInputs,
    getFindings: () => findings,
    getHintLevel: () => hintLevel
  });
  renderSessionCode();

  // Refresh the live strip as inputs land, plus once now for restored state.
  onCapture(renderLiveCoverage);
  renderLiveCoverage();
  renderResultHints();
  closeGuidancePanel();

  showView('explore');
  if (findings.length === 0) addFinding();
  else renderFindings();
}

// ── Findings management ──────────────────────────────────────────────────────
function saveFindingsToStorage() {
  if (!target) return;
  localStorage.setItem(`ctb-findings-${target.meta.id}`, JSON.stringify(findings));
}

function updateFindingCount() {
  const n = findings.filter(f => f.trim().length > 0).length;
  findingCount.textContent = `${n} finding${n !== 1 ? 's' : ''}`;
  evaluateBtn.disabled = n === 0;
}

function renderFindings() {
  findingsList.innerHTML = '';
  findings.forEach((text, i) => {
    const card = document.createElement('div');
    card.className = 'finding-card';
    card.innerHTML = `
      <div class="finding-header">
        <span class="finding-number">#${i + 1}</span>
        <button class="btn-icon delete-finding" data-index="${i}" title="Remove">&times;</button>
      </div>
      <textarea class="finding-text" data-index="${i}" rows="2"
        placeholder="Describe the bug you found...">${text}</textarea>
    `;
    findingsList.appendChild(card);
  });

  findingsList.querySelectorAll('.finding-text').forEach(ta => {
    ta.addEventListener('input', (e) => {
      const idx = parseInt(e.target.dataset.index);
      findings[idx] = e.target.value;
      saveFindingsToStorage();
      updateFindingCount();
    });
  });
  findingsList.querySelectorAll('.delete-finding').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.index);
      findings.splice(idx, 1);
      saveFindingsToStorage();
      renderFindings();
      updateFindingCount();
    });
  });

  updateFindingCount();
}

function addFinding() {
  findings.push('');
  saveFindingsToStorage();
  renderFindings();
  const textareas = findingsList.querySelectorAll('.finding-text');
  const last = textareas[textareas.length - 1];
  last.focus();
  last.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Results rendering ────────────────────────────────────────────────────────
function renderResults(results) {
  document.getElementById('score-found').textContent = results.matchedCount;
  document.getElementById('score-total').textContent = results.totalCount;
  document.getElementById('score-points').textContent = results.earnedPoints;
  document.getElementById('score-total-points').textContent = target.totalPoints;

  const pct = Math.round((results.matchedCount / results.totalCount) * 100);
  document.getElementById('score-pct').textContent = `${pct}%`;

  renderCoverage(computeCoverage(target.inputClasses, getCapturedInputs()));

  const detailsEl = document.getElementById('report-details');
  detailsEl.innerHTML = '';
  results.reportDetails.forEach((rd, i) => {
    const div = document.createElement('div');
    div.className = 'report-detail';
    const matchHtml = rd.topMatch
      ? `<span class="match-badge match-yes">Bug #${rd.topMatch.bug.id}: ${rd.topMatch.bug.title}
           <span class="confidence">${Math.round(rd.topMatch.score * 100)}% match</span></span>`
      : `<span class="match-badge match-no">No confident match</span>`;
    div.innerHTML = `
      <div class="report-text"><strong>#${i + 1}:</strong> ${escapeHtml(rd.report)}</div>
      <div class="report-match">${matchHtml}</div>
    `;
    detailsEl.appendChild(div);
  });

  const matchedEl = document.getElementById('matched-list');
  matchedEl.innerHTML = '';
  if (results.matchedBugs.length === 0) {
    matchedEl.innerHTML = '<p class="empty-state">No bugs matched your reports.</p>';
  } else {
    results.matchedBugs
      .sort((a, b) => a.id - b.id)
      .forEach(bug => {
        matchedEl.innerHTML += `
          <div class="bug-item bug-found">
            <span class="bug-id">#${bug.id}</span>
            <span class="bug-title">${bug.title}</span>
            <span class="bug-cat">${bug.category}</span>
            <span class="bug-pts">+${bug.points} pts</span>
          </div>`;
      });
  }

  const missedEl = document.getElementById('missed-list');
  missedEl.innerHTML = '';
  for (const [cat, catBugs] of bugsByCategory(results.missedBugs)) {
    missedEl.appendChild(categoryBlock(cat, catBugs, `${catBugs.length} missed`));
  }
}

// Groups bugs by category, preserving the order categories first appear in
// the answer key. Shared by the post-evaluation "Bugs You Missed" list and
// the pre-evaluation results hints below.
function bugsByCategory(bugs) {
  const byCategory = new Map();
  for (const bug of bugs) {
    if (!byCategory.has(bug.category)) byCategory.set(bug.category, []);
    byCategory.get(bug.category).push(bug);
  }
  return byCategory;
}

// A collapsible category with one row per bug: id, title and points, but
// never matchText — that stays reserved for the post-run matching itself.
function categoryBlock(cat, catBugs, countLabel) {
  const section = document.createElement('details');
  section.className = 'missed-category';
  section.innerHTML = `
    <summary>${escapeHtml(cat)} <span class="missed-count">(${countLabel})</span></summary>
    ${catBugs.map(bug => `
      <div class="bug-item bug-missed">
        <span class="bug-id">#${bug.id}</span>
        <span class="bug-title">${escapeHtml(bug.title)}</span>
        <span class="bug-pts">${bug.points} pts</span>
      </div>`).join('')}
  `;
  return section;
}

// ── Input coverage ───────────────────────────────────────────────────────────

// Captured values are arbitrary tester input: whitespace needs to stay visible
// and a 31k-word paste needs truncating.
function displayValue(v) {
  if (v.length === 0) return '(submitted empty)';
  if (v.trim().length === 0) {
    return v.replace(/\n/g, '↵').replace(/\t/g, '→').replace(/ /g, '·');
  }
  const MAX = 120;
  const oneLine = v.replace(/\n/g, ' ↵ ');
  return oneLine.length > MAX
    ? `${oneLine.slice(0, MAX)}… (${v.length} chars)`
    : oneLine;
}

// ── Live coverage strip ──────────────────────────────────────────────────────

// How much coverage feedback the tester sees *while exploring*. The end-of-run
// report always shows everything — this only governs mid-session hinting.
//   off    — nothing; the session stays a blind exploration
//   count  — a progress sentence only, no hint as to which classes are left
//   detail — also names the classes already exercised
//   all    — the full checklist, including what hasn't been tried yet
// `?hints=off` in the URL wins, so a facilitator can hand out a fixed link.
const HINT_LEVELS = ['off', 'count', 'detail', 'all'];
const hintSelect = document.getElementById('cov-hint-level');

function resolveHintLevel() {
  const fromUrl = new URLSearchParams(location.search).get('hints');
  if (HINT_LEVELS.includes(fromUrl)) return fromUrl;
  const stored = localStorage.getItem('ctb-hint-level');
  if (HINT_LEVELS.includes(stored)) return stored;
  return 'count';
}

let hintLevel = resolveHintLevel();

// Naming un-hit classes mid-session would hand over the answer key, so even at
// `detail` the strip only reports what the tester has already put through.
function renderLiveCoverage() {
  const strip = document.getElementById('coverage-live');
  const bar = document.getElementById('cov-bar');
  const chips = document.getElementById('cov-live-chips');
  const msg = document.getElementById('cov-live-msg');

  if (!target || target.inputClasses.length === 0) {
    strip.style.display = 'none';
    return;
  }
  strip.style.display = 'block';
  hintSelect.value = hintLevel;

  if (hintLevel === 'off') {
    bar.style.display = 'none';
    chips.style.display = 'none';
    document.getElementById('cov-live-list').style.display = 'none';
    msg.textContent = 'Coverage feedback hidden';
    msg.className = 'cov-msg-muted';
    return;
  }

  const cov = computeCoverage(target.inputClasses, getCapturedInputs());
  bar.style.display = 'block';
  msg.className = '';
  msg.textContent = cov.coveredCount === 0
    ? `We expect you to try ${cov.totalCount} kinds of input.`
    : `We expect you've tried ${cov.coveredCount} of ${cov.totalCount} kinds of input.`;
  document.getElementById('cov-live-fill').style.width = `${cov.percent}%`;

  const list = document.getElementById('cov-live-list');

  if (hintLevel === 'count') {
    chips.style.display = 'none';
    list.style.display = 'none';
    return;
  }

  // `all` reveals the whole checklist with a copy-pasteable sample per class.
  // The reasoning behind each one stays in the post-run report.
  if (hintLevel === 'all') {
    chips.style.display = 'none';
    list.style.display = 'block';
    list.innerHTML = '';
    const state = new Map([
      ...cov.covered.map(c => [c.id, 'hit']),
      ...cov.typedOnly.map(c => [c.id, 'typed'])
    ]);
    for (const c of target.inputClasses) {
      list.appendChild(liveRow(c, state.get(c.id) || 'todo'));
    }
    return;
  }

  list.style.display = 'none';
  chips.style.display = 'flex';
  chips.innerHTML = '';

  const shown = [
    ...cov.covered.map(c => ({ c, kind: 'hit' })),
    ...cov.typedOnly.map(c => ({ c, kind: 'typed' }))
  ];

  if (shown.length === 0) {
    chips.innerHTML =
      '<span class="cov-chip-empty">Nothing submitted to the app yet.</span>';
    return;
  }

  for (const { c, kind } of shown) {
    const chip = document.createElement('span');
    chip.className = `cov-chip cov-chip-${kind}`;
    chip.textContent = c.label;
    if (kind === 'typed') chip.title = 'Typed but not submitted — click through to count it';
    chips.appendChild(chip);
  }
}

hintSelect.addEventListener('change', () => {
  hintLevel = hintSelect.value;
  localStorage.setItem('ctb-hint-level', hintLevel);
  renderLiveCoverage();
});

// ── Results hints ────────────────────────────────────────────────────────────
// Unlike input hints, there is no exercised/missing split to reveal mid-session:
// whether a report actually matches a bug is only known once the AI model runs
// at evaluation time. So this only controls how much of the category breakdown
// to show, and `details` still withholds matchText — the text that drives
// matching stays reserved for the post-run report, same as input hints never
// hand over the `why` behind a class.
//   off      — nothing
//   count    — a total across categories, no category names
//   category — category names and how many bugs sit in each
//   details  — each category expanded to bug id, title and points
const RESULT_HINT_LEVELS = ['off', 'count', 'category', 'details'];
const resHintSelect = document.getElementById('res-hint-level');

function resolveResultHintLevel() {
  const fromUrl = new URLSearchParams(location.search).get('resultHints');
  if (RESULT_HINT_LEVELS.includes(fromUrl)) return fromUrl;
  const stored = localStorage.getItem('ctb-result-hint-level');
  if (RESULT_HINT_LEVELS.includes(stored)) return stored;
  return 'count';
}

let resultHintLevel = resolveResultHintLevel();

function renderResultHints() {
  const panel = document.getElementById('results-hints');
  const msg = document.getElementById('res-hint-msg');
  const list = document.getElementById('res-hint-categories');

  if (!target || target.bugs.length === 0) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';
  resHintSelect.value = resultHintLevel;
  list.innerHTML = '';

  if (resultHintLevel === 'off') {
    msg.textContent = 'Result hints hidden';
    msg.className = 'cov-msg-muted';
    return;
  }

  const byCategory = bugsByCategory(target.bugs);
  const triggerable = target.bugs.filter(b => b.inputTriggerable).length;
  const highImpact = target.bugs.filter(b => b.highImpact).length;
  msg.className = '';
  msg.textContent =
    `There are ${target.bugs.length} bugs across ${byCategory.size} categories waiting to be found ` +
    `— ${triggerable} triggered by specific input, ${target.bugs.length - triggerable} found by observation, ` +
    `${highImpact} of them high impact.`;

  if (resultHintLevel === 'count') return;

  if (resultHintLevel === 'category') {
    const chips = document.createElement('div');
    chips.className = 'res-cat-chips';
    for (const [cat, catBugs] of byCategory) {
      const chip = document.createElement('span');
      chip.className = 'res-cat-chip';
      chip.textContent = `${cat} (${catBugs.length})`;
      chips.appendChild(chip);
    }
    list.appendChild(chips);
    return;
  }

  // 'details'
  for (const [cat, catBugs] of byCategory) {
    const label = `${catBugs.length} ${catBugs.length === 1 ? 'bug' : 'bugs'}`;
    list.appendChild(categoryBlock(cat, catBugs, label));
  }
}

resHintSelect.addEventListener('change', () => {
  resultHintLevel = resHintSelect.value;
  localStorage.setItem('ctb-result-hint-level', resultHintLevel);
  renderResultHints();
});

// ── Give me one ──────────────────────────────────────────────────────────────
// A single explicit nudge, independent of the ambient hint level above: a coin
// flip between naming one input class to try and one bug category to look in.
// Input classes already exercised are worth less as a nudge, so those are
// skipped while any untried one remains.
document.getElementById('give-hint-btn').addEventListener('click', () => {
  if (!target) return;
  const canInput = target.inputClasses.length > 0;
  const canBug = target.bugs.length > 0;
  if (!canInput && !canBug) return;

  const kind = canInput && canBug
    ? (Math.random() < 0.5 ? 'input' : 'bug')
    : (canInput ? 'input' : 'bug');

  const box = document.getElementById('give-hint-result');
  box.style.display = 'block';

  if (kind === 'input') {
    const cov = computeCoverage(target.inputClasses, getCapturedInputs());
    const hitIds = new Set(cov.covered.map(c => c.id));
    const untried = target.inputClasses.filter(c => !hitIds.has(c.id));
    const pool = untried.length > 0 ? untried : target.inputClasses;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    box.innerHTML = `<span class="give-hint-kind">Input</span>${escapeHtml(pick.label)}`;
  } else {
    const bug = target.bugs[Math.floor(Math.random() * target.bugs.length)];
    box.innerHTML = `<span class="give-hint-kind">Bug category</span>${escapeHtml(bug.category)}`;
  }
});

// ── Guidance (user stories / test strategy / requirements) ─────────────────
// Reference material to bring into a session, not feedback on it — unlike
// everything else in the Hints panel this never changes with what the tester
// has done so far, so there is nothing to re-render as they work. Table-driven
// so a fourth button is one entry here, not a rewrite of the toggle logic.
const GUIDANCE_BUTTONS = [
  { kind: 'stories', btn: document.getElementById('user-stories-btn'), data: () => target.userStories },
  { kind: 'requirements', btn: document.getElementById('requirements-btn'), data: () => target.requirements },
  { kind: 'strategy', btn: document.getElementById('test-strategy-btn'), data: () => target.testStrategy }
];
const guidanceContent = document.getElementById('guidance-content');
let guidanceShown = null; // null | 'stories' | 'strategy' | 'requirements'

function closeGuidancePanel() {
  guidanceShown = null;
  guidanceContent.style.display = 'none';
  guidanceContent.replaceChildren();
  for (const g of GUIDANCE_BUTTONS) g.btn.setAttribute('aria-expanded', 'false');
}

function renderGuidance(data) {
  guidanceContent.replaceChildren();
  if (!data) {
    const p = document.createElement('p');
    p.className = 'empty-state';
    p.textContent = 'Not written up for this target yet.';
    guidanceContent.appendChild(p);
    return;
  }

  const h = document.createElement('h4');
  h.className = 'guidance-title';
  h.textContent = data.title;
  guidanceContent.appendChild(h);

  const itemList = (items) => {
    const ul = document.createElement('ul');
    items.forEach(text => {
      const li = document.createElement('li');
      li.textContent = text;
      ul.appendChild(li);
    });
    guidanceContent.appendChild(ul);
  };

  if (data.items) itemList(data.items);

  if (data.sections) {
    for (const section of data.sections) {
      const h5 = document.createElement('h5');
      h5.className = 'guidance-heading';
      h5.textContent = section.heading;
      guidanceContent.appendChild(h5);
      itemList(section.items);
    }
  }
}

function toggleGuidance(kind, data) {
  if (guidanceShown === kind) {
    closeGuidancePanel();
    return;
  }
  guidanceShown = kind;
  guidanceContent.style.display = 'block';
  for (const g of GUIDANCE_BUTTONS) g.btn.setAttribute('aria-expanded', String(g.kind === kind));
  renderGuidance(data);
  noteGuidance(kind);
}

for (const g of GUIDANCE_BUTTONS) {
  g.btn.addEventListener('click', () => {
    if (!target) return;
    toggleGuidance(g.kind, g.data());
  });
}

// Captured inputs persist per target, so re-entering a target resumes the old
// session. This is the explicit way to start counting from zero again — and
// since the point is a genuinely blind reattempt, it goes further than just
// the inputs: a new session code, and every hint level back to off, so the
// next attempt cannot lean on hints revealed during the last one. That part
// must happen every click, even if nothing was captured yet — only the
// discard-and-log step is conditional on there being something to discard.
document.getElementById('cov-reset').addEventListener('click', () => {
  if (!target) return;
  if (getCapturedInputs().length > 0) {
    // Record what is about to be discarded before discarding it: how often
    // someone recounts from zero is itself worth knowing. Recorded against
    // the session that is about to close, not the new one.
    noteReset();
    clearCapturedInputs();
  }

  hintLevel = 'off';
  localStorage.setItem('ctb-hint-level', hintLevel);
  resultHintLevel = 'off';
  localStorage.setItem('ctb-result-hint-level', resultHintLevel);
  closeGuidancePanel();
  document.getElementById('give-hint-result').style.display = 'none';

  // Closing the session flushes whatever findings were written under it
  // before the list is wiped below — the same way clearCapturedInputs() above
  // only happens after noteReset() has already flushed the inputs.
  endSession();
  findings = [];
  addFinding();

  startSession(target.meta.id, {
    getInputs: getCapturedInputs,
    getFindings: () => findings,
    getHintLevel: () => hintLevel
  });
  renderSessionCode();

  renderLiveCoverage();
  renderResultHints();
});

const COV_BADGE = { hit: '✓', typed: '~', missed: '·', todo: '·' };

// Samples may hold whitespace and invisible characters that must stay legible.
// ZWJ is left alone so emoji sequences still render as one glyph.
function sampleDisplay(s) {
  const vis = s
    .replace(/\r/g, '␍')
    .replace(/\n/g, '↵')
    .replace(/\t/g, '⇥')
    .replace(/\u00A0/g, '␠')
    .replace(/[\u200B\u200C\uFEFF]/g, '∅');
  return vis.length > 90 ? `${vis.slice(0, 90)}… (${s.length} chars)` : vis;
}

// A copy-pasteable sample plus a copy button. Built with DOM calls rather than
// markup so the raw sample never has to survive HTML escaping.
function sampleBlock(c) {
  const wrap = document.createElement('div');
  wrap.className = 'cov-sample';

  if (c.sample === undefined) {
    const note = document.createElement('span');
    note.className = 'cov-sample-note';
    note.textContent = c.sampleNote || '';
    wrap.appendChild(note);
    return wrap;
  }

  const code = document.createElement('code');
  code.textContent = c.sampleNote || sampleDisplay(c.sample);
  wrap.appendChild(code);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cov-copy';
  if (c.sample.length === 0) {
    btn.textContent = '—';
    btn.disabled = true;
    btn.title = 'Nothing to copy — just submit with the box empty';
  } else {
    btn.textContent = 'Copy';
    btn.title = 'Copy this input to the clipboard';
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(c.sample);
        btn.textContent = 'Copied';
      } catch {
        btn.textContent = 'Copy failed';
      }
      setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
    });
  }
  wrap.appendChild(btn);
  return wrap;
}

function coverageRow(c, kind) {
  const el = document.createElement('details');
  el.className = `missed-category cov-${kind}`;
  el.innerHTML = `
    <summary><span class="cov-badge">${COV_BADGE[kind]}</span> ${escapeHtml(c.label)}</summary>
    <div class="cov-body"><p class="cov-why">${escapeHtml(c.why)}</p></div>
  `;
  const body = el.querySelector('.cov-body');

  if (kind === 'missed') {
    body.appendChild(sampleBlock(c));
    return el;
  }

  for (const v of new Set(c.hits.map(h => displayValue(h.value)))) {
    const div = document.createElement('div');
    div.className = 'cov-value';
    div.textContent = v;
    body.appendChild(div);
  }
  if (kind === 'typed') {
    const note = document.createElement('p');
    note.className = 'cov-why';
    note.textContent =
      'You typed this but never clicked through, so the app never processed it.';
    body.appendChild(note);
  }
  return el;
}

// One row of the `all` checklist: state, label, and a sample to copy.
function liveRow(c, kind) {
  const row = document.createElement('div');
  row.className = `cov-live-row cov-live-${kind}`;
  const head = document.createElement('div');
  head.className = 'cov-live-row-head';
  head.innerHTML =
    `<span class="cov-badge">${COV_BADGE[kind]}</span>${escapeHtml(c.label)}`;
  row.appendChild(head);
  row.appendChild(sampleBlock(c));
  return row;
}

function renderCoverage(cov) {
  const section = document.getElementById('coverage-section');
  const block = document.getElementById('score-classes-block');

  // Targets without an inputClasses module simply have no coverage to show.
  if (cov.totalCount === 0) {
    section.style.display = 'none';
    block.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  block.style.display = 'block';

  document.getElementById('score-classes').textContent = cov.coveredCount;
  document.getElementById('score-total-classes').textContent = cov.totalCount;

  const list = document.getElementById('coverage-list');
  list.innerHTML = '';

  const groups = [
    ['Exercised', cov.covered, 'hit'],
    ['Typed but not submitted', cov.typedOnly, 'typed'],
    ['Never tried', cov.missed, 'missed']
  ];

  for (const [title, items, kind] of groups) {
    if (items.length === 0) continue;
    const h = document.createElement('h3');
    h.className = 'cov-group';
    h.innerHTML = `${title} <span class="missed-count">(${items.length})</span>`;
    list.appendChild(h);
    items.forEach(c => list.appendChild(coverageRow(c, kind)));
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ── Session code ─────────────────────────────────────────────────────────────
// The only thing tying a recorded session to the person who ran it, and only if
// they choose to pass it on. Shown while exploring and again on the results,
// which is when someone decides whether to share it.

function wireCopy(btn, getText) {
  btn.addEventListener('click', async () => {
    const text = getText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'Copied';
    } catch {
      btn.textContent = 'Copy failed';
    }
    setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
  });
}

function renderSessionCode() {
  const bar = document.getElementById('session-bar');
  const code = currentCode();
  // Nothing to show when recording is off: no code exists to share.
  bar.style.display = isRecording() && code ? 'flex' : 'none';
  if (code) document.getElementById('session-code').textContent = code;
}

function renderSessionResults() {
  const section = document.getElementById('session-section');
  const code = currentCode();
  section.style.display = isRecording() && code ? 'block' : 'none';
  if (!code) return;

  document.getElementById('results-session-code').textContent = code;

  // Earlier codes from this browser, so someone who restarted can hand over the
  // whole picture. This list is local; the database never links the attempts.
  const past = localSessionLog().filter(e => e.code !== code);
  const el = document.getElementById('past-sessions');
  el.innerHTML = '';
  if (past.length === 0) return;

  const p = document.createElement('p');
  p.className = 'hint';
  p.textContent = 'Earlier sessions from this browser:';
  el.appendChild(p);
  for (const entry of past) {
    const row = document.createElement('div');
    row.className = 'past-session';
    const c = document.createElement('code');
    c.textContent = entry.code;
    row.appendChild(c);
    const when = document.createElement('span');
    when.className = 'past-session-when';
    when.textContent = `${entry.target_id} · ${new Date(entry.at).toLocaleString()}`;
    row.appendChild(when);
    el.appendChild(row);
  }
}

wireCopy(document.getElementById('session-copy'), currentCode);
wireCopy(document.getElementById('results-session-copy'), currentCode);

// ── Evaluation flow ──────────────────────────────────────────────────────────
async function runEvaluation() {
  showView('results');
  loading.style.display = 'flex';
  scorecard.style.display = 'none';
  restartBtn.style.display = 'none';

  try {
    loadingText.textContent = 'Loading AI model (first time may download ~30 MB)...';

    await loadModel(target.bugs, (progress) => {
      if (progress.status === 'progress' && progress.total) {
        const pct = Math.round((progress.loaded / progress.total) * 100);
        loadingText.textContent = `Downloading model... ${pct}%`;
      } else if (progress.status === 'ready') {
        loadingText.textContent = 'Model ready, evaluating your findings...';
      }
    });

    loadingText.textContent = 'Matching your reports against known bugs...';
    const nonEmpty = findings.filter(f => f.trim().length > 0);
    const results = await evaluateReports(nonEmpty);

    loading.style.display = 'none';
    scorecard.style.display = 'block';
    restartBtn.style.display = 'inline-block';
    renderResults(results);

    noteEvaluation(results, computeCoverage(target.inputClasses, getCapturedInputs()));
    renderSessionResults();
  } catch (err) {
    loadingText.textContent = `Error: ${err.message}. Try refreshing the page.`;
    console.error(err);
  }
}

// ── Event binding ────────────────────────────────────────────────────────────
document.getElementById('add-finding-btn').addEventListener('click', addFinding);

evaluateBtn.addEventListener('click', () => {
  const nonEmpty = findings.filter(f => f.trim().length > 0);
  if (nonEmpty.length === 0) {
    alert('Write at least one finding before evaluating.');
    return;
  }
  runEvaluation();
});

restartBtn.addEventListener('click', () => {
  // Closes the session out: the next target entry mints a fresh code.
  endSession();
  findings = [];
  saveFindingsToStorage();
  clearCapturedInputs();
  stopCapture();
  showView('welcome');
});

// ── Inspection hooks (DevTools) ───────────────────────────────────────────────
window.__ctb = {
  inputs: getCapturedInputs,

  // Whether capture is live on the target document yet.
  capturing: isCapturing,

  // Which of the target's input classes the session actually exercised.
  coverage() {
    if (!target) return 'Pick a target first.';
    const cov = computeCoverage(target.inputClasses, getCapturedInputs());
    console.table(cov.classResults.map(c => ({
      class: c.id,
      status: c.hit ? 'hit' : c.typedOnly ? 'typed, not submitted' : 'missed',
      inputs: c.hits.length,
      probes: c.why
    })));
    console.info(
      `[ctb] ${cov.coveredCount}/${cov.totalCount} input classes exercised (${cov.percent}%)`
    );
    return cov;
  },

  // Classes a single string would land in — handy for sanity-checking detectors.
  classify: (value) => classifyValue(target ? target.inputClasses : [], value),

  // Discard captured inputs for the current target and recount from zero.
  reset() {
    noteReset();
    clearCapturedInputs();
    renderLiveCoverage();
    return 'Captured inputs cleared.';
  },

  // ── Recording ──────────────────────────────────────────────────────────────

  // The session code, whether recording is live, and every code this browser has
  // produced. That log is local: nothing server-side links the attempts.
  session: () => ({
    code: currentCode(),
    recording: isRecording(),
    log: localSessionLog()
  }),

  flushRecording: () => flushNow(),

  // Ends the attempt the way Start Over does, without going through the results.
  endSession() {
    endSession();
    return 'Session closed.';
  },

  // Records an evaluation using the target's own answer key, skipping the model
  // download — companion to previewCoverage, and the same trade: this exercises
  // the results-to-payload mapping, not the matching that produces the results.
  previewEvaluation() {
    if (!target) return 'Pick a target first.';
    showView('results');
    loading.style.display = 'none';
    scorecard.style.display = 'block';
    const matchedBugs = target.bugs.slice(0, 2);
    const results = {
      matchedBugs,
      missedBugs: target.bugs.slice(2),
      reportDetails: findings.filter(f => f.trim().length > 0).map(f => ({
        report: f,
        topMatch: { bug: target.bugs[0], score: 0.7123 }
      })),
      earnedPoints: matchedBugs.reduce((sum, b) => sum + b.points, 0),
      matchedCount: matchedBugs.length,
      totalCount: target.bugs.length
    };
    noteEvaluation(results, computeCoverage(target.inputClasses, getCapturedInputs()));
    renderSessionResults();
    return results;
  },

  // Renders just the coverage block, skipping the model download. Dev aid for
  // iterating on this section without running a full evaluation.
  previewCoverage() {
    if (!target) return 'Pick a target first.';
    showView('results');
    loading.style.display = 'none';
    scorecard.style.display = 'block';
    renderCoverage(computeCoverage(target.inputClasses, getCapturedInputs()));
  }
};

// ── Init ─────────────────────────────────────────────────────────────────────
loadTargetList();
