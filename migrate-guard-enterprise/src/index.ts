/**
 * CLI entrypoint for migrate-guard-enterprise.
 * Minimal orchestrator that runs visual + seo captures for mapped URL pairs.
 */
import { Command } from 'commander';
import pLimit from 'p-limit';
import path from 'path';
import fs from 'fs';
import { parseMappingFile, resolveConfigOverrides, ensureDataDir } from './config';
import { BrowserRunner } from './scanner/browser';
import { captureSeo, seoDiff } from './modules/seoDiff';
import { diffBuffers } from './modules/visualDiff';
import { runLighthouse } from './modules/performance';
import { generateHtmlReport } from './reporter/html';

const program = new Command();
program.option('-m, --mapping <path>', 'CSV mapping file (path,prod,staging)')
  .option('-o, --out <dir>', 'output dir', 'migrate-report')
  .option('-c, --concurrency <n>', 'concurrency', '3');

program.parse(process.argv);
const opts = program.opts();
if (!opts.mapping) { console.error('mapping required'); process.exit(2); }

const mappings = parseMappingFile(opts.mapping);
const cfg = resolveConfigOverrides({ concurrency: Number(opts.concurrency) });
const outRoot = ensureDataDir(process.cwd());

async function run() {
  const runner = new BrowserRunner(cfg);
  await runner.start();
  const limit = pLimit(cfg.concurrency);
  const results: any[] = [];
  await Promise.all(mappings.map(m => limit(async () => {
    const id = m.path.replace(/[^a-z0-9]/gi, '_');
    try {
      // adaptive attempts: start with configured masks, then apply heuristic masks if visual diff too large
      let attempt = 0;
      const maxAttempts = 3;
      let lastVdiff: any = null;
      let finalEntry: any = null;
      let maskSelectors = cfg.ignoredSelectors.slice();
      let lastPerfA: any = null;
      let lastPerfB: any = null;
      while (attempt < maxAttempts) {
        const a = await runner.capture(m.prod, { maskSelectors });
        const b = await runner.capture(m.staging, { maskSelectors });
        const seoA = captureSeo(a.html);
        const seoB = captureSeo(b.html);
        const seoDiffRes = seoDiff(seoA, seoB);
        const vdiff = await diffBuffers(a.screenshot, b.screenshot, cfg.visualTolerance);
        // run Lighthouse perf audits (best-effort)
        const perfA = await runLighthouse(m.prod, cfg);
        const perfB = await runLighthouse(m.staging, cfg);
        lastPerfA = perfA;
        lastPerfB = perfB;
        lastVdiff = vdiff;
        finalEntry = { mapping: m, seoDiff: seoDiffRes, visual: { mismatches: vdiff.mismatchedPixels, ratio: vdiff.mismatchRatio }, perf: { prod: perfA, staging: perfB }, attempt };

        // if within tolerance, break
        if (vdiff.mismatchRatio <= cfg.visualTolerance) break;

        // otherwise compute heuristic masks and retry
        const heuristics = [ 'iframe', '[class*=carousel]', '[class*=promo]', '[class*=ad]', '[id*=ad]', '.cookie-banner', '.banner', '[data-creative]', '[data-analytics]' ];
        // merge heuristics with any existing masks
        maskSelectors = Array.from(new Set([...maskSelectors, ...heuristics]));
        attempt++;
      }

      // persist artifacts for the final attempt
      const outDir = path.join(outRoot, 'reports', id);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'seoA.json'), JSON.stringify(captureSeo((await runner.capture(m.prod, { maskSelectors })).html), null, 2));
      fs.writeFileSync(path.join(outDir, 'seoB.json'), JSON.stringify(captureSeo((await runner.capture(m.staging, { maskSelectors })).html), null, 2));
      fs.writeFileSync(path.join(outDir, 'perfA.json'), JSON.stringify(lastPerfA || {}, null, 2));
      fs.writeFileSync(path.join(outDir, 'perfB.json'), JSON.stringify(lastPerfB || {}, null, 2));
      fs.writeFileSync(path.join(outDir, 'diff.png'), lastVdiff.diffBuffer);
      results.push(finalEntry);
    } catch (e) {
      results.push({ mapping: m, error: String(e) });
    }
  })));
  await runner.stop();
  const reportPath = path.join(outRoot, opts.out + '.html');
  generateHtmlReport(reportPath, results);
  console.log('report generated:', reportPath);
}

run().catch(e => { console.error(e); process.exit(1); });
