import * as THREE from 'three';
import { mulberry } from './sky';

// Small painted textures, drawn once on canvases. White-ish so the material colour tints them,
// soft-edged like gouache rather than photo detail (Oga: render small things, not everything).

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Dry-stone wall: rounded stones of slightly different tones, darker mortar, moss along the bottom. */
export function stoneTex() {
  return canvas(256, 256, (g) => {
    const r = mulberry(11);
    g.fillStyle = '#8f8a8c'; g.fillRect(0, 0, 256, 256);
    let y = 0;
    while (y < 256) {
      const rowH = 26 + r() * 18;
      let x = -r() * 40;
      while (x < 256) {
        const w = 34 + r() * 40;
        const tone = 225 + Math.floor(r() * 30);
        const warm = Math.floor(r() * 10);
        g.fillStyle = `rgb(${tone},${tone - 4 - warm},${tone - 14 - warm})`;
        roundRect(g, x + 2, y + 2, w - 4, rowH - 4, 9);
        // the soft shade at the bottom of each stone
        const gr = g.createLinearGradient(0, y, 0, y + rowH);
        gr.addColorStop(0.55, 'rgba(90,80,120,0)'); gr.addColorStop(1, 'rgba(90,80,120,0.22)');
        g.fillStyle = gr; roundRect(g, x + 2, y + 2, w - 4, rowH - 4, 9);
        // wrap around so the texture tiles
        if (x + w > 256) { g.fillStyle = `rgb(${tone},${tone - 4 - warm},${tone - 14 - warm})`; roundRect(g, x - 256 + 2, y + 2, w - 4, rowH - 4, 9); }
        x += w;
      }
      y += rowH;
    }
    // lichen flecks
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(185,196,154,${0.35 + r() * 0.3})`; g.beginPath(); g.arc(r() * 256, r() * 256, 1 + r() * 3, 0, 7); g.fill(); }
  });
}

/** Clay roof tiles: rows of rounded barrel tiles, each row casting a soft shadow on the one below.
 *  One repeat is one metre: four courses of eight tiles, big enough to read cleanly from the camera. */
export function tileTex() {
  return canvas(256, 256, (g) => {
    const r = mulberry(3);
    const TW = 32, CH = 64;
    g.fillStyle = 'rgb(150,112,112)'; g.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 4; row++) {
      const y = row * CH, off = (row % 2) * (TW / 2);
      for (let i = -1; i < 9; i++) {
        const x = i * TW + off;
        const tone = 222 + Math.floor(r() * 30);
        // a barrel tile: light down the middle, darker toward both edges
        const gr = g.createLinearGradient(x, 0, x + TW, 0);
        gr.addColorStop(0, `rgb(${tone - 52},${tone - 74},${tone - 78})`);
        gr.addColorStop(0.45, `rgb(${tone},${tone - 12},${tone - 18})`);
        gr.addColorStop(0.6, `rgb(${tone},${tone - 12},${tone - 18})`);
        gr.addColorStop(1, `rgb(${tone - 40},${tone - 62},${tone - 66})`);
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(x + 1, y); g.lineTo(x + TW - 1, y); g.lineTo(x + TW - 1, y + CH - 8);
        g.quadraticCurveTo(x + TW / 2, y + CH + 2, x + 1, y + CH - 8); g.closePath(); g.fill();
      }
      // the next course overlaps this one: a soft shadow under its lower edge
      const sh = g.createLinearGradient(0, y, 0, y + 14);
      sh.addColorStop(0, 'rgba(70,40,70,0.45)'); sh.addColorStop(1, 'rgba(70,40,70,0)');
      g.fillStyle = sh; g.fillRect(0, y, 256, 14);
    }
  });
}

/** Weathered planks with grain and a few knots. */
export function plankTex() {
  return canvas(128, 128, (g) => {
    const r = mulberry(8);
    for (let i = 0; i < 4; i++) {
      const tone = 220 + Math.floor(r() * 30);
      g.fillStyle = `rgb(${tone},${tone - 8},${tone - 18})`; g.fillRect(i * 32, 0, 32, 128);
      g.strokeStyle = 'rgba(110,80,70,0.18)'; g.lineWidth = 1;
      for (let k = 0; k < 6; k++) { g.beginPath(); const x = i * 32 + 3 + r() * 26; g.moveTo(x, 0); g.bezierCurveTo(x + 3, 40, x - 3, 80, x + 1, 128); g.stroke(); }
      g.fillStyle = 'rgba(90,60,60,0.45)'; g.fillRect(i * 32, 0, 1.5, 128);
      if (r() < 0.6) { g.fillStyle = 'rgba(100,70,60,0.35)'; g.beginPath(); g.ellipse(i * 32 + 16, r() * 128, 2.5, 4, 0, 0, 7); g.fill(); }
    }
  });
}

/** Lime plaster: soft blotches and a few cracks, darker toward the ground. */
export function plasterTex() {
  return canvas(256, 256, (g) => {
    const r = mulberry(21);
    g.fillStyle = '#fbf6ee'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(${200 + r() * 40},${190 + r() * 40},${190 + r() * 50},0.12)`;
      g.beginPath(); g.arc(r() * 256, r() * 256, 10 + r() * 30, 0, 7); g.fill();
    }
    g.strokeStyle = 'rgba(150,130,140,0.25)'; g.lineWidth = 1;
    for (let i = 0; i < 4; i++) { let x = r() * 256, y = r() * 256; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 20; y += 6 + r() * 8; g.lineTo(x, y); } g.stroke(); }
  });
}

/** Stepping stone top: pale stone with a moss rim. Not repeating. */
export function flagTex() {
  return canvas(128, 128, (g) => {
    const r = mulberry(4);
    g.fillStyle = '#efe8d8'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(160,150,170,${0.08 + r() * 0.08})`; g.beginPath(); g.arc(r() * 128, r() * 128, 4 + r() * 12, 0, 7); g.fill(); }
    const gr = g.createRadialGradient(64, 64, 40, 64, 64, 64);
    gr.addColorStop(0, 'rgba(134,166,90,0)'); gr.addColorStop(1, 'rgba(134,166,90,0.7)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }, false);
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.fill();
}

/** Scale a box's UVs so a texture keeps its size in metres on every face (1 repeat = `unit` metres). */
export function boxUV(geo: THREE.BufferGeometry, w: number, h: number, d: number, unit = 1) {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute, n = geo.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    const [su, sv] = nx > 0.5 ? [d, h] : ny > 0.5 ? [w, d] : [w, h];
    uv.setXY(i, (uv.getX(i) * su) / unit, (uv.getY(i) * sv) / unit);
  }
  return geo;
}
