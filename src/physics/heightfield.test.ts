import { describe, it, expect } from 'vitest';
import { Heightfield } from './heightfield';

function makeHf(): Heightfield {
  // 10x10 grid over [0,9]^2, gentle slope
  const nx = 10;
  const nz = 10;
  const buf = new ArrayBuffer(24 + nx * nz * 4);
  const header = new Float32Array(buf, 0, 6);
  header[0] = nx;
  header[1] = nz;
  header[2] = 0;
  header[3] = 0;
  header[4] = 1;
  header[5] = 1;
  const data = new Float32Array(buf, 24);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      data[j * nx + i] = (i + j) * 0.1;
    }
  }
  return new Heightfield(buf);
}

describe('Heightfield', () => {
  it('samples bilinearly', () => {
    const hf = makeHf();
    expect(hf.sample(0, 0)).toBeCloseTo(0, 5);
    expect(hf.sample(4, 4)).toBeCloseTo(0.8, 5);
    expect(hf.sample(4.5, 4.5)).toBeCloseTo(0.9, 5);
  });

  it('returns Infinity outside the grid', () => {
    const hf = makeHf();
    expect(hf.sample(-1, 0)).toBe(Infinity);
    expect(hf.sample(0, 10)).toBe(Infinity);
  });

  it('deforms terrain downward with a floor limit', () => {
    const hf = makeHf();
    const before = hf.sample(4, 4);
    hf.deform(4, 4, 0.1, 2);
    const after = hf.sample(4, 4);
    expect(after).toBeLessThan(before);
    // never below base - 0.14
    expect(after).toBeGreaterThanOrEqual(hf.baseHeights[44] - 0.15);
  });

  it('reset restores original heights', () => {
    const hf = makeHf();
    hf.deform(4, 4, 0.1, 2);
    hf.reset();
    expect(hf.sample(4, 4)).toBeCloseTo(0.8, 5);
  });

  it('computes upward normals', () => {
    const hf = makeHf();
    const n = hf.normal(4, 4);
    expect(n[1]).toBeGreaterThan(0.9);
  });
});
