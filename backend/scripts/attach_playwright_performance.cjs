const fs = require('fs');
const path = require('path');

const runId = process.argv[2] || 'evidence-1775602933655';
const artifacts = path.join(__dirname, '..', 'data', 'artifacts', runId);
const evidencePath = path.join(artifacts, 'evidence-summary.json');
const reportPath = path.join(artifacts, 'reports', 'report.json');

function safeRead(p) { try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch { return null; } }

const evidence = safeRead(evidencePath);
const report = safeRead(reportPath) || {};

if (!evidence) {
  console.error('evidence-summary.json not found for', runId);
  process.exit(2);
}

// Aggregate navigation durations per page and viewport
const perf = { pages: [] };
for (const page of evidence.pages || []) {
  const p = { path: page.path, viewports: [] };
  for (const v of page.viewports || []) {
    const navs = v.baseline && v.baseline.meta && v.baseline.meta.navigation ? v.baseline.meta.navigation : v.navigation || [];
    // fallback: try to read timing arrays if present
    const nav = (v.baseline && v.baseline.navigation) || (v.navigation) || null;
    // attempt to extract duration from view-level entries
    let durations = [];
    if (Array.isArray(v.baseline && v.baseline.navigation)) durations = v.baseline.navigation.map(n=>n.duration||0);
    if (durations.length===0 && Array.isArray(v.navigation)) durations = v.navigation.map(n=>n.duration||0);
    const avgDuration = durations.length ? durations.reduce((a,b)=>a+b,0)/durations.length : (v.timing ? (Array.isArray(v.timing) ? (v.timing[0] && v.timing[0].duration) || null : null) : null);
    p.viewports.push({ width: v.width, avgDuration });
  }
  perf.pages.push(p);
}

report.performance = perf;
try { fs.mkdirSync(path.join(artifacts, 'reports'), { recursive: true }); } catch {}
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
console.log('Attached Playwright-derived performance to', reportPath);
