/** Shared game types. World coordinates: XZ plane, +Y up (three.js / glTF). */

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface VehicleStats {
  speed: number;
  accel: number;
  handling: number;
  jumping: number;
  suspension: number;
  stability: number;
  weight: number;
  braking: number;
  traction: number;
  difficulty: number;
}

export interface VehicleClass {
  name: string;
  manufacturer: string;
  model: string;
  type: 'mx' | 'atv';
  engine: string;
  wheelbase: number;
  seat_height: number;
  bar_width: number;
  body_scale: number;
  rider_scale: number;
  weight_kg: number;
  power_kw: number;
  top_speed_kmh: number;
  stats: VehicleStats;
  // optional per-class fields
  front_wheel_d?: number;
  rear_wheel_d?: number;
  fork_travel?: number;
  track_width?: number;
  tire_d?: number;
  tire_width?: number;
  suspension_travel?: number;
  exhaust_len?: number;
}

export interface VehiclesManifest {
  classes: Record<string, VehicleClass>;
  default_colors: { primary: number[]; secondary: number[]; accent: number[] };
}

export interface TrackData {
  track_name: string;
  stadium: string;
  length_m: number;
  heightfield: { nx: number; nz: number; x0: number; z0: number; dx: number; dz: number };
  start_s: number;
  gate_s: number;
  n_gates: number;
  gates: number[][];
  checkpoints: number[];
  center_line: number[][];
  ai_line_left: number[][];
  ai_line_right: number[][];
  ai_line_inside: number[][];
  tuff_blocks: number[][];
  markers: number[][];
  sections: Record<string, number[] | number>;
}

export interface StadiumData {
  stadium: string;
  floor: number[];
  lamp_positions: number[][];
  boards: Record<string, { pos: number[]; size: number[]; axis: string; facing: number }>;
  seat_slots: number[][];
  roof_z: number;
}

export interface RiderSpec {
  name: string;
  number: string;
  colors: number[][];
}

export interface RaceConfig {
  mode: 'supercross' | 'elimination' | 'time_trial' | 'freestyle' | 'free_ride' | 'split_screen' | 'championship';
  laps: number;
  riders: number;
  difficulty: number;
  timeOfDay: 'day' | 'evening' | 'night';
  weather: 'clear' | 'overcast' | 'rain';
  vehicle: string;
  riderIndex: number;
  damageSim: boolean;
  transmission: 'manual' | 'auto';
}

export interface GameSettings {
  quality: 'low' | 'medium' | 'high' | 'ultra';
  shadows: boolean;
  dust: boolean;
  deformation: boolean;
  spectators: number; // 0..1
  reflections: boolean;
  antialias: boolean;
  bloom: boolean;
  motionBlur: boolean;
  textureQuality: number; // 0..1
  renderScale: number;
}
