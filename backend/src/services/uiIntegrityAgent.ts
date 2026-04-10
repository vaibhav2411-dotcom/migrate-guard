import { chromium } from 'playwright';
import { promises as fs } from 'fs';
import path from 'path';
import { DATA_DIR, config } from '../config/config';
import { ComparisonJob } from '../models';
import {
  UiIntegrityResult,
  UiRegionResult,
  BrandingResult,
  InteractionResult,
  OverflowResult,
} from '../models';

/**
 * UiIntegrityAgent - checks structural regions, branding tokens and interaction states
 */
export class UiIntegrityAgent {
  private readonly artifactsDir: string;

  constructor() {
    this.artifactsDir = path.join(DATA_DIR, 'artifacts');
  }

  /**
   * Execute UI integrity checks for candidate site using pre-captured artifacts where possible.
   * @param baselineDir Path to baseline artifacts directory
   * @param candidateDir Path to candidate artifacts directory
   * @param job Comparison job configuration
   * @param runId Run identifier for artifact writing
   * @returns UiIntegrityResult or null on error
   */
  async executeUiIntegrityCheck(
    baselineDir: string,
    candidateDir: string,
    job: ComparisonJob,
    runId: string,
    runSettings?: { useAI?: boolean }
  ): Promise<UiIntegrityResult | null> {
    try {
      // Load pre-captured artifact files (don't re-navigate if data already exists)
      const baselineStructurePath = path.join(baselineDir, 'dom-structure.json');
      const candidateStructurePath = path.join(candidateDir, 'dom-structure.json');
      const baselineTokensPath = path.join(baselineDir, 'design-tokens.json');
      const candidateTokensPath = path.join(candidateDir, 'design-tokens.json');

      const baselineStructure = (await fs.stat(baselineStructurePath).then(() => fs.readFile(baselineStructurePath, 'utf-8')).catch(() => '{}')) as string;
      const candidateStructure = (await fs.stat(candidateStructurePath).then(() => fs.readFile(candidateStructurePath, 'utf-8')).catch(() => '{}')) as string;
      const baselineTokens = (await fs.stat(baselineTokensPath).then(() => fs.readFile(baselineTokensPath, 'utf-8')).catch(() => '{}')) as string;
      const candidateTokens = (await fs.stat(candidateTokensPath).then(() => fs.readFile(candidateTokensPath, 'utf-8')).catch(() => '{}')) as string;

      const baselineStruct = JSON.parse(baselineStructure || '{}');
      const candidateStruct = JSON.parse(candidateStructure || '{}');
      const baselineTok = JSON.parse(baselineTokens || '{}');
      const candidateTok = JSON.parse(candidateTokens || '{}');

      // (A) STRUCTURAL UI CHECK
      const regions: UiRegionResult[] = [];

      const structuralChecks = [
        { region: 'Header', key: 'hasHeader', severity: 'critical' },
        { region: 'Navigation', key: 'hasNav', severity: 'critical' },
        { region: 'Main', key: 'hasMain', severity: 'high' },
        { region: 'Footer', key: 'hasFooter', severity: 'high' },
        { region: 'Breadcrumb', key: 'hasBreadcrumb', severity: 'medium' },
      ] as const;

      for (const check of structuralChecks) {
        const baselineHas = Boolean(baselineStruct[check.key]);
        const candidateHas = Boolean(candidateStruct[check.key]);
        regions.push({
          region: check.region,
          present: candidateHas,
          baseline: baselineHas,
          severity: !candidateHas && baselineHas ? (check.severity as UiRegionResult['severity']) : 'pass',
          notes: !candidateHas && baselineHas ? `${check.region} present in baseline but MISSING in candidate` : '',
        });
      }

      // H1 check
      const baselineH1Count = Array.isArray(baselineStruct.h1s) ? baselineStruct.h1s.length : 0;
      const candidateH1Count = Array.isArray(candidateStruct.h1s) ? candidateStruct.h1s.length : 0;
      regions.push({
        region: 'H1 heading',
        present: candidateH1Count === 1,
        baseline: baselineH1Count === 1,
        severity: candidateH1Count === 0 ? 'high' : candidateH1Count > 1 ? 'medium' : 'pass',
        notes: candidateH1Count === 0 ? 'No H1 found — migration may have stripped heading structure' : candidateH1Count > 1 ? 'Multiple H1 tags found — heading hierarchy is invalid' : '',
      });

      // (B) BRANDING AND DESIGN TOKEN CHECK
      const branding: BrandingResult[] = [];

      const tokenChecks = [
        { token: 'Primary colour', key: 'colorPrimary' },
        { token: 'Secondary colour', key: 'colorSecondary' },
        { token: 'Body font family', key: 'bodyFontFamily' },
        { token: 'Body background', key: 'bodyBackground' },
        { token: 'Body text colour', key: 'bodyColor' },
        { token: 'Font size base', key: 'fontSizeBase' },
        { token: 'Border radius', key: 'borderRadius' },
      ] as const;

      for (const t of tokenChecks) {
        const bVal = (baselineTok[t.key] || '').toString().trim();
        const cVal = (candidateTok[t.key] || '').toString().trim();
        const match = bVal === cVal || bVal === '' || cVal === '';
        branding.push({
          token: t.token,
          baseline: bVal,
          candidate: cVal,
          match,
          severity: !match && t.key.includes('color') ? 'high' : !match && t.key.includes('font') ? 'medium' : !match ? 'low' : 'pass',
        });
      }

      // (C) INTERACTION STATE AND OVERFLOW CHECKS — live Playwright session against candidate
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      const interactions: InteractionResult[] = [];
      const overflows: OverflowResult[] = [];

      try {
        await page.goto(job.candidateUrl, { waitUntil: 'networkidle', timeout: 45000 });

        // Focus ring check
        const focusableSelectors = ['button', 'a[href]', 'input', 'select', 'textarea', '[tabindex]'];
        for (const sel of focusableSelectors) {
          try {
            const el = await page.$(sel);
            if (!el) continue;
            await el.focus();
            const outlineWidth = await el.evaluate((e) => getComputedStyle(e).outlineWidth) as string;
            const boxShadow = await el.evaluate((e) => getComputedStyle(e).boxShadow) as string | null;
            const hasFocusRing = (String(outlineWidth) !== '0px') || (Boolean(boxShadow) && String(boxShadow) !== 'none');
            interactions.push({ element: sel, state: 'focus', hasFocusRing, isVisible: true, notes: !hasFocusRing ? `FAIL: ${sel} has no visible focus indicator — violates WCAG 2.4.11` : '' });
          } catch {
            // ignore
          }
        }

        // Sticky header / scroll padding check
        const headerHeight = await page.evaluate(() => {
          const header = document.querySelector('header, [role="banner"]') as HTMLElement | null;
          return header ? header.getBoundingClientRect().height : 0;
        });
        if (headerHeight > 0) {
          const scrollPaddingTop = await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingTop);
          const scrollPaddingValue = parseInt(scrollPaddingTop as string) || 0;
          interactions.push({
            element: 'html[scroll-padding-top]',
            state: 'focus',
            hasFocusRing: true,
            isVisible: scrollPaddingValue >= headerHeight,
            notes: scrollPaddingValue < headerHeight ? `WARN: scroll-padding-top (${scrollPaddingValue}px) is less than header height (${headerHeight}px) — keyboard focus may be obscured beneath sticky header` : '',
          });
        }

        // Touch target size check
        const touchTargets = await page.$$eval(
          'a, button, input, select, [role="button"]',
          (els) =>
            els
              .map((el) => {
                const r = (el as HTMLElement).getBoundingClientRect();
                return { tag: el.tagName, width: r.width, height: r.height, text: (el.textContent || '').trim().slice(0, 40) };
              })
              .filter((el) => el.width > 0 && el.height > 0 && (el.width < 24 || el.height < 24))
        );

        touchTargets.forEach((t) => {
          interactions.push({
            element: `${t.tag}: "${t.text}"`,
            state: 'active',
            hasFocusRing: true,
            isVisible: true,
            notes: `FAIL: Touch target ${t.width}×${t.height}px — below WCAG 2.5.8 minimum of 24×24px`,
          });
        });

        // Overflow check per viewport
        for (const width of config.comparison.viewports) {
          await page.setViewportSize({ width: Number(width), height: 900 });
          const overflowingElements = await page.$$eval('*', () =>
            Array.from(document.querySelectorAll('*'))
              .filter((el) => {
                try {
                  const r = (el as HTMLElement).getBoundingClientRect();
                  return r.right > window.innerWidth + 5;
                } catch {
                  return false;
                }
              })
              .map((el) => ({ selector: (el as HTMLElement).tagName + ((el as HTMLElement).id ? '#' + (el as HTMLElement).id : ''), right: Math.round((el as HTMLElement).getBoundingClientRect().right) }))
              .slice(0, 20)
          );

          overflowingElements.forEach((e: any) => {
            overflows.push({ selector: e.selector, viewport: Number(width), overflows: true, direction: 'x', notes: `Element extends to ${e.right}px — viewport is ${width}px` });
          });

          // Widescreen max-width check
          if (Number(width) >= 1920) {
            const mainWidth = await page.evaluate(() => {
              const main = document.querySelector('main, [role="main"], .container, .content-wrapper') as HTMLElement | null;
              return main ? main.getBoundingClientRect().width : 0;
            });
            if (mainWidth > 1400) {
              overflows.push({ selector: 'main / container', viewport: Number(width), overflows: false, direction: 'x', notes: `WARN: Main content is ${mainWidth}px wide at ${width}px viewport. No max-width constraint detected — violates readability heuristics (60-80 char lines).` });
            }
          }
        }

      } finally {
        try { await page.close(); } catch {}
        try { await browser.close(); } catch {}
      }

      // Compute summary counts
      const allItems = [
        ...regions,
        ...branding,
        ...interactions,
        ...overflows.map((o) => ({ severity: o.overflows ? 'high' : 'medium' } as any)),
      ];

      const summary = {
        critical: allItems.filter((i: any) => i.severity === 'critical').length,
        fail: allItems.filter((i: any) => ['high', 'critical'].includes((i as any).severity)).length,
        warn: allItems.filter((i: any) => (i as any).severity === 'medium').length,
        pass: allItems.filter((i: any) => ['low', 'pass'].includes((i as any).severity)).length,
      };

      const result: UiIntegrityResult = {
        regions,
        branding,
        interactions,
        overflows,
        summary,
      };

      // Generate remediation suggestions based on common failures
      let suggestions: Array<{ id: string; title: string; severity: string; snippet?: string; note?: string }> = [];

      try {
        // heuristic suggestions (fallback)
        if (interactions.some((i) => i.notes && i.notes.startsWith('FAIL:') && i.state === 'focus')) {
          suggestions.push({
            id: 'focus-ring',
            title: 'Add visible focus styles',
            severity: 'high',
            snippet: `:focus { outline: 3px solid #ffbf47; outline-offset: 2px; }`,
            note: 'Ensure interactive controls show a visible focus indicator to meet WCAG 2.4.11',
          });
        }

        if (interactions.some((i) => i.notes && i.notes.includes('Touch target'))) {
          suggestions.push({
            id: 'touch-targets',
            title: 'Increase touch target sizes',
            severity: 'medium',
            snippet: `.nav a, .footer a, button { padding: 8px 12px; min-width: 32px; min-height: 32px; }`,
            note: 'Add padding or minimum size to interactive elements to reach 24×24px target size.',
          });
        }

        if (regions.find((r) => r.region === 'H1 heading' && r.severity !== 'pass')) {
          suggestions.push({
            id: 'h1-structure',
            title: 'Restore a single H1 on the page',
            severity: 'high',
            note: 'Ensure each page has exactly one H1 element representing the main page heading. This improves SEO and accessibility.',
          });
        }

        if (overflows.length > 0) {
          suggestions.push({
            id: 'overflow',
            title: 'Container max-width and responsive images',
            severity: 'medium',
            snippet: `img { max-width: 100%; height: auto; } .container { max-width: 1200px; margin: 0 auto; }`,
            note: 'Ensure large media and containers respect viewport width to avoid horizontal scrolling on small devices.',
          });
        }

        // If AI endpoint configured, ask AI for improved suggestions
        try {
          const { AiReasoningService } = await import('./aiReasoningService');
          const ai = new AiReasoningService();
          if (ai.shouldUseAI(runSettings) && ai.isConfigured()) {
            try {
              const aiSuggestions = await ai.analyzeUiIntegrity({ regions, branding, interactions, overflows, summary }, runId, runSettings);
              if (Array.isArray(aiSuggestions) && aiSuggestions.length > 0) {
                suggestions = aiSuggestions as any;
              }
            } catch (e) {
              console.error('UI integrity AI analysis failed:', e);
            }
          }
        } catch (e) {
          // ignore loader errors and use heuristic suggestions
        }

        const suggestPath = path.join(this.artifactsDir, runId, 'ui-integrity-suggestions.json');
        await fs.mkdir(path.dirname(suggestPath), { recursive: true });
        await fs.writeFile(suggestPath, JSON.stringify(suggestions, null, 2), 'utf-8');
        // Also write a ready-to-apply CSS file with suggested fixes
        try {
          const cssSnippets = suggestions
            .map((s) => (s.snippet ? `/* ${s.title} */\n${s.snippet}\n` : `/* ${s.title}: ${s.note || ''} */\n`))
            .join('\n');
          const cssPath = path.join(this.artifactsDir, runId, 'ui-integrity-fixes.css');
          await fs.writeFile(cssPath, cssSnippets, 'utf-8');
        } catch {}
      } catch {}
      // Save artifact
      try {
        const outPath = path.join(this.artifactsDir, runId, 'ui-integrity.json');
        await fs.mkdir(path.dirname(outPath), { recursive: true });
        await fs.writeFile(outPath, JSON.stringify(result, null, 2), 'utf-8');
      } catch {
        // ignore write errors
      }

      return result;
    } catch (err) {
      // On error, write an error artifact and return null (graceful failure)
      try {
        const outPath = path.join(this.artifactsDir, runId, 'error-ui-integrity.json');
        await fs.mkdir(path.dirname(outPath), { recursive: true });
        await fs.writeFile(outPath, JSON.stringify({ error: err instanceof Error ? err.stack || err.message : String(err) }, null, 2), 'utf-8');
      } catch {}
      return null;
    }
  }
}
