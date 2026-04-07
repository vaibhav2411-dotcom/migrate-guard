/**
 * SEO and metadata diffing utilities using cheerio.
 */
import * as cheerio from 'cheerio';

export interface SeoSnapshot {
  title?: string;
  description?: string;
  canonical?: string;
  openGraph: Record<string, string>;
  headings: string[];
  jsonLd: any[];
}

function normalizeText(s?: string) {
  return s ? s.trim().replace(/\s+/g, ' ') : undefined;
}

export function captureSeo(html: string): SeoSnapshot {
  const $ = cheerio.load(html);
  const title = normalizeText($('title').text() || undefined);
  const description = normalizeText($('meta[name="description"]').attr('content'));
  const canonical = normalizeText($('link[rel="canonical"]').attr('href'));
  const openGraph: Record<string, string> = {};
  $('meta[property^="og:"]').each((i, el) => {
    const prop = $(el).attr('property') || '';
    const content = $(el).attr('content') || '';
    openGraph[prop] = normalizeText(content) || '';
  });
  const headings: string[] = [];
  for (let i = 1; i <= 6; i++) {
    $("h" + i).each((_, el) => {
      headings.push(normalizeText($(el).text()) || '');
    });
  }
  const jsonLd: any[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const txt = $(el).contents().text();
    try { jsonLd.push(JSON.parse(txt)); } catch (e) { /* ignore parse errors */ }
  });
  return { title, description, canonical, openGraph, headings, jsonLd };
}

export function seoDiff(a: SeoSnapshot, b: SeoSnapshot) {
  const diffs: Record<string, any> = {};
  if (a.title !== b.title) diffs.title = { a: a.title, b: b.title };
  if (a.description !== b.description) diffs.description = { a: a.description, b: b.description };
  if (a.canonical !== b.canonical) diffs.canonical = { a: a.canonical, b: b.canonical };
  const ogKeys = new Set([...Object.keys(a.openGraph), ...Object.keys(b.openGraph)]);
  const ogDiff: Record<string, any> = {};
  ogKeys.forEach(k => { if ((a.openGraph[k] || '') !== (b.openGraph[k] || '')) ogDiff[k] = { a: a.openGraph[k], b: b.openGraph[k] }; });
  if (Object.keys(ogDiff).length) diffs.openGraph = ogDiff;
  if (a.headings.join('|') !== b.headings.join('|')) diffs.headings = { a: a.headings, b: b.headings };
  // JSON-LD deep compare by stringifying with stable keys
  const jdA = JSON.stringify(a.jsonLd || []);
  const jdB = JSON.stringify(b.jsonLd || []);
  if (jdA !== jdB) diffs.jsonLd = { a: a.jsonLd, b: b.jsonLd };
  return diffs;
}
