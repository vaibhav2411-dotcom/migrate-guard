const fs = require('fs');
const path = require('path');

const evidenceDir = path.resolve(__dirname, '..', 'data', 'artifacts', 'evidence-1775599842566');
const baselineHtml = path.join(evidenceDir, 'baseline', 'index-375', 'baseline-index-375.html');
const candidateHtml = path.join(evidenceDir, 'candidate', 'index-375', 'candidate-index-375.html');
const outFile = path.join(evidenceDir, 'resource-diff.json');

function extractUrls(html) {
  const urls = new Set();
  if (!html) return urls;
  const attrRe = /(?:src|href)=["']([^"']+)["']/gi;
  let m;
  while ((m = attrRe.exec(html))) urls.add(m[1]);
  const cssUrlRe = /url\(([^)]+)\)/gi;
  while ((m = cssUrlRe.exec(html))) {
    let u = m[1].trim().replace(/^['\"]|['\"]$/g, '');
    urls.add(u);
  }
  return urls;
}

function readHtml(file) {
  try { return fs.readFileSync(file, 'utf8'); }
  catch (e) { return null; }
}

const baseHtml = readHtml(baselineHtml);
const candHtml = readHtml(candidateHtml);

const baseUrls = extractUrls(baseHtml);
const candUrls = extractUrls(candHtml);

const onlyInBaseline = [...baseUrls].filter(u => !candUrls.has(u));
const onlyInCandidate = [...candUrls].filter(u => !baseUrls.has(u));

const summary = {
  baseline: { file: baselineHtml, count: baseUrls.size },
  candidate: { file: candidateHtml, count: candUrls.size },
  onlyInBaseline: { count: onlyInBaseline.length, sample: onlyInBaseline.slice(0,50) },
  onlyInCandidate: { count: onlyInCandidate.length, sample: onlyInCandidate.slice(0,50) }
};

fs.writeFileSync(outFile, JSON.stringify({ summary, onlyInBaseline, onlyInCandidate }, null, 2));

console.log('Resource diff written to', outFile);
console.log(JSON.stringify(summary, null, 2));
