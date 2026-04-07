import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import { VisualDiffService } from '../src/services/visualDiffService';
import { ViewportConfig } from '../src/services/playwrightExecutionService';

describe('VisualDiffService', () => {
  it('compares two identical images and returns no differences', async () => {
    const artifactsDir = path.join(__dirname, '..', 'data', 'artifacts', 'visual-test');
    fs.mkdirSync(artifactsDir, { recursive: true });

    // create a small red PNG
    const png = new PNG({ width: 10, height: 10 });
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const idx = (y * 10 + x) * 4;
        png.data[idx] = 255;
        png.data[idx + 1] = 0;
        png.data[idx + 2] = 0;
        png.data[idx + 3] = 255;
      }
    }

    const baselinePath = path.join(artifactsDir, 'baseline.png');
    const candidatePath = path.join(artifactsDir, 'candidate.png');
    fs.writeFileSync(baselinePath, PNG.sync.write(png));
    fs.writeFileSync(candidatePath, PNG.sync.write(png));

    const service = new VisualDiffService(0.1, 1);
    const viewport: ViewportConfig = { name: 'test', width: 10, height: 10 };

    const result = await service.compareScreenshots(baselinePath, candidatePath, '/index', viewport, 'visual-test-run');
    expect(result.pixelMetrics.differentPixels).toBe(0);
    expect(result.pixelMetrics.diffPercentage).toBe(0);
    expect(result.severity).toBe('none');
  });
});
