import * as THREE from 'three';

/**
 * 3D model of the Coffee Science bottle, measured off the product photo
 * (teaser.webp, 960×1280): every size below is in photo pixels, so the
 * model has exactly the photo's proportions. Local space has y = 0 at the
 * underside of the glass and the bottle's axis on y.
 */

/** Bottle height on screen, world units per photo pixel. */
export const BOTTLE_H = 2.95;
export const PX = BOTTLE_H / 1280;

/** Photo row of the underside of the glass. */
export const BASE_ROW = 1208;

/** Photo row → local height. */
export const ly = (row: number) => (BASE_ROW - row) * PX;

/**
 * Outer silhouette, [radius, row] from the base up to the lip. Body Ø 432
 * px, shoulder from row ~400, neck Ø 224 px, rolled lip at the top.
 */
const OUTER: ReadonlyArray<readonly [number, number]> = [
  [0, 1208],
  [150, 1207],
  [195, 1203],
  [208, 1196],
  [214, 1185],
  // Straight body, sampled densely so the flutes can stop crisply at the label edges.
  ...Array.from({ length: 64 }, (_, i) => [216, 1165 - i * 12] as const),
  [214, 370],
  [205, 340],
  [185, 305],
  [160, 280],
  [135, 262],
  [120, 250],
  [114, 235],
  [112, 210],
  [112, 150],
  [114, 135],
  [118, 128],
  [118, 118],
  [114, 113],
  [108, 112],
];
/** Inner lip, so the open neck shows real glass thickness. */
const LIP_INSIDE: ReadonlyArray<readonly [number, number]> = [
  [100, 114],
  [100, 150],
];

/** Outer radius (px) at a given photo row. */
export function outerRadius(row: number) {
  for (let i = 1; i < OUTER.length; i++) {
    const [r0, y0] = OUTER[i - 1];
    const [r1, y1] = OUTER[i];
    if (row <= y0 && row >= y1) return r0 + ((r1 - r0) * (y0 - row)) / (y0 - y1 || 1);
  }
  return OUTER[OUTER.length - 1][0];
}

/** Glass wall thickness (px); the base is thicker. */
const WALL = 10;
export const innerRadius = (row: number) => Math.max(0, outerRadius(row) - WALL);

/** The label: photo crop, arched top/bottom, and its angular half-width on the body. */
export const LABEL = { x: 325, w: 305, top: 432, bottom: 1088, arch: 70, radius: 218 };
export const LABEL_THETA = Math.asin(LABEL.w / 2 / LABEL.radius);

/** The gold screw cap, from the photo. */
// (top starts below the photographed cap's top face, which is drawn as its own gold disc)
export const CAP = { x: 355, w: 245, top: 40, bottom: 108 };
export const CAP_R = (CAP.w / 2) * PX;
export const CAP_H = (CAP.bottom - CAP.top) * PX;
export const CAP_Y = ly((CAP.top + CAP.bottom) / 2);

/** Top of the neck (where the stream enters). */
export const MOUTH_Y = ly(112);

/**
 * Ribbed (fluted) glass: a lathe of the silhouette with vertical flutes
 * pressed into the body and shoulder, smooth behind the label like the real
 * bottle.
 */
export function createGlassGeometry(flutes = 32, segmentsPerFlute = 6) {
  const pts = [...OUTER, ...LIP_INSIDE].map(([r, row]) => new THREE.Vector2(r * PX, ly(row)));
  const geo = new THREE.LatheGeometry(pts, flutes * segmentsPerFlute);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const amp = 6 * PX;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-5) continue;
    const row = BASE_ROW - y / PX;
    // Only on the outer wall, fading in above the base and out over the shoulder.
    if (row > 1190 || row < 300) continue;
    const ends = smooth(1190, 1150, row) * smooth(300, 345, row);
    const phi = Math.atan2(x, z);
    // Smooth (no flutes) behind the label, so it sits flat on the glass.
    const besideLabel = smooth(LABEL_THETA + 0.02, LABEL_THETA + 0.12, Math.abs(phi));
    const aboveOrBelow = Math.max(smooth(LABEL.top - 4, LABEL.top - 22, row), smooth(LABEL.bottom + 4, LABEL.bottom + 22, row));
    const underLabel = Math.max(besideLabel, aboveOrBelow);
    const flute = 0.5 + 0.5 * Math.cos(phi * flutes);
    const k = (r + amp * flute * ends * underLabel) / r;
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/** The coffee inside: a lathe of the inner wall, cut to the fill level with a clipping plane. */
export function createLiquidGeometry() {
  const rows: number[] = [];
  for (let row = 1192; row >= 140; row -= 8) rows.push(row);
  const pts = [new THREE.Vector2(0, ly(1192)), ...rows.map((row) => new THREE.Vector2(innerRadius(row) * PX, ly(row)))];
  const geo = new THREE.LatheGeometry(pts, 64);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Label wrapped on the body. Each vertex samples the photo at the point
 * that sits in front of it, so from the front it looks exactly like the
 * photographed label, and it curves away correctly as the bottle turns.
 */
export function createLabelGeometry(columns = 48) {
  const R = LABEL.radius * PX;
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  const rows = [LABEL.top, LABEL.bottom];
  for (let j = 0; j < rows.length; j++) {
    for (let i = 0; i <= columns; i++) {
      const theta = -LABEL_THETA + (2 * LABEL_THETA * i) / columns;
      positions.push(R * Math.sin(theta), ly(rows[j]), R * Math.cos(theta));
      uvs.push(0.5 + (0.5 * Math.sin(theta)) / Math.sin(LABEL_THETA), j === 0 ? 1 : 0);
    }
  }
  for (let i = 0; i < columns; i++) {
    const a = i;
    const b = i + 1;
    const c = columns + 1 + i;
    const d = columns + 2 + i;
    index.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/** Cap side: open cylinder whose texture is the photographed cap, reprojected the same way as the label. */
export function createCapSideGeometry() {
  const geo = new THREE.CylinderGeometry(CAP_R, CAP_R, CAP_H, 96, 1, true);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const phi = Math.atan2(pos.getX(i), pos.getZ(i));
    uv.setX(i, 0.5 + 0.5 * Math.sin(phi));
  }
  return geo;
}

/** Label and cap textures cropped from the product photo. */
export function cropPhotoTextures(image: HTMLImageElement | ImageBitmap) {
  // Label, with its arched top and bottom cut out as alpha.
  const label = document.createElement('canvas');
  label.width = LABEL.w;
  label.height = LABEL.bottom - LABEL.top;
  const lctx = label.getContext('2d', { willReadFrequently: true })!;
  lctx.drawImage(image, LABEL.x, LABEL.top, label.width, label.height, 0, 0, label.width, label.height);
  const img = lctx.getImageData(0, 0, label.width, label.height);
  for (let y = 0; y < label.height; y++) {
    for (let x = 0; x < label.width; x++) {
      const u = (x - label.width / 2) / (label.width / 2);
      const arch = LABEL.arch * u * u;
      const row = y + LABEL.top;
      const inside = Math.min(row - (LABEL.top + arch), LABEL.bottom - arch - row);
      img.data[(y * label.width + x) * 4 + 3] = Math.round(255 * Math.min(1, Math.max(0, inside / 1.5)));
    }
  }
  lctx.putImageData(img, 0, 0);

  const cap = document.createElement('canvas');
  cap.width = CAP.w;
  cap.height = CAP.bottom - CAP.top;
  cap.getContext('2d')!.drawImage(image, CAP.x, CAP.top, cap.width, cap.height, 0, 0, cap.width, cap.height);

  return { label: toTexture(label), cap: toTexture(cap) };
}

function toTexture(canvas: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** 0 at a, 1 at b, smooth in between (works for a > b too). */
function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
