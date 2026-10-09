import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TrackCurve, createLapState, updateLap, raceKey } from './trackdata';

const data = {
  track_name: 't', stadium: 's', length_m: 100,
  heightfield: { nx: 2, nz: 2, x0: 0, z0: 0, dx: 1, dz: 1 },
  start_s: 0, gate_s: 0.01, n_gates: 2, gates: [],
  checkpoints: [0.25, 0.5, 0.75],
  center_line: [
    [0, 0, 0], [10, 0, 0], [10, 0, 10], [0, 0, 10], [0, 0, 0],
  ],
  ai_line_left: [], ai_line_right: [], ai_line_inside: [],
  tuff_blocks: [], markers: [], sections: {},
};

const curve = TrackCurve.fromData(data as never);

describe('TrackCurve', () => {
  it('has a 40m closed loop', () => {
    expect(curve.totalLength).toBeCloseTo(40, 5);
  });

  it('finds closest point', () => {
    const c = curve.closest(new THREE.Vector3(5, 0, -2));
    expect(c.dist).toBeCloseTo(2, 4);
    expect(c.s).toBeGreaterThan(0);
    expect(c.s).toBeLessThan(40);
  });

  it('wraps deltas across the seam', () => {
    const d = curve.wrapDelta(39, 1);
    expect(d).toBeCloseTo(2, 5);
  });

  it('samples points at arc length', () => {
    const p = curve.at(10);
    expect(p.x).toBeCloseTo(10, 4);
    const q = curve.at(0);
    expect(q.z).toBeCloseTo(0, 4);
  });
});

describe('lap logic', () => {
  it('counts laps on a loop', () => {
    const ls = createLapState();
    ls.s = 39;
    ls.totalS = 39;
    updateLap(ls, curve, 1, 0, 3);
    expect(ls.lap).toBe(1);
    expect(ls.lastLapTime).toBeGreaterThanOrEqual(0);
  });

  it('detects wrong-way travel', () => {
    const ls = createLapState();
    ls.s = 10;
    for (let i = 0; i < 60; i++) {
      updateLap(ls, curve, 10 - (i + 1) * 0.05, 0, 3);
    }
    expect(ls.backward).toBeGreaterThan(2.5);
    expect(ls.wrongWayTimer).toBeGreaterThan(0.9);
  });

  it('finishes when laps complete', () => {
    const ls = createLapState();
    ls.s = 0;
    ls.totalS = 39;
    ls.lap = 0;
    ls.lapStart = 0;
    updateLap(ls, curve, 1, 10, 1);
    expect(ls.finished).toBe(true);
  });

  it('raceKey orders by lap then progress', () => {
    const a = createLapState();
    a.lap = 2;
    a.s = 5;
    const b = createLapState();
    b.lap = 1;
    b.s = 30;
    expect(raceKey(a)).toBeGreaterThan(raceKey(b));
  });
});
