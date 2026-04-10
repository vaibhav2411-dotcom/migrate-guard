import { Page } from 'playwright';
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
  structuredData: any[];
  hreflang: string[];
  sitemapPresent: boolean;
  robotsTxtPresent: boolean;
  responseTime: number;
  statusCode: number;
}

export interface SeoIssue {
  field: string;
  severity: 'info' | 'warning' | 'fail' | 'critical';
  message: string;
}

export interface SeoResult {
  page: string;
  baseline: SeoSnapshot;
  candidate: SeoSnapshot;
  issues: SeoIssue[];
  score: number;
}

export class SeoAgent {
  private readonly artifactsDir: string;

  constructor() {
    this.artifactsDir = path.join(DATA_DIR, 'artifacts');
  }

  /**
   * Extract SEO snapshot from a Playwright page handle
   */
  async extractFromPageHandle(page: Page, _normalizedPath?: string): Promise<SeoSnapshot> {
    try {
      const start = Date.now();
      const snap = await page.evaluate(() => {
        const title = document.title || '';
        const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
        const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
        const robots = document.querySelector('meta[name="robots"]')?.getAttribute('content') || '';
        const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
        const ogDescription = document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
        const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
        const h1s = Array.from(document.querySelectorAll('h1')).map(h => (h.textContent || '').trim());
        const h2s = Array.from(document.querySelectorAll('h2')).map(h => (h.textContent || '').trim());
        const hreflang = Array.from(document.querySelectorAll('link[rel="alternate"][hreflang]')).map(l => l.getAttribute('hreflang') || '');
        const structuredData = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(el => {
          try { return JSON.parse(el.textContent || ''); } catch { return null; }
        }).filter(Boolean);
        const noindex = !!document.querySelector('meta[name="robots"][content*="noindex"]');
        return { title, metaDescription, canonical, robots, ogTitle, ogDescription, ogImage, h1s, h2s, hreflang, structuredData, noindex };
      });
      const end = Date.now();

      const seo: SeoSnapshot = {
        title: snap.title,
        metaDescription: snap.metaDescription,
        canonical: snap.canonical,
        robots: snap.robots,
        ogTitle: snap.ogTitle,
        ogDescription: snap.ogDescription,
        ogImage: snap.ogImage,
        h1s: snap.h1s || [],
        h2s: snap.h2s || [],
        structuredData: snap.structuredData || [],
        hreflang: snap.hreflang || [],
        sitemapPresent: false,
        robotsTxtPresent: false,
        responseTime: end - start,
        statusCode: 200,
      };

      return seo;
    } catch (err) {
      throw err;
    }
  }

  /**
   * Compare two SEO snapshots and produce findings
   */
  compareSnapshots(page: string, baseline: SeoSnapshot, candidate: SeoSnapshot): SeoResult {
    const issues: SeoIssue[] = [];

    if (!baseline.title) {
      issues.push({ field: 'title', severity: 'warning', message: 'Baseline title missing' });
    }
    if (!candidate.title) {
      issues.push({ field: 'title', severity: 'fail', message: 'Candidate title missing' });
    }
    if (baseline.title && candidate.title && baseline.title !== candidate.title) {
      issues.push({ field: 'title', severity: 'fail', message: `Title changed: "${baseline.title}" → "${candidate.title}"` });
    }

    if (!candidate.metaDescription) {
      issues.push({ field: 'metaDescription', severity: 'warning', message: 'Candidate meta description missing' });
    } else if (baseline.metaDescription && baseline.metaDescription !== candidate.metaDescription) {
      issues.push({ field: 'metaDescription', severity: 'info', message: 'Meta description changed' });
    }

    if (!candidate.canonical) {
      issues.push({ field: 'canonical', severity: 'fail', message: 'Candidate canonical missing' });
    }

    if ((candidate.h1s || []).length !== 1) {
      issues.push({ field: 'h1', severity: 'warning', message: `Candidate has ${(candidate.h1s || []).length} <h1> elements` });
    }

    const baselineTypes = (baseline.structuredData || []).map((s: any) => s['@type'] || s['type'] || '').filter(Boolean);
    const candidateTypes = (candidate.structuredData || []).map((s: any) => s['@type'] || s['type'] || '').filter(Boolean);
    if (baselineTypes.join(',') !== candidateTypes.join(',')) {
      issues.push({ field: 'structuredData', severity: 'fail', message: 'Structured data schema types changed' });
    }

    if (!candidate.ogTitle || !candidate.ogDescription) {
      issues.push({ field: 'og', severity: 'warning', message: 'Missing Open Graph tags' });
    }

    if (candidate.responseTime && baseline.responseTime && candidate.responseTime > baseline.responseTime * 1.5) {
      issues.push({ field: 'responseTime', severity: 'warning', message: 'Candidate response time significantly slower' });
    }

    if ((candidate as any).noindex) {
      issues.push({ field: 'noindex', severity: 'critical', message: 'Candidate has noindex — will block indexing' });
    }

    let score = 100;
    for (const issue of issues) {
      if (issue.severity === 'fail' || issue.severity === 'critical') score -= 30;
      else if (issue.severity === 'warning') score -= 10;
      else score -= 5;
    }
    if (score < 0) score = 0;

    return { page, baseline, candidate, issues, score };
  }

  /**
   * Save SEO comparison result to artifacts and return path
   */
  async saveResult(result: SeoResult, runId: string, runSettings?: { useAI?: boolean }): Promise<string> {
    const outPath = path.join(this.artifactsDir, runId, 'seo', `${this.sanitizePath(result.page)}.json`);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(result, null, 2), 'utf-8');

    // If AI is configured, request AI-enhanced SEO suggestions and save them
    try {
      const { AiReasoningService } = await import('./aiReasoningService');
      const ai = new AiReasoningService();
      if (ai.shouldUseAI(runSettings) && ai.isConfigured()) {
        try {
          const suggestions = await ai.analyzeSeo(result, runId, runSettings);
          if (Array.isArray(suggestions) && suggestions.length > 0) {
            const suggestPath = path.join(this.artifactsDir, runId, 'seo', `${this.sanitizePath(result.page)}-suggestions.json`);
            await fs.writeFile(suggestPath, JSON.stringify(suggestions, null, 2), 'utf-8');
          }
        } catch (e) {
          // log and continue with deterministic flow
          console.error('SEO AI analysis failed:', e);
        }
      }
    } catch (e) {
      // ignore loader errors
    }

      // Normalize to workspace-relative data/... path
      const parts = outPath.split(path.join('data', path.sep));
      const rel = parts.length > 1 ? parts.slice(1).join(path.sep) : outPath;
      return `data/${rel.replace(/\\/g, '/')}`;
  }

  private sanitizePath(p: string) {
    return p.replace(/[^a-zA-Z0-9-_]/g, '_').replace(/^_+|_+$/g, '') || 'index';
  }
}

export default SeoAgent;
 
