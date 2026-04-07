import { describe, it, expect } from 'vitest';
import { ReportAgent } from '../src/services/reportAgent';
import { randomUUID } from 'crypto';

describe('ReportAgent', () => {
  it('generates a report object and markdown', async () => {
    const agent = new ReportAgent();
    const job: any = { id: randomUUID(), name: 'Test Job', baselineUrl: 'https://a', candidateUrl: 'https://b' };
    const run: any = { id: randomUUID(), triggeredAt: new Date().toISOString() };

    const aiResult: any = {
      overallSeverity: 'low',
      overallConfidence: 0.8,
      overallPass: true,
      overallExplanation: 'All good',
      categoryAnalyses: [],
      falsePositives: [],
      expectedChanges: [],
      recommendations: [],
      artifactPaths: [],
    };

    const report = await agent.generateReport(job, run, aiResult, undefined, undefined, undefined, 'test-run');
    expect(report).toHaveProperty('executiveSummary');
    const saved = await agent.saveReport(report, 'test-run');
    expect(saved.jsonPath).toMatch(/data[\\/]artifacts[\\/]test-run/);
    expect(saved.markdownPath).toMatch(/data[\\/]artifacts[\\/]test-run/);
  });
});
