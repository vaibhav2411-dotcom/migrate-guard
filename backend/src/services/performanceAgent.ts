import path from 'path';
import { promises as fs } from 'fs';
import { DATA_DIR, config } from '../config/config';

export interface PerformanceSnapshot {
  lcp?: number;    // ms
  fid?: number;    // ms
  cls?: number;    // unitless
  fcp?: number;    // ms
  ttfb?: number;   // ms
  totalRequests?: number;
  totalBytes?: number;
  pageLoadTime?: number;
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

  /**
   * Extract performance vitals from a Playwright page via CDP client or from page.evaluate
   * Caller should provide a Playwright page object; for compatibility we'll accept a pageHandle
   */
  async extractFromPageHandle(pageHandle: any): Promise<PerformanceSnapshot> {
    try {
      // Try to get vitals via evaluate with PerformanceObserver
      const vitals = await pageHandle.evaluate(() => {
        return new Promise((resolve) => {
          const result: any = {};
          try {
            const po = new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                if ((entry as any).entryType === 'largest-contentful-paint') result.lcp = (entry as any).startTime;
                if ((entry as any).entryType === 'layout-shift') result.cls = (result.cls || 0) + ((entry as any).value || 0);
                if ((entry as any).entryType === 'paint' && (entry as any).name === 'first-contentful-paint') result.fcp = (entry as any).startTime;
              }
            });
            po.observe({ type: 'largest-contentful-paint', buffered: true });
            po.observe({ type: 'layout-shift', buffered: true });
            po.observe({ type: 'paint', buffered: true });
          } catch (e) {
            // ignore
          }

          setTimeout(() => {
            try { resolve(result); } catch { resolve(result); }
          }, 1500);
        });
      });

      // Basic ttfb via performance.timing if available
      const timing = await pageHandle.evaluate(() => {
        // @ts-ignore
        const t = performance.timing || {};
        return {
          ttfb: t.responseStart && t.requestStart ? t.responseStart - t.requestStart : undefined,
          pageLoad: t.loadEventEnd && t.navigationStart ? t.loadEventEnd - t.navigationStart : undefined,
        };
      });

      const snapshot: PerformanceSnapshot = {
        lcp: vitals.lcp,
        cls: vitals.cls,
        fcp: vitals.fcp,
        ttfb: timing.ttfb,
        pageLoadTime: timing.pageLoad,
        jsErrors: 0,
      };

      return snapshot;
    } catch (error) {
      return {} as PerformanceSnapshot;
    }
  }

  /**
   * Compare two snapshots and return result with issues and score
   */
  compareSnapshots(page: string, baseline?: PerformanceSnapshot, candidate?: PerformanceSnapshot): PerformanceResult {
    const issues: string[] = [];
    let score = 100;

    if (!baseline || !candidate) {
      issues.push('Missing baseline or candidate performance snapshot');
      return { page, baseline, candidate, issues, score: 50 };
    }

    // Thresholds from config (core web vitals)
    const lcpPass = 2500;
    const lcpWarn = 4000;

    const clsPass = 0.1;
    const clsWarn = 0.25;

    const fcpPass = 1800;
    const fcpWarn = 3000;

    // Helper to mark issues
    const checkMetric = (name: string, baseVal: any, candVal: any, passVal: number, warnVal: number, isPercentDelta = false) => {
      if (baseVal == null || candVal == null) return;
      // Absolute thresholds for pass/warn/fail
      if (name === 'cls') {
        if (candVal > warnVal) { issues.push(`${name} is FAIL (${candVal})`); score -= 40; }
        else if (candVal > passVal) { issues.push(`${name} is WARNING (${candVal})`); score -= 15; }
      } else {
        if (candVal > warnVal) { issues.push(`${name} is FAIL (${candVal}ms)`); score -= 40; }
        else if (candVal > passVal) { issues.push(`${name} is WARNING (${candVal}ms)`); score -= 15; }
      }

      // Relative comparison: candidate worse than baseline by > configured percent
      if (typeof baseVal === 'number' && typeof candVal === 'number' && baseVal > 0) {
        const delta = ((candVal - baseVal) / baseVal) * 100;
        if (delta > (config.comparison.performanceWarnDeltaPercent || 20)) {
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

  async saveResult(result: PerformanceResult, runId: string): Promise<string> {
    const outPath = path.join(this.artifactsDir, runId, 'performance', `${this.sanitizePath(result.page)}.json`);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(result, null, 2));
    return outPath.replace(/^.*[\\/]data[\\/]/, 'data/');
  }

  private sanitizePath(p: string) {
    return p.replace(/[^a-zA-Z0-9-_]/g, '_').replace(/^_+|_+$/g, '') || 'index';
  }
}
