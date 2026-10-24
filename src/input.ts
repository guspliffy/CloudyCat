// One input state for keyboard, gamepad and touch.
// A = jump (tap again in the air for the double jump). B = paw (tap to bap, hold for the smoke action).
export type Device = 'keyboard' | 'gamepad' | 'touch';

const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);

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
  private padA = false;
  private padEdge = false;
  private padB = false;
  private actions = new Set<'confirm'>();
  private look: [number, number] = [0, 0];
  private dragId: number | null = null;
  private dragX = 0;
  private dragY = 0;
  private stickId: number | null = null;
  private stickX = 0;
  private stickY = 0;
  private touchX = 0;
  private touchY = 0;
  private touchJump = false;
  private touchPaw = false;
  onAny: (() => void) | null = null;

  constructor(el: HTMLElement) {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      // on a Mac, keys pressed with Cmd never send keyup, so a held Cmd lets go of everything
      if (e.metaKey) { this.keys.clear(); return; }
      this.device = 'keyboard';
      this.keys.add(e.code);
      if (e.code === 'Space') { this.jumpEdge = true; e.preventDefault(); }
      if (e.code === 'KeyE' || e.code === 'KeyJ' || e.code === 'KeyK') this.pawEdge = true;
      if (e.code === 'Enter' || e.code === 'NumpadEnter') this.actions.add('confirm');
      this.onAny?.();
    });
    addEventListener('keyup', (e) => { if (e.key === 'Meta') this.keys.clear(); else this.keys.delete(e.code); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('blur', () => this.keys.clear());

    el.addEventListener('pointerdown', (e) => {
      this.onAny?.();
      if (e.pointerType === 'touch') {
        this.device = 'touch';
        if (e.clientX < innerWidth * 0.45 && this.stickId === null) {
          this.stickId = e.pointerId; this.stickX = e.clientX; this.stickY = e.clientY; this.touchX = this.touchY = 0;
          this.showStick(e.clientX, e.clientY, 0, 0);
          return;
        }
      } else if (this.device === 'touch') this.device = 'keyboard';
      if (this.dragId === null) { this.dragId = e.pointerId; this.dragX = e.clientX; this.dragY = e.clientY; }
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) {
        const dx = e.clientX - this.stickX, dy = e.clientY - this.stickY;
        const r = Math.hypot(dx, dy), max = 50, k = Math.min(1, r / max) / Math.max(r, 1e-6);
        this.touchX = dx * k; this.touchY = -dy * k;
        const c = Math.min(1, max / Math.max(r, 1e-6));
        this.showStick(this.stickX, this.stickY, dx * c, dy * c);
      } else if (e.pointerId === this.dragId) {
        this.lookX += e.clientX - this.dragX; this.lookY += e.clientY - this.dragY;
        this.dragX = e.clientX; this.dragY = e.clientY;
      }
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.stickId) { this.stickId = null; this.touchX = this.touchY = 0; this.hideStick(); }
      if (e.pointerId === this.dragId) this.dragId = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    // iOS only unlocks sound on a finished tap, not on pointerdown
    addEventListener('pointerup', () => this.onAny?.());

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

  /** Let go of everything, for example when the tab is hidden. */
  clear() {
    this.keys.clear(); this.jumpEdge = this.pawEdge = false; this.lookX = this.lookY = 0; this.actions.clear();
    this.touchJump = this.touchPaw = false;
    if (this.stickId !== null) { this.stickId = null; this.touchX = this.touchY = 0; this.hideStick(); }
    this.dragId = null;
  }

  /** Call once per frame before reading. */
  poll(dt: number) {
    let mx = 0, my = 0;
    const k = this.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) my += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my -= 1;
    const kl = Math.hypot(mx, my);
    if (kl > 0) {
      // keyboard trots by default, Shift runs (Ctrl and Alt are left alone: Ctrl+W would close the tab)
      const sp = k.has('ShiftLeft') || k.has('ShiftRight') ? 1 : 0.62;
      mx = (mx / kl) * sp; my = (my / kl) * sp;
    }
    let jump = k.has('Space'), paw = k.has('KeyE') || k.has('KeyJ') || k.has('KeyK');

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const gx = dz(p.axes[0] ?? 0), gy = -dz(p.axes[1] ?? 0);
      const a = !!p.buttons[0]?.pressed, b = !!(p.buttons[2]?.pressed || p.buttons[1]?.pressed);
      if (Math.hypot(gx, gy) > 0 || a || b) this.device = 'gamepad';
      if (Math.hypot(gx, gy) > Math.hypot(mx, my)) { mx = gx; my = gy; }
      if (a && !this.padA) { this.jumpEdge = true; this.padEdge = true; }
      if (b && !this.padB) { this.pawEdge = true; this.padEdge = true; }
      jump ||= a; paw ||= b;
      this.padA = a; this.padB = b;
      // the right stick turns the view at the same speed whatever the frame rate
      this.lookX += dz(p.axes[2] ?? 0) * 540 * dt; this.lookY += dz(p.axes[3] ?? 0) * 360 * dt;
      break;
    }
    if (this.stickId !== null) { mx = this.touchX; my = this.touchY; }
    const l = Math.hypot(mx, my);
    if (l > 1) { mx /= l; my /= l; }
    this.moveX = mx; this.moveY = my;
    this.jumpHeld = jump || this.touchJump;
    this.pawHeld = paw || this.touchPaw;
  }
  takeJump() { const j = this.jumpEdge; this.jumpEdge = false; return j; }
  takePaw() { const p = this.pawEdge; this.pawEdge = false; return p; }
  /** Confirm was asked for since the last call. */
  takeAction(a: 'confirm') { const had = this.actions.has(a); this.actions.delete(a); return had; }
  /** A gamepad button went down since the last call (to start the game from the pad). */
  takePadPress() { const p = this.padEdge; this.padEdge = false; return p; }
  /** The look drag since the last call. The returned pair is reused every frame. */
  takeLook() { this.look[0] = this.lookX; this.look[1] = this.lookY; this.lookX = 0; this.lookY = 0; return this.look; }

  glyph(action: 'jump' | 'paw' | 'move') {
    const d = this.device;
    if (action === 'move') return d === 'keyboard' ? 'WASD' : d === 'gamepad' ? 'Stick' : '';
    if (action === 'jump') return d === 'keyboard' ? 'Space' : d === 'gamepad' ? 'A' : 'Jump';
    return d === 'keyboard' ? 'E' : d === 'gamepad' ? 'X' : 'Bap';
  }
}
