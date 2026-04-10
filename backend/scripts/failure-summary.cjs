#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function findNetworkJson(sideDir) {
  if (!fs.existsSync(sideDir)) return null;
  const entries = fs.readdirSync(sideDir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) {
      const candidate = path.join(sideDir, e.name, 'network.json');
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  // fallback: maybe network.json directly
  const direct = path.join(sideDir, 'network.json');
  return fs.existsSync(direct) ? direct : null;
}

function hostOf(url) {
  try { return new URL(url).host; } catch (e) { return null; }
}

// Map stage hosts to production equivalents to reduce benign diffs
const HOST_MAP = {
  'stage.beta.bbcbenelux.com': 'www.bbcbenelux.com',
  'calama.stage.bbcstudios.com': 'calama.bbcstudios.com'
};

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    if (HOST_MAP[u.host]) {
      u.host = HOST_MAP[u.host];
    }
    return u.toString();
  } catch (e) {
    return url;
  }
}

function uniq(arr) { return Array.from(new Set(arr)); }

function diff(a, b) {
  const setB = new Set(b);
  return a.filter(x => !setB.has(x));
}

async function main() {
  const runId = process.argv[2];
  if (!runId) {
    console.error('Usage: node failure-summary.cjs <runId>');
    process.exit(2);
  }

  const artifacts = path.resolve(__dirname, '..', 'data', 'artifacts', runId);
  if (!fs.existsSync(artifacts)) {
    console.error('Run not found:', artifacts);
    process.exit(2);
  }

  const baselineDir = path.join(artifacts, 'baseline');
  const candidateDir = path.join(artifacts, 'candidate');

  const baselineNet = findNetworkJson(baselineDir);
  const candidateNet = findNetworkJson(candidateDir);

  if (!baselineNet && !candidateNet) {
    console.error('No network.json found under baseline/ or candidate/ for', runId);
    process.exit(3);
  }

  const baseline = baselineNet ? JSON.parse(fs.readFileSync(baselineNet, 'utf8')) : [];
  const candidate = candidateNet ? JSON.parse(fs.readFileSync(candidateNet, 'utf8')) : [];

  const stats = {
    baseline: { total: baseline.length, non200: 0, hosts: {} },
    candidate: { total: candidate.length, non200: 0, hosts: {} }
  };

  const baselineUrls = [];
  const candidateUrls = [];

  for (const r of baseline) {
    baselineUrls.push(r.url);
    if (typeof r.status === 'number' && r.status !== 200) stats.baseline.non200++;
    const h = hostOf(r.url) || 'local';
    const nh = HOST_MAP[h] || h;
    stats.baseline.hosts[nh] = (stats.baseline.hosts[nh] || 0) + 1;
  }
  for (const r of candidate) {
    candidateUrls.push(r.url);
    if (typeof r.status === 'number' && r.status !== 200) stats.candidate.non200++;
    const h = hostOf(r.url) || 'local';
    const nh = HOST_MAP[h] || h;
    stats.candidate.hosts[nh] = (stats.candidate.hosts[nh] || 0) + 1;
  }

  const onlyInBaseline = uniq(diff(uniq(baselineUrls), uniq(candidateUrls)));
  const onlyInCandidate = uniq(diff(uniq(candidateUrls), uniq(baselineUrls)));

  const resourceDiff = {
    summary: {
      baseline: { file: baselineNet || null, count: baseline.length },
      candidate: { file: candidateNet || null, count: candidate.length },
      onlyInBaseline: { count: onlyInBaseline.length, sample: onlyInBaseline.slice(0,50) },
      onlyInCandidate: { count: onlyInCandidate.length, sample: onlyInCandidate.slice(0,50) }
    },
    onlyInBaseline,
    onlyInCandidate
  };

  // Normalized (hostname-mapped) diffs to collapse stage→prod noise
  const baselineUrlsNorm = uniq(baselineUrls.map(normalizeUrl));
  const candidateUrlsNorm = uniq(candidateUrls.map(normalizeUrl));
  const onlyInBaselineNorm = uniq(diff(baselineUrlsNorm, candidateUrlsNorm));
  const onlyInCandidateNorm = uniq(diff(candidateUrlsNorm, baselineUrlsNorm));

  const resourceDiffNormalized = {
    summary: {
      baseline: { file: baselineNet || null, count: baseline.length },
      candidate: { file: candidateNet || null, count: candidate.length },
      onlyInBaseline: { count: onlyInBaselineNorm.length, sample: onlyInBaselineNorm.slice(0,50) },
      onlyInCandidate: { count: onlyInCandidateNorm.length, sample: onlyInCandidateNorm.slice(0,50) }
    },
    onlyInBaseline: onlyInBaselineNorm,
    onlyInCandidate: onlyInCandidateNorm
  };

  const failureSummary = {
    runId,
    generatedAt: new Date().toISOString(),
    stats,
    topBaselineHosts: Object.entries(stats.baseline.hosts).sort((a,b)=>b[1]-a[1]).slice(0,10),
    topCandidateHosts: Object.entries(stats.candidate.hosts).sort((a,b)=>b[1]-a[1]).slice(0,10),
    onlyInBaselineCount: onlyInBaseline.length,
    onlyInCandidateCount: onlyInCandidate.length
  };

  const outResourcePath = path.join(artifacts, 'resource-diff.json');
  const outSummaryPath = path.join(artifacts, 'failure-summary.json');
  const outResourceNorm = path.join(artifacts, 'resource-diff-normalized.json');
  const outSummaryNorm = path.join(artifacts, 'failure-summary-normalized.json');

  fs.writeFileSync(outResourcePath, JSON.stringify(resourceDiff, null, 2));
  fs.writeFileSync(outSummaryPath, JSON.stringify(failureSummary, null, 2));
  fs.writeFileSync(outResourceNorm, JSON.stringify(resourceDiffNormalized, null, 2));

  const failureSummaryNorm = Object.assign({}, failureSummary, {
    generatedAt: new Date().toISOString(),
    onlyInBaselineCount: onlyInBaselineNorm.length,
    onlyInCandidateCount: onlyInCandidateNorm.length
  });
  fs.writeFileSync(outSummaryNorm, JSON.stringify(failureSummaryNorm, null, 2));

  console.log('Wrote:', outResourcePath);
  console.log('Wrote:', outSummaryPath);
  console.log('Summary: baseline', stats.baseline.total, 'requests (non-200:', stats.baseline.non200 + ')');
  console.log('Summary: candidate', stats.candidate.total, 'requests (non-200:', stats.candidate.non200 + ')');
}

main().catch(err => {
  console.error(err);
  process.exit(99);
});
