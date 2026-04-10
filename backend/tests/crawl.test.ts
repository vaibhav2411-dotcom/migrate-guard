import { describe, it, expect } from 'vitest';
import { CrawlAgent } from '../src/services/crawlAgent';

describe('CrawlAgent matching', () => {
  it('matches pages by normalized path and generates pageMap', () => {
    const agent = new CrawlAgent();

    const baselineResult: any = {
      baseUrl: 'http://localhost',
      pages: [
        { url: 'http://localhost/', normalizedPath: '/', title: 'Home' },
        { url: 'http://localhost/about', normalizedPath: '/about', title: 'About' },
      ],
      sitemapUrls: [],
      crawlLog: [],
      errors: [],
    };

    const candidateResult: any = {
      baseUrl: 'http://localhost',
      pages: [
        { url: 'http://localhost/', normalizedPath: '/', title: 'Home' },
        { url: 'http://localhost/about-us', normalizedPath: '/about', title: 'About' },
      ],
      sitemapUrls: [],
      crawlLog: [],
      errors: [],
    };

    const matches = agent.matchPages(baselineResult, candidateResult);
    expect(matches.length).toBeGreaterThan(0);
    const pageMap = agent.generatePageMap(matches);
    expect(pageMap.some((m) => m.baselinePath === '/about' && m.candidatePath === '/about')).toBe(true);
  });
});
