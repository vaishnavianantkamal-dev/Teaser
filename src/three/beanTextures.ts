import * as THREE from 'three';
import { mulberry32 } from './math';

/**
 * Texture set for a roasted coffee bean, laid out on the sphere UV wrap used
 * by `createBeanGeometry`: u runs around the bean, v from tip to tip, and the
 * centre crease is at u = 0.25.
 *
 *  - colour:    medium-roast brown with darker mottling, a near-black crease
 *               and the pale silverskin line that shows inside a real cut.
 *  - bump:      fine cellular pitting plus the crease, for the leathery,
 *               slightly wrinkled skin of a roasted bean.
 *  - roughness: mostly satin, glossier on the domed back, matte inside the cut.
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
  const du = px - CREASE_U * SIZE;
  const across = Math.exp(-(du * du) / (2 * halfWidthPx * halfWidthPx));
  const t = (py / SIZE) * 2 - 1; // -1 at one tip, +1 at the other
  const along = 1 - Math.pow(Math.abs(t), 4);
  return across * along;
}

export function buildBeanMaps(seed = 3): BeanMaps {
  const r = mulberry32(seed);

  // ---- colour ---------------------------------------------------------------
  const color = document.createElement('canvas');
  color.width = color.height = SIZE;
  const ctx = color.getContext('2d')!;

  // Base roast: warm mid-brown, slightly lighter around the middle of the bean.
  const base = ctx.createLinearGradient(0, 0, 0, SIZE);
  base.addColorStop(0, '#7a4220');
  base.addColorStop(0.5, '#9c5a2e');
  base.addColorStop(1, '#7a4220');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Mottling: overlapping translucent blotches, darker and lighter.
  for (let i = 0; i < 900; i++) {
    const x = r() * SIZE;
    const y = r() * SIZE;
    const rad = 3 + r() * 22;
    const dark = r() < 0.6;
    ctx.fillStyle = dark ? `rgba(52,24,10,${0.05 + r() * 0.12})` : `rgba(196,128,72,${0.04 + r() * 0.09})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rad, rad * (0.5 + r() * 0.8), r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Fine speckle for the porous roasted skin.
  for (let i = 0; i < 6000; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(40,18,8,0.22)' : 'rgba(210,150,95,0.14)';
    ctx.fillRect(r() * SIZE, r() * SIZE, 1 + r() * 2, 1 + r() * 2);
  }

  // Crease and silverskin, painted per pixel so they blend with the mottling.
  const img = ctx.getImageData(0, 0, SIZE, SIZE);
  const d = img.data;
  const rough = document.createElement('canvas');
  rough.width = rough.height = SIZE;
  const rctx = rough.getContext('2d')!;
  const rimg = rctx.createImageData(SIZE, SIZE);
  const bumpBase = new Float32Array(SIZE * SIZE);

  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      const i = (py * SIZE + px) * 4;
      const wide = creaseWeight(px, py, 13); // shadowed walls of the cut
      const slit = creaseWeight(px, py, 3.2); // the pale silverskin line at the bottom
      // Darken into the cut.
      const shade = 1 - wide * 0.78;
      let cr = d[i] * shade;
      let cg = d[i + 1] * shade;
      let cb = d[i + 2] * shade;
      // Silverskin: creamy, slightly translucent line down the centre.
      cr = cr + (222 - cr) * slit * 0.9;
      cg = cg + (188 - cg) * slit * 0.9;
      cb = cb + (140 - cb) * slit * 0.9;
      d[i] = cr;
      d[i + 1] = cg;
      d[i + 2] = cb;

      // Roughness: satin skin, glossier towards the back (u ≈ 0.75), matte in the cut.
      const u = px / SIZE;
      const back = 0.5 + 0.5 * Math.cos((u - 0.75) * Math.PI * 2);
      const rv = 0.55 - back * 0.12 + wide * 0.3;
      const rb = Math.round(Math.min(1, Math.max(0, rv)) * 255);
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = rb;
      rimg.data[i + 3] = 255;

      bumpBase[py * SIZE + px] = 0.5 - wide * 0.45 + slit * 0.15;
    }
  }
  ctx.putImageData(img, 0, 0);
  rctx.putImageData(rimg, 0, 0);

  // ---- bump -----------------------------------------------------------------
  const bump = document.createElement('canvas');
  bump.width = bump.height = SIZE;
  const bctx = bump.getContext('2d')!;
  const bimg = bctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const v = Math.round(bumpBase[i] * 255);
    bimg.data[i * 4] = bimg.data[i * 4 + 1] = bimg.data[i * 4 + 2] = v;
    bimg.data[i * 4 + 3] = 255;
  }
  bctx.putImageData(bimg, 0, 0);
  // Cellular pitting: many soft dark dimples with a bright rim on one side.
  const r2 = mulberry32(seed + 17);
  for (let i = 0; i < 2600; i++) {
    const x = r2() * SIZE;
    const y = r2() * SIZE;
    const rad = 1.5 + r2() * 5;
    bctx.fillStyle = `rgba(0,0,0,${0.12 + r2() * 0.22})`;
    bctx.beginPath();
    bctx.arc(x, y, rad, 0, Math.PI * 2);
    bctx.fill();
    bctx.fillStyle = `rgba(255,255,255,${0.08 + r2() * 0.14})`;
    bctx.beginPath();
    bctx.arc(x - rad * 0.4, y - rad * 0.4, rad * 0.55, 0, Math.PI * 2);
    bctx.fill();
  }
  // Soft wrinkles running along the bean.
  bctx.strokeStyle = 'rgba(0,0,0,0.12)';
  bctx.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    const x0 = r2() * SIZE;
    bctx.beginPath();
    bctx.moveTo(x0, 0);
    bctx.bezierCurveTo(x0 + (r2() - 0.5) * 60, SIZE * 0.33, x0 + (r2() - 0.5) * 60, SIZE * 0.66, x0 + (r2() - 0.5) * 30, SIZE);
    bctx.stroke();
  }

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
    clearcoat: 0.35,
    clearcoatRoughness: 0.4,
    envMapIntensity: 0.9,
  });
}
