import { describe, it, expect } from 'vitest';
import { DataIntegrityAgent } from '../src/services/dataIntegrityAgent';

describe('DataIntegrityAgent comparisons', () => {
  it('calculates text similarity between baseline and candidate', () => {
    const agent = new DataIntegrityAgent();

    const baseline = {
      url: 'https://a',
      normalizedPath: '/p',
      visibleText: 'The quick brown fox jumps over the lazy dog',
      headings: [],
      paragraphs: [],
      links: [],
      metadata: {},
    };

    const candidate = {
      url: 'https://b',
      normalizedPath: '/p',
      visibleText: 'The quick brown fox jumps over the very lazy dog',
      headings: [],
      paragraphs: [],
      links: [],
      metadata: {},
    };

    const diff = agent.compareTextContent(baseline as any, candidate as any);
    expect(diff.similarity).toBeGreaterThan(0.7);
    expect(diff.addedText.length).toBeGreaterThanOrEqual(0);
  });

  it('detects table diffs', () => {
    const agent = new DataIntegrityAgent();

    const baselineTables = [
      { selector: 'table:nth-of-type(1)', headers: ['A', 'B'], rows: [['1','2'], ['3','4']], rowCount: 2, columnCount: 2 }
    ];

    const candidateTables = [
      { selector: 'table:nth-of-type(1)', headers: ['A', 'B'], rows: [['1','2'], ['3','X']], rowCount: 2, columnCount: 2 }
    ];

    const diffs = agent.compareTables(baselineTables as any, candidateTables as any);
    expect(diffs.length).toBeGreaterThanOrEqual(1);
    expect(diffs[0].fieldDiffs.some((f) => f.status === 'changed' || f.status === 'missing_candidate')).toBe(true);
  });
});
