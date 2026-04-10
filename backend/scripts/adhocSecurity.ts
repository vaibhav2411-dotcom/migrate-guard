import fs from 'fs/promises';
import path from 'path';
import { SecurityAgent } from '../src/services/securityAgent';
import { DATA_DIR } from '../src/config/config';

async function main() {
  const runId = process.argv[2];
  if (!runId) {
    console.error('Usage: tsx scripts/adhocSecurity.ts <runId>');
    process.exit(2);
  }

  const runDir = path.join(DATA_DIR, 'artifacts', runId);
  const baselinePath = path.join(runDir, 'baseline-execution.json');
  const candidatePath = path.join(runDir, 'candidate-execution.json');

  try {
    const [bRaw, cRaw] = await Promise.all([fs.readFile(baselinePath, 'utf-8'), fs.readFile(candidatePath, 'utf-8')]);
    const baseline = JSON.parse(bRaw);
    const candidate = JSON.parse(cRaw);

    const agent = new SecurityAgent();
    const artifacts: string[] = [];

    const pages = baseline.pages || [];
    for (const page of pages) {
      const normalized = page.normalizedPath || page.url || 'index';
      // For adhoc, create lightweight snapshots from page object
      const baselineSnap: any = { headers: {}, csp: null, hsts: null, cookies: [], mixedContentDetected: false, analyticsPresent: false, statusCode: 200 };
      const candidatePage = (candidate.pages || []).find((p: any) => p.normalizedPath === page.normalizedPath) || {};
      const candidateSnap: any = { headers: {}, csp: null, hsts: null, cookies: [], mixedContentDetected: false, analyticsPresent: false, statusCode: 200 };

      const res = agent.compareSnapshots(normalized, baselineSnap, candidateSnap);
      const saved = await agent.saveResult(res, runId, { useAI: false });
      artifacts.push(saved);
      console.log('Saved security artifact:', saved);
    }

    console.log('Completed adhoc security run for', runId);
  } catch (e) {
    console.error('Adhoc security failed:', e);
    process.exit(1);
  }
}

main();
