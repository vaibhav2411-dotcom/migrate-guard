const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function run(url, runId) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
  const cdn = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.6.3/axe.min.js';
  await page.addScriptTag({ url: cdn });
  const result = await page.evaluate(async () => {
    // @ts-ignore
    return await (window).axe.run();
  });
  const outDir = runId ? path.join(__dirname, '..', 'data', 'artifacts', runId) : path.join(__dirname, '..', 'data', 'artifacts', 'axe-latest');
  try { fs.mkdirSync(outDir, { recursive: true }); } catch {}
  const outPath = path.join(outDir, 'axe.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
  console.log('Axe results written to', outPath);
  await browser.close();
  return result;
}

const url = process.argv[2] || 'http://localhost:8080';
const runId = process.argv[3];
run(url, runId).catch(e=>{ console.error('axe run failed', e); process.exit(2); });
