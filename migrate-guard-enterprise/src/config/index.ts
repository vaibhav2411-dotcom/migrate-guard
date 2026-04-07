/**
 * Configuration module for migrate-guard-enterprise.
 * Supports runtime flags and simple mapping file parsing.
 */
import fs from 'fs';
import path from 'path';

export interface UrlMapping {
  path: string;
  prod: string;
  staging: string;
}

export interface GuardConfig {
  visualTolerance: number; // fraction, e.g. 0.01
  performanceDeltaPct: number; // percent
  concurrency: number;
  ignoredSelectors: string[];
  analyticsDomains: string[];
}

export const defaultConfig: GuardConfig = {
  visualTolerance: 0.01,
  performanceDeltaPct: 10,
  concurrency: 3,
  ignoredSelectors: [".ads", "[data-volatile]"],
  analyticsDomains: ["google-analytics.com", "www.google-analytics.com", "analytics.google.com", "gtm.js"]
};

/**
 * Parse a simple CSV mapping file with headers: path,prod,staging
 */
export function parseMappingFile(filePath: string): UrlMapping[] {
  const txt = fs.readFileSync(filePath, 'utf8');
  const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const out: UrlMapping[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 3) continue;
    out.push({ path: parts[0].trim(), prod: parts[1].trim(), staging: parts[2].trim() });
  }
  return out;
}

export function resolveConfigOverrides(overrides: Partial<GuardConfig>): GuardConfig {
  return { ...defaultConfig, ...overrides };
}

export function ensureDataDir(root: string) {
  const d = path.join(root, 'data');
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}
