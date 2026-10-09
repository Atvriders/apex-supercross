/** Vehicle runtime assembly: GLB node map, wheel spin, suspension movement,
 * plastic recoloring, rider attachment. */

import * as THREE from 'three';
import { Assets } from '../core/assets';
import type { VehicleClass } from '../core/types';
import { type RiderHandle, type ClipLibrary, loadRider, pinRider, playClip } from './riders';
import type { VehicleState } from '../physics/vehicle';

export interface VehicleHandle {
  root: THREE.Group;
  classId: string;
  spec: VehicleClass;
  wheels: THREE.Object3D[];
  frontWheel: THREE.Object3D | null;
  forkLowers: THREE.Object3D[];
  rider: RiderHandle | null;
  gripL: THREE.Vector3;
  gripR: THREE.Vector3;
  pegL: THREE.Vector3;
  pegR: THREE.Vector3;
  hip: THREE.Vector3;
  plasticMats: THREE.MeshStandardMaterial[];
}

export async function loadVehicle(
  assets: Assets,
  classId: string,
  spec: VehicleClass,
  lod = false,
): Promise<VehicleHandle> {
  const gltf = await assets.glb(`assets/vehicles/${classId}${lod ? '_lod1' : ''}.glb`);
  const root = gltf.scene;
  const wheels: THREE.Object3D[] = [];
  const forkLowers: THREE.Object3D[] = [];
  const plasticMats: THREE.MeshStandardMaterial[] = [];
  let frontWheel: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (o.name.startsWith('b_front_wheel')) frontWheel = o;
    if (o.name.startsWith('b_wheel_') || o.name.startsWith('b_front_wheel') || o.name.startsWith('b_rear_wheel')) {
      wheels.push(o);
    }
    if (o.name.startsWith('b_fork_lower')) forkLowers.push(o);
    const m = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh).material as THREE.MeshStandardMaterial : null;
    if (m && m.name && (m.name.includes('plastic') || m.name.includes('plate'))) {
      plasticMats.push(m);
    }
  });
  const gL = root.getObjectByName('b_grip_L');
  const gR = root.getObjectByName('b_grip_R');
  const hip = root.getObjectByName('b_hip');
  const gripL = gL ? gL.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(-0.35, 1.0, 0.2);
  const gripR = gR ? gR.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0.35, 1.0, 0.2);
  const hipPos = hip ? hip.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 0.95, 0);
  // pegs: bikes have b_peg_-1/1, atv b_peg_-1/1
  const pegL = root.getObjectByName('b_peg_-1');
  const pegR = root.getObjectByName('b_peg_1');
  const pegLPos = pegL ? pegL.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(-0.18, 0.55, 0);
  const pegRPos = pegR ? pegR.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0.18, 0.55, 0);
  return {
    root, classId, spec, wheels, frontWheel, forkLowers,
    rider: null, gripL, gripR, pegL: pegLPos, pegR: pegRPos, hip: hipPos, plasticMats,
  };
}

export async function attachRider(
  assets: Assets,
  v: VehicleHandle,
  riderIndex: number,
  library: ClipLibrary,
  lod = false,
) {
  v.rider = await loadRider(assets, riderIndex, library, lod);
  const r = v.rider;
  // scale rider to vehicle class
  r.root.scale.setScalar(v.spec.rider_scale);
  // attach at hip anchor
  const inv = new THREE.Matrix4();
  v.root.updateWorldMatrix(true, true);
  inv.copy(v.root.matrixWorld).invert();
  const localHip = v.hip.clone().applyMatrix4(inv);
  r.root.position.copy(localHip);
  v.root.add(r.root);
  // ground the rider later at runtime; set initial clip
  playClip(r, 'menu_idle', 0.1);
}

export function applyVehicleVisuals(v: VehicleHandle, state: VehicleState, dt: number) {
  // wheel spin + suspension
  for (const w of v.wheels) {
    w.rotation.x += (state.speed / 0.34) * dt * (v.spec.type === 'atv' ? 0.9 : 1);
  }
  // fork compression
  const comp = state.wheels.fl?.compression ?? 0;
  for (const f of v.forkLowers) {
    f.position.y -= comp * 0.5;
  }
  if (v.frontWheel) {
    v.frontWheel.position.y -= comp * 0.6;
  }
  // rider
  const r = v.rider;
  if (!r) return;
  r.mixer.update(dt);
  const isAtv = v.spec.type === 'atv';
  const gL = v.gripL.clone().applyMatrix4(v.root.matrixWorld);
  const gR = v.gripR.clone().applyMatrix4(v.root.matrixWorld);
  const pL = v.pegL.clone().applyMatrix4(v.root.matrixWorld);
  const pR = v.pegR.clone().applyMatrix4(v.root.matrixWorld);
  pinRider(r, gL, gR, pL, pR, isAtv);
}

/** Repaint plastics from user-selected colors. */
export function paintVehicle(v: VehicleHandle, primary: THREE.Color, secondary: THREE.Color) {
  for (const m of v.plasticMats) {
    if (m.color) m.color.copy(primary);
  }
  v.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const m = mesh.material as THREE.MeshStandardMaterial;
    if (m && m.name && m.name.includes('plastic2')) m.color.copy(secondary);
  });
}
