/** Rider runtime: shared clip library + skinned rider loading with
 * two-bone IK so hands stay on grips and feet on pegs. */

import * as THREE from 'three';
import { Assets } from '../core/assets';

export interface RiderHandle {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  skeleton: THREE.Skeleton;
  bones: Map<string, THREE.Bone>;
  actions: Map<string, THREE.AnimationAction>;
  current: string | null;
}

export class ClipLibrary {
  clips = new Map<string, THREE.AnimationClip>();
  private rootName = '';
  private loaded = false;

  async load(assets: Assets) {
    if (this.loaded) return;
    const manifest = await assets.animationManifest();
    // determine the skeleton root bone name from one rider asset
    const rider0 = await assets.glb('assets/riders/rider_0.glb');
    let boneName = '';
    rider0.scene.traverse((o) => {
      if ((o as THREE.Bone).isBone && !boneName) boneName = o.name;
    });
    this.rootName = boneName;
    await Promise.all(manifest.clips.map(async (clipName) => {
      const clipGltf = await assets.glb(`assets/anim/${clipName}.glb`);
      for (const anim of clipGltf.animations) {
        const clip = anim.clone();
        for (const track of clip.tracks) {
          track.name = track.name.replace('rider_rig', this.rootName);
        }
        this.clips.set(clipName, clip);
      }
    }));
    this.loaded = true;
  }

  actionsFor(mixer: THREE.AnimationMixer): Map<string, THREE.AnimationAction> {
    const actions = new Map<string, THREE.AnimationAction>();
    for (const [name, clip] of this.clips) {
      actions.set(name, mixer.clipAction(clip));
    }
    return actions;
  }
}

function collectBones(root: THREE.Object3D, out: Map<string, THREE.Bone>) {
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) out.set(o.name, o as THREE.Bone);
  });
}

export async function loadRider(
  assets: Assets,
  index: number,
  library: ClipLibrary,
  lod = false,
): Promise<RiderHandle> {
  const gltf = await assets.glb(`assets/riders/rider_${index}${lod ? '_lod1' : ''}.glb`);
  const root = gltf.scene;
  const mixer = new THREE.AnimationMixer(root);
  let skeleton: THREE.Skeleton | null = null;
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh && !skeleton) skeleton = sm.skeleton;
  });
  if (!skeleton) throw new Error('rider has no skeleton');
  const bones = new Map<string, THREE.Bone>();
  collectBones(root, bones);
  const actions = library.actionsFor(mixer);
  return { root, mixer, skeleton, bones, actions, current: null };
}

/** Crossfade to a clip. */
export function playClip(rider: RiderHandle, name: string, fade = 0.15) {
  if (rider.current === name) return;
  const next = rider.actions.get(name);
  if (!next) return;
  const prev = rider.current ? rider.actions.get(rider.current) : null;
  if (prev) prev.fadeOut(fade);
  next.reset();
  next.fadeIn(fade);
  next.play();
  rider.current = name;
}

/** Simple analytic two-bone IK on a chain: base -> mid -> tip. */
export function ikSolve(
  baseWorld: THREE.Vector3,
  targetWorld: THREE.Vector3,
  len1: number,
  len2: number,
  bend: THREE.Vector3,
  baseBone: THREE.Bone,
  midBone: THREE.Bone,
  tipBone: THREE.Bone,
  outBase: THREE.Quaternion,
  outMid: THREE.Quaternion,
): boolean {
  const dir = targetWorld.clone().sub(baseWorld);
  const dist = dir.length();
  const maxLen = len1 + len2;
  const d = Math.min(dist, maxLen * 0.999);
  const cosA = (d * d + len1 * len1 - len2 * len2) / (2 * d * len1);
  const a = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const axis = dir.clone().normalize().cross(bend).normalize();
  if (axis.lengthSq() < 1e-6) return false;
  const q1 = new THREE.Quaternion().setFromAxisAngle(axis, a);
  const baseQ = baseBone.getWorldQuaternion(new THREE.Quaternion());
  const invBase = baseQ.clone().invert();
  const localQ1 = invBase.multiply(q1);
  outBase.copy(baseBone.quaternion.multiply(localQ1).normalize());
  baseBone.updateWorldMatrix(true, false);
  const midWorld = midBone.getWorldPosition(new THREE.Vector3());
  const tipWorld = tipBone.getWorldPosition(new THREE.Vector3());
  const dir2 = targetWorld.clone().sub(midWorld);
  const d2 = Math.max(1e-5, dir2.length());
  const cosB = (len1 * len1 + len2 * len2 - d * d) / (2 * len1 * len2);
  void cosB;
  void d2;
  const curDir = tipWorld.clone().sub(midWorld).normalize();
  const wantDir = dir2.normalize();
  const q2 = new THREE.Quaternion().setFromUnitVectors(curDir, wantDir);
  const midQ = midBone.getWorldQuaternion(new THREE.Quaternion());
  const localQ2 = midQ.clone().invert().multiply(q2);
  outMid.copy(midBone.quaternion.multiply(localQ2).normalize());
  return true;
}

/** Pin rider hands to grip positions and feet to peg positions. */
export function pinRider(
  rider: RiderHandle,
  gripL: THREE.Vector3,
  gripR: THREE.Vector3,
  pegL: THREE.Vector3,
  pegR: THREE.Vector3,
  isAtv: boolean,
) {
  const B = rider.bones;
  const get = (n: string) => B.get(n);
  const shoulderL = get('upperarm01.L');
  const forearmL = get('lowerarm01.L');
  const handL = get('wrist.L');
  const shoulderR = get('upperarm01.R');
  const forearmR = get('lowerarm01.R');
  const handR = get('wrist.R');
  const hipL = get('upperleg01.L');
  const shinL = get('lowerleg01.L');
  const footL = get('foot.L');
  const hipR = get('upperleg01.R');
  const shinR = get('lowerleg01.R');
  const footR = get('foot.R');
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const bendOutL = new THREE.Vector3(-0.6, -0.2, 0.2);
  const bendOutR = new THREE.Vector3(0.6, -0.2, 0.2);
  if (shoulderL && forearmL && handL && hipL && shinL && footL) {
    const sw = shoulderL.getWorldPosition(new THREE.Vector3());
    const hw = handL.getWorldPosition(new THREE.Vector3());
    const l1 = sw.distanceTo(forearmL.getWorldPosition(new THREE.Vector3()));
    const l2 = forearmL.getWorldPosition(new THREE.Vector3()).distanceTo(hw);
    ikSolve(sw, gripL, l1, l2, bendOutL, shoulderL, forearmL, handL, q, q2);
    const hw2 = hipL.getWorldPosition(new THREE.Vector3());
    const kw = shinL.getWorldPosition(new THREE.Vector3());
    const fw = footL.getWorldPosition(new THREE.Vector3());
    const l3 = hw2.distanceTo(kw);
    const l4 = kw.distanceTo(fw);
    const bendKnee = new THREE.Vector3(0, isAtv ? 0.1 : 0.5, 0);
    ikSolve(hw2, pegL, l3, l4, bendKnee, hipL, shinL, footL, q, q2);
  }
  if (shoulderR && forearmR && handR && hipR && shinR && footR) {
    const sw = shoulderR.getWorldPosition(new THREE.Vector3());
    const hw = handR.getWorldPosition(new THREE.Vector3());
    const l1 = sw.distanceTo(forearmR.getWorldPosition(new THREE.Vector3()));
    const l2 = forearmR.getWorldPosition(new THREE.Vector3()).distanceTo(hw);
    ikSolve(sw, gripR, l1, l2, bendOutR, shoulderR, forearmR, handR, q, q2);
    const hw2 = hipR.getWorldPosition(new THREE.Vector3());
    const kw = shinR.getWorldPosition(new THREE.Vector3());
    const fw = footR.getWorldPosition(new THREE.Vector3());
    const l3 = hw2.distanceTo(kw);
    const l4 = kw.distanceTo(fw);
    const bendKnee = new THREE.Vector3(0, isAtv ? 0.1 : 0.5, 0);
    ikSolve(hw2, pegR, l3, l4, bendKnee, hipR, shinR, footR, q, q2);
  }
  const head = B.get('head');
  if (head) {
    const wq = head.getWorldQuaternion(new THREE.Quaternion());
    const e = new THREE.Euler().setFromQuaternion(wq, 'XYZ');
    e.z *= 0.6;
    e.x *= 0.75;
    head.quaternion.setFromEuler(e);
  }
}
