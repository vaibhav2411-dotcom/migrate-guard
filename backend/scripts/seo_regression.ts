import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

async function readCsv(file: string) {
  const txt = await fs.promises.readFile(file, 'utf8');
  const lines = txt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length <= 1) return [];
  const header = lines[0].split(',').map((c) => c.trim());
  const cols = header.length;
  const urls: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map((c) => c.trim());
    // expect format: path,prod,staging
    if (parts.length >= 2 && parts[1]) urls.push(parts[1]);
    if (parts.length >= 3 && parts[2]) urls.push(parts[2]);
  }
  return urls;
}

async function run() {
  const mapping = path.resolve(process.argv[2] || 'mappings/bbc.csv');
  if (!fs.existsSync(mapping)) {
    console.error('Mapping CSV not found at', mapping);
    process.exit(2);
  }

  const urls = await readCsv(mapping);
  const browser = await chromium.launch();
  try {
    let failures = 0;
    for (const u of urls) {
      console.log('\nChecking', u);
      const page = await browser.newPage();
      try {
        const res = await page.goto(u, { waitUntil: 'networkidle', timeout: 20000 });
        if (!res || res.status() >= 400) {
          console.error('  Navigation failed or returned', res?.status());
          failures++;
          await page.close();
          continue;
        }

        const h1 = await page.$('h1');
        if (!h1) {
          console.error('  Missing <h1> element');
          failures++;
        } else {
          const txt = (await h1.innerText()).trim();
          if (!txt) {
            console.error('  <h1> present but empty');
            failures++;
          } else {
            console.log('  <h1> OK:', txt.slice(0, 80));
          }
        }

        const hreflang = await page.$('link[rel="alternate"][hreflang]');
        if (!hreflang) {
          console.error('  Missing hreflang link[rel="alternate"][hreflang]');
          failures++;
        } else {
          const href = await hreflang.getAttribute('href');
          const hf = await hreflang.getAttribute('hreflang');
          console.log('  hreflang OK:', hf, href?.slice(0, 80));
        }
      } catch (e) {
        console.error('  Error checking page:', (e as Error).message);
        failures++;
      } finally {
        await page.close();
      }
    }

    if (failures > 0) {
      console.error('\nSEO regression checks failed for', failures, 'items');
      process.exit(2);
    }

    console.log('\nSEO regression checks passed');
    process.exit(0);
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('SEO check errored:', err);
  process.exit(3);
});
