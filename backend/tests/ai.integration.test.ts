import { describe, it, expect } from 'vitest';
import { AiReasoningService } from '../src/services/aiReasoningService';

describe('AI integration (fallback behavior)', () => {
  it('analyzeSeo returns empty array when AI not configured', async () => {
    const ai = new AiReasoningService();
    // ensure we are in no-AI mode for CI
    expect(ai.isConfigured()).toBe(false);
    const res = await ai.analyzeSeo({ page: '/', issues: [] }, 'test-run');
    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBe(0);
  });

  it('analyzePerformance returns empty array when AI not configured', async () => {
    const ai = new AiReasoningService();
    const res = await ai.analyzePerformance({ page: '/', issues: [] }, 'test-run');
    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBe(0);
  });

  it('analyzeUiIntegrity returns empty array when AI not configured', async () => {
    const ai = new AiReasoningService();
    const res = await ai.analyzeUiIntegrity({ regions: [] }, 'test-run');
    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBe(0);
  });
});
