import * as THREE from 'three';

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Hermite smoothstep between two edges. */
export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** 0 before `a`, eases to 1 by `b`, holds, eases back to 0 between `c` and `d`. */
export function bump(p: number, a: number, b: number, c: number, d: number) {
  return smoothstep(a, b, p) * (1 - smoothstep(c, d, p));
}

/**
 * Piecewise keyframe track. Keys are `[progress, value]` pairs in ascending
 * order; values hold before the first and after the last key and ease with
 * smoothstep in between.
 */
export function track(p: number, keys: ReadonlyArray<readonly [number, number]>) {
  if (p <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [p1, v1] = keys[i];
    if (p <= p1) {
      const [p0, v0] = keys[i - 1];
      return lerp(v0, v1, smoothstep(p0, p1, p));
    }
  }
  return keys[keys.length - 1][1];
}

/** Frame-rate independent exponential damping (wraps three's helper). */
export const damp = THREE.MathUtils.damp;

/** Interpolates through a list of hex colours at evenly spaced stops across 0..1. */
export function colorTrack(t: number, colors: readonly string[], out: THREE.Color) {
  const clamped = clamp01(t);
  const segments = colors.length - 1;
  const scaled = clamped * segments;
  const i = Math.min(segments - 1, Math.floor(scaled));
  const localT = scaled - i;
  out.set(colors[i]).lerp(_colorScratch.set(colors[i + 1]), localT);
  return out;
}
const _colorScratch = new THREE.Color();

/** Small seeded PRNG so particle layouts are stable between renders. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mutable number holder shared between the DOM scroll driver and the scene. */
export type NumRef = { current: number };
