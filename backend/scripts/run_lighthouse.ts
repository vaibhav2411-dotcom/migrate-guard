import fs from 'fs';

async function runLighthouse(url: string) {
  try {
    const { default: lighthouse } = await import('lighthouse');
    const { launch } = await import('chrome-launcher');
    const chrome = await launch({ chromeFlags: ['--no-sandbox', '--headless=new'] });
    try {
      const opts = { port: chrome.port };
      const runnerResult = await lighthouse(url, opts);
      const lhr = runnerResult.lhr;
      const summary = {
        score: Math.round((lhr.categories.performance?.score || 0) * 100),
        lcp: lhr.audits['largest-contentful-paint']?.numericValue,
        cls: lhr.audits['cumulative-layout-shift']?.numericValue,
        tbt: lhr.audits['total-blocking-time']?.numericValue,
      };
      console.log('Lighthouse summary:', summary);
      return summary;
    } finally {
      await chrome.kill();
    }
  } catch (e) {
    console.error('Lighthouse run failed or not installed:', e?.message || e);
    return null;
  }
}

async function main() {
  const url = process.argv[2] || 'http://127.0.0.1:5173';
  const res = await runLighthouse(url);
  if (!res) process.exit(2);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(3); });
