import { loadModel, evaluateReports } from './evaluator.js';

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
  target = {
    meta,
    bugs: bugsModule.bugs,
    totalPoints: bugsModule.totalPoints
  };

  // Restore findings for this target
  findings = JSON.parse(
    localStorage.getItem(`ctb-findings-${meta.id}`) || '[]'
  );

  // Set up the explore view
  document.getElementById('target-name').textContent = meta.name;
  document.getElementById('target-frame').src = meta.appPath;
  document.getElementById('target-popout').href = meta.appPath;

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
  showView('welcome');
});

// ── Init ─────────────────────────────────────────────────────────────────────
loadTargetList();
