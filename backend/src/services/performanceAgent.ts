import { Page } from 'playwright';
import { promises as fs } from 'fs';
import path from 'path';
import { DATA_DIR, config } from '../config/config';

export interface PerformanceSnapshot {
  lcp?: number;    // ms
  fcp?: number;    // ms
  cls?: number;    // unitless
  ttfb?: number;   // ms
  pageLoadTime?: number;
  totalBytes?: number;
  jsErrors?: number;
}

export interface PerformanceResult {
  page: string;
  baseline?: PerformanceSnapshot;
  candidate?: PerformanceSnapshot;
  issues: string[];
  score: number; // 0-100
}

export class PerformanceAgent {
  private readonly artifactsDir: string;

  constructor() {
    this.artifactsDir = path.join(DATA_DIR, 'artifacts');
  }

  async extractFromPageHandle(page: Page): Promise<PerformanceSnapshot> {
    try {
      const navTiming = await page.evaluate(() => {
        const entry = performance.getEntriesByType('navigation')?.[0] as PerformanceNavigationTiming | undefined;
        if (!entry) return null;
        return {
          ttfb: entry.responseStart - entry.requestStart,
          domReady: entry.domContentLoadedEventEnd - entry.startTime,
          pageLoad: entry.loadEventEnd - entry.startTime,
          redirectCount: entry.redirectCount || 0,
        };
      });
      const vitals = await page.evaluate(() => new Promise((resolve) => {
        const result: any = {};
        try {
          const po = new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
              if ((entry as any).entryType === 'paint' && (entry as any).name === 'first-contentful-paint') result.fcp = (entry as any).startTime;
              if ((entry as any).entryType === 'largest-contentful-paint') result.lcp = (entry as any).startTime;
              if ((entry as any).entryType === 'layout-shift') result.cls = (result.cls || 0) + ((entry as any).value || 0);
            }
          });
          try { po.observe({ entryTypes: ['paint', 'largest-contentful-paint', 'layout-shift'] }); } catch {}
        } catch {}
        setTimeout(() => { result.inp = 0; resolve(result); }, 1500);
      }));

      const totalBytes = await page.evaluate(() =>
        performance.getEntriesByType('resource').reduce((sum: number, e: any) => sum + ((e.transferSize) || 0), 0)
      );

      // JS errors count - best effort by reading console errors collected to window
      const jsErrors = await page.evaluate(() => (window as any).__mg_console_errors_count || 0).catch(() => 0);

      const vitalsTyped = vitals as { lcp?: number; fcp?: number; cls?: number; inp?: number } | null;

      const snapshot: PerformanceSnapshot = {
        lcp: vitalsTyped?.lcp,
        fcp: vitalsTyped?.fcp,
        cls: vitalsTyped?.cls,
        ttfb: navTiming?.ttfb,
        pageLoadTime: navTiming?.pageLoad,
        totalBytes,
        jsErrors,
      };

      return snapshot;
    } catch (err) {
      throw err;
    }
  }

  compareSnapshots(page: string, baseline?: PerformanceSnapshot, candidate?: PerformanceSnapshot): PerformanceResult {
    const issues: string[] = [];
    let score = 100;

    if (!baseline || !candidate) {
      issues.push('Missing baseline or candidate performance snapshot');
      return { page, baseline, candidate, issues, score: 50 };
    }

    // Thresholds from config (core web vitals)
    const lcpPass = config.comparison.webVitals.lcp.good || 2500;
    const lcpWarn = config.comparison.webVitals.lcp.poor || 4000;

    const clsPass = config.comparison.webVitals.cls.good || 0.1;
    const clsWarn = config.comparison.webVitals.cls.poor || 0.25;

    const fcpPass = config.comparison.webVitals.fcp.good || 1800;
    const fcpWarn = config.comparison.webVitals.fcp.poor || 3000;

    const checkMetric = (name: string, baseVal: any, candVal: any, passVal: number, warnVal: number) => {
      if (baseVal == null || candVal == null) return;
      if (name === 'cls') {
        if (candVal > warnVal) { issues.push(`${name} is FAIL (${candVal})`); score -= 40; }
        else if (candVal > passVal) { issues.push(`${name} is WARNING (${candVal})`); score -= 15; }
      } else {
        if (candVal > warnVal) { issues.push(`${name} is FAIL (${candVal}ms)`); score -= 40; }
        else if (candVal > passVal) { issues.push(`${name} is WARNING (${candVal}ms)`); score -= 15; }
      }

      if (typeof baseVal === 'number' && typeof candVal === 'number' && baseVal > 0) {
        const delta = ((candVal - baseVal) / baseVal) * 100;
        if (delta > (config.comparison.perfRegressionWarnPercent || 20)) {
          issues.push(`${name} degraded by ${delta.toFixed(0)}% vs baseline`);
          score -= 20;
        }
      }
    };

    checkMetric('lcp', baseline.lcp, candidate.lcp, lcpPass, lcpWarn);
    checkMetric('cls', baseline.cls, candidate.cls, clsPass, clsWarn);
    checkMetric('fcp', baseline.fcp, candidate.fcp, fcpPass, fcpWarn);

    if (score < 0) score = 0;

    return { page, baseline, candidate, issues, score };
  }

  async saveResult(result: PerformanceResult | any, runId: string, runSettings?: { useAI?: boolean }): Promise<string> {
    const outPath = path.join(this.artifactsDir, runId, 'performance', `${this.sanitizePath((result as any).page || 'index')}.json`);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(result, null, 2), 'utf-8');
    // If AI is configured, request AI-enhanced performance suggestions and save them
    try {
      const { AiReasoningService } = await import('./aiReasoningService');
      const ai = new AiReasoningService();
      if (ai.shouldUseAI(runSettings) && ai.isConfigured()) {
        try {
          const suggestions = await ai.analyzePerformance(result, runId, runSettings);
          if (Array.isArray(suggestions) && suggestions.length > 0) {
            const suggestPath = path.join(this.artifactsDir, runId, 'performance', `${this.sanitizePath((result as any).page || 'index')}-suggestions.json`);
            await fs.writeFile(suggestPath, JSON.stringify(suggestions, null, 2), 'utf-8');
          }
        } catch (e) {
          console.error('Performance AI analysis failed:', e);
        }
      }
    } catch (e) {
      // ignore AI errors
    }

    return outPath.replace(/^.*[\\\/]data[\\\/]/, 'data/');
  }

  private sanitizePath(p: string) {
    return p.replace(/[^a-zA-Z0-9-_]/g, '_').replace(/^_+|_+$/g, '') || 'index';
  }
}

export default PerformanceAgent;
 
