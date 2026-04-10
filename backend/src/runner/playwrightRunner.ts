import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { DATA_DIR } from '../config/config';

export type ArtifactList = string[];

interface NetworkEntry {
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  timestamp: string;
  failure?: string;
}

/**
 * Run a deterministic, local Playwright capture of two URLs (baseline & candidate).
 * Produces screenshots, full HTML snapshots, console logs and a network summary file for each site.
 */
export async function runTwoSiteCapture(
  baselineUrl: string,
  candidateUrl: string,
  runId: string
): Promise<ArtifactList> {
  const artifactsDir = path.join(DATA_DIR, 'artifacts', runId);
  await fs.mkdir(artifactsDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const artifactPaths: string[] = [];

  async function captureSite(url: string, siteName: 'baseline' | 'candidate') {
    const siteDir = path.join(artifactsDir, siteName);
    await fs.mkdir(siteDir, { recursive: true });

    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    const consoleMessages: Array<{ type: string; text: string; timestamp: string }> = [];
    const consoleErrors: Array<{ type: string; text: string; timestamp: string }> = [];
    const network: NetworkEntry[] = [];
    let responseHeaders: Record<string, string> | null = null;

    page.on('console', (msg) => {
      const entry = { type: msg.type(), text: msg.text(), timestamp: new Date().toISOString() };
      consoleMessages.push(entry);
      if (msg.type() === 'error' || msg.type() === 'warning') {
        consoleErrors.push(entry);
      }
    });

    page.on('request', (req) => {
      network.push({ url: req.url(), method: req.method(), timestamp: new Date().toISOString() });
    });

    page.on('response', async (res) => {
      try {
        const idx = network.findIndex((n) => n.url === res.url() && n.status === undefined);
        const headers = res.headers();
        if (idx >= 0) {
          network[idx].status = res.status();
          network[idx].statusText = res.statusText();
          network[idx].responseHeaders = headers;
        } else {
          network.push({ url: res.url(), method: 'GET', status: res.status(), statusText: res.statusText(), responseHeaders: headers, timestamp: new Date().toISOString() });
        }

        // Capture response headers for the main document
        try {
          const rtype = res.request().resourceType();
          if (!responseHeaders && (rtype === 'document' || res.url() === url)) {
            responseHeaders = headers;
          }
        } catch {}
      } catch {
        // ignore
      }
    });

    page.on('requestfailed', (req) => {
      network.push({ url: req.url(), method: req.method(), timestamp: new Date().toISOString(), failure: req.failure()?.errorText || 'requestfailed' });
    });

    try {
      const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

      // Capture response headers for the document response
      // Note: some responses may come before 'response' handler; handled in page.on('response') below

      // Multi-viewport screenshots
      const viewports = [375, 768, 1280, 1920];
      for (const width of viewports) {
        try {
          await page.setViewportSize({ width, height: 900 });
          await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
          const screenshotPath = path.join(siteDir, `screenshot-${width}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' });
          artifactPaths.push(screenshotPath);
        } catch (e) {
          // continue on screenshot errors
        }
      }

      // HTML snapshot (save once per page)
      const html = await page.content();
      const htmlPath = path.join(siteDir, 'snapshot.html');
      await fs.writeFile(htmlPath, html, 'utf-8');
      artifactPaths.push(htmlPath);

      // Computed design tokens
      try {
        const tokens = await page.evaluate(() => {
          const root = document.documentElement;
          const cs = getComputedStyle(root);
          return {
            colorPrimary: cs.getPropertyValue('--color-primary').trim(),
            colorSecondary: cs.getPropertyValue('--color-secondary').trim(),
            fontFamily: cs.getPropertyValue('--font-family-base').trim(),
            fontSizeBase: cs.getPropertyValue('--font-size-base').trim(),
            borderRadius: cs.getPropertyValue('--border-radius').trim(),
            spacingUnit: cs.getPropertyValue('--spacing-unit').trim(),
            bodyFontFamily: getComputedStyle(document.body).fontFamily,
            bodyBackground: getComputedStyle(document.body).backgroundColor,
            bodyColor: getComputedStyle(document.body).color,
          };
        });
        const tokensPath = path.join(siteDir, 'design-tokens.json');
        await fs.writeFile(tokensPath, JSON.stringify(tokens, null, 2), 'utf-8');
        artifactPaths.push(tokensPath);
      } catch {}

      // DOM structure snapshot (semantic inventory)
      try {
        const structure = await page.evaluate(() => ({
          title: document.title,
          h1s: Array.from(document.querySelectorAll('h1')).map(e => (e as HTMLElement).innerText.trim()),
          h2s: Array.from(document.querySelectorAll('h2')).map(e => (e as HTMLElement).innerText.trim()),
          h3s: Array.from(document.querySelectorAll('h3')).map(e => (e as HTMLElement).innerText.trim()),
          hasHeader: !!document.querySelector('header, [role="banner"]'),
          hasNav: !!document.querySelector('nav, [role="navigation"]'),
          hasMain: !!document.querySelector('main, [role="main"]'),
          hasFooter: !!document.querySelector('footer, [role="contentinfo"]'),
          hasBreadcrumb: !!document.querySelector('[aria-label*="breadcrumb"], nav[aria-label*="Breadcrumb"]'),
          imgCount: document.querySelectorAll('img').length,
          imgMissingAlt: document.querySelectorAll('img:not([alt])').length,
          linkCount: document.querySelectorAll('a[href]').length,
          formCount: document.querySelectorAll('form').length,
          buttonCount: document.querySelectorAll('button, [role="button"]').length,
        }));
        const domPath = path.join(siteDir, 'dom-structure.json');
        await fs.writeFile(domPath, JSON.stringify(structure, null, 2), 'utf-8');
        artifactPaths.push(domPath);
      } catch {}

      // Additional evidence: logo info, color palette, element bounding boxes and contrast ratios
      try {
        const extra = await page.evaluate(() => {
          function rgbaToKey(v: string) {
            return v.replace(/\s+/g, '');
          }

          // logo detection
          const logoEl = document.querySelector('img[alt*="logo" i], img[src*="logo" i], .logo, [aria-label*="logo" i]') as HTMLImageElement | null;
          const logo = logoEl
            ? {
                src: logoEl.src || null,
                alt: logoEl.alt || null,
                width: logoEl.naturalWidth || Math.round((logoEl as HTMLElement).getBoundingClientRect().width || 0),
                height: logoEl.naturalHeight || Math.round((logoEl as HTMLElement).getBoundingClientRect().height || 0),
              }
            : null;

          // color palette (sample computed colors)
          const colorMap: Record<string, number> = {};
          try {
            const all = Array.from(document.querySelectorAll<HTMLElement>('*'));
            for (let i = 0; i < all.length; i++) {
              try {
                const el = all[i];
                const cs = getComputedStyle(el);
                const c = rgbaToKey(cs.color || '');
                const bg = rgbaToKey(cs.backgroundColor || '');
                if (c) colorMap[c] = (colorMap[c] || 0) + 1;
                if (bg) colorMap[bg] = (colorMap[bg] || 0) + 1;
              } catch {}
            }
          } catch {}

          const palette = Object.entries(colorMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 40)
            .map(([color, count]) => ({ color, count }));

          // bounding boxes for key elements
          const bbox = (sel: string) => {
            const el = document.querySelector(sel) as HTMLElement | null;
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { selector: sel, x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
          };

          const boxes = [
            bbox('header, [role="banner"]'),
            bbox('nav, [role="navigation"]'),
            bbox('main, [role="main"]'),
            bbox('footer, [role="contentinfo"]'),
            bbox('h1'),
            bbox('img'),
          ].filter(Boolean);

          // contrast sampling for visible text nodes
          function rgbToL(a: string) {
            const m = a.match(/rgba?\(([^)]+)\)/);
            if (!m) return null;
            const parts = m[1].split(',').map(s => Number(s.trim()));
            const r = parts[0] / 255;
            const g = parts[1] / 255;
            const b = parts[2] / 255;
            const toSrgb = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
            const L = 0.2126 * toSrgb(r) + 0.7152 * toSrgb(g) + 0.0722 * toSrgb(b);
            return L;
          }

          function contrastRatio(fg: string, bg: string) {
            try {
              const L1 = rgbToL(fg) ?? 0;
              const L2 = rgbToL(bg) ?? 0;
              const lighter = Math.max(L1, L2);
              const darker = Math.min(L1, L2);
              return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
            } catch {
              return null;
            }
          }

          const contrasts: Array<any> = [];
          try {
            const textEls = Array.from(document.querySelectorAll('p, a, li, h1, h2, h3')) as HTMLElement[];
            for (let i = 0; i < Math.min(200, textEls.length); i++) {
              try {
                const el = textEls[i];
                const cs = getComputedStyle(el);
                const fg = cs.color || 'rgba(0,0,0,1)';
                // find effective background by walking up until non-transparent
                let cur: HTMLElement | null = el;
                let bg = 'rgba(255,255,255,1)';
                while (cur && cur !== document.documentElement) {
                  const bgc = getComputedStyle(cur).backgroundColor;
                  if (bgc && bgc !== 'rgba(0, 0, 0, 0)' && bgc !== 'transparent') {
                    bg = bgc;
                    break;
                  }
                  cur = cur.parentElement;
                }
                const ratio = contrastRatio(fg, bg);
                contrasts.push({ selector: el.tagName.toLowerCase(), text: (el.textContent || '').trim().slice(0, 80), fg, bg, ratio });
              } catch {}
            }
          } catch {}

          return { logo, palette, boxes, contrasts };
        });

        const logoPath = path.join(siteDir, 'logo-info.json');
        await fs.writeFile(logoPath, JSON.stringify(extra.logo, null, 2), 'utf-8');
        artifactPaths.push(logoPath);

        const palettePath = path.join(siteDir, 'palette.json');
        await fs.writeFile(palettePath, JSON.stringify(extra.palette, null, 2), 'utf-8');
        artifactPaths.push(palettePath);

        const boxesPath = path.join(siteDir, 'element-bboxes.json');
        await fs.writeFile(boxesPath, JSON.stringify(extra.boxes, null, 2), 'utf-8');
        artifactPaths.push(boxesPath);

        const contrastPath = path.join(siteDir, 'contrast.json');
        await fs.writeFile(contrastPath, JSON.stringify(extra.contrasts, null, 2), 'utf-8');
        artifactPaths.push(contrastPath);
      } catch (e) {
        // ignore extra evidence errors
      }

      // Console messages (all) and console errors separately
      const consolePath = path.join(siteDir, 'console.json');
      await fs.writeFile(consolePath, JSON.stringify(consoleMessages, null, 2), 'utf-8');
      artifactPaths.push(consolePath);

      const consoleErrorsPath = path.join(siteDir, 'console-errors.json');
      await fs.writeFile(consoleErrorsPath, JSON.stringify(consoleErrors, null, 2), 'utf-8');
      artifactPaths.push(consoleErrorsPath);

      // Network summary (simple HAR-like JSON)
      const networkPath = path.join(siteDir, 'network.json');
      await fs.writeFile(networkPath, JSON.stringify(network, null, 2), 'utf-8');
      artifactPaths.push(networkPath);

      // Response headers for document
      if (responseHeaders) {
        const respHeadersPath = path.join(siteDir, 'response-headers.json');
        await fs.writeFile(respHeadersPath, JSON.stringify(responseHeaders, null, 2), 'utf-8');
        artifactPaths.push(respHeadersPath);
      }

      // Performance timing (navigation)
      try {
        const perf = await page.evaluate(() => JSON.stringify(performance.getEntriesByType('navigation')));
        const perfPath = path.join(siteDir, 'perf-timing.json');
        await fs.writeFile(perfPath, perf, 'utf-8');
        artifactPaths.push(perfPath);
      } catch {}

      // Save a small metadata file
      const meta = {
        url: page.url() || url,
        status: resp?.status() ?? null,
        timestamp: new Date().toISOString(),
      };
      const metaPath = path.join(siteDir, 'metadata.json');
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
      artifactPaths.push(metaPath);

    } finally {
      try {
        await page.close();
      } catch {}
      try {
        await context.close();
      } catch {}
    }
  }

  try {
    // Capture baseline then candidate (deterministic ordering)
    await captureSite(baselineUrl, 'baseline');
    await captureSite(candidateUrl, 'candidate');

    return artifactPaths;
  } finally {
    try {
      await browser.close();
    } catch {}
  }
}

export default runTwoSiteCapture;
