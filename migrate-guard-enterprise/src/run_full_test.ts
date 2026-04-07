import path from 'path';
import fs from 'fs';
import { parseMappingFile, resolveConfigOverrides, ensureDataDir } from './config';
import { BrowserRunner } from './scanner/browser';
import { captureSeo } from './modules/seoDiff';
import { diffBuffers } from './modules/visualDiff';

const args = process.argv.slice(2);
const mapping = args[0] || 'mappings/bbc.csv';
const outRoot = ensureDataDir(process.cwd());
const cfg = resolveConfigOverrides({ concurrency: 1 });

const viewports = [
  { name: 'mobile-portrait', width: 375, height: 812 },
  { name: 'mobile-landscape', width: 812, height: 375 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'desktop', width: 1920, height: 1080 }
];

async function run() {
  const mappings = parseMappingFile(mapping);
  const runner = new BrowserRunner(cfg);
  await runner.start();
  for (const m of mappings) {
    const id = m.path.replace(/[^a-z0-9]/gi, '_') || 'root';
    const reportDir = path.join(outRoot, 'reports', id);
    fs.mkdirSync(reportDir, { recursive: true });
    const meta: any = { mapping: m, captures: [] };
    for (const vp of viewports) {
      try {
        let attempt = 0;
        const maxAttempts = 3;
        let lastDiff: any = null;
        let masks = cfg.ignoredSelectors.slice();
        const attemptsMeta: any[] = [];
        while (attempt < maxAttempts) {
          const a = await runner.capture(m.prod, { maskSelectors: masks });
          const b = await runner.capture(m.staging, { maskSelectors: masks });
          const seoA = captureSeo(a.html);
          const seoB = captureSeo(b.html);
          const diff = await diffBuffers(a.screenshot, b.screenshot, cfg.visualTolerance);
          attemptsMeta.push({ attempt, masks: masks.slice(), diff: { mismatches: diff.mismatchedPixels, ratio: diff.mismatchRatio } });
          lastDiff = diff;
          // persist attempt artifacts with index
          const prefix = `${vp.name}--attempt${attempt}`;
          fs.writeFileSync(path.join(reportDir, `${prefix}--prod.html`), a.html);
          fs.writeFileSync(path.join(reportDir, `${prefix}--staging.html`), b.html);
          fs.writeFileSync(path.join(reportDir, `${prefix}--prod-console.json`), JSON.stringify(a.consoleMessages, null, 2));
          fs.writeFileSync(path.join(reportDir, `${prefix}--staging-console.json`), JSON.stringify(b.consoleMessages, null, 2));
          fs.writeFileSync(path.join(reportDir, `${prefix}--prod-network.json`), JSON.stringify(a.networkRequests, null, 2));
          fs.writeFileSync(path.join(reportDir, `${prefix}--staging-network.json`), JSON.stringify(b.networkRequests, null, 2));
          fs.writeFileSync(path.join(reportDir, `${prefix}--seo-prod.json`), JSON.stringify(seoA, null, 2));
          fs.writeFileSync(path.join(reportDir, `${prefix}--seo-staging.json`), JSON.stringify(seoB, null, 2));
          fs.writeFileSync(path.join(reportDir, `${prefix}--diff.png`), diff.diffBuffer);

          if (diff.mismatchRatio <= cfg.visualTolerance) break;

          // expand masks heuristically
          const heuristics = [ 'iframe', '[class*=carousel]', '[class*=promo]', '[class*=ad]', '[id*=ad]', '.cookie-banner', '.banner', '[data-creative]', '[data-analytics]' ];
          masks = Array.from(new Set([...masks, ...heuristics]));
          attempt++;
        }
        meta.captures.push({ viewport: vp.name, attempts: attemptsMeta, final: { mismatches: lastDiff.mismatchedPixels, ratio: lastDiff.mismatchRatio } });
      } catch (e) {
        meta.captures.push({ viewport: vp.name, error: String(e) });
      }
    }
    fs.writeFileSync(path.join(reportDir, `meta.json`), JSON.stringify(meta, null, 2));
  }
  await runner.stop();
  console.log('Full test complete. Reports in', path.join(outRoot, 'reports'));
}

run().catch(e => { console.error(e); process.exit(1); });
