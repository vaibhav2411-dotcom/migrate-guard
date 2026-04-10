const fs = require('fs');
const path = require('path');

const runId = process.argv[2] || 'evidence-1775602933655';
const artifacts = path.join(__dirname, '..', 'data', 'artifacts', runId);
const diffPath = path.join(artifacts, 'resource-diff.json');
const out = path.join(artifacts, 'remediation.csv');

try {
  const diff = JSON.parse(fs.readFileSync(diffPath, 'utf8'));
  const rows = ['source,url'];
  (diff.onlyInBaseline || []).forEach(u => rows.push(`baseline,"${u.replace(/"/g,'""')}"`));
  (diff.onlyInCandidate || []).forEach(u => rows.push(`candidate,"${u.replace(/"/g,'""')}"`));
  fs.writeFileSync(out, rows.join('\n'));
  console.log('Wrote', out);
} catch (e) {
  console.error('Failed to write remediation CSV:', e.message);
  process.exit(2);
}
