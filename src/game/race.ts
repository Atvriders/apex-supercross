/** Race session: riders, phases, positions, timing, holeshot, results. */

import * as THREE from 'three';
import type { RaceConfig, VehicleClass } from '../core/types';
import { Heightfield } from '../physics/heightfield';
import {
  VehicleState, createVehicleState, makeStatsParams, stepVehicle, forwardOf,
} from '../physics/vehicle';
import type { VehicleInput } from '../physics/vehicle';
import { TrackCurve, type LapState, createLapState, updateLap, raceKey } from './trackdata';
import { buildAiState, aiInput, makeLines } from './ai';
import type { AiState } from './ai';
import type { AiParams } from './ai';

export interface RiderEntry {
  index: number;
  name: string;
  number: string;
  isPlayer: boolean;
  playerSlot: number; // 0 = P1, 1 = P2 (split-screen)
  vehicleClass: VehicleClass;
  riderIndex: number;
  state: VehicleState;
  lap: LapState;
  ai: AiState | null;
  gateIndex: number;
  holeshot: boolean;
  eliminated: boolean;
  finishedOrder: number;
  raceTime: number;
}

export type RacePhase = 'grid' | 'countdown' | 'gates' | 'racing' | 'finished';

const AI_CLASS_IDS = ['mx250', 'mx250', 'mx125', 'mx450', 'mx250', 'mx125', 'mx450', 'mx500', 'mx250', 'mx450', 'mx125', 'mx85'];
const AI_RIDERS = [1, 2, 3, 0, 2, 1, 3, 2, 0, 3, 1, 2];

export class RaceSession {
  entries: RiderEntry[] = [];
  phase: RacePhase = 'grid';
  phaseTimer = 0;
  raceTimer = 0;
  laps = 4;
  curve: TrackCurve;
  gatesDropped = false;
  positions: number[] = []; // entry indices, best first
  holeshotIndex = -1;
  nextFinishSlot = 1;
  private lastCutLap = 0;
  private gridPositions: THREE.Vector3[] = [];

  constructor(
    private hf: Heightfield,
    curve: TrackCurve,
    trackData: { gates: number[][]; n_gates: number },
    private config: RaceConfig,
    private deform: (x: number, z: number, w: number) => void,
    private vehicleClasses: Record<string, VehicleClass>,
    private lines: Record<AiParams['line'], THREE.Vector3[]>,
  ) {
    this.curve = curve;
    this.laps = config.laps;
    this.gridPositions = trackData.gates.map((g) => new THREE.Vector3(g[0], g[1], g[2]));
    this.buildEntries();
  }

  private buildEntries() {
    const count = Math.min(this.config.riders, 13);
    const split = this.config.mode === 'split_screen';
    const playerClass = this.vehicleClasses[this.config.vehicle] ?? this.vehicleClasses.mx250;
    const gates = this.shuffleGates(count);
    for (let i = 0; i < count; i++) {
      const isPlayer = i === 0 || (split && i === 1);
      const cls = isPlayer
        ? playerClass
        : this.vehicleClasses[AI_CLASS_IDS[(i - 1) % AI_CLASS_IDS.length]];
      const st = createVehicleState();
      const gate = this.gridPositions[gates[i]];
      st.pos.set(gate.x, this.hf.sample(gate.x, gate.z) + 0.4, gate.z);
      // face down the start straight (find direction by sampling curve ahead)
      const c = this.curve.closest(st.pos);
      const ahead = this.curve.at(c.s + 3);
      st.yaw = Math.atan2(-(ahead.x - st.pos.x), -(ahead.z - st.pos.z));
      const entry: RiderEntry = {
        index: i,
        name: isPlayer ? (i === 0 ? 'You' : 'Player 2') : ['M. Okafor', 'R. Delgado', 'S. Tran', 'J. Callahan', 'D. Vega', 'K. Brandt', 'L. Sato', 'T. Marsh', 'P. Knox', 'A. Reyes', 'C. Wolff', 'B. Ito'][i - (split ? 2 : 1)],
        number: isPlayer ? this.config.vehicle ? '7' : '7' : String(21 + i * 3),
        isPlayer,
        playerSlot: i,
        vehicleClass: cls,
        riderIndex: isPlayer ? this.config.riderIndex : AI_RIDERS[(i - 1) % AI_RIDERS.length],
        state: st,
        lap: createLapState(),
        ai: null,
        gateIndex: gates[i],
        holeshot: false,
        eliminated: false,
        finishedOrder: 0,
        raceTime: 0,
      };
      if (!isPlayer) {
        const params: AiParams = {
          skill: 0.35 + 0.6 * Math.min(1, (this.config.difficulty + (i % 4) * 0.08)),
          aggression: 0.25 + 0.7 * Math.min(1, this.config.difficulty * (0.6 + (i % 3) * 0.2)),
          line: (['left', 'right', 'center', 'inside'] as const)[i % 4],
          mistakeRate: 0.35 - this.config.difficulty * 0.25,
          rhythmBold: 0.3 + 0.6 * ((i * 7) % 10) / 10,
        };
        entry.ai = buildAiState(params, this.lines[params.line]);
      }
      this.entries.push(entry);
    }
    // player on pole-ish position
    this.positions = this.entries.map((e) => e.index);
  }

  private shuffleGates(count: number): number[] {
    const arr = Array.from({ length: this.config.riders <= 1 ? 13 : 13 }, (_, i) => i);
    // player gets gate 6 (center-ish), others spread
    const used = new Set<number>();
    const out: number[] = [];
    out.push(6);
    used.add(6);
    let k = 1;
    while (out.length < count) {
      const g = k % 2 === 0 ? 6 + k / 2 : 6 - (k + 1) / 2;
      if (g >= 0 && g < 13 && !used.has(g)) {
        out.push(g);
        used.add(g);
      }
      k++;
    }
    return out;
  }

  get player() {
    return this.entries[0];
  }

  getParamsFor(cls: VehicleClass) {
    return makeStatsParams(cls);
  }

  step(dt: number, playerInputs: VehicleInput[]) {
    this.raceTimer += dt;
    this.phaseTimer += dt;
    if (this.phase === 'countdown') {
      if (this.phaseTimer > 3.0) {
        this.phase = 'gates';
        this.phaseTimer = 0;
        this.gatesDropped = true;
      }
      return;
    }
    if (this.phase === 'grid') {
      if (this.phaseTimer > 1.2) {
        this.phase = 'countdown';
        this.phaseTimer = 0;
      }
      return;
    }
    if (this.phase === 'gates') {
      if (this.phaseTimer > 0.6) {
        this.phase = 'racing';
        this.phaseTimer = 0;
      }
      // allow immediate launch
    }
    if (this.phase === 'finished') return;

    // update each rider
    for (const e of this.entries) {
      if (e.eliminated || e.lap.finished) continue;
      e.raceTime += dt;
      let input: VehicleInput;
      if (e.isPlayer) {
        input = playerInputs[e.playerSlot] ?? playerInputs[0] ?? createEmptyInput();
      } else {
        const nearby = this.entries
          .filter((o) => o !== e && !o.eliminated)
          .map((o) => {
            const ahead = this.isAhead(o, e);
            return {
              pos: o.state.pos,
              dist: e.state.pos.distanceTo(o.state.pos),
              ahead,
            };
          });
        input = aiInput(e.ai!, e.state.pos, e.state.vel, e.state.speed, nearby, dt);
      }
      const p = this.getParamsFor(e.vehicleClass);
      stepVehicle(this.hf, e.state, input, dt, p, this.deform);
      const c = this.curve.closest(e.state.pos);
      updateLap(e.lap, this.curve, c.s, this.raceTimer, this.laps);
      if (e.lap.finished && e.finishedOrder === 0) {
        e.finishedOrder = this.nextFinishSlot++;
      }
      // holeshot: first to first checkpoint
      if (this.holeshotIndex === -1 && e.lap.checkpointIdx >= 1) {
        this.holeshotIndex = e.index;
      }
    }

    // positions
    this.positions = this.entries
      .map((e) => e.index)
      .sort((a, b) => {
        const ea = this.entries[a];
        const eb = this.entries[b];
        const ka = ea.eliminated ? -1e18 : raceKey(ea.lap);
        const kb = eb.eliminated ? -1e18 : raceKey(eb.lap);
        if (ka !== kb) return kb - ka;
        return 0;
      });

    // elimination mode: cut the last non-player rider once per completed lap
    if (this.config.mode === 'elimination' && this.phase === 'racing') {
      const maxLap = Math.max(...this.entries.map((e) => e.lap.lap));
      if (maxLap > this.lastCutLap && maxLap < this.laps) {
        this.lastCutLap = maxLap;
        const alive = this.entries.filter((e) => !e.eliminated && !e.isPlayer);
        if (alive.length > 0) {
          const worst = alive.sort((a, b) => raceKey(a.lap) - raceKey(b.lap))[0];
          if (worst) worst.eliminated = true;
        }
      }
    }

    // race over?
    const finished = this.entries.filter((e) => e.lap.finished).length;
    if (finished >= 1 && this.entries.filter((e) => e.lap.finished || e.eliminated).length >= this.entries.length - 1) {
      this.phase = 'finished';
    }
    if (this.entries[0].lap.finished || finished >= 8) {
      this.phase = 'finished';
    }
  }

  private isAhead(a: RiderEntry, b: RiderEntry): boolean {
    const da = raceKey(a.lap);
    const db = raceKey(b.lap);
    const L = this.curve.totalLength;
    const ahead = da > db ? da - db : da + L * (a.lap.lap + 1) - db;
    return ahead < L / 2 && ahead > 0;
  }

  positionOf(index: number): number {
    return this.positions.indexOf(index) + 1;
  }

  splitGap(index: number): number {
    const p = this.positionOf(index);
    if (p <= 1) return 0;
    const ahead = this.entries[this.positions[p - 2]];
    const me = this.entries[index];
    const da = raceKey(ahead.lap);
    const dm = raceKey(me.lap);
    return Math.abs(da - dm);
  }
}

export function createEmptyInput(): VehicleInput {
  return {
    throttle: 0, brakeFront: 0, brakeRear: 0, steer: 0,
    clutch: false, leanX: 0, leanY: 0, trick: false,
    shiftUp: false, shiftDown: false, reset: false,
  };
}

export function inputFromControls(
  ax: Record<string, number>,
  bt: Record<string, boolean>,
  shiftUp = false,
  shiftDown = false,
): VehicleInput {
  return {
    throttle: ax.throttle,
    brakeFront: ax.brakeFront,
    brakeRear: ax.brakeRear,
    steer: -ax.steer, // input steer right positive -> physics left positive
    clutch: bt.clutch,
    leanX: ax.leanX,
    leanY: ax.leanY,
    trick: bt.trick,
    shiftUp,
    shiftDown,
    reset: bt.reset,
  };
}
