/** Screen builders for every menu in the game flow. */

import { el, clearRoot, screen, menuList, statBar, formatTime, pad } from './dom';
import type {
  GameSettings, RaceConfig, VehicleClass, VehiclesManifest, RiderSpec, TrackData,
} from '../core/types';

export interface ScreenHandle {
  root: HTMLElement;
  update?: (dt: number, t: number) => void;
  onKey?: (action: string, down: boolean) => void;
  dispose?: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set?: (data: any) => void;
}

const root = document.getElementById('ui-root')!;

export function introScreen(onDone: () => void): ScreenHandle {
  clearRoot(root);
  const s = screen(root, 'intro');
  s.innerHTML = `
    <div class="overlay"></div>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center;">
      <div style="font-size:76px;font-weight:900;font-style:italic;letter-spacing:6px;color:#fff;text-shadow:0 4px 20px rgba(0,0,0,0.9),0 0 40px rgba(255,46,18,0.4);">APEX</div>
      <div style="font-size:26px;color:#ffb300;letter-spacing:10px;font-weight:700;">SUPERCROSS</div>
      <div style="color:#8a90a0;letter-spacing:4px;font-size:13px;">STADIUM SERIES — GRAVITYWORKS INTERACTIVE</div>
      <div style="color:#e8eaef;letter-spacing:3px;font-size:14px;border:1px solid rgba(255,255,255,0.15);padding:8px 22px;margin-top:6px;">GENERATED &amp; BUILT BY <span style="color:#ffb300;font-weight:700;">DEEPSEEK V4 PRO</span></div>
      <div style="margin-top:30px;color:#e8eaef;letter-spacing:2px;animation:blink 1.2s infinite;">PRESS ENTER</div>
    </div>
    <style>@keyframes blink{0%,100%{opacity:1}50%{opacity:0.2}}</style>`;
  return {
    root: s,
    onKey(action, down) {
      if (down && (action === 'confirm' || action === 'pause')) onDone();
    },
  };
}

export interface MenuOption {
  label: string;
  onSelect: () => void;
}

export function menuScreen(title: string, sub: string, options: MenuOption[]): ScreenHandle {
  clearRoot(root);
  const s = screen(root, 'menu');
  const overlay = el('div', 'overlay');
  s.appendChild(overlay);
  const panel = el('div', 'menu-panel');
  panel.style.cssText = 'position:absolute;left:60px;top:120px;min-width:340px;';
  panel.appendChild(el('div', 'menu-title', title));
  panel.appendChild(el('div', '', sub)).style.cssText = 'color:#8a90a0;letter-spacing:2px;margin-bottom:14px;font-size:12px;';
  const list = menuList(panel, options.map((o) => ({ label: o.label, onSelect: o.onSelect })));
  s.appendChild(panel);
  const hint = el('div', 'menu-hint', '↑/↓ or W/S select · ENTER confirm');
  panel.appendChild(hint);
  return {
    root: s,
    onKey(action, down) {
      if (!down) return;
      if (action === 'menuUp') list.move(-1);
      if (action === 'menuDown') list.move(1);
      if (action === 'confirm') options[list.index()].onSelect();
    },
  };
}

export interface EventConfig {
  mode: RaceConfig['mode'];
  laps: number;
  riders: number;
  timeOfDay: RaceConfig['timeOfDay'];
  weather: RaceConfig['weather'];
  difficulty: number;
}

export const EVENT_MODES: { id: RaceConfig['mode']; label: string; desc: string }[] = [
  { id: 'supercross', label: 'Supercross Race', desc: '12 riders, 4 laps, holeshot glory' },
  { id: 'elimination', label: 'Elimination', desc: 'Last rider cut every lap' },
  { id: 'time_trial', label: 'Time Trial', desc: 'You against the clock' },
  { id: 'freestyle', label: 'Freestyle', desc: 'Tricks for points on the big jumps' },
  { id: 'free_ride', label: 'Free Ride', desc: 'Open track, no pressure' },
  { id: 'split_screen', label: 'Split-Screen Race', desc: 'Head to head, one screen' },
  { id: 'championship', label: 'Championship Event', desc: 'Qualify, race the heat, main event' },
];

export interface TrackSelectCallbacks {
  onEnter: (config: EventConfig) => void;
  onBack: () => void;
}

export function trackSelectScreen(
  track: TrackData,
  cb: TrackSelectCallbacks,
): ScreenHandle {
  clearRoot(root);
  const s = screen(root, 'trackselect');
  const overlay = el('div', 'overlay');
  s.appendChild(overlay);

  const left = el('div', 'menu-panel');
  left.style.cssText = 'position:absolute;left:40px;top:60px;width:360px;';
  left.appendChild(el('div', 'menu-title', 'THE ANVIL'));
  left.appendChild(el('div', '', 'APEX COLISEUM · STADIUM SUPERCROSS')).style.cssText = 'color:#ffb300;letter-spacing:2px;font-size:12px;margin-bottom:10px;';

  const info = el('div', 'track-info');
  info.innerHTML = `
    <b>Event:</b> Supercross<br/>
    <b>Laps:</b> <span id="cfg-laps">4</span><br/>
    <b>Length:</b> ${track.length_m} m<br/>
    <b>Difficulty:</b> <span id="cfg-diff">Normal</span><br/>
    <b>Riders:</b> <span id="cfg-riders">13</span><br/>
    <b>Surface:</b> Tacky dirt<br/>
    <b>Time of day:</b> <span id="cfg-tod">Night</span><br/>
    <b>Weather:</b> Clear<br/>
    <b>Best lap:</b> <span id="cfg-best">--:--.---</span><br/>
    <b>Recommended classes:</b> 250cc · 450cc<br/>
  `;
  left.appendChild(info);

  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 200;
  canvas.style.cssText = 'margin-top:10px;background:rgba(255,255,255,0.05);width:100%;';
  left.appendChild(canvas);
  drawMinimap(canvas, track);

  const modeRow = el('div', 'grid2');
  modeRow.style.cssText = 'margin-top:10px;';
  const modeBtns = EVENT_MODES.map((m) => {
    const b = el('button', 'btn', m.label);
    b.style.cssText = 'font-size:11px;padding:6px 10px;';
    b.addEventListener('click', () => { config.mode = m.id; refresh(); });
    modeRow.appendChild(b);
    return { b, m };
  });
  left.appendChild(modeRow);

  const enter = el('button', 'btn accent', 'ENTER EVENT  ▶');
  enter.style.cssText = 'margin-top:12px;width:100%;';
  enter.addEventListener('click', () => cb.onEnter({ ...config }));
  const back = el('button', 'btn', '◀ BACK');
  back.style.cssText = 'margin-top:6px;width:100%;';
  back.addEventListener('click', cb.onBack);
  left.appendChild(enter);
  left.appendChild(back);
  s.appendChild(left);

  const config: EventConfig = {
    mode: 'supercross', laps: 4, riders: 13, timeOfDay: 'night', weather: 'clear', difficulty: 0.5,
  };
  const best = localStorage.getItem('apex_sx_bestlap');
  if (best) document.getElementById('cfg-best')!.textContent = formatTime(parseFloat(best));

  function refresh() {
    document.getElementById('cfg-laps')!.textContent = String(config.laps);
    document.getElementById('cfg-riders')!.textContent = String(config.mode === 'time_trial' || config.mode === 'free_ride' ? 1 : config.mode === 'split_screen' ? 2 : 13);
    document.getElementById('cfg-diff')!.textContent = config.difficulty < 0.34 ? 'Easy' : config.difficulty < 0.67 ? 'Normal' : 'Pro';
    document.getElementById('cfg-tod')!.textContent = config.timeOfDay === 'night' ? 'Night' : config.timeOfDay === 'evening' ? 'Evening' : 'Day';
    modeBtns.forEach(({ b, m }) => {
      b.classList.toggle('accent', m.id === config.mode);
    });
  }
  refresh();

  return {
    root: s,
    onKey(action, down) {
      if (!down) return;
      if (action === 'back') cb.onBack();
      if (action === 'confirm') cb.onEnter({ ...config });
      if (action === 'menuLeft') {
        const i = EVENT_MODES.findIndex((m) => m.id === config.mode);
        config.mode = EVENT_MODES[(i + EVENT_MODES.length - 1) % EVENT_MODES.length].id;
        refresh();
      }
      if (action === 'menuRight') {
        const i = EVENT_MODES.findIndex((m) => m.id === config.mode);
        config.mode = EVENT_MODES[(i + 1) % EVENT_MODES.length].id;
        refresh();
      }
      if (action === 'menuUp') { config.laps = Math.min(8, config.laps + 1); refresh(); }
      if (action === 'menuDown') { config.laps = Math.max(1, config.laps - 1); refresh(); }
    },
  };
}

function drawMinimap(canvas: HTMLCanvasElement, track: TrackData) {
  const g = canvas.getContext('2d')!;
  const pts = track.center_line;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
  }
  const scale = Math.min(canvas.width / (maxX - minX), canvas.height / (maxZ - minZ)) * 0.92;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const px = (x: number) => canvas.width / 2 + (x - cx) * scale;
  const pz = (z: number) => canvas.height / 2 + (z - cz) * scale;
  g.strokeStyle = '#ff2e12';
  g.lineWidth = 5;
  g.lineCap = 'round';
  g.beginPath();
  pts.forEach((p, i) => {
    if (i === 0) g.moveTo(px(p[0]), pz(p[2]));
    else g.lineTo(px(p[0]), pz(p[2]));
  });
  g.closePath();
  g.stroke();
  // gates
  g.fillStyle = '#ffb300';
  for (const gate of track.gates) {
    g.fillRect(px(gate[0]) - 3, pz(gate[2]) - 3, 6, 6);
  }
}

export interface VehicleSelectCallbacks {
  onRace: (config: RaceConfig) => void;
  onBack: () => void;
  onChanged: (classId: string, riderIndex: number) => void;
}

export function vehicleSelectScreen(
  manifest: VehiclesManifest,
  riders: RiderSpec[],
  initial: { classId: string; riderIndex: number; colors: number[] },
  cb: VehicleSelectCallbacks,
): ScreenHandle & { refresh: (classId: string, riderIndex: number, colors: number[]) => void } {
  clearRoot(root);
  const s = screen(root, 'vehicleselect');
  const overlay = el('div', 'overlay');
  s.appendChild(overlay);

  const left = el('div', 'menu-panel');
  left.style.cssText = 'position:absolute;left:36px;top:48px;width:430px;max-height:calc(100vh - 80px);overflow-y:auto;';
  left.appendChild(el('div', 'menu-title', 'SELECT VEHICLE'));

  const classList = el('div', '');
  classList.style.cssText = 'max-height:200px;overflow-y:auto;margin:8px 0;';
  const cats: { label: string; ids: string[] }[] = [
    { label: 'MX BIKES', ids: ['mx50', 'mx85', 'mx125', 'mx250', 'mx450', 'mx500'] },
    { label: 'ATVs', ids: ['atv90', 'atv250', 'atv450', 'atv700', 'atvopen'] },
  ];
  const buttons = new Map<string, HTMLDivElement>();
  for (const cat of cats) {
    const h = el('div', '', cat.label);
    h.style.cssText = 'color:#ffb300;font-size:12px;letter-spacing:2px;margin:8px 0 4px;';
    classList.appendChild(h);
    for (const id of cat.ids) {
      const c = manifest.classes[id];
      const b = el('div', 'menu-item', `${c.name} — ${c.manufacturer} ${c.model}`);
      b.style.fontSize = '14px';
      b.addEventListener('click', () => {
        selected.classId = id;
        refresh();
        cb.onChanged(id, selected.riderIndex);
      });
      classList.appendChild(b);
      buttons.set(id, b);
    }
  }
  left.appendChild(classList);

  const stats = el('div', '');
  stats.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;column-gap:10px;';
  left.appendChild(stats);
  const numRow = el('div', '');
  numRow.style.cssText = 'margin-top:8px;';
  const numLabel = el('span', '', 'RACING NUMBER: ');
  const numInput = document.createElement('input');
  numInput.value = '7';
  numInput.maxLength = 3;
  numInput.style.cssText = 'width:56px;background:#111;color:#fff;border:1px solid #444;padding:4px 8px;';
  numRow.appendChild(numLabel);
  numRow.appendChild(numInput);
  left.appendChild(numRow);

  const riderRow = el('div', 'grid2');
  riderRow.style.cssText = 'margin-top:8px;';
  riders.forEach((r, i) => {
    const b = el('button', 'btn', r.name);
    b.style.cssText = 'font-size:11px;';
    b.addEventListener('click', () => {
      selected.riderIndex = i;
      refresh();
      cb.onChanged(selected.classId, i);
    });
    riderRow.appendChild(b);
  });
  left.appendChild(riderRow);

  const go = el('button', 'btn accent', 'START RACE  ▶');
  go.style.cssText = 'margin-top:12px;width:100%;';
  go.addEventListener('click', () => {
    cb.onRace({
      mode: 'supercross', laps: 4, riders: 13, difficulty: 0.5,
      timeOfDay: 'night', weather: 'clear',
      vehicle: selected.classId, riderIndex: selected.riderIndex,
      damageSim: false, transmission: 'auto',
    });
  });
  const back = el('button', 'btn', '◀ BACK');
  back.style.cssText = 'margin-top:6px;width:100%;';
  back.addEventListener('click', cb.onBack);
  left.appendChild(go);
  left.appendChild(back);
  s.appendChild(left);

  const selected = { classId: initial.classId, riderIndex: initial.riderIndex, colors: [...initial.colors] };

  function refresh() {
    const c = manifest.classes[selected.classId];
    buttons.forEach((b, id) => b.classList.toggle('selected', id === selected.classId));
    stats.innerHTML = '';
    statBar(stats, 'Speed', c.stats.speed);
    statBar(stats, 'Acceleration', c.stats.accel);
    statBar(stats, 'Handling', c.stats.handling);
    statBar(stats, 'Jumping', c.stats.jumping);
    statBar(stats, 'Suspension', c.stats.suspension);
    statBar(stats, 'Stability', c.stats.stability);
    statBar(stats, 'Weight', c.stats.weight, 240, true);
    statBar(stats, 'Braking', c.stats.braking);
    statBar(stats, 'Traction', c.stats.traction);
    statBar(stats, 'Difficulty', c.stats.difficulty, 100, true);
    numInput.value = localStorage.getItem('apex_sx_number') ?? '7';
    riders.forEach((_, i) => {
      const b = riderRow.children[i] as HTMLElement;
      if (b) b.classList.toggle('accent', i === selected.riderIndex);
    });
  }
  refresh();
  numInput.addEventListener('change', () => localStorage.setItem('apex_sx_number', numInput.value));

  return {
    root: s,
    refresh(classId, riderIndex, colors) {
      selected.classId = classId;
      selected.riderIndex = riderIndex;
      selected.colors = colors;
      refresh();
    },
  };
}

export function pauseScreen(onResume: () => void, onQuit: () => void): ScreenHandle {
  clearRoot(root);
  const s = screen(root, 'pause');
  s.appendChild(el('div', 'overlay'));
  const panel = el('div', 'menu-panel');
  panel.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);min-width:300px;';
  panel.appendChild(el('div', 'menu-title', 'PAUSED'));
  const list = menuList(panel, [
    { label: 'Resume', onSelect: onResume },
    { label: 'Quit to Menu', onSelect: onQuit },
  ]);
  s.appendChild(panel);
  return {
    root: s,
    onKey(action, down) {
      if (!down) return;
      if (action === 'pause') onResume();
      if (action === 'menuUp') list.move(-1);
      if (action === 'menuDown') list.move(1);
      if (action === 'confirm') {
        const i = list.index();
        if (i === 0) onResume();
        else onQuit();
      }
    },
  };
}

export function resultsScreen(
  position: number,
  total: number,
  bestLap: number,
  raceTime: number,
  onReplay: () => void,
  onMenu: () => void,
): ScreenHandle {
  clearRoot(root);
  const s = screen(root, 'results');
  s.appendChild(el('div', 'overlay'));
  const panel = el('div', 'menu-panel');
  panel.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);min-width:380px;text-align:center;';
  const pos = el('div', '', position === 1 ? 'WINNER!' : `${position}${ordinal(position)} PLACE`);
  pos.style.cssText = `font-size:44px;font-weight:900;font-style:italic;color:${position === 1 ? '#ffb300' : '#fff'};`;
  panel.appendChild(pos);
  const rows = el('div', 'track-info');
  rows.style.cssText = 'margin:12px 0;';
  rows.innerHTML = `<b>Race time:</b> ${formatTime(raceTime)}<br/><b>Best lap:</b> ${bestLap === Infinity ? '--' : formatTime(bestLap)}<br/><b>Riders:</b> ${total}<br/>`;
  panel.appendChild(rows);
  const rb = el('button', 'btn accent', 'REPLAY');
  rb.style.cssText = 'margin:6px;';
  rb.addEventListener('click', onReplay);
  const mb = el('button', 'btn', 'MAIN MENU');
  mb.addEventListener('click', onMenu);
  panel.appendChild(rb);
  panel.appendChild(mb);
  s.appendChild(panel);
  return {
    root: s,
    onKey(action, down) {
      if (!down) return;
      if (action === 'confirm') onReplay();
      if (action === 'back') onMenu();
    },
  };
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'TH';
  return ['TH', 'ST', 'ND', 'RD'][n % 10] ?? 'TH';
}

export function hudScreen(): ScreenHandle {
  clearRoot(root);
  const s = screen(root, 'hud');
  s.innerHTML = `
    <div class="hud">
      <div class="pos-box"><span id="hud-pos">1</span><small id="hud-total">/13</small></div>
      <div class="lap-box"><span id="hud-lap">LAP 1</span><span style="color:#8a90a0"> / <span id="hud-laps">4</span></span></div>
      <div class="time-box"><span id="hud-time">00:00.000</span><br/><span id="hud-best">BEST --:--.---</span><br/><span id="hud-split">SPLIT +0.000</span></div>
      <div class="speed-box"><span id="hud-speed">0</span><small>KM/H</small></div>
      <div class="tach"><div class="fill" id="hud-tach"></div></div>
      <div class="gear-box" id="hud-gear">1</div>
      <div class="minimap"><canvas id="hud-map" width="140" height="100"></canvas></div>
      <div class="trickbox"><div class="trickname" id="hud-trick"></div><div class="score" id="hud-tscore"></div><div class="combo" id="hud-tcombo"></div></div>
      <div class="warn" id="hud-warn" style="display:none"></div>
      <div class="notify" id="hud-notify"></div>
    </div>`;
  const show = (id: string, text: string) => {
    const node = s.querySelector(`#${id}`)! as HTMLElement;
    node.textContent = text;
  };
  const warn = s.querySelector('#hud-warn') as HTMLElement;
  const notify = s.querySelector('#hud-notify') as HTMLElement;
  let notifyTimer = 0;
  return {
    root: s,
    update(dt) {
      void dt;
      if (notifyTimer > 0) {
        notifyTimer -= dt;
        if (notifyTimer <= 0) notify.textContent = '';
      }
    },
    dispose() {
      clearRoot(root);
    },
    set(data: {
      pos?: number; total?: number; lap?: number; laps?: number; time?: number;
      best?: number; split?: number; speed?: number; rpm?: number; gear?: number;
      trick?: string; tscore?: number; combo?: number; warn?: string; notify?: string;
    }) {
      if (data.pos !== undefined) show('hud-pos', String(data.pos));
      if (data.total !== undefined) show('hud-total', `/${data.total}`);
      if (data.lap !== undefined) show('hud-lap', `LAP ${data.lap}`);
      if (data.laps !== undefined) show('hud-laps', String(data.laps));
      if (data.time !== undefined) show('hud-time', formatTime(data.time));
      if (data.best !== undefined) show('hud-best', data.best === Infinity ? 'BEST --:--.---' : `BEST ${formatTime(data.best)}`);
      if (data.split !== undefined) show('hud-split', `SPLIT ${data.split >= 0 ? '+' : ''}${data.split.toFixed(3)}`);
      if (data.speed !== undefined) show('hud-speed', String(Math.round(data.speed * 3.6)));
      if (data.rpm !== undefined) {
        const fill = s.querySelector('#hud-tach') as HTMLElement;
        fill.style.width = `${Math.min(100, (data.rpm / 10000) * 100)}%`;
      }
      if (data.gear !== undefined) show('hud-gear', data.gear === 0 ? 'N' : String(data.gear));
      if (data.trick !== undefined) show('hud-trick', data.trick);
      if (data.tscore !== undefined) show('hud-tscore', data.tscore > 0 ? String(Math.round(data.tscore)) : '');
      if (data.combo !== undefined) show('hud-tcombo', data.combo > 1 ? `COMBO x${data.combo}` : '');
      if (data.warn !== undefined) {
        warn.textContent = data.warn;
        warn.style.display = data.warn ? 'block' : 'none';
      }
      if (data.notify) {
        notify.textContent = data.notify;
        notifyTimer = 2.2;
      }
    },
  };
}

export function settingsScreen(settings: GameSettings, onSave: (s: GameSettings) => void, onBack: () => void): ScreenHandle {
  clearRoot(root);
  const s = screen(root, 'settings');
  s.appendChild(el('div', 'overlay'));
  const panel = el('div', 'menu-panel');
  panel.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);min-width:420px;';
  panel.appendChild(el('div', 'menu-title', 'SETTINGS'));
  const copy = { ...settings };
  const toggles: { label: string; key: keyof GameSettings }[] = [
    { label: 'Shadows', key: 'shadows' },
    { label: 'Dust', key: 'dust' },
    { label: 'Track deformation', key: 'deformation' },
    { label: 'Reflections', key: 'reflections' },
    { label: 'Anti-aliasing', key: 'antialias' },
    { label: 'Bloom', key: 'bloom' },
    { label: 'Motion blur', key: 'motionBlur' },
  ];
  const list = menuList(panel, [
    { label: `Quality: ${copy.quality.toUpperCase()}`, onSelect: () => cycleQuality() },
    ...toggles.map((t) => ({
      label: `${t.label}: ${copy[t.key] ? 'ON' : 'OFF'}`,
      onSelect: () => {
        (copy[t.key] as boolean) = !(copy[t.key] as boolean);
        refresh();
      },
    })),
    { label: 'SAVE & BACK', onSelect: () => { onSave(copy); onBack(); } },
  ]);
  function cycleQuality() {
    const q = ['low', 'medium', 'high', 'ultra'] as const;
    const i = q.indexOf(copy.quality);
    copy.quality = q[(i + 1) % q.length];
    refresh();
  }
  function refresh() {
    const items = [
      `Quality: ${copy.quality.toUpperCase()}`,
      ...toggles.map((t) => `${t.label}: ${copy[t.key] ? 'ON' : 'OFF'}`),
      'SAVE & BACK',
    ];
    list.root.querySelectorAll('.menu-item').forEach((n, i) => {
      if (n instanceof HTMLElement) n.textContent = items[i];
    });
  }
  s.appendChild(panel);
  return {
    root: s,
    onKey(action, down) {
      if (!down) return;
      if (action === 'back') onBack();
      if (action === 'menuUp') list.move(-1);
      if (action === 'menuDown') list.move(1);
      if (action === 'confirm') {
        const i = list.index();
        if (i === 0) cycleQuality();
        else if (i <= toggles.length) {
          const t = toggles[i - 1];
          (copy[t.key] as boolean) = !(copy[t.key] as boolean);
          refresh();
        } else {
          onSave(copy);
          onBack();
        }
      }
    },
  };
}

export function recordsScreen(onBack: () => void): ScreenHandle {
  clearRoot(root);
  const s = screen(root, 'records');
  s.appendChild(el('div', 'overlay'));
  const panel = el('div', 'menu-panel');
  panel.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);min-width:380px;';
  panel.appendChild(el('div', 'menu-title', 'RECORDS'));
  const rows = el('div', 'track-info');
  const best = localStorage.getItem('apex_sx_bestlap');
  const wins = localStorage.getItem('apex_sx_wins') ?? '0';
  rows.innerHTML = `<b>Best lap:</b> ${best ? formatTime(parseFloat(best)) : '--:--.---'}<br/><b>Wins:</b> ${wins}<br/><b>Track:</b> The Anvil — Apex Coliseum<br/>`;
  panel.appendChild(rows);
  const back = el('button', 'btn', '◀ BACK');
  back.addEventListener('click', onBack);
  panel.appendChild(back);
  s.appendChild(panel);
  return {
    root: s,
    onKey(action, down) {
      if (down && (action === 'back' || action === 'confirm')) onBack();
    },
  };
}

export function replayScreen(
  onSpeed: () => void,
  onMenu: () => void,
  onResults: () => void,
): ScreenHandle {
  clearRoot(root);
  const s = screen(root, 'replay');
  const overlay = el('div', 'overlay');
  overlay.style.pointerEvents = 'none';
  s.appendChild(overlay);
  const bar = el('div', '');
  bar.style.cssText = 'position:absolute;bottom:26px;left:50%;transform:translateX(-50%);display:flex;gap:10px;';
  const speed = el('button', 'btn', 'SPEED: 1x');
  speed.addEventListener('click', onSpeed);
  const results = el('button', 'btn', 'RESULTS');
  results.addEventListener('click', onResults);
  const menu = el('button', 'btn accent', 'MAIN MENU');
  menu.addEventListener('click', onMenu);
  bar.appendChild(speed);
  bar.appendChild(results);
  bar.appendChild(menu);
  s.appendChild(bar);
  const hint = el('div', 'menu-hint', 'REPLAY — camera orbits the race · speed cycles 1x → 0.25x → 2x');
  hint.style.cssText = 'position:absolute;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.6);padding:4px 12px;';
  s.appendChild(hint);
  return {
    root: s,
    onKey(action, down) {
      if (!down) return;
      if (action === 'camera') onSpeed();
      if (action === 'back' || action === 'confirm') onMenu();
    },
  };
}
