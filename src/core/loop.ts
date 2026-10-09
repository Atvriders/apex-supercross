/** Fixed-timestep game loop with accumulator + catch-up clamp. */

export const TICK_HZ = 120;
export const TICK_DT = 1 / TICK_HZ;
export const MAX_CATCHUP_TICKS = 6;

export class Loop {
  private acc = 0;
  private last = 0;
  private running = false;
  private raf = 0;

  constructor(
    private onTick: (dt: number, tick: number) => void,
    private onFrame: (alpha: number, dt: number) => void,
  ) {}

  start() {
    this.running = true;
    this.last = performance.now();
    const frame = (t: number) => {
      if (!this.running) return;
      let dt = (t - this.last) / 1000;
      this.last = t;
      if (dt > 0.1) dt = 0.1; // tab-switch clamp
      this.acc += dt;
      let ticks = 0;
      while (this.acc >= TICK_DT && ticks < MAX_CATCHUP_TICKS) {
        this.onTick(TICK_DT, ticks);
        this.acc -= TICK_DT;
        ticks++;
      }
      if (ticks >= MAX_CATCHUP_TICKS) this.acc = 0;
      this.onFrame(this.acc / TICK_DT, dt);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
