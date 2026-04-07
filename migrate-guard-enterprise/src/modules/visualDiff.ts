/**
 * Visual diffing module using pngjs + pixelmatch.
 */
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export interface VisualDiffResult {
  mismatchedPixels: number;
  totalPixels: number;
  mismatchRatio: number; // 0..1
  diffBuffer: Buffer;
}

export async function diffBuffers(aBuf: Buffer, bBuf: Buffer, threshold = 0.1): Promise<VisualDiffResult> {
  const a = PNG.sync.read(aBuf);
  const b = PNG.sync.read(bBuf);

  // normalize dimensions by expanding smaller to larger with transparent padding
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);

  const aImg = new PNG({ width, height });
  const bImg = new PNG({ width, height });
  PNG.bitblt(a, aImg, 0, 0, a.width, a.height, 0, 0);
  PNG.bitblt(b, bImg, 0, 0, b.width, b.height, 0, 0);

  const diff = new PNG({ width, height });
  const mismatched = pixelmatch(aImg.data, bImg.data, diff.data, width, height, { threshold });
  const total = width * height;
  const ratio = mismatched / total;
  const diffBuffer = PNG.sync.write(diff);
  return { mismatchedPixels: mismatched, totalPixels: total, mismatchRatio: ratio, diffBuffer };
}
