/** MX bike and ATV vehicle dynamics. Fixed-dt, deterministic-ish, tuned per
 * vehicle class from the stats manifest. World: XZ plane, +Y up. */

import type { VehicleClass, VehicleStats } from '../core/types';
import { Vector3 } from 'three';
import { Heightfield } from './heightfield';

export interface VehicleInput {
  throttle: number;   // 0..1
  brakeFront: number; // 0..1
  brakeRear: number;  // 0..1
  steer: number;      // -1..1 (left positive)
  clutch: boolean;
  leanX: number;      // rider lean -1..1
  leanY: number;      // rider forward/back -1..1
  trick: boolean;
  shiftUp: boolean;
  shiftDown: boolean;
  reset: boolean;
}

export interface WheelState {
  contact: boolean;
  compression: number; // meters
  springForce: number;
  slip: number;        // 0..1 longitudinal slip
  lateralSlip: number; // m/s lateral sliding
  x: number;
  y: number;
  z: number;
}

export class VehicleState {
  pos = new Vector3(0, 1, 0);
  vel = new Vector3(0, 0, 0);
  yaw = 0;      // heading (radians)
  pitch = 0;    // nose up positive
  roll = 0;     // right side down positive (bike lean)
  steering = 0; // smoothed steer input
  riderLean = 0;
  riderFwd = 0;
  speed = 0;    // forward speed m/s
  rpm = 0;
  gear = 1;
  throttle = 0;
  wheelspin = 0;
  airTime = 0;
  airborne = false;
  crashed = false;
  crashTimer = 0;
  wheelie = 0;   // pitch torque accumulation
  wheels: Record<string, WheelState> = {};
  suspensionStress = 0;
  damage = 0;
  doneWheelie = false;
  doneStoppie = false;
  lastSurface = 0;
}

const G = 9.81;

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function makeStatsParams(c: VehicleClass) {
  const s = c.stats;
  const mass = c.weight_kg;
  const power = c.power_kw * 1000;
  return {
    mass,
    power,
    topSpeed: (c.top_speed_kmh / 3.6),
    grip: 0.7 + (s.traction / 100) * 0.9,
    accelForce: power / ((c.top_speed_kmh / 3.6) * 0.28 + 1),
    brakeForce: (300 + s.braking * 12) * 9.81 * 0.35,
    steeringPower: 0.8 + (s.handling / 100) * 1.6,
    wheelbase: c.wheelbase,
    maxLean: (0.65 + (s.handling / 100) * 0.25) * (c.type === 'atv' ? 0.35 : 1),
    suspensionK: 9000 + s.suspension * 80,
    suspensionC: 600 + s.suspension * 7,
    travel: c.type === 'atv' ? (c.suspension_travel ?? 0.22) : (c.fork_travel ?? 0.3),
    wheelieTorque: power * 0.55,
    type: c.type,
  };
}

export type SimParams = ReturnType<typeof makeStatsParams>;

export function createVehicleState(): VehicleState {
  const st = new VehicleState();
  for (const k of ['fl', 'fr', 'rl', 'rr']) {
    st.wheels[k] = { contact: false, compression: 0, springForce: 0, slip: 0, lateralSlip: 0, x: 0, y: 0, z: 0 };
  }
  return st;
}

function contactZ(hf: Heightfield, x: number, z: number): number {
  const h = hf.sample(x, z);
  return Number.isFinite(h) ? h : 0.01;
}

/** Step one tick of the vehicle simulation. */
export function stepVehicle(
  hf: Heightfield,
  st: VehicleState,
  input: VehicleInput,
  dt: number,
  p: SimParams,
  deform: (x: number, z: number, w: number) => void,
): void {
  if (st.crashed) {
    st.crashTimer -= dt;
    if (st.crashTimer <= 0) {
      st.crashed = false;
      st.pos.y = contactZ(hf, st.pos.x, st.pos.z) + 1.2;
      st.vel.set(0, 0, 0);
      st.pitch = 0;
      st.roll = 0;
    } else {
      // slide to a halt
      const f = Math.exp(-2.5 * dt);
      st.vel.x *= f;
      st.vel.z *= f;
      st.vel.y -= G * dt;
      st.pos.x += st.vel.x * dt;
      st.pos.z += st.vel.z * dt;
      st.pos.y = Math.max(contactZ(hf, st.pos.x, st.pos.z) + 0.35, st.pos.y + st.vel.y * dt);
      return;
    }
  }

  st.throttle = input.throttle;

  // geometry helpers -------------------------------------------------------
  const sinY = Math.sin(st.yaw);
  const cosY = Math.cos(st.yaw);
  const fx = -sinY;   // forward
  const fz = -cosY;
  const rx = cosY;    // right
  const rz = -sinY;

  const wb = p.wheelbase;
  const half = wb / 2;
  // contact points in world
  const contacts = {
    fl: { x: st.pos.x + fx * half + rx * (p.type === 'atv' ? p.wheelbase * 0.31 : 0), z: st.pos.z + fz * half + rz * (p.type === 'atv' ? p.wheelbase * 0.31 : 0) },
    fr: { x: st.pos.x + fx * half - rx * (p.type === 'atv' ? p.wheelbase * 0.31 : 0), z: st.pos.z + fz * half - rz * (p.type === 'atv' ? p.wheelbase * 0.31 : 0) },
    rl: { x: st.pos.x - fx * half + rx * (p.type === 'atv' ? p.wheelbase * 0.32 : 0), z: st.pos.z - fz * half + rz * (p.type === 'atv' ? p.wheelbase * 0.32 : 0) },
    rr: { x: st.pos.x - fx * half - rx * (p.type === 'atv' ? p.wheelbase * 0.32 : 0), z: st.pos.z - fz * half - rz * (p.type === 'atv' ? p.wheelbase * 0.32 : 0) },
  };

  // suspension -------------------------------------------------------------
  const wheelR = p.type === 'atv' ? 0.29 : 0.34;
  const wheelKeys: ('fl' | 'fr' | 'rl' | 'rr')[] =
    p.type === 'atv' ? ['fl', 'fr', 'rl', 'rr'] : ['fl', 'rl'];
  let allAir = true;
  let totalSpring = 0;
  let frontSpring = 0;
  let rearSpring = 0;
  for (const k of wheelKeys) {
    const w = st.wheels[k];
    const c = contacts[k];
    const terrain = contactZ(hf, c.x, c.z);
    const restY = st.pos.y - wheelR; // wheel center at full extension
    // squash = how far terrain pushes the wheel up
    const squash = clamp(terrain - restY, -0.05, p.travel + 0.12);
    w.compression = Math.max(0, squash);
    const contact = squash > -0.02;
    w.contact = contact;
    if (contact) allAir = false;
    const spring = contact ? Math.max(0, squash) * p.suspensionK : 0;
    const damp = contact ? clamp(-st.vel.y, -8, 8) * p.suspensionC : 0;
    w.springForce = spring + damp;
    totalSpring += w.springForce;
    if (k.startsWith('f')) frontSpring += w.springForce;
    else rearSpring += w.springForce;
    const latVel = (st.vel.x * rx + st.vel.z * rz);
    w.lateralSlip = latVel;
  }
  st.airborne = allAir;
  if (allAir) st.airTime += dt;
  else st.airTime = 0;
  st.suspensionStress = Math.max(
    ...['fl', 'fr', 'rl', 'rr'].map((k) => st.wheels[k].compression),
  ) / p.travel;

  // longitudinal ------------------------------------------------------------
  let speedFwd = st.vel.x * fx + st.vel.z * fz;
  st.speed = speedFwd;

  // engine: rpm from speed in gear, throttle
  const gearRatios = [0, 3.4, 2.45, 1.9, 1.55, 1.3, 1.1];
  const ratio = gearRatios[st.gear] ?? 1;
  const wheelCirc = Math.PI * 2 * wheelR;
  const engineRpmFromSpeed = Math.abs(speedFwd) / wheelCirc * ratio * 60 * 2.6;
  const maxRpm = 9800;
  st.rpm = clamp(engineRpmFromSpeed, 900, maxRpm);

  let drive = 0;
  const inGear = st.gear >= 1;
  if (inGear && input.throttle > 0.02 && !input.clutch) {
    const powerBand = 1 - Math.pow(Math.abs((st.rpm - 7200) / 6000), 2);
    drive = p.accelForce * input.throttle * clamp(powerBand, 0.05, 1.1);
  }
  // traction limit
  const gripN = p.mass * G * p.grip;
  const driveMax = gripN * 1.4;
  const spin = drive > driveMax ? (drive - driveMax) / drive : 0;
  st.wheelspin = clamp(spin, 0, 1);
  const driveForce = clamp(drive, 0, driveMax) - (st.speed > 1 ? 0 : 0);
  const brakeF = (input.brakeFront * 0.7 + input.brakeRear * 0.3) * p.brakeForce * (st.speed > 0 ? 1 : 0);
  const brake = Math.min(brakeF, Math.abs(speedFwd) / dt * p.mass);
  const sign = speedFwd >= 0 ? 1 : -1;
  const drag = 0.35 * speedFwd * Math.abs(speedFwd);
  const rollRes = 0.02 * p.mass * G * (st.airborne ? 0 : 1);
  const accel = (driveForce - brake * sign - drag - rollRes) / p.mass;

  const newSpeed = speedFwd + accel * dt;
  if (st.speed > 0.5 && brake > 0 && newSpeed <= 0) st.doneStoppie = false;
  speedFwd = clamp(newSpeed, -8, p.topSpeed * 1.15);

  // gears ------------------------------------------------------------------
  if (input.shiftUp && st.gear < 6) st.gear++;
  if (input.shiftDown && st.gear > 1) st.gear--;
  if (st.rpm > 9400 && st.gear < 6) st.gear++;
  if (st.rpm < 2200 && st.gear > 1) st.gear--;

  // lateral + steering ------------------------------------------------------
  st.steering = lerp(st.steering, input.steer, 1 - Math.exp(-9 * dt));
  let yawRate = 0;
  if (!st.airborne) {
    if (p.type === 'atv') {
      // car-like steering
      const steerAngle = st.steering * (0.5 - Math.min(0.25, Math.abs(speedFwd) * 0.02));
      yawRate = (speedFwd / wb) * Math.tan(steerAngle);
      // body roll from lateral accel
      const latAcc = yawRate * speedFwd;
      const targetRoll = clamp(latAcc / G * 0.6, -0.5, 0.5);
      st.roll = lerp(st.roll, targetRoll, 1 - Math.exp(-6 * dt));
    } else {
      // bike: lean-based steering (countersteer into roll)
      const targetLean = st.steering * p.maxLean + input.leanX * 0.12;
      st.riderLean = lerp(st.riderLean, input.leanX, 1 - Math.exp(-8 * dt));
      st.roll = lerp(st.roll, targetLean, 1 - Math.exp(-7 * dt));
      const leanFactor = Math.sin(st.roll);
      yawRate = (speedFwd / wb) * leanFactor * 0.85;
      // limit yaw at low speed
      yawRate *= clamp(Math.abs(speedFwd) / 2, 0, 1);
    }
    // lateral grip
    const latVel = st.vel.x * rx + st.vel.z * rz;
    const gripK = p.grip * (1 - st.wheelspin * 0.4) * (1 - Math.abs(input.throttle) * 0.12);
    const latDamp = clamp(Math.abs(yawRate * speedFwd), 0, 30);
    const slipK = 1 - Math.exp(-(gripK * 8 + 1) * dt);
    const newLat = latVel * (1 - slipK) + (-latVel) * (gripK * 0.15 * dt);
    st.vel.x = fx * speedFwd + rx * newLat;
    st.vel.z = fz * speedFwd + rz * newLat;
  } else {
    // air control
    st.roll += input.leanX * dt * 2.2;
    st.pitch += input.leanY * dt * 1.8;
    yawRate = input.steer * dt * 0.6;
  }

  st.yaw += yawRate * dt;

  // wheelie / stoppie -------------------------------------------------------
  if (!st.airborne && p.type === 'mx') {
    const accelFor = driveForce / p.mass;
    st.wheelie = clamp(st.wheelie + (accelFor * 0.012 - brakeF / p.mass * 0.02) * dt * 60, 0, 1.6);
    if (st.wheelie > 1.0 && speedFwd > 3) {
      st.pitch = lerp(st.pitch, (st.wheelie - 1) * 0.8, 0.2);
      st.doneWheelie = st.wheelie > 1.15;
    } else {
      st.pitch = lerp(st.pitch, 0, 1 - Math.exp(-5 * dt));
    }
    if (brakeF > 0.3 * p.brakeForce && speedFwd > 8) {
      st.pitch = lerp(st.pitch, -0.35, 0.1);
      st.doneStoppie = st.pitch < -0.28;
    }
  }

  // vertical integration ----------------------------------------------------
  const gravityF = p.mass * G;
  const netY = (totalSpring - gravityF) / p.mass;
  st.vel.y += netY * dt;
  st.pos.y += st.vel.y * dt;
  // ground clamp per wheel: if any contact and pos too low, push up
  const minRestY = Math.max(0, ...(Object.values(st.wheels).map((w) => st.pos.y - wheelR - w.compression)));
  const floorY = Math.max(contactZ(hf, st.pos.x, st.pos.z), minRestY);
  if (!st.airborne && st.pos.y < floorY + 0.01) {
    st.pos.y = floorY + 0.01;
    if (st.vel.y < 0) st.vel.y = 0;
  }

  // landing event -----------------------------------------------------------
  const impact = st.vel.y;
  if (st.airTime > 0.12 && impact < -6) {
    st.suspensionStress = Math.max(st.suspensionStress, 1.3);
    deform(st.pos.x, st.pos.z, Math.min(1, Math.abs(impact) / 14));
  }
  st.lastSurface = Math.abs(impact) > 2 ? Math.abs(impact) : st.lastSurface * 0.98;

  // position integration ----------------------------------------------------
  st.pos.x += st.vel.x * dt;
  st.pos.z += st.vel.z * dt;
  st.vel.y -= G * dt * (st.airborne ? 1 : 0); // keep gravity always on
  if (!st.airborne && st.vel.y < -0.5) st.vel.y *= 0.6;

  // crash detection ---------------------------------------------------------
  if (!st.crashed && !st.airborne) {
    const latVel = st.vel.x * rx + st.vel.z * rz;
    let crash = false;
    if (Math.abs(latVel) > 9 && speedFwd > 6) crash = true;               // washout
    if (Math.abs(st.roll) > 1.25 && speedFwd > 3) crash = true;           // high-side
    if (p.type === 'atv' && Math.abs(st.roll) > 1.15) crash = true;       // rollover
    if (st.pitch > 1.15 && speedFwd < 6) crash = true;                    // loop-out
    if (st.pitch < -0.85 && speedFwd > 6) crash = true;                   // over the bars
    if (st.suspensionStress > 2.2) crash = true;                          // bottoming
    if (impact < -13 && st.airTime > 0.3) crash = true;                   // cased hard
    if (crash) {
      st.crashed = true;
      st.crashTimer = 1.6;
      st.damage = clamp(st.damage + 12, 0, 100);
    }
  }

  // wheel deformation for dirt
  for (const k of ['fl', 'fr', 'rl', 'rr'] as const) {
    const w = st.wheels[k];
    if (w.contact && Math.abs(speedFwd) > 2) {
      const c = contacts[k];
      deform(c.x, c.z, (st.wheelspin * 0.5 + 0.15) * clamp(Math.abs(speedFwd) / 20, 0, 1));
    }
  }
}

/** Smoothly steer the state's forward vector. */
export function forwardOf(st: VehicleState) {
  const sinY = Math.sin(st.yaw);
  const cosY = Math.cos(st.yaw);
  return { x: -sinY, z: -cosY };
}

export function speedOf(st: VehicleState) {
  return Math.hypot(st.vel.x, st.vel.z);
}
