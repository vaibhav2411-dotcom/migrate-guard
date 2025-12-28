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
    const network: NetworkEntry[] = [];

    page.on('console', (msg) => {
      consoleMessages.push({ type: msg.type(), text: msg.text(), timestamp: new Date().toISOString() });
    });

    page.on('request', (req) => {
      network.push({ url: req.url(), method: req.method(), timestamp: new Date().toISOString() });
    });

    page.on('response', async (res) => {
      try {
        const idx = network.findIndex((n) => n.url === res.url() && n.status === undefined);
        if (idx >= 0) {
          network[idx].status = res.status();
          network[idx].statusText = res.statusText();
          network[idx].responseHeaders = res.headers();
        } else {
          network.push({ url: res.url(), method: 'GET', status: res.status(), statusText: res.statusText(), timestamp: new Date().toISOString() });
        }
      } catch {
        // ignore
      }
    });

    page.on('requestfailed', (req) => {
      network.push({ url: req.url(), method: req.method(), timestamp: new Date().toISOString(), failure: req.failure()?.errorText || 'requestfailed' });
    });

    try {
      const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

      // Screenshot (full page)
      const screenshotPath = path.join(siteDir, 'screenshot-full.png');
      await page.screenshot({ path: screenshotPath, fullPage: true });
      artifactPaths.push(screenshotPath);

      // HTML snapshot
      const html = await page.content();
      const htmlPath = path.join(siteDir, 'snapshot.html');
      await fs.writeFile(htmlPath, html, 'utf-8');
      artifactPaths.push(htmlPath);

      // Console messages
      const consolePath = path.join(siteDir, 'console.json');
      await fs.writeFile(consolePath, JSON.stringify(consoleMessages, null, 2), 'utf-8');
      artifactPaths.push(consolePath);

      // Network summary (simple HAR-like JSON)
      const networkPath = path.join(siteDir, 'network.json');
      await fs.writeFile(networkPath, JSON.stringify(network, null, 2), 'utf-8');
      artifactPaths.push(networkPath);

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
