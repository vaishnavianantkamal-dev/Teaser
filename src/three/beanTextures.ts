import * as THREE from 'three';
import { CREASE_S } from './beanGeometry';
import { mulberry32 } from './math';

/**
 * Texture set for a roasted coffee bean, laid out on the sphere UV wrap used
 * by `createBeanGeometry`: u runs around the bean, v from tip to tip, and the
 * centre crease is at u = 0.25.
 *
 *  - colour:    medium-roast brown with darker mottling, a near-black crease
 *               and the pale silverskin line that shows inside a real cut.
 *  - bump:      a dense network of fine crinkles plus the crease, for the
 *               wrinkled skin of a roasted bean (finer than the colour map).
 *  - roughness: oily and glossy on the ridges, duller down in the crinkles
 *               and inside the cut, so highlights break into small glints.
 */
export type BeanMaps = {
  color: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
};

const SIZE = 512;
const CREASE_U = 0.25;

function makeTexture(canvas: HTMLCanvasElement, srgb: boolean) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** Crease strength at a given texture pixel, 0..1: strongest at u = 0.25, fading towards the tips. */
function creaseWeight(px: number, py: number, halfWidthPx: number) {
  const t = (py / SIZE) * 2 - 1; // -1 at one tip, +1 at the other
  // Same gentle S as the geometry's crease (texture v runs opposite to its y).
  const sway = -((CREASE_S * SIZE) / (2 * Math.PI)) * Math.sin(Math.PI * t);
  const du = px - CREASE_U * SIZE - sway;
  const across = Math.exp(-(du * du) / (2 * halfWidthPx * halfWidthPx));
  const along = 1 - Math.pow(Math.abs(t), 4);
  return across * along;
}

/**
 * Crinkled roasted-bean skin as a 0..1 height field (size²): sharp, narrow
 * creases between soft puckered cells. Ridged value noise, domain-warped so
 * the wrinkles meander, and periodic across u so it wraps round the bean
 * without a seam. Texture u runs round the bean (the longer distance), so it
 * gets more cells than v to keep the crinkles roughly round.
 */
function wrinkleField(size: number, seed: number) {
  const salt = Math.imul(seed + 1, 0x9e3779b1);
  const hash = (x: number, y: number) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ salt;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  // Smooth value noise, wrapping every `period` cells in x.
  const noise = (x: number, y: number, period: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const x0 = ((ix % period) + period) % period;
    const x1 = (x0 + 1) % period;
    const a = hash(x0, iy);
    const b = hash(x1, iy);
    const c = hash(x0, iy + 1);
    const d = hash(x1, iy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };

  const CX = 40;
  const CY = 26;
  const octaves = [
    { f: 1, amp: 1 },
    { f: 2, amp: 0.65 },
    { f: 4, amp: 0.4 },
  ];
  const total = octaves.reduce((t, o) => t + o.amp, 0);
  const out = new Float32Array(size * size);
  for (let py = 0; py < size; py++) {
    const v = py / size;
    for (let px = 0; px < size; px++) {
      const u = px / size;
      const wx = (noise(u * 6, v * 4, 6) - 0.5) * 2.4;
      const wy = (noise(u * 6 + 17.3, v * 4 + 9.1, 6) - 0.5) * 2.4;
      let h = 0;
      for (const o of octaves) {
        const n = noise((u * CX + wx) * o.f, (v * CY + wy) * o.f, CX * o.f);
        // Ridged: 0 along a sharp crease, rising to 1 across the cell.
        const ridge = Math.abs(2 * n - 1);
        h += o.amp * Math.sqrt(ridge);
      }
      out[py * size + px] = h / total;
    }
  }
  return out;
}

export function buildBeanMaps(seed = 3, bumpSize = 1024): BeanMaps {
  const r = mulberry32(seed);
  const skin = wrinkleField(bumpSize, seed);
  const skinStep = bumpSize / SIZE;
  /** Crinkle height at a colour-map pixel. */
  const skinAt = (px: number, py: number) => skin[Math.floor(py * skinStep) * bumpSize + Math.floor(px * skinStep)];

  // ---- colour ---------------------------------------------------------------
  const color = document.createElement('canvas');
  color.width = color.height = SIZE;
  const ctx = color.getContext('2d')!;

  // Base roast: warm reddish brown, a touch lighter around the middle and
  // darker at the tips, which roast faster.
  const base = ctx.createLinearGradient(0, 0, 0, SIZE);
  base.addColorStop(0, '#4a2212');
  base.addColorStop(0.5, '#74391c');
  base.addColorStop(1, '#4a2212');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Mottling: overlapping translucent blotches, darker and lighter.
  for (let i = 0; i < 900; i++) {
    const x = r() * SIZE;
    const y = r() * SIZE;
    const rad = 3 + r() * 22;
    const dark = r() < 0.6;
    ctx.fillStyle = dark ? `rgba(40,15,5,${0.06 + r() * 0.14})` : `rgba(165,90,48,${0.04 + r() * 0.1})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rad, rad * (0.5 + r() * 0.8), r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Fine speckle for the porous roasted skin.
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = r() < 0.55 ? 'rgba(32,12,4,0.22)' : 'rgba(176,104,60,0.12)';
    ctx.fillRect(r() * SIZE, r() * SIZE, 1 + r() * 2, 1 + r() * 2);
  }
  // Faint streaks along the length, following the bean's grain.
  for (let i = 0; i < 70; i++) {
    const x0 = r() * SIZE;
    ctx.strokeStyle = r() < 0.6 ? `rgba(36,14,5,${0.04 + r() * 0.07})` : `rgba(160,90,50,${0.03 + r() * 0.05})`;
    ctx.lineWidth = 1 + r() * 3;
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.bezierCurveTo(x0 + (r() - 0.5) * 40, SIZE * 0.33, x0 + (r() - 0.5) * 40, SIZE * 0.66, x0 + (r() - 0.5) * 20, SIZE);
    ctx.stroke();
  }

  // Crease and silverskin, painted per pixel so they blend with the mottling.
  const img = ctx.getImageData(0, 0, SIZE, SIZE);
  const d = img.data;
  const rough = document.createElement('canvas');
  rough.width = rough.height = SIZE;
  const rctx = rough.getContext('2d')!;
  const rimg = rctx.createImageData(SIZE, SIZE);
  const bumpBase = new Float32Array(SIZE * SIZE);

  // The silverskin isn't a clean stripe: it wanders a pixel or two and is
  // torn in places. A smoothed random walk per row gives both.
  const jitter = new Float32Array(SIZE);
  const torn = new Float32Array(SIZE);
  for (let py = 1, j = 0, k = 1; py < SIZE; py++) {
    j = Math.max(-2.5, Math.min(2.5, j * 0.9 + (r() - 0.5) * 1.6));
    k = Math.max(0.25, Math.min(1, k * 0.85 + 0.15 * (0.2 + r() * 1.1) + (r() - 0.5) * 0.25));
    jitter[py] = j;
    torn[py] = k;
  }

  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      const i = (py * SIZE + px) * 4;
      const wide = creaseWeight(px, py, 7); // shadowed walls of the cut
      const slit = creaseWeight(px - jitter[py], py, 3) * torn[py]; // golden silverskin at the bottom
      // Darken into the cut, and a little down in each crinkle.
      const crinkle = 1 - skinAt(px, py);
      const shade = (1 - wide * 0.85) * (1 - crinkle * 0.3);
      let cr = d[i] * shade;
      let cg = d[i + 1] * shade;
      let cb = d[i + 2] * shade;
      // Silverskin: the golden chaff line showing inside the cut.
      cr = cr + (218 - cr) * slit * 0.9;
      cg = cg + (166 - cg) * slit * 0.9;
      cb = cb + (92 - cb) * slit * 0.9;
      d[i] = cr;
      d[i + 1] = cg;
      d[i + 2] = cb;

      // Roughness: oily and glossy on the ridges (most of all on the back,
      // u ≈ 0.75), duller down in the crinkles and matte inside the cut.
      const u = px / SIZE;
      const back = 0.5 + 0.5 * Math.cos((u - 0.75) * Math.PI * 2);
      const rv = 0.32 - back * 0.08 + crinkle * 0.3 + wide * 0.35 + (r() - 0.5) * 0.08;
      const rb = Math.round(Math.min(1, Math.max(0, rv)) * 255);
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = rb;
      rimg.data[i + 3] = 255;

      bumpBase[py * SIZE + px] = 0.5 - wide * 0.45 + slit * 0.15;
    }
  }
  ctx.putImageData(img, 0, 0);
  rctx.putImageData(rimg, 0, 0);

  // ---- bump -----------------------------------------------------------------
  // Crinkled skin, with the crease (from the colour pass) carved into it.
  const bump = document.createElement('canvas');
  bump.width = bump.height = bumpSize;
  const bctx = bump.getContext('2d')!;
  const bimg = bctx.createImageData(bumpSize, bumpSize);
  for (let py = 0; py < bumpSize; py++) {
    // Fade the crinkles out at the very tips, where the UV wrap pinches to a
    // point and would bunch them into a star.
    const tips = Math.min(1, Math.sin((Math.PI * (py + 0.5)) / bumpSize) * 4);
    for (let px = 0; px < bumpSize; px++) {
      const p = py * bumpSize + px;
      const crease = bumpBase[Math.floor(py / skinStep) * SIZE + Math.floor(px / skinStep)];
      const v = Math.round(Math.min(1, Math.max(0, crease + (skin[p] - 0.6) * 0.55 * tips)) * 255);
      bimg.data[p * 4] = bimg.data[p * 4 + 1] = bimg.data[p * 4 + 2] = v;
      bimg.data[p * 4 + 3] = 255;
    }
  }
  bctx.putImageData(bimg, 0, 0);

  return {
    color: makeTexture(color, true),
    bump: makeTexture(bump, false),
    roughness: makeTexture(rough, false),
  };
}

/** Physically based roasted-bean material sharing one texture set. */
export function createBeanMaterial(maps: BeanMaps, bumpScale = 0.02) {
  return new THREE.MeshPhysicalMaterial({
    map: maps.color,
    bumpMap: maps.bump,
    bumpScale,
    roughnessMap: maps.roughness,
    roughness: 1,
    metalness: 0,
    // The oily sheen comes from the low roughness, not a clearcoat: three.js
    // doesn't apply the bump map to the clearcoat layer, so it would lay a
    // smooth plastic-looking gloss over the crinkles.
    envMapIntensity: 1.1,
  });
}
