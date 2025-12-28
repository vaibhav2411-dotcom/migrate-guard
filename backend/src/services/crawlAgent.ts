import { chromium, Browser, Page } from 'playwright';
import { parseStringPromise } from 'xml2js';
import { promises as fs } from 'fs';
import path from 'path';
import { CrawlConfig, PageMap, ComparisonJob } from '../models';
import { DATA_DIR } from '../config/config';

/**
 * Crawled page information
 */
export interface CrawledPage {
  url: string;
  normalizedPath: string;
  title?: string;
  statusCode: number;
  links: string[];
  metadata?: {
    description?: string;
    keywords?: string;
    ogTitle?: string;
    ogDescription?: string;
  };
}

/**
 * Crawl result for a single site
 */
export interface CrawlResult {
  baseUrl: string;
  pages: CrawledPage[];
  sitemapUrls: string[];
  crawlLog: string[];
  errors: string[];
}

/**
 * Matched page pair for comparison
 */
export interface MatchedPage {
  baseline: CrawledPage;
  candidate: CrawledPage;
  confidence: number; // 0-1, how confident we are in the match
  matchReason: string; // Why these pages were matched
}

/**
 * CrawlAgent - Handles crawling of baseline and candidate sites
 * Uses Playwright for browser automation and content extraction
 */
export class CrawlAgent {
  private browser: Browser | null = null;
  private readonly artifactsDir: string;

  constructor() {
    this.artifactsDir = path.join(DATA_DIR, 'artifacts');
  }

  /**
   * Initialize browser instance
   */
  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
      });
    }
  }

  /**
   * Cleanup browser instance
   */
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Read sitemap.xml from a URL
   */
  async readSitemap(sitemapUrl: string): Promise<string[]> {
    const log: string[] = [];
    const urls: string[] = [];

    try {
      log.push(`Reading sitemap from: ${sitemapUrl}`);
      const response = await fetch(sitemapUrl);
      
      if (!response.ok) {
        log.push(`Sitemap not found or inaccessible: ${response.status}`);
        return urls;
      }

      const xmlContent = await response.text();
      const parsed = await parseStringPromise(xmlContent);

      // Handle sitemap index (contains multiple sitemaps)
      if (parsed.sitemapindex) {
        log.push('Found sitemap index');
        const sitemapUrls = (parsed.sitemapindex.sitemap as Array<{ loc?: string[] }>)?.map((s) => s.loc?.[0]).filter(Boolean) || [];
        
        // Recursively read nested sitemaps
        for (const nestedSitemapUrl of sitemapUrls) {
          if (nestedSitemapUrl) {
            const nestedUrls = await this.readSitemap(nestedSitemapUrl);
            urls.push(...nestedUrls);
          }
        }
        return urls;
      }

      // Handle regular sitemap
      if (parsed.urlset?.url) {
        const sitemapUrls = (parsed.urlset.url as Array<{ loc?: string[] }>).map((entry) => entry.loc?.[0]).filter(Boolean) as string[];
        log.push(`Found ${sitemapUrls.length} URLs in sitemap`);
        urls.push(...sitemapUrls);
      }
    } catch (error) {
      log.push(`Error reading sitemap: ${error instanceof Error ? error.message : String(error)}`);
    }

    return urls;
  }

  /**
   * Normalize URL to a stable path representation
   */
  normalizeUrl(url: string, baseUrl: string): string {
    try {
      const urlObj = new URL(url, baseUrl);
      // Remove query params and hash for normalization
      const normalized = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
      return normalized.replace(/\/$/, ''); // Remove trailing slash
    } catch (error) {
      return url;
    }
  }

  /**
   * Extract path from URL (relative to base)
   */
  extractPath(url: string, baseUrl: string): string {
    try {
      const urlObj = new URL(url, baseUrl);
      const baseObj = new URL(baseUrl);
      
      if (urlObj.host !== baseObj.host) {
        return url; // External link, return full URL
      }

      return urlObj.pathname || '/';
    } catch (error) {
      return url;
    }
  }

  /**
   * Check if URL matches include/exclude patterns
   */
  matchesPatterns(url: string, includePaths?: string[], excludePaths?: string[]): boolean {
    let urlPath: string;
    try {
      urlPath = new URL(url).pathname;
    } catch {
      return false;
    }

    // Check exclude patterns first
    if (excludePaths) {
      for (const pattern of excludePaths) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        if (regex.test(urlPath)) {
          return false;
        }
      }
    }

    // If include patterns exist, URL must match at least one
    if (includePaths && includePaths.length > 0) {
      return includePaths.some((pattern) => {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(urlPath);
      });
    }

    return true; // No include patterns means include all
  }

  /**
   * Crawl a single page
   */
  async crawlPage(page: Page, url: string, baseUrl: string, depth: number, maxDepth: number, visited: Set<string>, config: CrawlConfig): Promise<CrawledPage | null> {
    const normalized = this.normalizeUrl(url, baseUrl);
    
    // Skip if already visited
    if (visited.has(normalized)) {
      return null;
    }

    // Check depth limit
    if (depth > maxDepth) {
      return null;
    }

    // Check include/exclude patterns
    if (!this.matchesPatterns(url, config.includePaths, config.excludePaths)) {
      return null;
    }

    visited.add(normalized);

    try {
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      const statusCode = response?.status() || 0;

      if (statusCode >= 400) {
        return null; // Skip error pages
      }

      // Extract page information
      const title = await page.title().catch(() => undefined);
      const links = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href]'));
        return anchors.map((a) => (a as HTMLAnchorElement).href);
      }) as string[];

      // Extract metadata
      const metadata = await page.evaluate(() => {
        const getMeta = (name: string) => {
          const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
          return meta?.getAttribute('content') || undefined;
        };

        return {
          description: getMeta('description') || getMeta('og:description'),
          keywords: getMeta('keywords'),
          ogTitle: getMeta('og:title'),
          ogDescription: getMeta('og:description'),
        };
      });

      return {
        url: normalized,
        normalizedPath: this.extractPath(normalized, baseUrl),
        title,
        statusCode,
        links: links.filter((link) => {
          try {
            const linkUrl = new URL(link, baseUrl);
            const baseUrlObj = new URL(baseUrl);
            // Only include same-domain links or external if configured
            return config.followExternalLinks || linkUrl.host === baseUrlObj.host;
          } catch {
            return false;
          }
        }),
        metadata,
      };
    } catch (error) {
      // Page failed to load, return null
      return null;
    }
  }

  /**
   * Crawl a website starting from base URL
   */
  async crawlSite(baseUrl: string, config: CrawlConfig, runId: string): Promise<CrawlResult> {
    await this.initialize();

    const result: CrawlResult = {
      baseUrl,
      pages: [],
      sitemapUrls: [],
      crawlLog: [],
      errors: [],
    };

    const visited = new Set<string>();
    const toVisit: Array<{ url: string; depth: number }> = [{ url: baseUrl, depth: 0 }];

    // Try to read sitemap first
    const sitemapUrl = new URL('/sitemap.xml', baseUrl).href;
    result.crawlLog.push(`Attempting to read sitemap from: ${sitemapUrl}`);
    
    try {
      const sitemapUrls = await this.readSitemap(sitemapUrl);
      result.sitemapUrls = sitemapUrls;
      result.crawlLog.push(`Found ${sitemapUrls.length} URLs in sitemap`);

      // Add sitemap URLs to crawl queue
      for (const sitemapUrl of sitemapUrls.slice(0, config.maxPages || 100)) {
        if (!visited.has(this.normalizeUrl(sitemapUrl, baseUrl))) {
          toVisit.push({ url: sitemapUrl, depth: 0 });
        }
      }
    } catch (error) {
      result.crawlLog.push(`Could not read sitemap: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const page = await this.browser.newPage();

    try {
      while (toVisit.length > 0 && result.pages.length < (config.maxPages || 100)) {
        const { url, depth } = toVisit.shift()!;
        const normalized = this.normalizeUrl(url, baseUrl);

        if (visited.has(normalized)) {
          continue;
        }

        result.crawlLog.push(`Crawling: ${url} (depth: ${depth})`);

        const crawledPage = await this.crawlPage(page, url, baseUrl, depth, config.depth, visited, config);

        if (crawledPage) {
          result.pages.push(crawledPage);
          result.crawlLog.push(`Successfully crawled: ${crawledPage.normalizedPath}`);

          // Add links to queue if within depth limit
          if (depth < config.depth) {
            for (const link of crawledPage.links) {
              const linkNormalized = this.normalizeUrl(link, baseUrl);
              if (!visited.has(linkNormalized)) {
                toVisit.push({ url: link, depth: depth + 1 });
              }
            }
          }
        } else {
          result.crawlLog.push(`Skipped or failed: ${url}`);
        }
      }
    } catch (error) {
      result.errors.push(`Crawl error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await page.close();
    }

    result.crawlLog.push(`Crawl completed: ${result.pages.length} pages crawled`);
    return result;
  }

  /**
   * Match equivalent pages between baseline and candidate sites
   */
  matchPages(baselineResult: CrawlResult, candidateResult: CrawlResult, existingPageMap?: PageMap[]): MatchedPage[] {
    const matches: MatchedPage[] = [];

    // First, use explicit pageMap if provided
    if (existingPageMap && existingPageMap.length > 0) {
      for (const mapping of existingPageMap) {
        const baselinePage = baselineResult.pages.find(
          (p) => p.normalizedPath === mapping.baselinePath || p.url.endsWith(mapping.baselinePath)
        );
        const candidatePage = candidateResult.pages.find(
          (p) => p.normalizedPath === mapping.candidatePath || p.url.endsWith(mapping.candidatePath)
        );

        if (baselinePage && candidatePage) {
          matches.push({
            baseline: baselinePage,
            candidate: candidatePage,
            confidence: 1.0,
            matchReason: 'Explicit pageMap mapping',
          });
        }
      }
    }

    // Then, match by normalized path (exact match)
    for (const baselinePage of baselineResult.pages) {
      if (matches.some((m) => m.baseline.url === baselinePage.url)) {
        continue; // Already matched
      }

      const candidatePage = candidateResult.pages.find(
        (p) => p.normalizedPath === baselinePage.normalizedPath
      );

      if (candidatePage) {
        matches.push({
          baseline: baselinePage,
          candidate: candidatePage,
          confidence: 0.9,
          matchReason: 'Exact path match',
        });
      }
    }

      // Match by title similarity
      for (const baselinePage of baselineResult.pages) {
        if (matches.some((m) => m.baseline.url === baselinePage.url)) {
          continue;
        }

        const baselineTitle = baselinePage.title;
        if (!baselineTitle) continue;

        const candidatePage = candidateResult.pages.find((p) => {
          if (matches.some((m) => m.candidate.url === p.url)) return false;
          if (!p.title) return false;
          // Simple title matching (can be enhanced with fuzzy matching)
          return p.title.toLowerCase().trim() === baselineTitle.toLowerCase().trim();
        });

      if (candidatePage) {
        matches.push({
          baseline: baselinePage,
          candidate: candidatePage,
          confidence: 0.7,
          matchReason: 'Title match',
        });
      }
    }

    return matches;
  }

  /**
   * Generate stable pageMap from matched pages
   */
  generatePageMap(matchedPages: MatchedPage[]): PageMap[] {
    return matchedPages.map((match) => ({
      baselinePath: match.baseline.normalizedPath,
      candidatePath: match.candidate.normalizedPath,
      notes: `Matched with ${(match.confidence * 100).toFixed(0)}% confidence: ${match.matchReason}`,
    }));
  }

  /**
   * Save crawl artifacts and logs
   */
  async saveCrawlArtifacts(
    runId: string,
    baselineResult: CrawlResult,
    candidateResult: CrawlResult,
    matchedPages: MatchedPage[],
    pageMap: PageMap[]
  ): Promise<string[]> {
    const artifactsDir = path.join(this.artifactsDir, runId);
    await fs.mkdir(artifactsDir, { recursive: true });

    const artifactPaths: string[] = [];

    // Save baseline crawl result
    const baselineFile = path.join(artifactsDir, 'baseline-crawl.json');
    await fs.writeFile(baselineFile, JSON.stringify(baselineResult, null, 2));
    artifactPaths.push(baselineFile);

    // Save candidate crawl result
    const candidateFile = path.join(artifactsDir, 'candidate-crawl.json');
    await fs.writeFile(candidateFile, JSON.stringify(candidateResult, null, 2));
    artifactPaths.push(candidateFile);

    // Save matched pages
    const matchedFile = path.join(artifactsDir, 'matched-pages.json');
    await fs.writeFile(matchedFile, JSON.stringify(matchedPages, null, 2));
    artifactPaths.push(matchedFile);

    // Save generated pageMap
    const pageMapFile = path.join(artifactsDir, 'generated-pageMap.json');
    await fs.writeFile(pageMapFile, JSON.stringify(pageMap, null, 2));
    artifactPaths.push(pageMapFile);

    // Save crawl logs
    const logFile = path.join(artifactsDir, 'crawl.log');
    const allLogs = [
      '=== Baseline Crawl Log ===',
      ...baselineResult.crawlLog,
      '',
      '=== Candidate Crawl Log ===',
      ...candidateResult.crawlLog,
      '',
      '=== Errors ===',
      ...baselineResult.errors,
      ...candidateResult.errors,
    ];
    await fs.writeFile(logFile, allLogs.join('\n'));
    artifactPaths.push(logFile);

    return artifactPaths;
  }

  /**
   * Main crawl method - crawls both sites and generates pageMap
   */
  async crawlComparison(job: ComparisonJob, runId: string): Promise<{
    baselineResult: CrawlResult;
    candidateResult: CrawlResult;
    matchedPages: MatchedPage[];
    pageMap: PageMap[];
    artifactPaths: string[];
  }> {
    try {
      // Crawl baseline site
      const baselineResult = await this.crawlSite(job.baselineUrl, job.crawlConfig, runId);

      // Crawl candidate site
      const candidateResult = await this.crawlSite(job.candidateUrl, job.crawlConfig, runId);

      // Match pages
      const matchedPages = this.matchPages(baselineResult, candidateResult, job.pageMap);

      // Generate stable pageMap
      const pageMap = this.generatePageMap(matchedPages);

      // Save artifacts
      const artifactPaths = await this.saveCrawlArtifacts(
        runId,
        baselineResult,
        candidateResult,
        matchedPages,
        pageMap
      );

      return {
        baselineResult,
        candidateResult,
        matchedPages,
        pageMap,
        artifactPaths,
      };
    } finally {
      await this.cleanup();
    }
  }
}

