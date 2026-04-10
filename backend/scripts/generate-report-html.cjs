const fs = require('fs');
const path = require('path');

function usage() {
  console.log('Usage: node scripts/generate-report-html.cjs <runFolder>');
  console.log('Example: node scripts/generate-report-html.cjs backend/data/artifacts/evidence-1775604164372');
}

const runFolder = process.argv[2];
if (!runFolder) {
  usage();
  process.exit(1);
}

const reportPath = path.join(runFolder, 'reports', 'report.json');
if (!fs.existsSync(reportPath)) {
  console.error('report.json not found at', reportPath);
  process.exit(2);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

// Attempt to read generated page map and crawl summary (if available)
let pageMap = null;
const pageMapPath = path.join(runFolder, 'generated-pageMap.json');
if (fs.existsSync(pageMapPath)) {
  try { pageMap = JSON.parse(fs.readFileSync(pageMapPath, 'utf8')); } catch (e) { pageMap = null; }
}
let crawlSummary = null;
const crawlSummaryPath = path.join(runFolder, 'crawl-summary.json');
if (fs.existsSync(crawlSummaryPath)) {
  try { crawlSummary = JSON.parse(fs.readFileSync(crawlSummaryPath, 'utf8')); } catch (e) { crawlSummary = null; }
}

function safe(s){
  if (s === null || s === undefined) return '';
  return String(s);
}

// Collect screenshots anywhere under the run folder and categorize
function collectAllScreens(baseFolder) {
  const out = [];
  if (!fs.existsSync(baseFolder)) return out;
  const walk = (dir, relPrefix = '') => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    entries.forEach(e => {
      const full = path.join(dir, e.name);
      const rel = path.join(relPrefix, e.name);
      if (e.isDirectory()) {
        // skip the reports output folder to avoid recursion
        if (e.name === 'reports') return;
        walk(full, rel);
      } else if (/\.(png|jpg|jpeg)$/i.test(e.name)) {
        out.push(rel.replace(/\\/g, '/'));
      }
    });
  };
  walk(baseFolder);
  return out;
}

const allImgs = collectAllScreens(runFolder);
// categorize images: mark those that contain the word baseline or candidate (case-insensitive)
const baselineImgs = allImgs.filter(p => /baseline/i.test(p) && !/candidate/i.test(p));
const candidateImgs = allImgs.filter(p => /candidate/i.test(p) && !/baseline/i.test(p));
const otherImgs = allImgs.filter(p => !/baseline/i.test(p) && !/candidate/i.test(p));

function renderKeyValueTable(obj){
  let html = '<table class="kv">';
  for(const k of Object.keys(obj)){
    let v = obj[k];
    if (typeof v === 'object') v = JSON.stringify(v, null, 2);
    html += `<tr><th>${k}</th><td><pre>${safe(v)}</pre></td></tr>`;
  }
  html += '</table>';
  return html;
}

let html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Migration Report - ${path.basename(runFolder)}</title>
  <style>
    body{font-family: Arial, Helvetica, sans-serif; padding:20px}
    h1,h2{color:#1f2937}
    table{border-collapse:collapse;width:100%;margin-bottom:16px}
    table.kv th{width:220px;text-align:left;padding:6px;background:#f3f4f6}
    table.kv td{padding:6px;background:#fff}
    table.data th,table.data td{border:1px solid #e5e7eb;padding:8px}
    .thumb{max-width:220px;max-height:140px;border:1px solid #ddd;margin:6px}
    .grid{display:flex;flex-wrap:wrap;gap:8px}
    pre{white-space:pre-wrap;word-break:break-word;margin:0}
    .severity{font-weight:700}
  </style>
</head>
<body>
  <h1>Migration Report: ${path.basename(runFolder)}</h1>
  <h2>Summary</h2>
  ${renderKeyValueTable({ runId: path.basename(runFolder), aiMode: report.aiMode || report.aiMode === undefined ? report.aiMode : 'unknown', overallRisk: report.overallRisk || report.overallRiskScore || '' })}

  <h2>Category Analyses</h2>
`;

if (Array.isArray(report.categoryAnalyses) && report.categoryAnalyses.length){
  html += '<table class="data"><tr><th>Category</th><th>Severity</th><th>Summary</th></tr>';
  for(const c of report.categoryAnalyses){
    html += `<tr><td>${safe(c.category)}</td><td class="severity">${safe(c.severity)}</td><td><pre>${safe(c.summary || c.description || JSON.stringify(c, null, 2))}</pre></td></tr>`;
  }
  html += '</table>';
} else if (report.categoryAnalyses && typeof report.categoryAnalyses === 'object'){
  html += renderKeyValueTable(report.categoryAnalyses);
} else {
  html += '<p>No category analyses found in report.json</p>';
}

html += '<h2>Issues / Findings</h2>';
if (Array.isArray(report.issues) && report.issues.length){
  html += '<table class="data"><tr><th>Type</th><th>Severity</th><th>Message</th><th>Detail</th></tr>';
  for(const it of report.issues){
    html += `<tr><td>${safe(it.type||it.category||'issue')}</td><td class="severity">${safe(it.severity||'')}</td><td>${safe(it.message||it.summary||'')}</td><td><pre>${safe(JSON.stringify(it.detail||it, null, 2))}</pre></td></tr>`;
  }
  html += '</table>';
} else {
  html += '<p>No explicit issues array; check resource diffs and triage JSON files.</p>';
}

html += '<h2>Screenshots</h2>';
// Build pages list: prefer explicit pages in report, fall back to filenames
function derivePagesFromReport(r){
  if (!r) return [];
  if (Array.isArray(r.pages) && r.pages.length) return r.pages;
  if (Array.isArray(r.urls) && r.urls.length) return r.urls;
  // try to extract from any `pages`-like key
  if (Array.isArray(r.pageList) && r.pageList.length) return r.pageList;
  // fallback: derive from screenshot folder structure (e.g. baseline/index/screenshot.png => page 'index')
  const pages = new Set();
  const all = [].concat(baselineImgs, candidateImgs, otherImgs || []);
  all.forEach(p => {
    const parts = p.split('/');
    // remove common prefixes
    while (parts.length && ['baseline', 'candidate', 'visual-diffs', 'visual-diff', 'visual', 'diffs'].includes(parts[0].toLowerCase())) parts.shift();
    // remaining parts before the filename represent the page path
    const dirs = parts.slice(0, -1);
    let page = dirs.join('/');
    if (!page) {
      // fallback: try to infer from filename (e.g. screenshot-desktop -> homepage)
      const name = path.basename(p).replace(/\.(png|jpg|jpeg)$/i, '');
      page = name;
    }
    pages.add(page);
  });
  return Array.from(pages).map(s => s || 'index');
}

const pages = derivePagesFromReport(report);
if (pages && pages.length){
  html += '<h3>Pages Covered (inferred)</h3><ul>';
  for(const p of pages) html += `<li>${safe(p)}</li>`;
  html += '</ul>';
} 
// Show generated page map if available
if (pageMap && Array.isArray(pageMap) && pageMap.length) {
  html += '<h3>Captured Page Map</h3>';
  html += '<table class="data"><tr><th>Baseline Path</th><th>Candidate Path</th><th>Notes</th></tr>';
  pageMap.forEach(pm => {
    html += `<tr><td>${safe(pm.baselinePath||'')}</td><td>${safe(pm.candidatePath||'')}</td><td><pre>${safe(pm.notes||'')}</pre></td></tr>`;
  });
  html += '</table>';
}
// Crawl summary
if (crawlSummary) {
  html += '<h3>Crawl Summary</h3>';
  html += renderKeyValueTable(crawlSummary);
}
// If only root was captured, warn user and provide re-run guidance
if ((!pageMap || pageMap.length === 0) && pages.length === 1 && pages[0] === 'index') {
  html += '<h3 style="color:#b91c1c">Warning: Only root page captured</h3>';
  html += '<p>The run only contains screenshots for the site root. To capture all pages, re-run the evidence capture with a crawler or provide a list of paths.</p>';
  html += '<pre>Example (PowerShell):\n$env:FEATURE_AI_REASONING=\'0\'\n$env:PATHS=\'/, /about, /contact\'\nPush-Location backend\nnode scripts/two-site-evidence.cjs https://your.baseline.url https://your.candidate.url\nPop-Location</pre>';
} 
html += '<h3>Baseline</h3>';
if (baselineImgs.length){
  html += '<div class="grid">';
  for(const f of baselineImgs){
    const src = path.posix.join('..', f).replace(/\\/g, '/');
    html += `<a href="${src}" target="_blank"><img class="thumb" src="${src}" alt="baseline screenshot"></a>`;
  }
  html += '</div>';
} else html += '<p>No baseline screenshots found.</p>';

html += '<h3>Candidate</h3>';
if (candidateImgs.length){
  html += '<div class="grid">';
  for(const f of candidateImgs){
    const src = path.posix.join('..', f).replace(/\\/g, '/');
    html += `<a href="${src}" target="_blank"><img class="thumb" src="${src}" alt="candidate screenshot"></a>`;
  }
  html += '</div>';
} else html += '<p>No candidate screenshots found.</p>';

// Other screenshots (not categorized as baseline/candidate)
if (otherImgs && otherImgs.length){
  html += '<h3>Other Screenshots</h3><div class="grid">';
  for(const f of otherImgs){
    const src = path.posix.join('..', f).replace(/\\/g, '/');
    html += `<a href="${src}" target="_blank"><img class="thumb" src="${src}" alt="screenshot"></a>`;
  }
  html += '</div>';
}

html += '<h2>Attached Files</h2>';
html += '<ul>';
const attachFiles = ['failure-summary.json','resource-diff.json','remediation.csv','axe.json','reports/report.md'];
for(const fn of attachFiles){
  const p = path.join(runFolder, fn);
  const rel = path.join('..', fn).replace(/\\/g, '/');
  if (fs.existsSync(p)) html += `<li><a href="${rel}">${fn}</a></li>`;
}
html += '</ul>';

html += '<footer style="margin-top:40px;color:#6b7280">Generated by generate-report-html.cjs</footer>';

html += '</body></html>';

const outDir = path.join(runFolder, 'reports');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'report.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log('Wrote HTML report to', outPath);

process.exit(0);
