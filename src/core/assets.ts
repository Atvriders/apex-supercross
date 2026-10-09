/** Asset loading: manifests, GLBs, heightfield, JSON. */

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type {
  StadiumData,
  TrackData,
  VehiclesManifest,
  RiderSpec,
} from './types';

const BASE = import.meta.env.BASE_URL || './';

export class Assets {
  private gltf = new GLTFLoader();
  private cache = new Map<string, unknown>();

  constructor(private base = BASE) {}

  async json<T>(path: string): Promise<T> {
    const url = this.base + path;
    if (this.cache.has(url)) return this.cache.get(url) as T;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
    const data = (await res.json()) as T;
    this.cache.set(url, data);
    return data;
  }

  async glb(path: string) {
    const url = this.base + path;
    if (this.cache.has(url)) return this.cache.get(url) as Awaited<ReturnType<GLTFLoader['loadAsync']>>;
    const gltf = await this.gltf.loadAsync(url);
    this.cache.set(url, gltf);
    return gltf;
  }

  async binary(path: string): Promise<ArrayBuffer> {
    const url = this.base + path;
    if (this.cache.has(url)) return this.cache.get(url) as ArrayBuffer;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
    const buf = await res.arrayBuffer();
    this.cache.set(url, buf);
    return buf;
  }

  vehicles(): Promise<VehiclesManifest> {
    return this.json<VehiclesManifest>('assets/vehicles/vehicles.json');
  }

  trackData(): Promise<TrackData> {
    return this.json<TrackData>('assets/stadium/track_data.json');
  }

  stadiumData(): Promise<StadiumData> {
    return this.json<StadiumData>('assets/stadium/stadium_data.json');
  }

  animationManifest(): Promise<{ clips: string[]; fps: number; frames: number }> {
    return this.json<{ clips: string[]; fps: number; frames: number }>(
      'assets/anim/animations.json',
    );
  }

  riderSpecs(): RiderSpec[] {
    return [
      { name: 'J. Callahan', number: '7', colors: [[0.82, 0.1, 0.08], [0.95, 0.95, 0.95], [0.1, 0.12, 0.14]] },
      { name: 'M. Okafor', number: '21', colors: [[0.95, 0.62, 0.08], [0.08, 0.09, 0.1], [0.95, 0.95, 0.95]] },
      { name: 'R. Delgado', number: '44', colors: [[0.1, 0.35, 0.85], [0.95, 0.95, 0.95], [0.1, 0.12, 0.14]] },
      { name: 'S. Tran', number: '86', colors: [[0.35, 0.78, 0.25], [0.95, 0.95, 0.95], [0.08, 0.09, 0.1]] },
    ];
  }
}
