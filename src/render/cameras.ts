/** Camera suite: third-person chase, helmet, handlebar, trackside, replay. */

import * as THREE from 'three';
import type { VehicleState } from '../physics/vehicle';
import { forwardOf } from '../physics/vehicle';

export type CameraMode = 'near' | 'far' | 'helmet' | 'handlebar' | 'trackside' | 'replay' | 'spectator';

const MODES: CameraMode[] = ['near', 'far', 'helmet', 'handlebar', 'trackside', 'spectator'];

export class CameraSystem {
  mode: CameraMode = 'near';
  private pos = new THREE.Vector3();
  private target = new THREE.Vector3();
  private look = new THREE.Vector3();
  private shake = 0;
  private heightFollow = 1.6;

  next(): CameraMode {
    const i = MODES.indexOf(this.mode);
    this.mode = MODES[(i + 1) % MODES.length];
    return this.mode;
  }

  update(
    cam: THREE.PerspectiveCamera,
    st: VehicleState,
    headPos: THREE.Vector3,
    dt: number,
    riderScale = 1,
  ) {
    const fwd = forwardOf(st);
    const speed = Math.hypot(st.vel.x, st.vel.z);
    const up = new THREE.Vector3(0, 1, 0);

    switch (this.mode) {
      case 'near': {
        const dist = 5.2 + speed * 0.05;
        const h = 2.1 + Math.max(0, st.vel.y * 0.12);
        const desired = new THREE.Vector3(
          st.pos.x - fwd.x * dist, st.pos.y + h, st.pos.z - fwd.z * dist,
        );
        // anticipate turns
        desired.x += st.steering * -Math.sin(st.yaw) * 2.2;
        desired.z += st.steering * -Math.cos(st.yaw) * 2.2;
        this.pos.lerp(desired, 1 - Math.exp(-4.2 * dt));
        this.target.set(st.pos.x, st.pos.y + 1.35 * riderScale, st.pos.z);
        break;
      }
      case 'far': {
        const dist = 9.5 + speed * 0.04;
        this.pos.lerp(
          new THREE.Vector3(st.pos.x - fwd.x * dist, st.pos.y + 5.2, st.pos.z - fwd.z * dist),
          1 - Math.exp(-3.5 * dt),
        );
        this.target.set(st.pos.x, st.pos.y + 1.0, st.pos.z);
        break;
      }
      case 'helmet': {
        this.pos.set(headPos.x, headPos.y + 0.05, headPos.z);
        this.target.set(headPos.x + fwd.x * 6, headPos.y + 0.1, headPos.z + fwd.z * 6);
        break;
      }
      case 'handlebar': {
        this.pos.set(
          st.pos.x - fwd.x * 0.2 + Math.cos(st.yaw) * 0.3,
          st.pos.y + 1.1 * riderScale,
          st.pos.z - fwd.z * 0.2 - Math.sin(st.yaw) * 0.3,
        );
        this.target.set(st.pos.x + fwd.x * 5, st.pos.y + 1.0, st.pos.z + fwd.z * 5);
        break;
      }
      case 'trackside': {
        // fixed trackside camera: recompute anchor periodically
        if (!this._tracksideAnchor) {
          this._tracksideAnchor = new THREE.Vector3(
            st.pos.x + fwd.x * 10, 3.2, st.pos.z + fwd.z * 10,
          );
        }
        this.pos.lerp(this._tracksideAnchor, 1 - Math.exp(-2 * dt));
        this.target.lerp(st.pos.clone().setY(st.pos.y + 1), 1 - Math.exp(-6 * dt));
        break;
      }
      case 'spectator': {
        const d = st.pos.distanceTo(this.pos);
        if (d > 60 || d < 4) {
          const az = Math.random() * Math.PI * 2;
          this.pos.set(
            st.pos.x + Math.sin(az) * 22, 8 + Math.random() * 6, st.pos.z + Math.cos(az) * 22,
          );
        }
        this.target.lerp(st.pos.clone().setY(st.pos.y + 1), 1 - Math.exp(-3 * dt));
        break;
      }
      case 'replay':
        break;
    }

    // impact shake
    this.shake = Math.max(this.shake - dt * 2.2, 0);
    if (st.lastSurface > 5) this.shake = Math.min(0.25, st.lastSurface / 40);

    this.look.copy(this.target);
    if (this.shake > 0.001) {
      const t = performance.now() * 0.06;
      this.look.x += Math.sin(t * 7) * this.shake;
      this.look.y += Math.cos(t * 9) * this.shake;
    }
    cam.position.lerp(this.pos, 1);
    cam.lookAt(this.look);
    cam.up.copy(up);
  }

  private _tracksideAnchor: THREE.Vector3 | null = null;

  reset(st: VehicleState) {
    this.pos.set(st.pos.x, st.pos.y + 2.5, st.pos.z);
    this._tracksideAnchor = null;
  }
}
