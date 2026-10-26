import * as THREE from 'three';

/** Pixel row (in the 960×1280 teaser.webp) where the gold cap ends and the glass neck begins. */
export const CAP_CUT_ROW = 112;

/**
 * Removes the green studio backdrop from teaser.webp so the bottle can sit
 * on the live 3D scene. A flood fill from the image border only eats
 * connected backdrop pixels, so the green emblem inside the label (enclosed
 * by the black label and gold frame) is left untouched. The photographed
 * cap is cut away too; a real 3D cap replaces it so it can unscrew.
 */
export function cutoutBottle(image: HTMLImageElement | ImageBitmap) {
  const w = image.width;
  const h = image.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  const isBackdrop = (i: number) => {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    // Deep forest green: green clearly leads red, and it's not a bright highlight.
    return g - r > 7 && g >= b - 4 && r + g + b < 260;
  };

  const bg = new Uint8Array(w * h);
  const stack: number[] = [];
  const seed = (x: number, y: number) => {
    const p = y * w + x;
    if (!bg[p] && isBackdrop(p * 4)) {
      bg[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x, 0);
    seed(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    seed(0, y);
    seed(w - 1, y);
  }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) seed(x - 1, y);
    if (x < w - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y < h - 1) seed(x, y + 1);
  }

  // Hard mask → alpha. Also trim along the curved underside of the glass:
  // below it is only the photographed floor and its reflections, which read
  // as a muddy blob once the bottle sits on the 3D scene (a proper shadow is
  // drawn there instead).
  for (let p = 0; p < w * h; p++) {
    const x = p % w;
    const y = (p - x) / w;
    let a = bg[p] ? 0 : 255;
    if (a && y > 1150) {
      const u = (x - BASE.cx) / BASE.halfW;
      const edge = BASE.y - BASE.curve * u * u;
      a = Math.round(255 * Math.min(1, Math.max(0, (edge - y) / 2.5)));
    }
    d[p * 4 + 3] = a;
  }
  ctx.putImageData(img, 0, 0);

  // Feather the edge a touch so the silhouette doesn't look stencilled.
  const soft = document.createElement('canvas');
  soft.width = w;
  soft.height = h;
  const sctx = soft.getContext('2d')!;
  sctx.filter = 'blur(1.2px)';
  sctx.drawImage(canvas, 0, 0);
  sctx.filter = 'none';
  sctx.globalCompositeOperation = 'source-atop';
  sctx.drawImage(canvas, 0, 0);

  // The original photographed cap, cropped out so it can lift off on its own.
  const cap = document.createElement('canvas');
  cap.width = CAP_RECT.w;
  cap.height = CAP_RECT.h;
  cap.getContext('2d')!.drawImage(soft, CAP_RECT.x, CAP_RECT.y, CAP_RECT.w, CAP_RECT.h, 0, 0, CAP_RECT.w, CAP_RECT.h);

  // Bottle body without the cap.
  sctx.globalCompositeOperation = 'source-over';
  sctx.clearRect(0, 0, w, CAP_CUT_ROW);

  return { body: toTexture(soft), cap: toTexture(cap) };
}

/** Underside of the bottle in teaser.webp pixels: centre row, half-width and how far the edges curve up. */
export const BASE = { cx: 470, halfW: 185, y: 1208, curve: 20 };

/** Crop of the gold cap in teaser.webp pixels. */
export const CAP_RECT = { x: 340, y: 14, w: 276, h: CAP_CUT_ROW - 14 };

function toTexture(canvas: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}
