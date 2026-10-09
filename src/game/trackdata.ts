/** Track curve utilities: progress along the loop, lap logic, AI lines. */

import type { TrackData } from '../core/types';
import * as THREE from 'three';

export interface CurvePoint {
  pos: THREE.Vector3;
  s: number; // cumulative meters
}

export class TrackCurve {
  points: CurvePoint[] = [];
  totalLength = 0;
  checkpoints: number[] = []; // meters along loop

  static fromData(data: TrackData): TrackCurve {
    const c = new TrackCurve();
    const raw = data.center_line.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    raw.push(raw[0].clone());
    let acc = 0;
    for (let i = 0; i < raw.length - 1; i++) {
      c.points.push({ pos: raw[i], s: acc });
      acc += raw[i].distanceTo(raw[i + 1]);
    }
    c.points.push({ pos: raw[raw.length - 1], s: acc });
    c.totalLength = acc;
    c.checkpoints = data.checkpoints.map((s) => s * acc);
    return c;
  }

  /** Closest point on the loop; returns wrapped s in meters + curve point. */
  closest(p: THREE.Vector3): { s: number; point: CurvePoint; dist: number } {
    let bestS = 0;
    let bestPoint = this.points[0];
    let bestD = Infinity;
    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i];
      const b = this.points[i + 1];
      const ab = b.pos.clone().sub(a.pos);
      const len2 = ab.lengthSq();
      let t = len2 > 1e-9 ? p.clone().sub(a.pos).dot(ab) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const proj = a.pos.clone().addScaledVector(ab, t);
      const d = proj.distanceTo(p);
      if (d < bestD) {
        bestD = d;
        bestS = a.s + t * (b.s - a.s);
        bestPoint = { pos: proj, s: bestS };
      }
    }
    return { s: bestS, point: bestPoint, dist: bestD };
  }

  /** Point at arc-length s (meters, wrapped into [0, L)). */
  at(s: number): THREE.Vector3 {
    const len = this.totalLength;
    let ss = s % len;
    if (ss < 0) ss += len;
    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i];
      const b = this.points[i + 1];
      if (ss >= a.s && ss <= b.s + 1e-6) {
        const t = Math.min(1, (ss - a.s) / Math.max(1e-6, b.s - a.s));
        return a.pos.clone().lerp(b.pos, t);
      }
    }
    return this.points[0].pos.clone();
  }

  /** Smallest signed delta from a to b on the loop. */
  wrapDelta(a: number, b: number): number {
    const L = this.totalLength;
    const d = b - a;
    const d1 = b - a - L;
    const d2 = b - a + L;
    const abs = Math.min(Math.abs(d), Math.abs(d1), Math.abs(d2));
    if (abs === Math.abs(d)) return d;
    if (abs === Math.abs(d1)) return d1;
    return d2;
  }
}

export interface LapState {
  lap: number;           // laps completed
  s: number;             // wrapped meters
  totalS: number;        // unwrapped progress
  checkpointIdx: number;
  backward: number;      // accumulated backward meters
  wrongWayTimer: number;
  lastLapTime: number;
  bestLap: number;       // Infinity until first lap done
  lapStart: number;      // race-time when current lap started
  finished: boolean;
  finishTime: number;
}

export function createLapState(): LapState {
  return {
    lap: 0, s: 0, totalS: 0, checkpointIdx: 0, backward: 0, wrongWayTimer: 0,
    lastLapTime: 0, bestLap: Infinity, lapStart: 0, finished: false, finishTime: 0,
  };
}

/** Advance lap state given the closest wrapped s on the curve. */
export function updateLap(ls: LapState, curve: TrackCurve, s: number, now: number, totalLaps: number): void {
  if (ls.finished) return;
  const delta = curve.wrapDelta(ls.s, s);
  ls.totalS += delta;
  ls.s = s;
  const L = curve.totalLength;
  const newLap = Math.floor(ls.totalS / L);
  if (newLap > ls.lap) {
    const t = now - ls.lapStart;
    ls.lastLapTime = t;
    if (ls.lap > 0 && t < ls.bestLap) ls.bestLap = t;
    ls.lap = newLap;
    ls.lapStart = now;
  }
  // wrong-way detection: accumulate backward travel, decay when moving forward
  if (delta < 0) {
    ls.backward += -delta;
  } else {
    ls.backward = Math.max(0, ls.backward - delta * 0.8);
  }
  ls.wrongWayTimer = Math.max(0, Math.min(1, ls.backward / 2.5));
  // checkpoint index
  let idx = 0;
  for (const ck of curve.checkpoints) {
    if (ls.s >= ck) idx++;
  }
  ls.checkpointIdx = idx;
  if (ls.lap >= totalLaps && !ls.finished) {
    ls.finished = true;
    ls.finishTime = now;
  }
}

/** Racing position sort key: laps done, then s within lap. */
export function raceKey(ls: LapState): number {
  return ls.lap * 1e7 + ls.s;
}
