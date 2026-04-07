import { describe, it, expect } from 'vitest';
import { PerformanceAgent } from '../src/services/performanceAgent';

describe('PerformanceAgent', () => {
  it('compares simple snapshots and returns issues and score', async () => {
    const agent = new PerformanceAgent();

    const baseline = { lcp: 1000, cls: 0.05, fcp: 500 };
    const candidate = { lcp: 3000, cls: 0.2, fcp: 2500 };

    const result = agent.compareSnapshots('/index', baseline as any, candidate as any);

    expect(result.page).toBe('/index');
    expect(Array.isArray(result.issues)).toBe(true);
    expect(typeof result.score).toBe('number');
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
