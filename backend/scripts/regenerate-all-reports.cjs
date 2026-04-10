const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const artifactsDir = path.join(__dirname, '..', 'data', 'artifacts');
if (!fs.existsSync(artifactsDir)) {
  console.error('Artifacts folder not found:', artifactsDir);
  process.exit(1);
}

const runs = fs.readdirSync(artifactsDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => path.join(artifactsDir, d.name));
let count = 0;
for (const run of runs) {
  const reportJson = path.join(run, 'reports', 'report.json');
  if (!fs.existsSync(reportJson)) {
    console.log('skip (no report.json):', run);
    continue;
  }
  console.log('generating:', run);
  const res = cp.spawnSync(process.execPath, [path.join(__dirname, 'generate-report-html.cjs'), run], { stdio: 'inherit' });
  if (res.status !== 0) console.error('generator failed for', run);
  else count++;
}

console.log('Done. Generated reports for', count, 'runs.');
