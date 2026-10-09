/** Dust / mud particle system with object pooling. */

import * as THREE from 'three';

export class DustSystem {
  private points: THREE.Points;
  private positions: Float32Array;
  private life: Float32Array;
  private vel: Float32Array;
  private cursor = 0;
  private max = 900;

  constructor(scene: THREE.Scene, private enabled: boolean) {
    this.positions = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.vel = new Float32Array(this.max * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.7,
      color: 0xb09a76,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.NormalBlending,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(x: number, y: number, z: number, strength: number, spread = 0.5) {
    if (!this.enabled) return;
    const n = Math.min(6, Math.ceil(strength * 6));
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      this.positions[i * 3] = x + (Math.random() - 0.5) * spread;
      this.positions[i * 3 + 1] = y + 0.1;
      this.positions[i * 3 + 2] = z + (Math.random() - 0.5) * spread;
      this.vel[i * 3] = (Math.random() - 0.5) * 1.6;
      this.vel[i * 3 + 1] = 0.8 + Math.random() * 1.8 * strength;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * 1.6;
      this.life[i] = 0.9 + Math.random() * 1.2;
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.positions[i * 3 + 1] = -999;
        continue;
      }
      this.life[i] -= dt;
      this.positions[i * 3] += this.vel[i * 3] * dt;
      this.positions[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3 + 1] -= dt * 0.4;
      if (this.life[i] <= 0) this.positions[i * 3 + 1] = -999;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
  }
}
