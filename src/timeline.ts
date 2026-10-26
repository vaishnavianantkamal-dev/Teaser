import { lerp, smoothstep } from '@/three/math';

/** One loop of the teaser, in seconds. */
export const CYCLE = 13.5;

/** Key moments in the loop (seconds). */
export const K = {
  revealEnd: 0.9,
  unscrewStart: 1.0,
  unscrewEnd: 2.2,
  liftEnd: 3.2,
  pourStart: 2.8,
  dropTime: 0.5,
  fillEnd: 9.0,
  pourStop: 9.1,
  returnStart: 9.7,
  returnEnd: 10.8,
  screwEnd: 11.7,
  exitStart: 12.6,
};

// `?t=5` starts the loop 5 s in — handy for jumping straight to the pour.
const START_OFFSET = Number(new URLSearchParams(window.location.search).get('t')) || 0;

/** Seconds into the current loop. */
export const loopTime = (elapsed: number) => (elapsed + START_OFFSET) % CYCLE;

/** 0..1 how far the front of the stream has fallen, and how far its tail has. */
export function streamState(t: number) {
  const head = smoothstep(K.pourStart, K.pourStart + K.dropTime, t);
  const tail = smoothstep(K.pourStop, K.pourStop + K.dropTime, t);
  return { head, tail };
}

/** Coffee level in the bottle photo's pixel rows: liquid floor, top of the straight body, full line in the neck. */
export const LIQUID = { bottom: 1190, shoulder: 330, full: 205 };

/**
 * Coffee level as a photo row. Constant flow, so the wide body fills slowly
 * and the narrow shoulder and neck catch up quickly at the end.
 */
export function fillRow(t: number) {
  const f = smoothstep(K.pourStart + K.dropTime, K.fillEnd, t);
  if (f < 0.85) return lerp(LIQUID.bottom, LIQUID.shoulder, f / 0.85);
  return lerp(LIQUID.shoulder, LIQUID.full, (f - 0.85) / 0.15);
}

/**
 * Bottle presence, 0..1: it materialises (scale + half spin) at the start of
 * each loop already empty, and dissolves away full at the end, so the loop
 * resets without ever showing the coffee vanish.
 */
export function presence(t: number) {
  const inn = smoothstep(0, K.revealEnd, t);
  const out = 1 - smoothstep(K.exitStart, CYCLE, t);
  return Math.min(inn, out);
}
