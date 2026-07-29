import { loadModel, evaluateReports } from './evaluator.js';
import {
  startCapture, stopCapture, getCapturedInputs, clearCapturedInputs, onCapture,
  isCapturing
} from './capture.js';
import { computeCoverage, classifyValue } from './coverage.js';

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

  target = {
    meta,
    bugs: bugsModule.bugs,
    totalPoints: bugsModule.totalPoints,
    inputClasses
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
  document.getElementById('target-popout').href = meta.appPath;

  // Refresh the live strip as inputs land, plus once now for restored state.
  onCapture(renderLiveCoverage);
  renderLiveCoverage();

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
  const missedByCategory = {};
  results.missedBugs.forEach(bug => {
    if (!missedByCategory[bug.category]) missedByCategory[bug.category] = [];
    missedByCategory[bug.category].push(bug);
  });

  Object.entries(missedByCategory).forEach(([cat, catBugs]) => {
    const section = document.createElement('details');
    section.className = 'missed-category';
    section.innerHTML = `
      <summary>${cat} <span class="missed-count">(${catBugs.length} missed)</span></summary>
      ${catBugs.map(bug => `
        <div class="bug-item bug-missed">
          <span class="bug-id">#${bug.id}</span>
          <span class="bug-title">${bug.title}</span>
          <span class="bug-pts">${bug.points} pts</span>
        </div>`).join('')}
    `;
    missedEl.appendChild(section);
  });
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

// Captured inputs persist per target, so re-entering a target resumes the old
// session. This is the explicit way to start counting from zero again.
document.getElementById('cov-reset').addEventListener('click', () => {
  if (getCapturedInputs().length === 0) return;
  clearCapturedInputs();
  renderLiveCoverage();
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
    clearCapturedInputs();
    renderLiveCoverage();
    return 'Captured inputs cleared.';
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
