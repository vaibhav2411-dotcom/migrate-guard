import { chromium } from 'playwright';
import path from 'path';
import { promises as fs } from 'fs';
import { DATA_DIR } from '../src/config/config';

async function run() {
  const base = process.env.AUDIT_BASE_URL || 'http://localhost:8080';
  const routes = ['/', '/projects', '/tests', '/urls', '/data', '/reports', '/runs', '/settings'];
  const viewports = [375, 768, 1280, 1920];
  const runId = `manual-e2e-${Date.now()}`;
  const artifactsDir = path.join(DATA_DIR, 'artifacts', runId);
  await fs.mkdir(artifactsDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const results: any[] = [];

  for (const route of routes) {
    const pageReport: any = { route, screenshots: [], console: [], networkFailures: [], navigations: [] };
    for (const width of viewports) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();

      page.on('console', (msg) => {
        try { pageReport.console.push({ type: msg.type(), text: msg.text(), location: msg.location() }); } catch { }
      });
      page.on('pageerror', (err) => { pageReport.console.push({ type: 'pageerror', text: String(err) }); });
      page.on('requestfailed', (req) => { pageReport.networkFailures.push({ url: req.url(), method: req.method(), failure: req.failure()?.errorText }); });

      const url = `${base.replace(/\/$/, '')}${route}`;
      const started = Date.now();
      try {
        const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        const navTiming = await page.evaluate(() => JSON.stringify(performance.getEntriesByType('navigation'))).catch(() => null);
        pageReport.navigations.push({ width, status: resp?.status() ?? null, url: page.url(), timing: navTiming ? JSON.parse(navTiming) : null });

        // screenshot
        const screenshotPath = path.join(artifactsDir, `${route === '/' ? 'index' : route.replace(/[^a-zA-Z0-9]/g,'_')}-${width}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        pageReport.screenshots.push(screenshotPath.replace(/\\/g, '/'));

        // html snapshot
        const html = await page.content();
        const htmlPath = path.join(artifactsDir, `${route === '/' ? 'index' : route.replace(/[^a-zA-Z0-9]/g,'_')}-${width}.html`);
        await fs.writeFile(htmlPath, html, 'utf-8');

      } catch (err) {
        pageReport.error = String(err);
      } finally {
        try { await page.close(); } catch {}
        try { await context.close(); } catch {}
      }
    }
    results.push(pageReport);
  }

  await browser.close();

  const outPath = path.join(artifactsDir, 'playwright-audit.json');
  await fs.writeFile(outPath, JSON.stringify({ runId, base, results }, null, 2), 'utf-8');
  console.log('Audit complete. Artifacts in:', artifactsDir);
}

run().catch((e) => { console.error(e); process.exit(1); });
