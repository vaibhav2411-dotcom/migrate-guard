import { describe, it, expect } from 'vitest';
import { SeoAgent, SeoSnapshot } from '../src/services/seoAgent';

describe('SeoAgent', () => {
  it('compares snapshots and returns SeoResult with score and issues', async () => {
    const agent = new SeoAgent();

    const baseline: SeoSnapshot = {
      title: 'Example Domain',
      metaDescription: 'Baseline description',
      canonical: '',
      robots: 'index,follow',
      ogTitle: 'Example OG',
      ogDescription: 'OG desc',
      ogImage: '',
      h1s: ['Example Domain'],
      h2s: [],
      structuredData: [],
      hreflang: [],
      sitemapPresent: false,
      robotsTxtPresent: false,
      responseTime: 100,
      statusCode: 200,
    };

    const candidate: SeoSnapshot = {
      ...baseline,
      title: 'Example Domain Updated',
      metaDescription: '',
      canonical: '',
      h1s: [],
    };

    const result = agent.compareSnapshots('/index', baseline, candidate);

    expect(result.page).toBe('/index');
    expect(typeof result.score).toBe('number');
    expect(Array.isArray(result.issues)).toBe(true);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
