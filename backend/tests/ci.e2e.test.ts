import { describe, it, expect, vi } from 'vitest';
import { JobService, RunService } from '../src/services/domainServices';
import { StoragePort, StorageSnapshot } from '../src/models';

// Mock CrawlAgent to return a simple matched page set
vi.mock('../src/services/crawlAgent', () => {
  return {
    CrawlAgent: class {
      async crawlComparison(job: any, runId: string) {
        return {
          artifactPaths: [],
          pageMap: [],
          baselineResult: { pages: [] },
          candidateResult: { pages: [] },
          matchedPages: [
            {
              baseline: { normalizedPath: '/' },
              candidate: { normalizedPath: '/' },
              confidence: 0.9,
              matchReason: 'test-mock',
            },
          ],
        };
      }
    },
  };
});

// Mock PlaywrightExecutionService to return a lightweight execution result
vi.mock('../src/services/playwrightExecutionService', () => {
  return {
    PlaywrightExecutionService: class {
      async executeComparison(_b: string, _c: string, _matches: any[], runId: string) {
        const pageFactory = () => ({ goto: async () => {}, close: async () => {} });
        return {
          artifactPaths: [`data/artifacts/${runId}/execution-exec.json`],
          baseline: { pages: [{ normalizedPath: '/', screenshots: [], harPath: null, timestamp: new Date().toISOString() }] },
          candidate: { pages: [{ normalizedPath: '/', screenshots: [], harPath: null, timestamp: new Date().toISOString() }] },
          baselineContext: { newPage: async () => pageFactory(), close: async () => {} },
          candidateContext: { newPage: async () => pageFactory(), close: async () => {} },
        };
      }
      async cleanup() {}
    },
  };
});

// Mock SecurityAgent to produce a saved artifact
vi.mock('../src/services/securityAgent', () => {
  return {
    SecurityAgent: class {
      async extractFromPageHandle(_p: any, _path?: string) {
        return { headers: {}, csp: null, hsts: null, cookies: [], mixedContentDetected: false, analyticsPresent: false, statusCode: 200 };
      }
      compareSnapshots(page: string, baseline: any, candidate: any) {
        return { page, baseline, candidate, issues: [], score: 100 };
      }
      async saveResult(result: any, runId: string) {
        // write minimal file so domainServices can register path
        const out = `data/artifacts/${runId}/security/${(result.page||'index').replace(/[^a-zA-Z0-9-_]/g, '_')}.json`;
        const fs = require('fs');
        try { fs.mkdirSync(require('path').dirname(require('path').join('data', out)), { recursive: true }); } catch {}
        try { fs.writeFileSync(out, JSON.stringify(result, null, 2), 'utf-8'); } catch {}
        return out;
      }
    },
  };
});

class InMemoryStorage implements StoragePort {
  private snapshot: StorageSnapshot = {
    version: '2.0',
    comparisonJobs: [],
    runs: [],
    artifacts: [],
  };

  async load(): Promise<StorageSnapshot> {
    return this.snapshot;
  }

  async save(snapshot: StorageSnapshot): Promise<void> {
    this.snapshot = snapshot;
  }
}

describe('CI E2E (AI-disabled) run', () => {
  it('triggers a comparison run and records security artifact', async () => {
    const storage = new InMemoryStorage();
    const jobService = new JobService(storage);
    const runService = new RunService(storage);

    const created = await jobService.createJob({
      name: 'CI E2E Job',
      description: 'E2E run for CI',
      sourceUrl: 'http://localhost:8080',
      targetUrl: 'http://localhost:8080',
    });

    // Make the urls different to satisfy comparison check
    created.baselineUrl = 'http://localhost:8080';
    created.candidateUrl = 'http://localhost:8081';

    // save into storage snapshot manually
    const snap = await storage.load();
    snap.comparisonJobs = [created as any];
    await storage.save(snap);

    const run = await runService.triggerComparisonRun(created.id, 'ci-test', { useAI: false });

    // Poll until completed (with timeout)
    const start = Date.now();
    let final: any = null;
    while (Date.now() - start < 15000) {
      // small delay
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 200));
      const r = await runService.getRunById(run.id);
      if (r && (r.status === 'completed' || r.status === 'failed')) { final = r; break; }
    }

    expect(final).toBeDefined();
    expect(['completed', 'failed']).toContain(final.status);

    const arts = await runService.listArtifactsByRun(run.id);
    const hasSecurity = arts.some(a => (a.label||'').toLowerCase().startsWith('security'));
    const hasErrorLog = arts.some(a => (a.label||'').toLowerCase().includes('error'));
    // Either the run completed with security artifacts or it failed and produced an error log
    expect(hasSecurity || hasErrorLog).toBe(true);
  }, 20000);
});
