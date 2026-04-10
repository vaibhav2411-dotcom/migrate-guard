import { Page } from 'playwright';
import { promises as fs } from 'fs';
import path from 'path';
import { DATA_DIR } from '../config/config';

export interface SecuritySnapshot {
  headers: Record<string, string>;
  csp?: string | null;
  hsts?: string | null;
  cookies?: string[];
  mixedContentDetected?: boolean;
  analyticsPresent?: boolean;
  statusCode?: number;
}

export interface SecurityIssue {
  field: string;
  severity: 'info' | 'warning' | 'fail' | 'critical';
  message: string;
}

export interface SecurityResult {
  page: string;
  baseline: SecuritySnapshot;
  candidate: SecuritySnapshot;
  issues: SecurityIssue[];
  score: number;
}

export class SecurityAgent {
  private readonly artifactsDir: string;

  constructor() {
    this.artifactsDir = path.join(DATA_DIR, 'artifacts');
  }

  async extractFromPageHandle(page: Page, _normalizedPath?: string): Promise<SecuritySnapshot> {
    try {
      const snap = await page.evaluate(() => {
        const hdrs: Record<string, string> = {};
        try {
          // Gather meta and header-like information available in the DOM
          const metas = Array.from(document.querySelectorAll('meta')).map(m => ({ name: m.getAttribute('name') || m.getAttribute('http-equiv') || m.getAttribute('property'), content: m.getAttribute('content') }));
          metas.forEach(m => { if (m.name && m.content) hdrs[m.name.toLowerCase()] = m.content; });
        } catch {}

        const cookies = (document.cookie || '') ? document.cookie.split(';').map(c => c.trim()) : [];
        const scripts = Array.from(document.querySelectorAll('script[src]')).map(s => (s as HTMLScriptElement).src);
        const analyticsPresent = scripts.some(s => /googletagmanager|google-analytics|gtag|analytics.js|segment.com|hotjar|mixpanel/i.test(s));
        const csp = Array.from(document.querySelectorAll('meta[http-equiv]')).find(m => (m.getAttribute('http-equiv')||'').toLowerCase() === 'content-security-policy')?.getAttribute('content') || null;
        const hsts = Array.from(document.querySelectorAll('meta[http-equiv]')).find(m => (m.getAttribute('http-equiv')||'').toLowerCase() === 'strict-transport-security')?.getAttribute('content') || null;
        const mixedContentDetected = Array.from(document.querySelectorAll('img, iframe, script, link')).some(el => {
          try {
            const src = (el as any).src || (el as any).href || '';
            return src && src.startsWith('http:');
          } catch { return false; }
        });

        return { headers: hdrs, csp, hsts, cookies, mixedContentDetected, analyticsPresent, statusCode: 200 };
      });
      return snap;
    } catch (err) {
      throw err;
    }
  }

  compareSnapshots(page: string, baseline: SecuritySnapshot, candidate: SecuritySnapshot): SecurityResult {
    const issues: SecurityIssue[] = [];

    // Check CSP presence
    if (!candidate.csp) issues.push({ field: 'csp', severity: 'warning', message: 'Candidate missing Content-Security-Policy meta/header' });
    // HSTS
    if (!candidate.hsts) issues.push({ field: 'hsts', severity: 'warning', message: 'Candidate missing HSTS header' });
    // Mixed content
    if (candidate.mixedContentDetected) issues.push({ field: 'mixedContent', severity: 'critical', message: 'Mixed content detected (insecure http resources)' });
    // Analytics presence change
    if (baseline.analyticsPresent && !candidate.analyticsPresent) issues.push({ field: 'analytics', severity: 'info', message: 'Analytics script removed in candidate' });
    if (!baseline.analyticsPresent && candidate.analyticsPresent) issues.push({ field: 'analytics', severity: 'info', message: 'Analytics script added in candidate' });

    let score = 100;
    for (const it of issues) {
      if (it.severity === 'critical') score -= 50;
      else if (it.severity === 'fail') score -= 30;
      else if (it.severity === 'warning') score -= 15;
      else score -= 5;
    }
    if (score < 0) score = 0;

    return { page, baseline, candidate, issues, score };
  }

  async saveResult(result: SecurityResult, runId: string, runSettings?: { useAI?: boolean }): Promise<string> {
    const outPath = path.join(this.artifactsDir, runId, 'security', `${this.sanitizePath(result.page)}.json`);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(result, null, 2), 'utf-8');

    // Optionally ask AI for security suggestions
    try {
      const { AiReasoningService } = await import('./aiReasoningService');
      const ai = new AiReasoningService();
      if (ai.shouldUseAI(runSettings) && ai.isConfigured()) {
        try {
          const suggestions = await ai.analyzeSecurity(result, runId, runSettings);
          if (Array.isArray(suggestions) && suggestions.length > 0) {
            const suggestPath = path.join(this.artifactsDir, runId, 'security', `${this.sanitizePath(result.page)}-suggestions.json`);
            await fs.writeFile(suggestPath, JSON.stringify(suggestions, null, 2), 'utf-8');
          }
        } catch (e) {
          console.error('Security AI analysis failed:', e);
        }
      }
    } catch (e) {
      // ignore loader errors
    }

    const parts = outPath.split(path.join('data', path.sep));
    const rel = parts.length > 1 ? parts.slice(1).join(path.sep) : outPath;
    return `data/${rel.replace(/\\/g, '/')}`;
  }

  private sanitizePath(p: string) {
    return p.replace(/[^a-zA-Z0-9-_]/g, '_').replace(/^_+|_+$/g, '') || 'index';
  }
}

export default SecurityAgent;
