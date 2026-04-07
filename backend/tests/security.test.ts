import { describe, it, expect } from 'vitest';
import SecurityAgent from '../src/services/securityAgent';

describe('SecurityAgent basic behavior', () => {
  it('compares snapshots and calculates score', () => {
    const agent = new SecurityAgent();
    const baseline = { headers: {}, csp: 'default-src https:', hsts: 'max-age=31536000', cookies: [], mixedContentDetected: false, analyticsPresent: false, statusCode: 200 };
    const candidate = { headers: {}, csp: null, hsts: null, cookies: [], mixedContentDetected: true, analyticsPresent: true, statusCode: 200 };
    const res = agent.compareSnapshots('/', baseline as any, candidate as any);
    expect(res).toBeDefined();
    expect(Array.isArray(res.issues)).toBe(true);
    expect(res.score).toBeLessThan(100);
  });
});
