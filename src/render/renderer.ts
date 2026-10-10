/** Three.js renderer + quality presets. */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { GameSettings } from '../core/types';

export class Renderer {
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer | null = null;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 400);
  private bloom: UnrealBloomPass | null = null;
  private ssao: SSAOPass | null = null;

  constructor(canvas: HTMLCanvasElement, public settings: GameSettings) {
    // Try progressively more conservative context options: some machines
    // (blocked GPU, remote desktop, high-performance adapters) refuse the
    // default request but accept a basic one.
    const attempts: THREE.WebGLRendererParameters[] = [
      { canvas, antialias: settings.antialias, powerPreference: 'high-performance' },
      { canvas, antialias: false, powerPreference: 'default' },
      { canvas, antialias: false, powerPreference: 'low-power' },
      { canvas, antialias: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: false },
    ];
    let created: THREE.WebGLRenderer | null = null;
    let lastErr: unknown = null;
    for (const params of attempts) {
      try {
        created = new THREE.WebGLRenderer(params);
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!created) {
      console.error('WebGL context creation failed:', lastErr);
      throw new Error('WebGL is not available in this browser. Enable hardware acceleration or try another browser.');
    }
    this.renderer = created;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.applySettings();
  }

  applySettings() {
    const s = this.settings;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * s.renderScale);
    this.renderer.shadowMap.enabled = s.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.composer?.dispose();
    // Bloom/SSAO post-processing is Ultra-only: EffectComposer is unreliable on
    // software GL (SwiftShader/llvmpipe), so lower presets render directly.
    if (s.quality === 'ultra' && s.bloom) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.8, 0.82);
      if (s.quality === 'ultra') {
        this.ssao = new SSAOPass(this.scene, this.camera, 1, 1);
        this.ssao.kernelRadius = 2;
        this.ssao.minDistance = 0.02;
        this.ssao.maxDistance = 30;
        this.composer.addPass(this.ssao);
      }
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    } else {
      this.composer = null;
    }
    this.renderer.toneMappingExposure = s.quality === 'low' ? 0.95 : 1.05;
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
    if (this.ssao) {
      this.ssao.setSize(w, h);
    }
  }

  render(dt: number) {
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  /** Two-player split screen: P1 left, P2 right. */
  renderSplit(camA: THREE.PerspectiveCamera, camB: THREE.PerspectiveCamera, dt: number) {
    const w = this.renderer.domElement.width;
    const h = this.renderer.domElement.height;
    const half = Math.floor(w / 2);
    this.renderer.setScissorTest(true);
    this.renderer.setViewport(0, 0, half, h);
    this.renderer.setScissor(0, 0, half, h);
    this.renderer.render(this.scene, camA);
    this.renderer.setViewport(half, 0, w - half, h);
    this.renderer.setScissor(half, 0, w - half, h);
    this.renderer.render(this.scene, camB);
    this.renderer.setScissorTest(false);
    void dt;
  }
}

export const QUALITY_PRESETS: Record<GameSettings['quality'], GameSettings> = {
  low: {
    quality: 'low', shadows: false, dust: true, deformation: true, spectators: 0.3,
    reflections: false, antialias: false, bloom: false, motionBlur: false,
    textureQuality: 0.5, renderScale: 0.75,
  },
  medium: {
    quality: 'medium', shadows: true, dust: true, deformation: true, spectators: 0.55,
    reflections: false, antialias: true, bloom: false, motionBlur: false,
    textureQuality: 0.75, renderScale: 0.9,
  },
  high: {
    quality: 'high', shadows: true, dust: true, deformation: true, spectators: 0.8,
    reflections: true, antialias: true, bloom: true, motionBlur: true,
    textureQuality: 1, renderScale: 1,
  },
  ultra: {
    quality: 'ultra', shadows: true, dust: true, deformation: true, spectators: 1,
    reflections: true, antialias: true, bloom: true, motionBlur: true,
    textureQuality: 1, renderScale: 1.25,
  },
};
