// One input state for keyboard, gamepad and touch.
// A = jump (tap again in the air for the double jump). B = paw (tap to bap, hold for the smoke action).
export type Device = 'keyboard' | 'gamepad' | 'touch';

export class Input {
  moveX = 0; // right
  moveY = 0; // forward
  jumpHeld = false;
  pawHeld = false;
  lookX = 0; // camera drag this frame (pixels or stick units)
  lookY = 0;
  device: Device = 'keyboard';
  private jumpEdge = false;
  private pawEdge = false;
  private keys = new Set<string>();
  private padPrev = { a: false, b: false };
  private dragId: number | null = null;
  private dragLast = [0, 0];
  private stickId: number | null = null;
  private stickOrigin = [0, 0];
  private touchMove = [0, 0];
  private touchJump = false;
  private touchPaw = false;
  onAny: (() => void) | null = null;

  constructor(el: HTMLElement) {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.device = 'keyboard';
      this.keys.add(e.code);
      if (e.code === 'Space') { this.jumpEdge = true; e.preventDefault(); }
      if (e.code === 'KeyE' || e.code === 'KeyJ' || e.code === 'KeyK') this.pawEdge = true;
      this.onAny?.();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    el.addEventListener('pointerdown', (e) => {
      this.onAny?.();
      if (e.pointerType === 'touch') {
        this.device = 'touch';
        if (e.clientX < innerWidth * 0.45 && this.stickId === null) {
          this.stickId = e.pointerId; this.stickOrigin = [e.clientX, e.clientY]; this.touchMove = [0, 0];
          this.showStick(e.clientX, e.clientY, 0, 0);
          return;
        }
      } else if (this.device === 'touch') this.device = 'keyboard';
      if (this.dragId === null) { this.dragId = e.pointerId; this.dragLast = [e.clientX, e.clientY]; }
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) {
        const dx = e.clientX - this.stickOrigin[0], dy = e.clientY - this.stickOrigin[1];
        const r = Math.hypot(dx, dy), max = 50, k = Math.min(1, r / max) / Math.max(r, 1e-6);
        this.touchMove = [dx * k, -dy * k];
        this.showStick(this.stickOrigin[0], this.stickOrigin[1], dx * Math.min(1, max / Math.max(r, 1e-6)), dy * Math.min(1, max / Math.max(r, 1e-6)));
      } else if (e.pointerId === this.dragId) {
        this.lookX += e.clientX - this.dragLast[0]; this.lookY += e.clientY - this.dragLast[1];
        this.dragLast = [e.clientX, e.clientY];
      }
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.stickId) { this.stickId = null; this.touchMove = [0, 0]; this.hideStick(); }
      if (e.pointerId === this.dragId) this.dragId = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);

    const hold = (id: string, set: (v: boolean) => void) => {
      const b = document.getElementById(id)!;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.device = 'touch'; set(true); b.classList.add('down'); this.onAny?.(); });
      const up = () => { set(false); b.classList.remove('down'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
    };
    hold('btn-jump', (v) => { if (v && !this.touchJump) this.jumpEdge = true; this.touchJump = v; });
    hold('btn-paw', (v) => { if (v && !this.touchPaw) this.pawEdge = true; this.touchPaw = v; });
  }

  private showStick(x: number, y: number, kx: number, ky: number) {
    const s = document.getElementById('stick')!, k = document.getElementById('knob')!;
    s.style.display = 'block'; s.style.left = x + 'px'; s.style.top = y + 'px';
    k.style.transform = `translate(${kx}px, ${ky}px)`;
  }
  private hideStick() { document.getElementById('stick')!.style.display = 'none'; }

  /** Call once per frame before reading. */
  poll() {
    let mx = 0, my = 0;
    const k = this.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) my += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my -= 1;
    const kl = Math.hypot(mx, my);
    if (kl > 0) {
      // keyboard trots by default, Shift runs, Ctrl or Alt walks
      const sp = k.has('ShiftLeft') || k.has('ShiftRight') ? 1 : k.has('ControlLeft') || k.has('AltLeft') ? 0.3 : 0.62;
      mx = (mx / kl) * sp; my = (my / kl) * sp;
    }
    let jump = k.has('Space'), paw = k.has('KeyE') || k.has('KeyJ') || k.has('KeyK');

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
      const gx = dz(p.axes[0] ?? 0), gy = -dz(p.axes[1] ?? 0);
      const a = !!p.buttons[0]?.pressed, b = !!(p.buttons[2]?.pressed || p.buttons[1]?.pressed);
      if (Math.hypot(gx, gy) > 0 || a || b) this.device = 'gamepad';
      if (Math.hypot(gx, gy) > Math.hypot(mx, my)) { mx = gx; my = gy; }
      if (a && !this.padPrev.a) this.jumpEdge = true;
      if (b && !this.padPrev.b) this.pawEdge = true;
      jump ||= a; paw ||= b;
      this.padPrev = { a, b };
      this.lookX += dz(p.axes[2] ?? 0) * 9; this.lookY += dz(p.axes[3] ?? 0) * 6;
      break;
    }
    if (this.stickId !== null) { mx = this.touchMove[0]; my = this.touchMove[1]; }
    const l = Math.hypot(mx, my);
    if (l > 1) { mx /= l; my /= l; }
    this.moveX = mx; this.moveY = my;
    this.jumpHeld = jump || this.touchJump;
    this.pawHeld = paw || this.touchPaw;
  }
  takeJump() { const j = this.jumpEdge; this.jumpEdge = false; return j; }
  takePaw() { const p = this.pawEdge; this.pawEdge = false; return p; }
  takeLook() { const l = [this.lookX, this.lookY]; this.lookX = 0; this.lookY = 0; return l; }

  glyph(action: 'jump' | 'paw' | 'move') {
    const d = this.device;
    if (action === 'move') return d === 'keyboard' ? 'WASD' : d === 'gamepad' ? 'Stick' : '';
    if (action === 'jump') return d === 'keyboard' ? 'Space' : d === 'gamepad' ? 'A' : 'Jump';
    return d === 'keyboard' ? 'E' : d === 'gamepad' ? 'X' : 'Bap';
  }
}
