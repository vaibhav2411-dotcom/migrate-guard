/**
 * Simple HTML reporter - generates a single-file report with embedded assets.
 */
import fs from 'fs';
import path from 'path';

export function generateHtmlReport(outPath: string, data: any) {
  const title = `Migration Guard Report`;
  const body = `<h1>${title}</h1>
  <pre>${JSON.stringify(data, null, 2)}</pre>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>body{font-family:Arial,Helvetica,sans-serif;padding:20px}</style></head><body>${body}</body></html>`;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, 'utf8');
}
