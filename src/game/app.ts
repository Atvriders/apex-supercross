/** GameApp: owns renderer, assets, audio, input; drives the state machine
 * through the full menu -> race -> replay flow. */

import * as THREE from 'three';
import { Renderer, QUALITY_PRESETS } from '../render/renderer';
import { Assets } from '../core/assets';
import { Input } from '../core/input';
import { Loop, TICK_DT } from '../core/loop';
import { AudioEngine } from '../audio/audio';
import { Heightfield } from '../physics/heightfield';
import { TrackCurve } from './trackdata';
import { StadiumScene, makeSkyAndFog } from '../render/stadium';
import { DustSystem } from '../render/dust';
import { CameraSystem } from '../render/cameras';
import { loadVehicle, attachRider, applyVehicleVisuals, paintVehicle } from '../render/vehicles';
import type { VehicleHandle } from '../render/vehicles';
import { ClipLibrary } from '../render/riders';
import { RaceSession, inputFromControls, createEmptyInput } from './race';
import { aiInput } from './ai';
import type { AiState } from './ai';
import { createVehicleState } from '../physics/vehicle';
import type { VehicleState } from '../physics/vehicle';
import type {
  GameSettings, RaceConfig, TrackData, StadiumData, VehiclesManifest, VehicleClass,
} from '../core/types';
import {
  introScreen, menuScreen, trackSelectScreen, vehicleSelectScreen,
  pauseScreen, resultsScreen, settingsScreen, recordsScreen, hudScreen,
  replayScreen,
} from '../ui/screens';
import type { ScreenHandle, EventConfig } from '../ui/screens';
import { clearRoot, el } from '../ui/dom';

type State =
  | 'intro' | 'menu' | 'trackselect' | 'vehicleselect' | 'race'
  | 'results' | 'replay' | 'paused';

const GARAGE_KEY = 'apex_sx_garage';

interface GarageState {
  classId: string;
  riderIndex: number;
  colors: number[];
}

export class GameApp {
  state: State = 'intro';
  screen: ScreenHandle | null = null;
  settings: GameSettings;
  private renderer!: Renderer;
  private assets = new Assets();
  private input = new Input();
  private audio = new AudioEngine();
  private loop: Loop | null = null;
  private stadium: StadiumScene | null = null;
  private hf: Heightfield | null = null;
  private curve: TrackCurve | null = null;
  private trackData: TrackData | null = null;
  private stadiumData: StadiumData | null = null;
  private manifest: VehiclesManifest | null = null;
  private vehicleCache = new Map<string, Promise<VehicleHandle>>();
  private clips = new ClipLibrary();
  private riderCache = new Map<number, Promise<unknown>>();
  private cameras = new CameraSystem();
  private camP2 = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 400);
  private camerasP2 = new CameraSystem();
  private dust: DustSystem | null = null;
  private race: RaceSession | null = null;
  private playerVehicle: VehicleHandle | null = null;
  private raceVehicles = new Map<number, VehicleHandle>();
  private hud: ScreenHandle | null = null;
  private hudTimer = 0;
  private garage: GarageState;
  private trackSelectExtras: {
    cameraT: number;
    practice: { vehicle: VehicleHandle; ai: AiState }[];
    lamps: THREE.Mesh[];
    lampOn: number;
    crowdT: number;
    spots: THREE.SpotLight[];
    truck: THREE.Object3D | null;
    truckDir: number;
    flashes: THREE.Sprite[];
    flashT: number;
  } | null = null;
  private menuHero: { root: THREE.Group; angle: number } | null = null;
  private gateObjects: THREE.Object3D[] = [];
  private replayBuffer: { t: number; p: THREE.Vector3[]; yaw: number[]; pitch: number[] }[] = [];
  private replayIdx = 0;
  private replaySpeed = 1;
  private replayCam = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 400);
  private raceConfig: RaceConfig | null = null;
  private resultsData = { position: 1, total: 13, bestLap: Infinity, raceTime: 0 };
  private trickTimer = 0;
  private trickName = '';
  private trickScore = 0;
  private combo = 0;
  private special = 0;
  private time = 0;

  constructor(private canvas: HTMLCanvasElement) {
    let savedSettings: GameSettings | null = null;
    let savedGarage: GarageState | null = null;
    try {
      const s = localStorage.getItem('apex_sx_settings');
      if (s) savedSettings = JSON.parse(s);
    } catch { savedSettings = null; }
    try {
      const g = localStorage.getItem(GARAGE_KEY);
      if (g) savedGarage = JSON.parse(g);
    } catch { savedGarage = null; }
    this.settings = savedSettings ?? QUALITY_PRESETS.high;
    this.garage = savedGarage ?? {
      classId: 'mx250', riderIndex: 0, colors: [0.82, 0.1, 0.08],
    };
  }

  async boot() {
    const loading = document.getElementById('loading')!;
    const fill = document.getElementById('loading-fill')!;
    const text = document.getElementById('loading-text')!;
    const progress = (p: number, t: string) => {
      fill.style.width = `${p * 100}%`;
      text.textContent = t;
    };
    try {
      progress(0.05, 'INITIALIZING RENDERER...');
      this.renderer = new Renderer(this.canvas, this.settings);
      this.resize();
      window.addEventListener('resize', () => this.resize());

      progress(0.15, 'LOADING MANIFESTS...');
      const [manifest, trackData, stadiumData, animManifest] = await Promise.all([
        this.assets.vehicles(),
        this.assets.trackData(),
        this.assets.stadiumData(),
        this.assets.animationManifest(),
      ]);
      this.manifest = manifest;
      this.trackData = trackData;
      this.stadiumData = stadiumData;
      this.curve = TrackCurve.fromData(trackData);
      void animManifest;
      await this.clips.load(this.assets);

      progress(0.35, 'LOADING STADIUM...');
      const hfBuf = await this.assets.binary('assets/stadium/heightfield.bin');
      this.hf = new Heightfield(hfBuf);
      this.stadium = new StadiumScene(this.assets, this.settings);
      this.makeSkyAndFog(this.renderer.scene);
      await this.stadium.load(this.hf, trackData, stadiumData);
      this.renderer.scene.add(this.stadium.root);
      this.dust = new DustSystem(this.renderer.scene, this.settings.dust);

      progress(0.7, 'WARMING VEHICLES...');
      // background preload of all classes so selection is instant
      for (const id of Object.keys(manifest.classes)) {
        this.getVehicle(id, false).catch(() => {});
      }
      await this.getVehicle(this.garage.classId, false);

      progress(1, 'READY');
      loading.style.display = 'none';
      this.startLoop();
      this.enter('intro');
    } catch (e) {
      console.error(e);
      console.error('STACK:', e instanceof Error ? e.stack : String(e));
      text.textContent = 'FAILED TO LOAD: ' + String(e);
    }
  }

  private makeSkyAndFog(scene: THREE.Scene) {
    makeSkyAndFog(scene, 'night');
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer?.resize(w, h);
    this.replayCam.aspect = w / h;
    this.replayCam.updateProjectionMatrix();
    const split = this.raceConfig?.mode === 'split_screen';
    this.camP2.aspect = split ? (w / 2) / h : w / h;
    this.camP2.updateProjectionMatrix();
    this.renderer.camera.aspect = split ? (w / 2) / h : w / h;
    this.renderer.camera.updateProjectionMatrix();
  }

  private startLoop() {
    this.loop = new Loop(
      (dt) => this.tick(dt),
      (alpha, dt) => this.frame(alpha, dt),
    );
    this.loop.start();
  }

  // -------------------------------------------------------------------------
  // State transitions
  // -------------------------------------------------------------------------
  private enter(next: State) {
    this.disposeScreen();
    this.state = next;
    this.audio.stopMusic();
    // remove screens' 3D props when leaving their states
    if (next !== 'intro' && next !== 'menu' && this.menuHero) {
      this.renderer.scene.remove(this.menuHero.root);
    }
    if (next !== 'vehicleselect' && next !== 'race' && this.selectVehicle) {
      this.renderer.scene.remove(this.selectVehicle.root);
      this.selectVehicle = null;
    }
    if (next === 'race' && this.selectVehicle) {
      this.renderer.scene.remove(this.selectVehicle.root);
      this.selectVehicle = null;
    }
    if ((next === 'menu' || next === 'trackselect' || next === 'vehicleselect' || next === 'intro') &&
        (this.playerVehicle || this.raceVehicles.size > 0)) {
      for (const v of this.raceVehicles.values()) this.renderer.scene.remove(v.root);
      this.raceVehicles.clear();
      this.playerVehicle = null;
      this.hf?.reset();
    }
    switch (next) {
      case 'intro': {
        this.buildMenuHero();
        this.screen = introScreen(() => this.enter('menu'));
        break;
      }
      case 'menu': {
        this.buildMenuHero();
        this.audio.start();
        this.audio.startMusic();
        this.screen = menuScreen('APEX SUPERCROSS', 'STADIUM SERIES', [
          { label: 'Single Event', onSelect: () => this.enter('trackselect') },
          { label: 'Championship', onSelect: () => { this.pendingEvent = { mode: 'championship', laps: 4, riders: 13, timeOfDay: 'night', weather: 'clear', difficulty: 0.5 }; this.enter('vehicleselect'); } },
          { label: 'Time Trial', onSelect: () => { this.pendingEvent = { mode: 'time_trial', laps: 3, riders: 1, timeOfDay: 'evening', weather: 'clear', difficulty: 0.5 }; this.enter('vehicleselect'); } },
          { label: 'Freestyle', onSelect: () => { this.pendingEvent = { mode: 'freestyle', laps: 0, riders: 4, timeOfDay: 'night', weather: 'clear', difficulty: 0.4 }; this.enter('vehicleselect'); } },
          { label: 'Free Ride', onSelect: () => { this.pendingEvent = { mode: 'free_ride', laps: 99, riders: 3, timeOfDay: 'day', weather: 'clear', difficulty: 0.3 }; this.enter('vehicleselect'); } },
          { label: 'Split Screen', onSelect: () => { this.pendingEvent = { mode: 'split_screen', laps: 3, riders: 2, timeOfDay: 'night', weather: 'clear', difficulty: 0.5 }; this.enter('vehicleselect'); } },
          { label: 'Garage', onSelect: () => this.enter('vehicleselect') },
          { label: 'Rider Customization', onSelect: () => { this.garage.riderIndex = (this.garage.riderIndex + 1) % 4; this.saveGarage(); this.enter('vehicleselect'); } },
          { label: 'Records', onSelect: () => { this.screen = recordsScreen(() => this.enter('menu')); } },
          { label: 'Settings', onSelect: () => { this.screen = settingsScreen(this.settings, (s) => { this.settings = s; localStorage.setItem('apex_sx_settings', JSON.stringify(s)); this.renderer.applySettings(); }, () => this.enter('menu')); } },
        ]);
        break;
      }
      case 'trackselect': {
        if (!this.stadium) return;
        this.buildTrackSelectExtras();
        this.screen = trackSelectScreen(this.trackData!, {
          onEnter: (cfg) => {
            this.pendingEvent = cfg;
            this.enter('vehicleselect');
          },
          onBack: () => this.enter('menu'),
        });
        break;
      }
      case 'vehicleselect': {
        this.buildVehicleSelect();
        break;
      }
      case 'race': {
        this.startRace();
        break;
      }
      case 'results': {
        this.screen = resultsScreen(
          this.resultsData.position, this.resultsData.total,
          this.resultsData.bestLap, this.resultsData.raceTime,
          () => this.enter('replay'),
          () => this.enter('menu'),
        );
        break;
      }
      case 'replay': {
        this.replayIdx = 0;
        this.replaySpeed = 1;
        this.screen = replayScreen(
          () => this.replaySpeed = this.replaySpeed === 1 ? 0.25 : this.replaySpeed === 0.25 ? 2 : 1,
          () => this.enter('menu'),
          () => this.enter('results'),
        );
        break;
      }
      case 'paused': {
        this.screen = pauseScreen(() => this.enter('race'), () => this.enter('menu'));
        break;
      }
    }
  }

  pendingEvent: EventConfig = {
    mode: 'supercross', laps: 4, riders: 13, timeOfDay: 'night', weather: 'clear', difficulty: 0.5,
  };

  private disposeScreen() {
    this.screen?.dispose?.();
    this.screen = null;
    clearRoot(document.getElementById('ui-root')!);
  }

  private saveGarage() {
    localStorage.setItem(GARAGE_KEY, JSON.stringify(this.garage));
  }

  // -------------------------------------------------------------------------
  // Menu hero + track select 3D
  // -------------------------------------------------------------------------
  private async buildMenuHero() {
    if (this.menuHero) {
      this.renderer.scene.add(this.menuHero.root);
      return;
    }
    const v = await this.getVehicle('mx450', false);
    await attachRider(this.assets, v, 0, this.clips);
    const root = new THREE.Group();
    root.add(v.root);
    v.root.position.set(0, 0, 0);
    const spot1 = new THREE.SpotLight(0xffffff, 90, 30, 0.55, 0.6);
    spot1.position.set(3, 5, 3);
    const spot2 = new THREE.SpotLight(0xffb300, 60, 30, 0.55, 0.6);
    spot2.position.set(-3, 4, -2);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(6, 48),
      new THREE.MeshStandardMaterial({ color: 0x15161c, roughness: 0.4, metalness: 0.6 }),
    );
    floor.rotation.x = -Math.PI / 2;
    root.add(floor, spot1, spot2);
    this.menuHero = { root, angle: 0 };
    this.renderer.scene.add(root);
  }

  private async buildTrackSelectExtras() {
    const s = this.stadium!;
    const lines = {
      left: this.trackData!.ai_line_left.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
      right: this.trackData!.ai_line_right.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
      center: this.trackData!.center_line.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
      inside: this.trackData!.ai_line_inside.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
    };
    const practice = [] as any[];
    for (let i = 0; i < 3; i++) {
      const cls = this.manifest!.classes[i === 0 ? 'mx450' : i === 1 ? 'mx250' : 'mx125'];
      const v = await this.getVehicle(i === 0 ? 'mx450' : i === 1 ? 'mx250' : 'mx125', false);
      await attachRider(this.assets, v, (i + 1) % 4, this.clips);
      this.renderer.scene.add(v.root);
      const line = lines[i === 0 ? 'center' : i === 1 ? 'left' : 'right'];
      const ai = new (class {})() as AiState;
      Object.assign(ai, {
        params: { skill: 0.7, aggression: 0.5, line: 'center', mistakeRate: 0.2, rhythmBold: 0.7 },
        line, curvature: line.map(() => 0.1),
        bobbleTimer: 0, wideTimer: 0, pressure: 0, lastThrottle: 0, seed: Math.random() * 1000,
      });
      practice.push({ vehicle: v, cls, ai });
    }
    // truck
    let truck: THREE.Object3D | null = null;
    try {
      const t = await this.assets.glb('assets/props/water_truck.glb');
      truck = t.scene;
      truck.position.set(0, 30, 0);
      this.renderer.scene.add(truck);
    } catch { /* optional */ }
    this.trackSelectExtras = {
      cameraT: 0, practice, lamps: [], lampOn: 0, crowdT: 0,
      spots: [], truck, truckDir: 1, flashes: [], flashT: 0,
    };
    // sweeping spotlights
    const spotA = new THREE.SpotLight(0xbfd4ff, 260, 90, 0.45, 0.5);
    spotA.position.set(-30, 17, -14);
    const spotB = new THREE.SpotLight(0xffd9b3, 200, 90, 0.45, 0.5);
    spotB.position.set(30, 17, 10);
    this.renderer.scene.add(spotA, spotB);
    this.trackSelectExtras.spots = [spotA, spotB];
    // camera flash sprites in the stands
    const flashTex = this.makeFlashTexture();
    const slots = this.stadiumData!.seat_slots;
    for (let i = 0; i < 26; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, opacity: 0 }));
      const slot = slots[(i * 53) % slots.length];
      sp.position.set(slot[0], slot[2], -slot[1]); // Blender -> game coords
      sp.scale.set(0.7, 0.7, 0.7);
      this.renderer.scene.add(sp);
      this.trackSelectExtras.flashes.push(sp);
    }
    this.cameras.mode = 'replay';
    this.cameras.reset({ pos: new THREE.Vector3(0, 2, 0) as any, vel: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, speed: 0 } as any);
  }

  private makeFlashTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,240,200,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  }

  // -------------------------------------------------------------------------
  // Vehicle selection
  // -------------------------------------------------------------------------
  private selectVehicle: VehicleHandle | null = null;

  private async buildVehicleSelect() {
    const s = this.stadium!;
    if (this.selectVehicle) this.renderer.scene.remove(this.selectVehicle.root);
    const v = await this.getVehicle(this.garage.classId, false);
    await attachRider(this.assets, v, this.garage.riderIndex, this.clips);
    this.selectVehicle = v;
    // paddock placement: in front of the garages (behind south wall)
    v.root.position.set(0, this.hf!.sample(0, 32) + 0.02, 30);
    v.root.rotation.y = Math.PI; // face the arena
    this.renderer.scene.add(v.root);
    paintVehicle(v, new THREE.Color(this.garage.colors[0], this.garage.colors[1], this.garage.colors[2]), new THREE.Color(0.95, 0.95, 0.95));
    // camera behind garage row
    this.cameras.mode = 'replay';
    this.renderer.camera.position.set(0, 3.4, 38);
    this.renderer.camera.lookAt(0, 1.0, 30);
    // spot on the vehicle
    const spot = new THREE.SpotLight(0xffffff, 80, 40, 0.55, 0.7);
    spot.position.set(3, 8, 35);
    spot.target.position.copy(v.root.position);
    this.renderer.scene.add(spot, spot.target);

    this.screen = vehicleSelectScreen(
      this.manifest!, this.assets.riderSpecs(),
      { classId: this.garage.classId, riderIndex: this.garage.riderIndex, colors: this.garage.colors },
      {
        onRace: (cfg) => {
          this.raceConfig = { ...cfg, mode: this.pendingEvent.mode };
          this.enter('race');
        },
        onBack: () => this.enter('menu'),
        onChanged: async (classId, riderIndex) => {
          this.garage.classId = classId;
          this.garage.riderIndex = riderIndex;
          this.saveGarage();
          const old = this.selectVehicle;
          const nv = await this.getVehicle(classId, false);
          await attachRider(this.assets, nv, riderIndex, this.clips);
          nv.root.position.copy(old!.root.position);
          nv.root.rotation.copy(old!.root.rotation);
          this.renderer.scene.add(nv.root);
          this.renderer.scene.remove(old!.root);
          this.selectVehicle = nv;
          paintVehicle(nv, new THREE.Color(this.garage.colors[0], this.garage.colors[1], this.garage.colors[2]), new THREE.Color(0.95, 0.95, 0.95));
          this.audio.setEngine(nv.spec.type === 'atv' ? 'atv_large' : '4t_large');
          this.audio.updateEngine(1500, 0.2, 0.5, 0, 5);
        },
      },
    );
    this.audio.setEngine(v.spec.type === 'atv' ? 'atv_large' : '4t_large');
  }

  // -------------------------------------------------------------------------
  // Race
  // -------------------------------------------------------------------------
  private async startRace() {
    this.disposeScreen();
    this.hud = hudScreen();
    const cfg: RaceConfig = {
      mode: this.pendingEvent.mode === 'split_screen' ? 'split_screen' : this.pendingEvent.mode,
      laps: this.pendingEvent.laps === 0 ? 6 : this.pendingEvent.laps,
      riders: this.pendingEvent.riders,
      difficulty: this.pendingEvent.difficulty,
      timeOfDay: this.pendingEvent.timeOfDay,
      weather: this.pendingEvent.weather,
      vehicle: this.raceConfig?.vehicle ?? this.garage.classId,
      riderIndex: this.raceConfig?.riderIndex ?? this.garage.riderIndex,
      damageSim: false,
      transmission: 'auto',
    };
    this.raceConfig = cfg;
    const lines = {
      left: this.trackData!.ai_line_left.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
      right: this.trackData!.ai_line_right.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
      center: this.trackData!.center_line.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
      inside: this.trackData!.ai_line_inside.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
    };
    this.hf!.reset();
    this.race = new RaceSession(
      this.hf!, this.curve!, this.trackData!, cfg,
      (x, z, w) => this.hf?.deform(x, z, w * 0.004, 0.5),
      this.manifest!.classes, lines as any,
    );

    // spawn vehicles for every rider
    this.audio.start();
    this.audio.setEngine(
      this.manifest!.classes[cfg.vehicle].type === 'atv'
        ? (this.manifest!.classes[cfg.vehicle].weight_kg > 200 ? 'atv_large' : 'atv_small')
        : this.manifest!.classes[cfg.vehicle].engine.includes('two-stroke')
          ? (this.manifest!.classes[cfg.vehicle].power_kw > 30 ? '2t_large' : '2t_small')
          : (this.manifest!.classes[cfg.vehicle].power_kw > 30 ? '4t_large' : '4t_small'),
    );
    this.audio.stopMusic();
    this.audio.announce();

    for (const entry of this.race.entries) {
      const isPlayer = entry.isPlayer;
      const id = Object.keys(this.manifest!.classes).find(
        (k) => this.manifest!.classes[k].name === entry.vehicleClass.name,
      );
      if (!id) {
        console.error('no class id for', entry.vehicleClass.name);
        continue;
      }
      try {
        const v = await this.getVehicle(id, !isPlayer);
        if (isPlayer) {
          await attachRider(this.assets, v, entry.riderIndex, this.clips);
          paintVehicle(v, new THREE.Color(this.garage.colors[0], this.garage.colors[1], this.garage.colors[2]), new THREE.Color(0.95, 0.95, 0.95));
        } else {
          await attachRider(this.assets, v, entry.riderIndex, this.clips, true);
          const hue = (entry.index * 47) % 360;
          paintVehicle(v, new THREE.Color().setHSL(hue / 360, 0.7, 0.5), new THREE.Color(0.92, 0.92, 0.95));
        }
        this.renderer.scene.add(v.root);
        this.raceVehicles.set(entry.index, v);
        if (isPlayer && entry.index === 0) this.playerVehicle = v;
      } catch (e) {
        console.error('vehicle spawn failed for', entry.vehicleClass.name, e);
      }
    }
    // gate meshes
    this.gateObjects = [];
    const trackScene = this.stadium!.root;
    for (let i = 0; i < 13; i++) {
      const g = trackScene.getObjectByName(`gate_${String(i).padStart(2, '0')}`);
      if (g) this.gateObjects.push(g);
    }
    this.replayBuffer = [];
    this.cameras.mode = 'near';
    this.cameras.reset(this.race.player.state);
    const split = cfg.mode === 'split_screen';
    this.input.useGamepad = !split;
    if (split && this.race.entries[1]) {
      this.camerasP2.mode = 'near';
      this.camerasP2.reset(this.race.entries[1].state);
    }
    this.resize();
    this.trickScore = 0;
    this.combo = 0;
    this.state = 'race';
  }

  private repeat: Record<string, number> = {};
  private MENU_ACTIONS = [
    'throttle', 'brakeFront', 'brakeRear', 'steerLeft', 'steerRight',
    'leanForward', 'leanBack', 'leanLeft', 'leanRight', 'clutch', 'trick',
    'shiftUp', 'shiftDown', 'reset', 'camera', 'lookBack', 'pause', 'confirm',
    'back', 'menuUp', 'menuDown', 'menuLeft', 'menuRight',
  ] as const;

  private dispatchInput(dt: number) {
    const onKey = this.screen?.onKey;
    if (!onKey) return;
    for (const a of this.MENU_ACTIONS) {
      if (this.input.actionPressed(a)) onKey(a, true);
      if (this.input.actionDown(a) &&
          (a === 'menuUp' || a === 'menuDown' || a === 'menuLeft' || a === 'menuRight')) {
        this.repeat[a] = (this.repeat[a] ?? 0) + dt;
        if (this.repeat[a] > 0.3) {
          onKey(a, true);
          this.repeat[a] = 0.12;
        }
      } else {
        this.repeat[a] = 0;
      }
    }
  }

  private tick(dt: number) {
    this.time += dt;
    this.dispatchInput(dt);
    this.input.clearFrame();
    if (this.input.actionDown('pause') && this.state === 'race') {
      this.enter('paused');
    }
    if (this.state === 'race' && this.race) {
      const input = this.readPlayerInput();
      const inputs = [input];
      if (this.raceConfig?.mode === 'split_screen') {
        inputs.push(this.readPlayer2Input());
      }
      if (input.reset && this.race.player.state.crashed) {
        this.race.player.state.crashTimer = 0;
      }
      this.race.step(dt, inputs);
      const p = this.race.player.state;
      // dust
      if (this.dust && Math.abs(p.speed) > 2) {
        const f = { x: -Math.sin(p.yaw), z: -Math.cos(p.yaw) };
        this.dust.spawn(p.pos.x - f.x * 0.8, p.pos.y, p.pos.z - f.z * 0.8, Math.min(1, Math.abs(p.speed) / 25 + p.wheelspin), 0.4);
      }
      // replay record
      if (this.replayBuffer.length < 60 * 60 * 5) {
        const idx = Math.floor(this.race.raceTimer / (dt * 4));
        if (idx >= this.replayBuffer.length) {
          this.replayBuffer.push({
            t: this.race.raceTimer,
            p: this.race.entries.map((e) => e.state.pos.clone()),
            yaw: this.race.entries.map((e) => e.state.yaw),
            pitch: this.race.entries.map((e) => e.state.pitch),
          });
        }
      }
      // trick handling
      this.tickTricks(dt, p);
      // audio
      this.audio.updateEngine(p.rpm, p.throttle, 0.5, p.wheelspin, 6);
      this.audio.updateWind(Math.abs(p.speed));
      if (this.race.phase === 'finished' && this.state === 'race') {
        this.finishRace();
      }
    } else if (this.state === 'trackselect' && this.trackSelectExtras) {
      this.tickTrackSelect(dt);
    } else if (this.state === 'replay') {
      // buffer records at 30 Hz; tick is 120 Hz -> advance 0.25/tick at 1x
      this.replayIdx += 0.25 * this.replaySpeed;
      if (this.replayIdx >= this.replayBuffer.length) {
        this.enter('results');
      }
    }
  }

  private tickTricks(dt: number, p: any) {
    if (this.raceConfig?.mode !== 'freestyle') return;
    if (this.trickTimer > 0) this.trickTimer -= dt;
    const air = p.airTime > 0.15;
    if (air && this.trickTimer <= 0) {
      const tricks = ['No-Hander', 'No-Footer', 'Can-Can', 'Nac-Nac', 'Superman', 'Seat Grab', 'Heel Clicker', 'Whip'];
      this.trickName = tricks[Math.floor(Math.random() * tricks.length)];
      this.trickTimer = 0.6;
      this.trickScore += (10 + p.airTime * 14) * (1 + this.combo * 0.25);
      this.combo++;
      this.special += 8;
      this.audio.crowdReact(0.5);
    }
    if (!air && this.trickTimer <= 0 && this.combo > 0) {
      this.combo = 0;
    }
  }

  private finishRace() {
    const p = this.race!.player;
    const pos = this.race!.positionOf(0);
    const total = this.race!.entries.length;
    this.resultsData = {
      position: pos, total,
      bestLap: p.lap.bestLap,
      raceTime: p.lap.finishTime || this.race!.raceTimer,
    };
    if (pos === 1) {
      const wins = parseInt(localStorage.getItem('apex_sx_wins') ?? '0', 10);
      localStorage.setItem('apex_sx_wins', String(wins + 1));
    }
    if (p.lap.bestLap !== Infinity) {
      const best = parseFloat(localStorage.getItem('apex_sx_bestlap') ?? 'Infinity');
      if (p.lap.bestLap < best) localStorage.setItem('apex_sx_bestlap', String(p.lap.bestLap));
    }
    this.audio.crowdReact(1);
    this.enter('results');
  }

  private readPlayerInput() {
    const ax = {
      throttle: this.input.actionDown('throttle') ? 1 : 0,
      brakeFront: this.input.actionDown('brakeFront') ? 1 : 0,
      brakeRear: this.input.actionDown('brakeRear') ? 1 : 0,
      steer: this.input.axis('steerRight', 'steerLeft'),
      leanX: this.input.axis('leanRight', 'leanLeft'),
      leanY: this.input.axis('leanForward', 'leanBack'),
    };
    const bt = {
      clutch: this.input.actionDown('clutch'),
      trick: this.input.actionDown('trick'),
      reset: this.input.actionDown('reset'),
    };
    return inputFromControls(ax, bt, this.input.actionPressed('shiftUp'), this.input.actionPressed('shiftDown'));
  }

  /** Split-screen player 2: gamepad 0 (P1 keeps the keyboard). */
  private readPlayer2Input() {
    const pad = Input.gamepadRaw(0);
    if (!pad) return createEmptyInput();
    const bt = (i: number) => pad.buttons[i]?.pressed || pad.buttons[i]?.value > 0.4;
    const axis = (i: number) => pad.axes[i] ?? 0;
    return inputFromControls(
      {
        throttle: bt(7) ? 1 : 0,
        brakeFront: bt(6) ? 1 : 0,
        brakeRear: bt(1) ? 1 : 0,
        steer: axis(0),
        leanX: axis(2),
        leanY: axis(1),
      },
      { clutch: bt(0), trick: bt(2), reset: bt(3) },
      false,
      false,
    );
  }

  private tickTrackSelect(dt: number) {
    const ex = this.trackSelectExtras!;
    ex.cameraT += dt;
    // cinematic flyover
    const t = ex.cameraT;
    const r = 42;
    const cam = this.renderer.camera;
    const angle = t * 0.06;
    const x = Math.sin(angle) * r * 0.8;
    const z = -Math.cos(angle) * r * 0.6;
    const y = 15 + Math.sin(t * 0.1) * 6;
    cam.position.lerp(new THREE.Vector3(x, y, z), 1 - Math.exp(-0.5 * dt));
    cam.lookAt(0, 0, 0);
    // practice riders
    for (const pr of ex.practice) {
      const near = this.curve!.closest(pr.vehicle.root.position);
      const target = this.curve!.at(near.s + 10);
      pr.vehicle.root.position.lerp(target, Math.min(1, dt * 1.1));
      pr.vehicle.root.lookAt(target);
      pr.vehicle.root.rotateY(Math.PI); // vehicles face -Z, lookAt points +Z
      if (this.dust) this.dust.spawn(pr.vehicle.root.position.x, pr.vehicle.root.position.y, pr.vehicle.root.position.z, 0.4, 0.3);
    }
    // crowd fills in
    if (this.stadium!.crowd && this.stadium!.crowdVisible < 2200) {
      this.stadium!.crowdVisible = Math.min(2200, this.stadium!.crowdVisible + Math.ceil(dt * 260));
    }
    // lights ramp on
    ex.lampOn = Math.min(1, ex.lampOn + dt * 0.12);
    // moving spotlights
    ex.spots.forEach((sp, i) => {
      sp.position.x = Math.sin(this.time * 0.3 + i * 2) * 34;
      sp.position.z = Math.cos(this.time * 0.22 + i) * 20;
      sp.target.position.set(sp.position.x * 0.4, 0, sp.position.z * 0.4);
    });
    // truck drives
    if (ex.truck) {
      ex.truck.position.x += ex.truckDir * dt * 4;
      if (ex.truck.position.x > 34) ex.truckDir = -1;
      if (ex.truck.position.x < -34) ex.truckDir = 1;
    }
    // camera flashes
    ex.flashT -= dt;
    if (ex.flashT <= 0) {
      ex.flashT = 0.12 + Math.random() * 0.5;
      const f = ex.flashes[Math.floor(Math.random() * ex.flashes.length)];
      (f.material as THREE.SpriteMaterial).opacity = 0.9;
      setTimeout(() => { (f.material as THREE.SpriteMaterial).opacity = 0; }, 90);
    }
    this.stadium!.updateBoards(this.time, dt);
  }

  private frame(alpha: number, dt: number) {
    const cam = this.renderer.camera;
    switch (this.state) {
      case 'intro':
      case 'menu': {
        if (this.menuHero) {
          this.menuHero.angle += dt * 0.25;
          const a = this.menuHero.angle;
          cam.position.set(Math.sin(a) * 7, 2.6, Math.cos(a) * 7);
          cam.lookAt(0, 1.2, 0);
          applyVehicleVisuals(this.getVehicleSync('mx450'), this.fakeHeroState(dt), dt);
        }
        break;
      }
      case 'trackselect': {
        // camera handled in tick
        break;
      }
      case 'vehicleselect': {
        // orbit camera around the selected vehicle
        if (this.selectVehicle) {
          const a = this.time * 0.35 + this.input.axis('menuRight', 'menuLeft') * dt * 2.5;
          this.time = this.time + this.input.axis('menuRight', 'menuLeft') * dt * 2.5;
          const r = 5.2;
          cam.position.lerp(
            new THREE.Vector3(
              this.selectVehicle.root.position.x + Math.sin(a) * r,
              2.6, this.selectVehicle.root.position.z + Math.cos(a) * r,
            ),
            1 - Math.exp(-3 * dt),
          );
          cam.lookAt(this.selectVehicle.root.position.x, 1.1, this.selectVehicle.root.position.z);
          const vs = this.selectorVisualState;
          vs.speed = Math.abs(Math.sin(this.time * 0.7)) * 2;
          applyVehicleVisuals(this.selectVehicle, vs, dt);
          this.audio.updateEngine(1400 + Math.sin(this.time) * 400, 0.25, 0.5, 0, 4);
        }
        break;
      }
      case 'race': {
        if (!this.race || !this.playerVehicle) break;
        const r = this.race;
        const split = this.raceConfig?.mode === 'split_screen';
        for (const e of r.entries) {
          const v = this.raceVehicles.get(e.index) ?? this.playerVehicle;
          if (!v) continue;
          const ground = this.hf!.sample(e.state.pos.x, e.state.pos.z);
          v.root.position.set(
            e.state.pos.x,
            Number.isFinite(ground) ? ground : e.state.pos.y - 0.34,
            e.state.pos.z,
          );
          v.root.rotation.order = 'YXZ';
          v.root.rotation.set(e.state.pitch, e.state.yaw, e.state.roll);
          applyVehicleVisuals(v, e.state, dt);
        }
        // gates
        if (r.gatesDropped) {
          for (const g of this.gateObjects) {
            g.rotation.x = Math.max(g.rotation.x - dt * 4, -Math.PI / 2);
          }
        }
        this.cameras.update(cam, r.player.state, this.headPosition(), dt);
        if (split && r.entries[1]) {
          const p2 = r.entries[1].state;
          const head2 = new THREE.Vector3(p2.pos.x, p2.pos.y + 1.55, p2.pos.z);
          this.camerasP2.update(this.camP2, p2, head2, dt);
        }
        this.stadium!.updateTrackGeometry(this.hf!);
        this.stadium!.updateBoards(this.time, dt);
        // HUD
        this.hudTimer -= dt;
        if (this.hudTimer <= 0) {
          this.hudTimer = 0.08;
          const p = r.player;
          const lap = p.lap;
          this.hud?.set?.({
            pos: r.positionOf(0),
            total: r.entries.length,
            lap: Math.min(lap.lap + 1, this.raceConfig!.laps),
            laps: this.raceConfig!.laps,
            time: this.raceConfig!.mode === 'time_trial' ? r.raceTimer : lap.lastLapTime > 0 ? this.time - lap.lapStart + lap.lastLapTime : this.time,
            best: lap.bestLap,
            split: r.splitGap(0),
            speed: p.state.speed,
            rpm: p.state.rpm,
            gear: p.state.gear,
            warn: lap.wrongWayTimer > 0.5 ? '⚠ WRONG WAY' : '',
            notify: r.holeshotIndex === 0 ? 'HOLESHOT!' : '',
            trick: this.trickName,
            tscore: this.trickScore,
            combo: this.combo,
          });
        }
        break;
      }
      case 'replay': {
        if (this.replayBuffer.length > 0 && this.replayIdx < this.replayBuffer.length) {
          const frame = this.replayBuffer[this.replayIdx];
          if (frame) {
            const target = frame.p[0];
            const dist = 8;
            const a = this.replayIdx * 0.01;
            this.replayCam.position.set(
              target.x + Math.sin(a) * dist, target.y + 4, target.z + Math.cos(a) * dist,
            );
            this.replayCam.lookAt(target);
          }
        }
        break;
      }
      default:
        break;
    }
    if (this.dust) this.dust.update(dt);
    if (this.state === 'race' && this.raceConfig?.mode === 'split_screen' && this.race && this.race.entries.length > 1) {
      this.renderer.renderSplit(this.renderer.camera, this.camP2, dt);
    } else {
      this.renderer.render(dt);
    }
    this.screen?.update?.(dt, this.time);
  }

  private headPosition(): THREE.Vector3 {
    const p = this.race!.player.state;
    return new THREE.Vector3(p.pos.x, p.pos.y + 1.55, p.pos.z);
  }

  selectorVisualState: VehicleState = createVehicleState();

  private heroState: VehicleState = createVehicleState();

  private fakeHeroState(dt: number) {
    this.heroState.speed = 1.2 + Math.sin(this.time) * 0.4;
    return this.heroState;
  }

  private syncVehicles = new Map<string, VehicleHandle>();

  private async getVehicle(classId: string, lod: boolean): Promise<VehicleHandle> {
    const key = `${classId}_${lod}`;
    if (this.syncVehicles.has(key)) return this.syncVehicles.get(key)!;
    if (this.vehicleCache.has(key)) return this.vehicleCache.get(key)!;
    const p = loadVehicle(this.assets, classId, this.manifest!.classes[classId], lod);
    this.vehicleCache.set(key, p);
    p.then((v) => this.syncVehicles.set(key, v));
    return p;
  }

  private getVehicleSync(classId: string): VehicleHandle {
    const key = `${classId}_false`;
    const v = this.syncVehicles.get(key);
    if (!v) throw new Error('vehicle not loaded: ' + classId);
    return v;
  }
}
