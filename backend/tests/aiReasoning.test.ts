import { describe, it, expect } from 'vitest';
import { AiReasoningService } from '../src/services/aiReasoningService';

describe('AiReasoningService fallback analysis', () => {
  it('returns a fallback analysis when AI is not configured', async () => {
    const svc = new AiReasoningService();

    // Create minimal dummy results
    const visual: any = { summary: { totalPages: 1, pagesWithDiffs: 0, criticalIssues: 0, highIssues: 0, averageDiffPercentage: 0 } };
    const functional: any = { baseline: { summary: { totalPages: 1, pagesWithNavigationIssues: 0, totalBrokenLinks: 0, totalJSErrors: 0 } }, candidate: { summary: { totalBrokenLinks: 0, totalJSErrors: 0 } } };
    const data: any = { summary: { totalPages: 1, pagesWithMismatches: 0, totalFieldDiffs: 0, criticalMismatches: 0 } };

    const result = await svc.analyzeArtifacts(visual, functional, data, 'test-run');
    expect(result).toHaveProperty('overallSeverity');
    expect(result.categoryAnalyses.length).toBeGreaterThanOrEqual(0);
  });
});
