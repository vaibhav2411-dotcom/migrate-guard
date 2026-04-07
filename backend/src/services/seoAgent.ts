import { promises as fs } from 'fs';
import path from 'path';
import { DATA_DIR } from '../config/config';

export interface SeoSnapshot {
  title: string;
  metaDescription: string;
  canonical: string;
  robots: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  h1s: string[];
  h2s: string[];
  structuredData: object[];
  hreflang: string[];
  sitemapPresent: boolean;
  robotsTxtPresent: boolean;
  responseTime: number;
  statusCode: number;
}

export interface SeoIssue {
  field: string;
  severity: 'info' | 'warning' | 'fail';
  message: string;
}

export interface SeoResult {
  page: string;
  baseline: SeoSnapshot;
  candidate: SeoSnapshot;
  issues: SeoIssue[];
  score: number; // 0-100
}

/**
 * SeoAgent - Extracts SEO-related metadata and compares snapshots
 */
export class SeoAgent {
  private readonly artifactsDir: string;

  constructor() {
    this.artifactsDir = path.join(DATA_DIR, 'artifacts');
  }

  /**
   * Extract SEO snapshot from a Playwright page context via evaluate
   * @param page Playwright Page - note: caller should pass serialized DOM snapshots or operate with browser context
   * @returns SeoSnapshot
   */
  async extractFromPageHandle(pageHandle: any, url: string): Promise<SeoSnapshot> {
    // pageHandle expected to be a Playwright Page
    try {
      const start = Date.now();
      const snapshot = await pageHandle.evaluate(() => ({
        title: document.title || '',
        metaDescription: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
        robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') || '',
        ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '',
        ogDescription: document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '',
        ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '',
        h1s: Array.from(document.querySelectorAll('h1')).map((h) => h.innerText.trim()),
        h2s: Array.from(document.querySelectorAll('h2')).map((h) => h.innerText.trim()),
        structuredData: Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((s) => {
          try { return JSON.parse(s.textContent || '{}'); } catch { return null; }
        }).filter(Boolean),
        hreflang: Array.from(document.querySelectorAll('link[rel="alternate"][hreflang]')).map((l) => l.getAttribute('hreflang') || ''),
      }));

      const end = Date.now();
      const seo: SeoSnapshot = {
        title: snapshot.title,
        metaDescription: snapshot.metaDescription,
        canonical: snapshot.canonical,
        robots: snapshot.robots,
        ogTitle: snapshot.ogTitle,
        ogDescription: snapshot.ogDescription,
        ogImage: snapshot.ogImage,
        h1s: snapshot.h1s,
        h2s: snapshot.h2s,
        structuredData: snapshot.structuredData,
        hreflang: snapshot.hreflang,
        sitemapPresent: false,
        robotsTxtPresent: false,
        responseTime: end - start,
        statusCode: 200,
      };

      return seo;
    } catch (error) {
      return {
        title: '',
        metaDescription: '',
        canonical: '',
        robots: '',
        ogTitle: '',
        ogDescription: '',
        ogImage: '',
        h1s: [],
        h2s: [],
        structuredData: [],
        hreflang: [],
        sitemapPresent: false,
        robotsTxtPresent: false,
        responseTime: 0,
        statusCode: 0,
      };
    }
  }

  /**
   * Compare two SeoSnapshots and produce SeoResult
   */
  compareSnapshots(page: string, baseline: SeoSnapshot, candidate: SeoSnapshot): SeoResult {
    const issues: SeoIssue[] = [];

    // Title
    if (!baseline.title) {
      issues.push({ field: 'title', severity: 'warning', message: 'Baseline title missing' });
    }
    if (!candidate.title) {
      issues.push({ field: 'title', severity: 'fail', message: 'Candidate title missing' });
    }
    if (baseline.title && candidate.title && baseline.title !== candidate.title) {
      issues.push({ field: 'title', severity: 'fail', message: `Title changed: "${baseline.title}" → "${candidate.title}"` });
    }

    // Meta description
    if (!candidate.metaDescription) {
      issues.push({ field: 'metaDescription', severity: 'warning', message: 'Candidate meta description missing' });
    } else if (baseline.metaDescription && baseline.metaDescription !== candidate.metaDescription) {
      issues.push({ field: 'metaDescription', severity: 'info', message: 'Meta description changed' });
    }

    // Canonical
    if (!candidate.canonical) {
      issues.push({ field: 'canonical', severity: 'fail', message: 'Candidate canonical missing' });
    }

    // H1s
    if (candidate.h1s.length !== 1) {
      issues.push({ field: 'h1', severity: 'warning', message: `Candidate has ${candidate.h1s.length} <h1> elements` });
    }

    // Structured data types
    const baselineTypes = (baseline.structuredData || []).map((s: any) => s['@type'] || s['type'] || '').filter(Boolean);
    const candidateTypes = (candidate.structuredData || []).map((s: any) => s['@type'] || s['type'] || '').filter(Boolean);
    if (baselineTypes.join(',') !== candidateTypes.join(',')) {
      issues.push({ field: 'structuredData', severity: 'fail', message: 'Structured data schema types changed' });
    }

    // OG tags
    if (!candidate.ogTitle || !candidate.ogDescription) {
      issues.push({ field: 'og', severity: 'warning', message: 'Missing Open Graph tags' });
    }

    // Simple scoring: start at 100 and deduct per issue
    let score = 100;
    for (const issue of issues) {
      if (issue.severity === 'fail') score -= 30;
      else if (issue.severity === 'warning') score -= 10;
      else score -= 5;
    }
    if (score < 0) score = 0;

    return {
      page,
      baseline,
      candidate,
      issues,
      score,
    };
  }

  /**
   * Save SEO result to artifacts
   */
  async saveResult(result: SeoResult, runId: string): Promise<string> {
    const outPath = path.join(this.artifactsDir, runId, 'seo', `${this.sanitizePath(result.page)}.json`);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(result, null, 2));
    return outPath.replace(/^.*[\\/]data[\\/]/, 'data/');
  }

  private sanitizePath(p: string) {
    return p.replace(/[^a-zA-Z0-9-_]/g, '_').replace(/^_+|_+$/g, '') || 'index';
  }
}
