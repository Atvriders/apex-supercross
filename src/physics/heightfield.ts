/** Track heightfield: binary grid, bilinear sampling, runtime deformation. */

export class Heightfield {
  nx = 0;
  nz = 0;
  x0 = 0;
  z0 = 0;
  dx = 0;
  dz = 0;
  private base: Float32Array;
  data: Float32Array;

  constructor(buf: ArrayBuffer) {
    const header = new Float32Array(buf, 0, 6);
    this.nx = Math.round(header[0]);
    this.nz = Math.round(header[1]);
    this.x0 = header[2];
    this.z0 = header[3];
    this.dx = header[4];
    this.dz = header[5];
    this.base = new Float32Array(buf, 24);
    this.data = this.base.slice();
  }

  get baseHeights() {
    return this.base;
  }

  reset() {
    this.data.set(this.base);
  }

  private idx(i: number, j: number) {
    return j * this.nx + i;
  }

  /** Bilinear sample; returns Infinity outside the grid. */
  sample(x: number, z: number): number {
    const fx = (x - this.x0) / this.dx;
    const fz = (z - this.z0) / this.dz;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    if (i < 0 || j < 0 || i + 1 >= this.nx || j + 1 >= this.nz) return Infinity;
    const tx = fx - i;
    const tz = fz - j;
    const a = this.data[this.idx(i, j)];
    const b = this.data[this.idx(i + 1, j)];
    const c = this.data[this.idx(i, j + 1)];
    const d = this.data[this.idx(i + 1, j + 1)];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  /** Normal at (x, z) from gradient. */
  normal(x: number, z: number): [number, number, number] {
    const h = 0.5;
    const hx = this.sample(x + h, z);
    const hx2 = this.sample(x - h, z);
    const hz = this.sample(x, z + h);
    const hz2 = this.sample(x, z - h);
    const gx = (hx - hx2) / (2 * h);
    const gz = (hz - hz2) / (2 * h);
    const len = Math.hypot(gx, 1, gz);
    return [-gx / len, 1 / len, -gz / len];
  }

  /** Carve a rut: sink terrain around (x,z) by amount with falloff. */
  deform(x: number, z: number, amount: number, radius: number) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const i0 = Math.max(0, Math.floor((x - radius - this.x0) / this.dx));
    const i1 = Math.min(this.nx - 1, Math.ceil((x + radius - this.x0) / this.dx));
    const j0 = Math.max(0, Math.floor((z - radius - this.z0) / this.dz));
    const j1 = Math.min(this.nz - 1, Math.ceil((z + radius - this.z0) / this.dz));
    const r2 = radius * radius;
    const maxDepth = 0.14;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const px = this.x0 + i * this.dx;
        const pz = this.z0 + j * this.dz;
        const d2 = (px - x) * (px - x) + (pz - z) * (pz - z);
        if (d2 > r2) continue;
        const w = 1 - d2 / r2;
        // sink towards a rut floor but never below base - maxDepth
        const idx = this.idx(i, j);
        const target = Math.max(this.base[idx] - maxDepth, this.data[idx] - amount * w);
        this.data[idx] = Math.min(this.data[idx], this.data[idx] - amount * w);
        if (this.data[idx] < target) this.data[idx] = target;
      }
    }
  }
}
