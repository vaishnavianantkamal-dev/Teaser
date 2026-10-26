import * as THREE from 'three';

/** Canvas-generated radial gradient, used for glows and soft shadows. */
export function radialTexture(stops: Array<[number, string]>, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [offset, color] of stops) g.addColorStop(offset, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export const softShadow = () =>
  radialTexture([
    [0, 'rgba(0,0,0,0.8)'],
    [0.45, 'rgba(0,0,0,0.3)'],
    [1, 'rgba(0,0,0,0)'],
  ]);

export const goldGlow = () =>
  radialTexture(
    [
      [0, 'rgba(212,175,106,0.9)'],
      [0.3, 'rgba(160,110,50,0.35)'],
      [1, 'rgba(0,0,0,0)'],
    ],
    256,
  );
