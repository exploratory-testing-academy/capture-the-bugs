let extractor = null;
let bugEmbeddings = null;
let activeBugs = null;

// Load the sentence-transformer model and pre-embed bug descriptions
export async function loadModel(bugs, onProgress) {
  activeBugs = bugs;

  const { pipeline } = await import(
    'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2'
  );

  extractor = await pipeline(
    'feature-extraction',
    'Xenova/all-MiniLM-L6-v2',
    { progress_callback: onProgress }
  );

  // Pre-embed all bug descriptions once the model is ready
  const texts = activeBugs.map(b => b.matchText);
  const output = await extractor(texts, { pooling: 'mean', normalize: true });
  bugEmbeddings = [];
  for (let i = 0; i < activeBugs.length; i++) {
    bugEmbeddings.push(output[i].data);
  }
}

// Embed a single text and return its vector
async function embed(text) {
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return output[0].data;
}

// Dot product of two normalized vectors = cosine similarity
function cosineSimilarity(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

// Match a list of user reports against all known bugs.
export async function evaluateReports(reports, threshold = 0.55) {
  const matchedBugIds = new Set();
  const reportDetails = [];

  for (const report of reports) {
    const reportVec = await embed(report);

    const scores = bugEmbeddings.map((bugVec, i) => ({
      bug: activeBugs[i],
      score: cosineSimilarity(reportVec, bugVec)
    }));

    scores.sort((a, b) => b.score - a.score);

    // Collect all matches above threshold
    const matches = scores.filter(s => s.score >= threshold);

    // Pick the best match that hasn't been claimed yet, or the overall best
    const bestNew = matches.find(m => !matchedBugIds.has(m.bug.id));
    const best = bestNew || (matches.length > 0 ? matches[0] : null);

    if (best) {
      matchedBugIds.add(best.bug.id);
      // Also claim any other strong matches from this report
      for (const m of matches) {
        if (m.score >= threshold + 0.05) matchedBugIds.add(m.bug.id);
      }
    }

    reportDetails.push({
      report,
      topMatch: best ? { bug: best.bug, score: best.score } : null,
      otherCandidates: scores.slice(0, 5).map(s => ({
        bugId: s.bug.id,
        title: s.bug.title,
        score: Math.round(s.score * 100)
      }))
    });
  }

  const matchedBugs = activeBugs.filter(b => matchedBugIds.has(b.id));
  const missedBugs = activeBugs.filter(b => !matchedBugIds.has(b.id));
  const earnedPoints = matchedBugs.reduce((sum, b) => sum + b.points, 0);

  return {
    matchedBugs,
    missedBugs,
    reportDetails,
    earnedPoints,
    matchedCount: matchedBugs.length,
    totalCount: activeBugs.length
  };
}
