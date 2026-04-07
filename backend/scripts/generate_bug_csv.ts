import fs from 'fs';
import path from 'path';

const REPORTS_DIR = path.resolve('migrate-guard-enterprise', 'data', 'reports', '_');

function safeReadJson(p: string) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function findArtifacts() {
  const files = walk(REPORTS_DIR);
  const metas = files.filter((f) => f.endsWith('meta.json'));
  const rows: string[] = [];
  for (const m of metas) {
    const data = safeReadJson(m) || {};
    const runId = data.runId || path.basename(path.dirname(m));
    const visual = files.find((f) => f.endsWith('diff.png') && f.includes(path.dirname(m)));
    const perfA = files.find((f) => f.endsWith('perfA.json') && f.includes(path.dirname(m)));
    const perfB = files.find((f) => f.endsWith('perfB.json') && f.includes(path.dirname(m)));
    rows.push([runId, data.title || '', visual || '', perfA || '', perfB || ''].map((c)=>`"${String(c).replace(/"/g,'""')}"`).join(','));
  }
  return rows;
}

function main() {
  const out = path.resolve('migrate-guard-enterprise', 'data', 'bug-report.csv');
  const rows = findArtifacts();
  const header = 'runId,title,diffImage,perfA,perfB';
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, [header, ...rows].join('\n'));
  console.log('Wrote', out, 'with', rows.length, 'rows');
}

main();
