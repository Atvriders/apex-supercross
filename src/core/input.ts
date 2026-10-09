/** Keyboard + Gamepad input with rebindable actions. */

export type Action =
  | 'throttle' | 'brakeFront' | 'brakeRear' | 'steerLeft' | 'steerRight'
  | 'leanForward' | 'leanBack' | 'leanLeft' | 'leanRight'
  | 'clutch' | 'trick' | 'shiftUp' | 'shiftDown' | 'reset'
  | 'camera' | 'lookBack' | 'pause' | 'confirm' | 'back'
  | 'menuUp' | 'menuDown' | 'menuLeft' | 'menuRight';

export interface KeyBindings {
  [action: string]: string[];
}

export const DEFAULT_KEYBINDINGS: KeyBindings = {
  throttle: ['KeyW', 'ArrowUp'],
  brakeFront: ['KeyS', 'ArrowDown'],
  brakeRear: ['KeyB'],
  steerLeft: ['KeyA'],
  steerRight: ['KeyD'],
  leanForward: ['ArrowUp'],
  leanBack: ['ArrowDown'],
  leanLeft: ['ArrowLeft'],
  leanRight: ['ArrowRight'],
  clutch: ['Space'],
  trick: ['ShiftLeft', 'ShiftRight'],
  shiftUp: ['KeyE'],
  shiftDown: ['KeyQ'],
  reset: ['KeyR'],
  camera: ['KeyC'],
  lookBack: ['KeyL'],
  pause: ['Escape'],
  confirm: ['Enter'],
  back: ['Backspace'],
  menuUp: ['ArrowUp', 'KeyW'],
  menuDown: ['ArrowDown', 'KeyS'],
  menuLeft: ['ArrowLeft', 'KeyA'],
  menuRight: ['ArrowRight', 'KeyD'],
};

const STORAGE_KEY = 'apex_sx_keybindings';

export class Input {
  private pressed = new Set<string>();
  private down = new Set<string>();
  private padState: Record<string, boolean> = {};
  bindings: KeyBindings;
  /** When false (split-screen), the gamepad is reserved for player 2. */
  useGamepad = true;

  constructor() {
    const saved = localStorage.getItem(STORAGE_KEY);
    this.bindings = saved ? { ...DEFAULT_KEYBINDINGS, ...JSON.parse(saved) } : DEFAULT_KEYBINDINGS;
    window.addEventListener('keydown', (e) => {
      if (!e.repeat) this.down.add(e.code);
      this.pressed.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.pressed.delete(e.code);
    });
    window.addEventListener('blur', () => this.pressed.clear());
  }

  saveBindings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bindings));
  }

  resetBindings() {
    this.bindings = { ...DEFAULT_KEYBINDINGS };
    this.saveBindings();
  }

  poll() {
    const p = new Set(this.pressed);
    if (this.useGamepad) {
      const gp = navigator.getGamepads ? navigator.getGamepads() : [];
      const pad = gp[0];
      if (pad) {
        // Gamepad mapping to actions
        const bt = (i: number) => pad.buttons[i]?.value > 0.4 || pad.buttons[i]?.pressed;
        const axis = (i: number) => pad.axes[i] ?? 0;
        if (bt(7)) this.setPad('throttle');
        else this.clearPad('throttle');
        if (bt(6)) this.setPad('brakeFront');
        else this.clearPad('brakeFront');
        if (bt(1)) this.setPad('brakeRear');
        else this.clearPad('brakeRear');
        if (axis(0) < -0.35) this.setPad('steerLeft');
        else if (axis(0) > 0.35) this.setPad('steerRight');
        else { this.clearPad('steerLeft'); this.clearPad('steerRight'); }
        if (axis(1) < -0.35) this.setPad('leanForward');
        else if (axis(1) > 0.35) this.setPad('leanBack');
        else { this.clearPad('leanForward'); this.clearPad('leanBack'); }
        if (axis(2) < -0.35) this.setPad('leanLeft');
        else if (axis(2) > 0.35) this.setPad('leanRight');
        else { this.clearPad('leanLeft'); this.clearPad('leanRight'); }
        if (bt(0)) this.setPad('clutch');
        else this.clearPad('clutch');
        if (bt(2)) this.setPad('trick');
        else this.clearPad('trick');
        if (bt(4)) this.setPad('shiftUp');
        else this.clearPad('shiftUp');
        if (bt(5)) this.setPad('shiftDown');
        else this.clearPad('shiftDown');
        if (bt(3)) this.setPad('reset');
        else this.clearPad('reset');
        if (bt(8)) this.setPad('camera');
        else this.clearPad('camera');
        if (bt(9)) this.setPad('pause');
        else this.clearPad('pause');
      }
    }
    return p;
  }

  /** Raw gamepad snapshot for a specific pad (used by split-screen P2). */
  static gamepadRaw(index = 0): { axes: readonly number[]; buttons: { pressed: boolean; value: number }[] } | null {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads[index];
    if (!pad) return null;
    return {
      axes: pad.axes,
      buttons: Array.from(pad.buttons, (b) => ({ pressed: b.pressed, value: b.value })),
    };
  }

  private setPad(a: Action) { this.padState[a] = true; }
  private clearPad(a: Action) { this.padState[a] = false; }

  actionDown(a: Action): boolean {
    for (const key of this.bindings[a] ?? []) if (this.pressed.has(key)) return true;
    return this.padState[a] === true;
  }

  actionPressed(a: Action): boolean {
    for (const key of this.bindings[a] ?? []) if (this.down.has(key)) return true;
    return false;
  }

  /** Continuous steering/lean axes in [-1, 1] for menu + game. */
  axis(a: Action, neg: Action): number {
    return (this.actionDown(a) ? 1 : 0) - (this.actionDown(neg) ? 1 : 0);
  }

  clearFrame() {
    this.down.clear();
  }
}
