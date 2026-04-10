import { randomUUID } from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import runTwoSiteCapture from '../src/runner/playwrightRunner';
import { UiIntegrityAgent } from '../src/services/uiIntegrityAgent';
import { DATA_DIR } from '../src/config/config';

async function main() {
  const baseline = 'https://www.bbcbenelux.com';
  const candidate = 'https://stage.beta.bbcbenelux.com';
  const runId = randomUUID();
  console.log('RunId:', runId);

  const artifactsDir = path.join(DATA_DIR, 'artifacts', runId);
  await fs.mkdir(artifactsDir, { recursive: true });

  try {
    console.log('Starting two-site capture...');
    const arts = await runTwoSiteCapture(baseline, candidate, runId);
    console.log('Captured artifacts:', arts.length);

    const baselineDir = path.join(artifactsDir, 'baseline');
    const candidateDir = path.join(artifactsDir, 'candidate');

    console.log('Running UI integrity checks...');
    const ui = new UiIntegrityAgent();
    const res = await ui.executeUiIntegrityCheck(baselineDir, candidateDir, { id: 'ad-hoc', baselineUrl: baseline, candidateUrl: candidate, name: 'ad-hoc' } as any, runId);
    console.log('UI integrity result summary:', res?.summary || 'null');

    console.log('Artifacts are in:', artifactsDir);
  } catch (err) {
    console.error('Run failed:', err);
    process.exit(1);
  }
}

main();
