const fs = require('fs').promises;
const path = require('path');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

async function readPng(p) {
  const buf = await fs.readFile(p);
  return PNG.sync.read(buf);
}

function calcDiffPercent(img1, img2) {
  if (img1.width !== img2.width || img1.height !== img2.height) return 100;
  const { width, height } = img1;
  const diff = new PNG({ width, height });
  const count = pixelmatch(img1.data, img2.data, diff.data, width, height, { threshold: 0.1 });
  return (count / (width * height)) * 100;
}

async function analyze(dir) {
  const out = { dir, comparisons: [] };
  const files = await fs.readdir(dir);
  const pairs = [];
  // look for baseline-*.png and candidate-*.png
  const baseline = files.filter(f => f.startsWith('baseline-') && f.endsWith('.png'));
  for (const b of baseline) {
    const name = b.replace(/^baseline-/, '');
    const candName = `candidate-${name}`;
    if (files.includes(candName)) pairs.push({ baseline: path.join(dir, b), candidate: path.join(dir, candName) });
  }
  for (const p of pairs) {
    const img1 = await readPng(p.baseline);
    const img2 = await readPng(p.candidate);
    const percent = calcDiffPercent(img1, img2);
    out.comparisons.push({ baseline: p.baseline, candidate: p.candidate, diffPercent: percent });
  }
  const outPath = path.join(dir, 'analysis-summary.json');
  await fs.writeFile(outPath, JSON.stringify(out, null, 2), 'utf-8');
  console.log('Analysis written to', outPath);
}

const target = process.argv[2] || path.join(__dirname, '..', 'data', 'artifacts', 'evidence-1775599842566');
analyze(target).catch(e=>{ console.error(e); process.exit(1); });
