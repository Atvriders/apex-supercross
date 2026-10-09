/** AI riders: line following with skill/aggression/mistakes/avoidance. */

import * as THREE from 'three';
import type { VehicleInput } from '../physics/vehicle';

export interface AiParams {
  skill: number;      // 0..1
  aggression: number; // 0..1
  line: 'left' | 'right' | 'center' | 'inside';
  mistakeRate: number;
  rhythmBold: number; // preference for big rhythm combos
}

export interface AiState {
  params: AiParams;
  line: THREE.Vector3[];
  curvature: number[];
  bobbleTimer: number;
  wideTimer: number;
  pressure: number;
  lastThrottle: number;
  seed: number;
}

export function makeLines(
  center: number[][],
  left: number[][],
  right: number[][],
  inside: number[][],
): Record<AiParams['line'], THREE.Vector3[]> {
  const toV = (arr: number[][]) => arr.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  return {
    left: toV(left),
    right: toV(right),
    center: toV(center),
    inside: toV(inside),
  };
}

export function buildAiState(p: AiParams, line: THREE.Vector3[]): AiState {
  const curvature: number[] = [];
  const n = line.length;
  for (let i = 0; i < n; i++) {
    const a = line[(i - 2 + n) % n];
    const b = line[(i + 2) % n];
    const d1 = line[(i - 1 + n) % n].clone().sub(a);
    const d2 = b.clone().sub(line[(i + 1) % n]);
    const angle = d1.angleTo(d2);
    curvature.push(angle);
  }
  return {
    params: p, line, curvature,
    bobbleTimer: 0, wideTimer: 0, pressure: 0,
    lastThrottle: 0, seed: Math.random() * 1000,
  };
}

function rng(st: AiState) {
  st.seed = (st.seed * 16807) % 2147483647;
  return st.seed / 2147483647;
}

/** Compute AI input for this tick. */
export function aiInput(
  st: AiState,
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  speed: number,
  nearby: { pos: THREE.Vector3; dist: number; ahead: boolean }[],
  dt: number,
): VehicleInput {
  const out: VehicleInput = {
    throttle: 0, brakeFront: 0, brakeRear: 0, steer: 0,
    clutch: false, leanX: 0, leanY: 0, trick: false,
    shiftUp: false, shiftDown: false, reset: false,
  };
  // nearest line point
  let bestI = 0;
  let bestD = Infinity;
  const n = st.line.length;
  for (let i = 0; i < n; i += 2) {
    const d = pos.distanceToSquared(st.line[i]);
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  // lookahead distance grows with speed
  const look = Math.max(4, speed * 1.6);
  let i = bestI;
  let acc = 0;
  while (acc < look && i < n) {
    const j = (i + 1) % n;
    acc += st.line[i].distanceTo(st.line[j]);
    i = j;
  }
  const target = st.line[i % n];
  const toTarget = target.clone().sub(pos).setY(0);
  const heading = vel.clone().setY(0).normalize();
  const desired = toTarget.normalize();
  let steer = Math.atan2(
    heading.x * desired.z - heading.z * desired.x,
    heading.x * desired.x + heading.z * desired.z,
  );
  steer = Math.max(-1, Math.min(1, steer * 2.2));

  // curvature-based target speed
  const curve = st.curvature[i % n];
  const maxCorner = 18 / Math.max(0.25, curve * 2.4);
  const targetSpeed = Math.max(maxCorner, 8 + st.params.skill * 16);
  const skillNoise = 0.85 + st.params.skill * 0.3;

  // mistakes
  if (st.bobbleTimer > 0) {
    st.bobbleTimer -= dt;
    steer *= 0.4;
    out.brakeFront = 0.5;
  } else if (st.wideTimer > 0) {
    st.wideTimer -= dt;
    steer *= 0.5 + st.params.skill * 0.5;
  } else if (rng(st) < st.params.mistakeRate * st.pressure * dt * 2) {
    st.bobbleTimer = 0.25 + rng(st) * 0.5;
  } else if (rng(st) < 0.04 * (1 - st.params.skill) * dt) {
    st.wideTimer = 0.4;
  }

  // pressure from nearby riders
  st.pressure = Math.max(0, ...nearby.filter((r) => r.ahead).map((r) => 1 - r.dist / 12));

  // throttle/brake
  const speedErr = targetSpeed * skillNoise - speed;
  if (speedErr > 0.5) {
    out.throttle = Math.min(1, speedErr / targetSpeed * 2.4);
    out.brakeFront = 0;
  } else if (speedErr < -2) {
    out.throttle = 0;
    out.brakeFront = Math.min(1, -speedErr / targetSpeed * 1.4);
  } else {
    out.throttle = 0.35 + st.params.aggression * 0.4;
  }

  // avoidance: nearest rider straight ahead
  const ahead = nearby.find((r) => r.ahead && r.dist < 6);
  if (ahead) {
    const dir = ahead.pos.clone().sub(pos).normalize();
    const side = Math.sign(heading.x * dir.z - heading.z * dir.x) || 1;
    steer += side * 0.5 * st.params.aggression;
  }

  // jumping: preload + scrub for bold riders
  if (st.params.rhythmBold > 0.6 && speed > 12 && curve < 0.2 && rng(st) < 0.3) {
    out.leanY = 0.3;
  }

  out.steer = Math.max(-1, Math.min(1, steer));
  out.leanX = Math.max(-1, Math.min(1, steer * 0.8));
  st.lastThrottle = out.throttle;
  return out;
}
