/**
 * Performance module stub. Integrate Lighthouse programmatically in a production setup.
 * This file provides a resilient interface and placeholder implementation.
 */
import type { GuardConfig } from '../config';

export interface PerfResult {
  lcp?: number;
  cls?: number;
  tbt?: number;
  score?: number;
}

/**
 * runLighthouse is a placeholder that should be replaced with a real Lighthouse invocation.
 * Running Lighthouse programmatically requires a Chrome instance and extra orchestration.
 */
export async function runLighthouse(url: string, cfg: GuardConfig): Promise<PerfResult> {
  // Attempt to run Lighthouse programmatically. If it fails, return safe placeholders.
  let chrome: any = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const chromeLauncher = require('chrome-launcher');
    const lhModule = await import('lighthouse');
    const lighthouseFn = (lhModule && (lhModule as any).default) ? (lhModule as any).default : (lhModule as any);

    chrome = await chromeLauncher.launch({ chromeFlags: ['--headless', '--no-sandbox'] });
    const options = { port: chrome.port, output: 'json', logLevel: 'info' };
    const runnerResult = await lighthouseFn(url, options);
    const lhr = runnerResult && runnerResult.lhr;

    const perf: PerfResult = {
      score: lhr?.categories?.performance?.score ? Math.round((lhr.categories.performance.score as number) * 100) : undefined,
      lcp: lhr?.audits?.['largest-contentful-paint']?.numericValue,
      cls: lhr?.audits?.['cumulative-layout-shift']?.numericValue,
      tbt: lhr?.audits?.['total-blocking-time']?.numericValue,
    };

    return perf;
  } catch (err) {
    const e: any = err;
    // eslint-disable-next-line no-console
    console.warn('Lighthouse run failed or not available, returning placeholder perf metrics:', e && e.message ? e.message : e);
    return { lcp: 0, cls: 0, tbt: 0, score: 0 };
  } finally {
    if (chrome && chrome.kill) {
      try {
        await chrome.kill();
      } catch (_) {}
    }
  }
}
        // eslint-disable-next-line no-console
