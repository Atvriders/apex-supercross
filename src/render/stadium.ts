/** Stadium scene assembly: arena GLB, lights, video boards, instanced
 * spectators, tuff blocks, markers, track mesh with live deformation. */

import * as THREE from 'three';
import type { StadiumData, TrackData, GameSettings } from '../core/types';
import { Assets } from '../core/assets';
import { Heightfield } from '../physics/heightfield';
import { TrackCurve } from '../game/trackdata';

export class StadiumScene {
  root = new THREE.Group();
  trackMesh: THREE.Mesh | null = null;
  trackPositions: Float32Array | null = null;
  boardTargets: Record<string, THREE.Mesh> = {};
  crowd: THREE.Mesh | null = null;
  crowdMatrices: THREE.Matrix4[] = [];
  crowdVisible = 0;
  private spectatorsMax = 0;
  private videoCanvas = document.createElement('canvas');
  private videoCtx = this.videoCanvas.getContext('2d')!;
  private videoTextures: Record<string, THREE.CanvasTexture> = {};

  constructor(
    private assets: Assets,
    private settings: GameSettings,
  ) {}

  /** stadium_data.json is authored in Blender Z-up coords (x, y, z); the GLB
   * exporter converts to game coords (x, z, -y). Apply the same mapping. */
  private gp(p: number[]): readonly [number, number, number] {
    return [p[0], p[2], -p[1]];
  }

  async load(hf: Heightfield, trackData: TrackData, stadiumData: StadiumData) {
    const gp = (p: number[]) => this.gp(p);
    const gltf = await this.assets.glb('assets/stadium/stadium.glb');
    this.root.add(gltf.scene);
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    const trackGltf = await this.assets.glb('assets/stadium/track.glb');
    const trackScene = trackGltf.scene;
    this.trackMesh = trackScene.getObjectByName('track') as THREE.Mesh;
    this.root.add(trackScene);
    if (this.trackMesh) {
      this.trackMesh.castShadow = false;
      this.trackMesh.receiveShadow = true;
      const geo = this.trackMesh.geometry as THREE.BufferGeometry;
      this.trackPositions = geo.getAttribute('position').array as Float32Array;
      // dirt material with procedural canvas texture
      const tex = this.makeDirtTexture();
      const mat = this.trackMesh.material as THREE.MeshStandardMaterial;
      mat.map = tex;
      mat.roughness = 0.95;
      mat.metalness = 0;
      mat.color.set(0xb78a5a);
      mat.needsUpdate = true;
    }

    // stadium lights
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xfff2dd,
      emissive: 0xfff0d8,
      emissiveIntensity: 1.4,
    });
    const lampGeo = new THREE.BoxGeometry(1.6, 0.5, 0.3);
    const lampCount = Math.min(40, stadiumData.lamp_positions.length);
    for (let i = 0; i < lampCount; i++) {
      const p = gp(stadiumData.lamp_positions[i]);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(p[0], p[1], p[2]);
      this.root.add(lamp);
    }
    // lights with shadow casting limited for perf
    const nLights = this.settings.quality === 'low' ? 4 : this.settings.quality === 'medium' ? 8 : 14;
    for (let i = 0; i < nLights && i < stadiumData.lamp_positions.length; i++) {
      const p = gp(stadiumData.lamp_positions[i]);
      const l = new THREE.SpotLight(0xfff1dd, 340, 95, 0.6, 0.45, 1.25);
      l.position.set(p[0], p[1], p[2]);
      l.target.position.set(p[0], 0, p[2]);
      if (this.settings.shadows && i < 6) {
        l.castShadow = true;
        l.shadow.mapSize.set(1024, 1024);
        l.shadow.camera.near = 1;
        l.shadow.camera.far = 80;
      }
      this.root.add(l, l.target);
    }

    // video boards -> animated canvas textures
    for (const key of Object.keys(stadiumData.boards)) {
      this.makeBoardTexture(key);
      const mesh = this.root.getObjectByName(key) as THREE.Mesh;
      if (mesh) {
        this.boardTargets[key] = mesh;
        const mat = (mesh.material as THREE.MeshBasicMaterial).clone();
        mat.map = this.videoTextures[key];
        mesh.material = mat;
      }
    }

    // spectators
    await this.buildCrowd(stadiumData.seat_slots);

    // tuff blocks + markers (instanced)
    await this.buildTrackside(trackData);

    return this.root;
  }

  private makeDirtTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const g = c.getContext('2d')!;
    g.fillStyle = '#8a6842';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const v = Math.random();
      g.fillStyle = v < 0.33 ? '#7a5a36' : v < 0.66 ? '#94744d' : '#a9885c';
      g.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    // subtle grooves
    g.strokeStyle = 'rgba(60,40,20,0.25)';
    for (let i = 0; i < 40; i++) {
      g.beginPath();
      g.moveTo(Math.random() * 512, Math.random() * 512);
      g.lineTo(Math.random() * 512, Math.random() * 512);
      g.lineWidth = 1 + Math.random() * 2;
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(14, 4);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private makeBoardTexture(key: string) {
    const c = this.videoCanvas;
    c.width = 512;
    c.height = 128;
    const g = this.videoCtx;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.videoTextures[key] = tex;
    // initial content
    this.drawBoard(g, 0);
  }

  private drawBoard(g: CanvasRenderingContext2D, t: number) {
    g.fillStyle = '#081a33';
    g.fillRect(0, 0, 512, 128);
    const hue = (t * 40) % 360;
    g.fillStyle = `hsl(${hue}, 80%, 55%)`;
    g.fillRect(40, 30, 120, 68);
    g.fillStyle = '#ffffff';
    g.font = 'bold 44px sans-serif';
    g.fillText('APEX SUPERCROSS', 190, 60);
    g.font = '28px sans-serif';
    g.fillText('THE ANVIL  -  MAIN EVENT', 190, 102);
  }

  updateBoards(t: number, dt: number) {
    for (const key of Object.keys(this.videoTextures)) {
      const tex = this.videoTextures[key];
      const g = this.videoCtx;
      const tt = Math.floor(t * 1.2);
      if ((tt % 8 === 0 && tt > 0) || dt > 0) this.drawBoard(g, tt);
      if (tt % 8 === 0) tex.needsUpdate = true;
    }
  }

  private async buildCrowd(seatSlots: number[][]) {
    const maxCrowd = seatSlots.length;
    this.spectatorsMax = Math.floor(maxCrowd * this.settings.spectators);
    const variants: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    for (let v = 0; v < 4; v++) {
      const gltf = await this.assets.glb(`assets/props/spectator_${v}.glb`);
      let geo: THREE.BufferGeometry | null = null;
      gltf.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && !geo) {
          geo = ((o as THREE.Mesh).geometry as THREE.BufferGeometry).clone();
          materials.push((o as THREE.Mesh).material as THREE.Material);
        }
      });
      if (geo) variants.push(geo);
    }
    if (!variants.length) return;
    // merge geometry of first variant (crowd silhouettes are cheap)
    const base = variants[0];
    const merged = new THREE.BufferGeometry();
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const srcPos = base.getAttribute('position').array as Float32Array;
    const srcNor = base.getAttribute('normal')?.array as Float32Array;
    const vCount = base.getAttribute('position').count;
    const stride = 7;
    const maxInst = Math.min(this.spectatorsMax, 2400);
    const m = new THREE.Matrix4();
    const colorChoices = [0xc63a2e, 0x2e5bc6, 0xe8b23a, 0x2e9e4e, 0xd8d8d8];
    for (let i = 0; i < maxInst; i++) {
      const slot = seatSlots[i % seatSlots.length];
      const sp = this.gp(slot);
      const variantIdx = i % variants.length;
      const vgeo = variants[variantIdx];
      const vpos = vgeo.getAttribute('position').array as Float32Array;
      const vnor = vgeo.getAttribute('normal')?.array as Float32Array;
      const vc = vgeo.getAttribute('position').count;
      m.identity();
      m.makeRotationY(((i * 7) % 12) * 0.45);
      m.setPosition(sp[0], sp[1], sp[2]);
      const col = new THREE.Color(colorChoices[i % colorChoices.length]);
      for (let j = 0; j < vc; j++) {
        const p = new THREE.Vector3(vpos[j * 3], vpos[j * 3 + 1], vpos[j * 3 + 2]).applyMatrix4(m);
        positions.push(p.x, p.y, p.z);
        if (vnor) {
          const n = new THREE.Vector3(vnor[j * 3], vnor[j * 3 + 1], vnor[j * 3 + 2]).applyMatrix4(m);
          normals.push(n.x, n.y, n.z);
        } else {
          normals.push(0, 1, 0);
        }
        colors.push(col.r, col.g, col.b);
      }
      void srcPos; void srcNor; void vCount; void stride;
    }
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.frustumCulled = false;
    this.crowd = mesh;
    this.crowdVisible = maxInst;
    this.root.add(mesh);
  }

  private async buildTrackside(trackData: TrackData) {
    const tuff = await this.assets.glb('assets/props/tuff_block.glb');
    let tuffGeo: THREE.BufferGeometry | null = null;
    let tuffMat: THREE.Material | null = null;
    tuff.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !tuffGeo) {
        tuffGeo = ((o as THREE.Mesh).geometry as THREE.BufferGeometry).clone();
        tuffMat = ((o as THREE.Mesh).material as THREE.Material).clone();
      }
    });
    if (tuffGeo && tuffMat) {
      const inst = new THREE.InstancedMesh(tuffGeo, tuffMat, trackData.tuff_blocks.length);
      const m = new THREE.Matrix4();
      trackData.tuff_blocks.forEach((t, i) => {
        m.makeRotationY(t[3] ?? 0);
        m.setPosition(t[0], t[1], t[2]);
        inst.setMatrixAt(i, m);
      });
      inst.castShadow = true;
      inst.receiveShadow = true;
      this.root.add(inst);
    }
    const marker = await this.assets.glb('assets/props/marker.glb');
    let mGeo: THREE.BufferGeometry | null = null;
    let mMat: THREE.Material | null = null;
    marker.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !mGeo) {
        mGeo = ((o as THREE.Mesh).geometry as THREE.BufferGeometry).clone();
        mMat = ((o as THREE.Mesh).material as THREE.Material).clone();
      }
    });
    if (mGeo && mMat) {
      const inst = new THREE.InstancedMesh(mGeo, mMat, trackData.markers.length);
      const m = new THREE.Matrix4();
      trackData.markers.forEach((t, i) => {
        m.identity();
        m.setPosition(t[0], t[1], t[2]);
        inst.setMatrixAt(i, m);
      });
      inst.castShadow = true;
      this.root.add(inst);
    }
  }

  /** Push heightfield deformation into the visible track ribbon. */
  updateTrackGeometry(hf: Heightfield) {
    if (!this.trackMesh || !this.trackPositions) return;
    const pos = this.trackPositions;
    const geo = this.trackMesh.geometry;
    for (let i = 0; i < pos.length; i += 3) {
      const h = hf.sample(pos[i], pos[i + 2]);
      if (Number.isFinite(h)) pos[i + 1] = h;
    }
    geo.getAttribute('position').needsUpdate = true;
    geo.computeVertexNormals();
  }
}

export function makeSkyAndFog(scene: THREE.Scene, timeOfDay: string) {
  const fog = new THREE.Fog(0x14171d, 70, 240);
  scene.fog = fog;
  const hemi = new THREE.HemisphereLight(0x99aacc, 0x33291d, 0.85);
  scene.add(hemi);
  let amb = 0.32;
  if (timeOfDay === 'night') amb = 0.28;
  if (timeOfDay === 'evening') amb = 0.3;
  const ambient = new THREE.AmbientLight(0xffffff, amb);
  scene.add(ambient);
  scene.background = new THREE.Color(0x161a21);
  return { fog, hemi, ambient };
}

export { TrackCurve };
