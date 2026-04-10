const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR } = { DATA_DIR: path.join(__dirname, '..', 'data') };
const SNAPSHOT_FILE = path.join(DATA_DIR, 'snapshot.json');

function ensureSnapshot() {
  if (!fs.existsSync(SNAPSHOT_FILE)) {
    fs.mkdirSync(path.dirname(SNAPSHOT_FILE), { recursive: true });
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify({ version: '2.0', comparisonJobs: [], runs: [], artifacts: [], metadata: {} }, null, 2));
  }
}

function main() {
  const runId = process.argv[2];
  const relPath = process.argv[3];
  const label = process.argv[4] || 'Security Result';
  if (!runId || !relPath) {
    console.error('Usage: node scripts/registerArtifact.cjs <runId> <relativePath> [label]');
    process.exit(2);
  }
  ensureSnapshot();
  const raw = fs.readFileSync(SNAPSHOT_FILE, 'utf-8');
  const snap = JSON.parse(raw);
  const entry = {
    id: crypto.randomUUID(),
    runId,
    type: 'report',
    label,
    path: relPath.replace(/\\/g,'/'),
    createdAt: new Date().toISOString(),
  };
  snap.artifacts = snap.artifacts || [];
  snap.artifacts.push(entry);
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snap, null, 2));
  console.log('Registered artifact in snapshot:', entry.path);
}

main();
