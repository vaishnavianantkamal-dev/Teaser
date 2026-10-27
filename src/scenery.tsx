import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mulberry32 } from '@/three/math';
import { radialTexture } from '@/three/textures';

/**
 * Set dressing around the bottle: the dark stone it stands on, coffee leaves
 * resting on the stone, a ribbon of cold brew that swirls up round the bottle
 * once it's full (throwing off spray), and coffee droplets drifting in the air.
 *
 * Everything is placed relative to `topY` (the stone's top surface, where the
 * bottle's base sits) and `x` (the bottle's centre line).
 */

// ---- stone ------------------------------------------------------------------

const STONE = { rx: 2.0, rz: 0.95, h: 1.6 };

function canvasTexture(canvas: HTMLCanvasElement, srgb: boolean, repeat: [number, number] = [1, 1]) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** Dark slate: charcoal-brown with grain and pits, satin with a few damp, glossier patches. */
function stoneMaps() {
  const S = 512;
  const r = mulberry32(21);
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    return [c, c.getContext('2d')!] as const;
  };
  const blots = (ctx: CanvasRenderingContext2D, n: number, rMin: number, rMax: number, style: () => string) => {
    for (let i = 0; i < n; i++) {
      const rad = rMin + r() * (rMax - rMin);
      ctx.fillStyle = style();
      ctx.beginPath();
      ctx.ellipse(r() * S, r() * S, rad, rad * (0.4 + r() * 0.8), r() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const [color, cctx] = mk();
  cctx.fillStyle = '#121110';
  cctx.fillRect(0, 0, S, S);
  blots(cctx, 700, 4, 46, () => (r() < 0.65 ? `rgba(6,6,6,${0.1 + r() * 0.25})` : `rgba(60,56,52,${0.04 + r() * 0.08})`));
  blots(cctx, 9000, 0.5, 1.8, () => (r() < 0.5 ? 'rgba(130,120,108,0.25)' : 'rgba(0,0,0,0.35)'));

  const [bump, bctx] = mk();
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, S, S);
  blots(bctx, 900, 3, 14, () => (r() < 0.5 ? `rgba(0,0,0,${0.08 + r() * 0.2})` : `rgba(255,255,255,${0.06 + r() * 0.16})`));
  blots(bctx, 12000, 0.5, 2, () => (r() < 0.6 ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.3)'));

  const [rough, rctx] = mk();
  rctx.fillStyle = '#f0f0f0';
  rctx.fillRect(0, 0, S, S);
  blots(rctx, 60, 10, 50, () => `rgba(150,150,150,${0.2 + r() * 0.3})`);

  return {
    color: canvasTexture(color, true, [2, 1]),
    bump: canvasTexture(bump, false, [2, 1]),
    roughness: canvasTexture(rough, false, [2, 1]),
  };
}

/** A flat-topped slab with an irregular, chipped outline and slightly rounded top edge. */
function stoneGeometry() {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 96, 10, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i); // -0.5 .. 0.5
    const z = pos.getZ(i);
    const th = Math.atan2(z, x);
    // Irregular outline, plus rougher chipping down the sides.
    const side = 0.5 - y; // 0 at the top
    let k =
      1 +
      0.07 * Math.sin(3 * th + 1.1) +
      0.04 * Math.sin(5 * th + 2.3) +
      0.02 * Math.sin(11 * th + 0.4) +
      side * (0.03 * Math.sin(17 * th + 9 * y) + 0.02 * Math.sin(29 * th - 5 * y));
    // Rounded top edge; the bottom flares out a little.
    const fromTop = (0.5 - y) * STONE.h;
    if (fromTop < 0.12) k *= 1 - ((0.12 - fromTop) / 0.12) ** 2 * 0.05;
    k *= 1 + side * 0.04;
    // Caps share the same function, so their rim meets the sides exactly.
    pos.setXYZ(i, x * k * STONE.rx, y * STONE.h, z * k * STONE.rz);
  }
  geo.computeVertexNormals();
  return geo;
}

export function Stone({ x, topY }: { x: number; topY: number }) {
  // On narrow (phone) screens, slim the slab so its rocky ends stay in frame
  // and it still reads as a stone rather than a floor.
  const { viewport } = useThree();
  const fitX = Math.min(1, (viewport.width * 0.5 * 0.88) / STONE.rx);
  const geometry = useMemo(() => stoneGeometry(), []);
  const maps = useMemo(() => stoneMaps(), []);
  const contact = useMemo(
    () =>
      radialTexture([
        [0, 'rgba(0,0,0,0.85)'],
        [0.5, 'rgba(0,0,0,0.45)'],
        [1, 'rgba(0,0,0,0)'],
      ]),
    [],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      maps.color.dispose();
      maps.bump.dispose();
      maps.roughness.dispose();
      contact.dispose();
    },
    [geometry, maps, contact],
  );

  return (
    <group position={[x, topY, 0]}>
      <mesh geometry={geometry} position={[0, -STONE.h / 2, 0]} scale={[fitX, 1, 1]}>
        <meshStandardMaterial
          map={maps.color}
          bumpMap={maps.bump}
          bumpScale={0.5}
          roughnessMap={maps.roughness}
          roughness={1}
          metalness={0}
          envMapIntensity={0.12}
        />
      </mesh>
      {/* Contact shadow where the bottle stands on the stone. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} scale={[1.15, 0.55, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={contact} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

// ---- leaves -----------------------------------------------------------------

const LEAF_W = 256;
const LEAF_H = 512;

/**
 * Coffee leaf texture set (u across the leaf, v from base to tip; canvas
 * bottom is the base):
 *  - colour:    deep waxy green with uneven tone, darker veins and edges.
 *  - bump:      veins sunk into the blade, the blade puckered between them,
 *               and a scatter of raised water drops.
 *  - roughness: waxy and glossy, the water drops glossiest of all.
 */
function leafMaps() {
  const r = mulberry32(8);
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = LEAF_W;
    c.height = LEAF_H;
    return [c, c.getContext('2d')!] as const;
  };
  const cx = LEAF_W / 2;
  // Vein layout, shared by every map: [start y, side, end x, end y, bend].
  const veins: Array<[number, number, number, number, number]> = [];
  for (let k = 0; k < 10; k++) {
    const y0 = LEAF_H - 45 - k * 42 - r() * 10;
    for (const side of [-1, 1]) veins.push([y0, side, cx + side * (95 + r() * 25), y0 - 70 - r() * 30, 40 + r() * 30]);
  }
  const drawVeins = (ctx: CanvasRenderingContext2D, style: string, side: number, mid: number) => {
    ctx.strokeStyle = style;
    ctx.lineCap = 'round';
    ctx.lineWidth = side;
    for (const [y0, s, x1, y1, bend] of veins) {
      ctx.beginPath();
      ctx.moveTo(cx, y0);
      ctx.quadraticCurveTo(cx + s * bend, y0 - 18, x1, y1);
      ctx.stroke();
    }
    ctx.lineWidth = mid;
    ctx.beginPath();
    ctx.moveTo(cx, LEAF_H);
    ctx.lineTo(cx, 6);
    ctx.stroke();
  };
  const drops = Array.from({ length: 34 }, () => ({ x: 20 + r() * (LEAF_W - 40), y: 40 + r() * (LEAF_H - 90), rad: 2 + Math.pow(r(), 2) * 7 }));

  // Colour.
  const [color, cctx] = mk();
  const g = cctx.createLinearGradient(0, LEAF_H, 0, 0);
  g.addColorStop(0, '#16300f');
  g.addColorStop(0.45, '#1f4216');
  g.addColorStop(1, '#1a3812');
  cctx.fillStyle = g;
  cctx.fillRect(0, 0, LEAF_W, LEAF_H);
  for (let i = 0; i < 260; i++) {
    const rad = 6 + r() * 30;
    cctx.fillStyle = r() < 0.5 ? `rgba(8,20,5,${0.05 + r() * 0.1})` : `rgba(70,95,35,${0.03 + r() * 0.07})`;
    cctx.beginPath();
    cctx.ellipse(r() * LEAF_W, r() * LEAF_H, rad, rad * 0.7, r() * Math.PI, 0, Math.PI * 2);
    cctx.fill();
  }
  // Darker towards the edges, a touch lighter along the middle.
  const edge = cctx.createLinearGradient(0, 0, LEAF_W, 0);
  edge.addColorStop(0, 'rgba(5,12,3,0.45)');
  edge.addColorStop(0.3, 'rgba(0,0,0,0)');
  edge.addColorStop(0.7, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(5,12,3,0.45)');
  cctx.fillStyle = edge;
  cctx.fillRect(0, 0, LEAF_W, LEAF_H);
  drawVeins(cctx, 'rgba(105,130,60,0.22)', 1.5, 3.5);

  // Bump.
  const [bump, bctx] = mk();
  bctx.fillStyle = '#9a9a9a';
  bctx.fillRect(0, 0, LEAF_W, LEAF_H);
  for (let i = 0; i < 900; i++) {
    const rad = 3 + r() * 9;
    bctx.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.08})`;
    bctx.beginPath();
    bctx.arc(r() * LEAF_W, r() * LEAF_H, rad, 0, Math.PI * 2);
    bctx.fill();
  }
  drawVeins(bctx, 'rgba(20,20,20,0.75)', 3, 6);
  for (const d of drops) {
    const dg = bctx.createRadialGradient(d.x - d.rad * 0.3, d.y - d.rad * 0.3, 0, d.x, d.y, d.rad);
    dg.addColorStop(0, '#ffffff');
    dg.addColorStop(0.7, '#e0e0e0');
    dg.addColorStop(1, 'rgba(154,154,154,0)');
    bctx.fillStyle = dg;
    bctx.beginPath();
    bctx.arc(d.x, d.y, d.rad, 0, Math.PI * 2);
    bctx.fill();
  }

  // Roughness.
  const [rough, rctx] = mk();
  rctx.fillStyle = '#6a6a6a';
  rctx.fillRect(0, 0, LEAF_W, LEAF_H);
  drawVeins(rctx, '#909090', 3, 6);
  rctx.fillStyle = '#141414';
  for (const d of drops) {
    rctx.beginPath();
    rctx.arc(d.x, d.y, d.rad, 0, Math.PI * 2);
    rctx.fill();
  }

  const tex = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 4;
    return t;
  };
  return { color: tex(color, true), bump: tex(bump, false), roughness: tex(rough, false) };
}

/**
 * Unit-length leaf along +y: a pointed oval, slightly lopsided, folded along
 * the midrib, curling back towards the tip and twisting a little, with a wavy
 * rim.
 */
function leafGeometry(seed: number) {
  const r = mulberry32(seed);
  const lop = 0.06 + r() * 0.08;
  const twist = (r() - 0.5) * 0.5;
  const NU = 16;
  const NT = 40;
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  for (let j = 0; j <= NT; j++) {
    const t = j / NT;
    const base = 0.29 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.9)), 0.8) * (1 - 0.25 * t);
    for (let i = 0; i <= NU; i++) {
      const u = (i / NU) * 2 - 1;
      const w = base * (1 + Math.sign(u) * lop * Math.sin(Math.PI * t));
      let x = u * w;
      let z = -Math.abs(u) * w * 0.32 - 0.22 * t * t;
      // Wavy rim, stronger towards the edge.
      z += 0.03 * Math.sin(t * 14 + Math.sign(u) * 1.7) * u * u;
      // Gentle twist along the length.
      const a = twist * t;
      [x, z] = [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)];
      positions.push(x, t, z);
      uvs.push((u + 1) / 2, t);
    }
  }
  const row = NU + 1;
  for (let j = 0; j < NT; j++) {
    for (let i = 0; i < NU; i++) {
      const a = j * row + i;
      index.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

// Resting on the stone either side of the bottle, leaning outwards: [x, z, lean (rot z), tilt (rot x), turn (rot y), length].
const LEAVES: Array<[number, number, number, number, number, number]> = [
  [-0.62, 0.25, 1.05, -0.55, 0.3, 0.78],
  [-0.58, -0.25, 0.45, 0.15, -0.5, 0.9],
  [0.66, 0.2, -1.15, -0.5, -0.4, 0.68],
];

export function Leaves({ x, topY }: { x: number; topY: number }) {
  const geometries = useMemo(() => LEAVES.map((_, i) => leafGeometry(40 + i)), []);
  const maps = useMemo(() => leafMaps(), []);
  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        map: maps.color,
        bumpMap: maps.bump,
        bumpScale: 1.5,
        roughnessMap: maps.roughness,
        roughness: 1,
        metalness: 0,
        // Light glowing through the thin blade where it faces away from the key light.
        sheen: 0.4,
        sheenColor: new THREE.Color('#5d7d2a'),
        sheenRoughness: 0.5,
        envMapIntensity: 1.1,
        side: THREE.DoubleSide,
      }),
    [maps],
  );
  useEffect(
    () => () => {
      geometries.forEach((g) => g.dispose());
      maps.color.dispose();
      maps.bump.dispose();
      maps.roughness.dispose();
      material.dispose();
    },
    [geometries, maps, material],
  );
  return (
    <group position={[x, topY, 0]}>
      {LEAVES.map(([lx, lz, lean, tilt, turn, len], i) => (
        <mesh key={i} geometry={geometries[i]} material={material} position={[lx, 0, lz]} rotation={[tilt, turn, lean]} scale={len} />
      ))}
    </group>
  );
}

// ---- coffee swirl -------------------------------------------------------------

/** Swirl centre line, mirrored on the CPU for the spray (keep in sync with `curve` in swirlVert). */
function swirlCurve(s: number, time: number, bottom: number, top: number, R0: number, out: THREE.Vector3) {
  const th = -2.2 + s * 9.5 + time * 0.9;
  const y = bottom + (top - bottom) * s + 0.06 * Math.sin(s * 11 + time * 2.3);
  const R = R0 * (1 + 0.22 * Math.sin(s * 4 + 0.6) + 0.05 * Math.sin(s * 17 + time * 3.1));
  return out.set(Math.cos(th) * R, y, Math.sin(th) * R * 0.8);
}

const swirlVert = /* glsl */ `
  uniform float uTime;
  uniform float uHead;
  uniform float uTail;
  uniform float uBottom;
  uniform float uTop;
  uniform float uR;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vTangent;
  varying float vZ;
  varying float vS;
  varying float vA;
  varying float vEdge;

  // Centre line: about one and a half turns rising round the bottle, slowly spinning.
  vec3 curve(float s) {
    float th = -2.2 + s * 9.5 + uTime * 0.9;
    float y = mix(uBottom, uTop, s) + 0.06 * sin(s * 11.0 + uTime * 2.3);
    float R = uR * (1.0 + 0.22 * sin(s * 4.0 + 0.6) + 0.05 * sin(s * 17.0 + uTime * 3.1));
    return vec3(cos(th) * R, y, sin(th) * R * 0.8);
  }

  void main() {
    float s = position.y + 0.5;           // 0 at the stone, 1 at the top of the swirl
    float a = atan(position.z, position.x);
    vec3 C = curve(s);
    vec3 T = normalize(curve(s + 0.002) - curve(s - 0.002));
    vec3 N = normalize(vec3(C.x, 0.0, C.z));
    vec3 B = normalize(cross(T, N));
    N = normalize(cross(B, T));

    // A sheet of liquid: thick, rounded body with thin, ragged edges that
    // flare and ripple as it flows, swelling and pinching along its length.
    float body = pow(sin(3.14159 * s), 0.6);
    float env = sqrt(clamp((uHead - s) / 0.05, 0.0, 1.0)) * sqrt(clamp((s - uTail) / 0.05, 0.0, 1.0));
    float swell = 1.0 + 0.3 * sin(s * 23.0 - uTime * 6.0) + 0.15 * sin(s * 57.0 + uTime * 9.0);
    float sa = sin(a);
    float edge = pow(abs(sa), 6.0);
    float rag = 1.0 + edge * (0.45 * sin(s * 41.0 + uTime * 7.0 + sign(sa) * 2.0) + 0.25 * sin(s * 97.0 - uTime * 11.0));
    float w = 0.12 * body * env * swell * rag;
    float h = 0.05 * body * env * (1.0 - 0.6 * edge);

    vec3 p = C + N * cos(a) * h + B * sa * w;
    // Ripples running along the surface.
    p += N * cos(a) * 0.012 * env * sin(s * 70.0 - uTime * 12.0 + sa * 2.0);
    vec3 n = normalize(N * cos(a) / max(h, 1e-4) + B * sa / max(w, 1e-4));

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vNormal = normalize(normalMatrix * n);
    vTangent = normalize(normalMatrix * T);
    vView = normalize(-mv.xyz);
    vZ = p.z;
    vS = s;
    vA = a;
    vEdge = edge;
    gl_Position = projectionMatrix * mv;
  }
`;

const swirlFrag = /* glsl */ `
  uniform float uTime;
  uniform float uSide;
  uniform float uOpacity;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vTangent;
  varying float vZ;
  varying float vS;
  varying float vA;
  varying float vEdge;

  void main() {
    // Drawn in two passes, behind and in front of the bottle.
    if (vZ * uSide < 0.0) discard;

    // Fine ripples in the shading normal, flowing along the stream.
    vec3 n = normalize(vNormal);
    float rip = sin(vS * 160.0 - uTime * 18.0 + vA * 3.0) * 0.5 + sin(vS * 310.0 + vA * 7.0 - uTime * 25.0) * 0.25;
    n = normalize(n + vTangent * rip * 0.35);
    vec3 v = normalize(vView);
    float facing = clamp(abs(dot(n, v)), 0.0, 1.0);

    // Light passing through: thick parts deep brown, thin parts and the
    // ragged edges glow amber, the thinnest almost gold.
    // (Colours are linear; they come out much lighter on screen.)
    float thin = clamp((1.0 - facing) * 0.55 + vEdge * 0.55, 0.0, 1.0);
    vec3 deep = vec3(0.018, 0.004, 0.0006);
    vec3 amber = vec3(0.2, 0.055, 0.007);
    vec3 glow = vec3(0.65, 0.26, 0.05);
    vec3 col = mix(deep, amber, smoothstep(0.1, 0.75, thin));
    col = mix(col, glow, smoothstep(0.7, 1.0, thin) * 0.55);
    // Swirling density inside the liquid.
    col *= 0.75 + 0.45 * smoothstep(-0.6, 1.0, sin(vS * 37.0 - uTime * 5.0 + vA * 2.0));

    // Sharp, wet highlights from the key and rim lights, plus a softer sheen.
    vec3 h1 = normalize(normalize(vec3(-0.45, 0.45, 0.8)) + v);
    vec3 h2 = normalize(normalize(vec3(0.6, 0.7, 0.4)) + v);
    float spec = pow(max(dot(n, h1), 0.0), 90.0) * 1.6 + pow(max(dot(n, h2), 0.0), 60.0) * 0.9;
    float sheen = pow(max(dot(n, h1), 0.0), 12.0) * 0.05;
    // Wet, mirror-like rim where the surface turns away from the camera.
    float rim = pow(1.0 - facing, 4.0) * (1.0 - vEdge * 0.5);
    col += vec3(1.0, 0.92, 0.8) * spec + vec3(1.0, 0.65, 0.35) * sheen + vec3(0.9, 0.7, 0.5) * rim * 0.15;
    // Glossy reflection of a bright, warm studio light overhead: streaks
    // wherever the rippled surface tilts up towards it.
    vec3 refl = reflect(-v, n);
    float fres = 0.08 + 0.92 * pow(1.0 - facing, 5.0);
    float sky = smoothstep(0.8, 0.97, refl.y);
    col += vec3(1.0, 0.85, 0.65) * sky * (0.5 + fres) * 1.2;
    // Backlight glowing through the thin ragged edges.
    col += vec3(0.8, 0.35, 0.07) * vEdge * 0.15;

    float alpha = mix(0.96, 0.75, thin) + spec * 0.5 + sky * 0.3;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0) * uOpacity);
    #include <colorspace_fragment>
  }
`;

export type SwirlState = { head: number; tail: number; opacity: number };

/**
 * Ribbon of cold brew spiralling up round the bottle, throwing off spray as
 * it goes; `state(time)` drives when it grows, drains and fades.
 */
export function CoffeeSwirl({
  x,
  bottom,
  top,
  radius,
  state,
}: {
  x: number;
  bottom: number;
  top: number;
  radius: number;
  state: (time: number) => SwirlState;
}) {
  const geo = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 24, 360, true), []);
  const [back, front] = useMemo(
    () =>
      [-1, 1].map(
        (side) =>
          new THREE.ShaderMaterial({
            vertexShader: swirlVert,
            fragmentShader: swirlFrag,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            uniforms: {
              uTime: { value: 0 },
              uHead: { value: 0 },
              uTail: { value: 0 },
              uBottom: { value: bottom },
              uTop: { value: top },
              uR: { value: radius },
              uSide: { value: side },
              uOpacity: { value: 0 },
            },
          }),
      ),
    [bottom, top, radius],
  );
  useEffect(
    () => () => {
      geo.dispose();
      back.dispose();
      front.dispose();
    },
    [geo, back, front],
  );
  const groupRef = useRef<THREE.Group>(null);

  // Spray: drops flung off the swirl, each on its own short repeating life.
  const { size } = useThree();
  const sprayCount = size.width < 640 ? 24 : 48;
  const spray = useMemo(() => {
    const r = mulberry32(57);
    return Array.from({ length: sprayCount }, () => ({
      s: 0.08 + r() * 0.84,
      life: 0.7 + r() * 0.8,
      offset: r(),
      speed: 0.35 + r() * 0.6,
      up: (r() - 0.3) * 0.8,
      size: 0.012 + Math.pow(r(), 2) * 0.03,
    }));
  }, [sprayCount]);
  const sprayRef = useRef<THREE.InstancedMesh>(null);
  const drop = useDropMaterial();
  const tmp = useMemo(() => ({ p: new THREE.Vector3(), o: new THREE.Object3D() }), []);

  useFrame((s) => {
    const time = s.clock.elapsedTime;
    const { head, tail, opacity } = state(time);
    for (const m of [back, front]) {
      m.uniforms.uTime.value = time;
      m.uniforms.uHead.value = head * 1.05;
      m.uniforms.uTail.value = tail * 1.05;
      m.uniforms.uOpacity.value = opacity;
    }
    const on = head > 0 && tail < 1 && opacity > 0;
    if (groupRef.current) groupRef.current.visible = on;

    const mesh = sprayRef.current;
    if (!mesh || !on) return;
    drop.material.uniforms.uOpacity.value = opacity;
    for (let i = 0; i < sprayCount; i++) {
      const d = spray[i];
      const phase = (time / d.life + d.offset) % 1;
      // Only from the part of the swirl that's currently there.
      const live = d.s < head * 1.05 - 0.03 && d.s > tail * 1.05 + 0.03;
      const born = time - phase * d.life;
      swirlCurve(d.s, born, bottom, top, radius, tmp.p);
      const out = Math.hypot(tmp.p.x, tmp.p.z) || 1;
      const age = phase * d.life;
      const k = d.speed * age;
      tmp.o.position.set(
        tmp.p.x + (tmp.p.x / out) * k,
        tmp.p.y + d.up * age - 0.9 * age * age,
        tmp.p.z + (tmp.p.z / out) * k * 0.8,
      );
      const sz = live ? d.size * (1 - phase * 0.6) : 0;
      tmp.o.scale.set(sz, sz * 1.2, sz);
      tmp.o.updateMatrix();
      mesh.setMatrixAt(i, tmp.o.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  // Back half before the bottle (behind the label), front half after its cap.
  return (
    <group ref={groupRef} position={[x, 0, 0]}>
      <mesh geometry={geo} material={back} renderOrder={1} frustumCulled={false} />
      <mesh geometry={geo} material={front} renderOrder={4} frustumCulled={false} />
      <instancedMesh key={sprayCount} ref={sprayRef} args={[drop.geometry, drop.material, sprayCount]} frustumCulled={false} />
    </group>
  );
}

// ---- droplets -------------------------------------------------------------------

/**
 * A coffee droplet: a little lens of cold brew. Dark at the rim, glowing
 * amber through the middle (light shining through it), with a sharp white
 * glint and a small secondary one.
 */
const dropVert = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    mat4 m = modelMatrix;
    #ifdef USE_INSTANCING
      m = modelMatrix * instanceMatrix;
    #endif
    vec4 world = m * vec4(position, 1.0);
    vNormal = normalize(mat3(viewMatrix) * mat3(m) * normal);
    vec4 mv = viewMatrix * world;
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const dropFrag = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vView);
    float facing = clamp(dot(n, v), 0.0, 1.0);
    vec3 col = mix(vec3(0.012, 0.003, 0.0005), vec3(0.16, 0.045, 0.006), smoothstep(0.2, 0.95, facing));
    // Light gathered in the lower half, as through a lens.
    col += vec3(0.45, 0.16, 0.025) * smoothstep(0.3, 0.95, -n.y) * facing;
    vec3 h1 = normalize(normalize(vec3(-0.45, 0.6, 0.7)) + v);
    vec3 h2 = normalize(normalize(vec3(0.5, -0.2, 0.8)) + v);
    col += vec3(1.0, 0.95, 0.85) * (pow(max(dot(n, h1), 0.0), 260.0) * 3.0 + pow(max(dot(n, h2), 0.0), 120.0) * 0.6);
    gl_FragColor = vec4(col, uOpacity);
    #include <colorspace_fragment>
  }
`;

/** Shared drop geometry + material, built per component (cheap) so each can fade on its own. */
function useDropMaterial() {
  const res = useMemo(
    () => ({
      geometry: new THREE.SphereGeometry(1, 16, 12),
      material: new THREE.ShaderMaterial({
        vertexShader: dropVert,
        fragmentShader: dropFrag,
        transparent: true,
        uniforms: { uOpacity: { value: 1 } },
      }),
    }),
    [],
  );
  useEffect(
    () => () => {
      res.geometry.dispose();
      res.material.dispose();
    },
    [res],
  );
  return res;
}

/** Coffee droplets drifting round the bottle. */
export function Droplets({
  x,
  bottom,
  top,
  opacity,
}: {
  x: number;
  bottom: number;
  top: number;
  opacity: (time: number) => number;
}) {
  const { size } = useThree();
  const count = size.width < 640 ? 18 : 34;
  const drop = useDropMaterial();
  const seeds = useMemo(() => {
    const r = mulberry32(31);
    return Array.from({ length: count }, () => ({
      a: r() * Math.PI * 2,
      speed: (0.08 + r() * 0.18) * (r() < 0.5 ? -1 : 1),
      radius: 0.7 + r() * 1.5,
      y: bottom + r() * (top - bottom),
      size: 0.014 + Math.pow(r(), 2) * 0.032,
      phase: r() * Math.PI * 2,
    }));
  }, [count, bottom, top]);
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((s) => {
    const mesh = ref.current;
    if (!mesh) return;
    const time = s.clock.elapsedTime;
    drop.material.uniforms.uOpacity.value = opacity(time);
    for (let i = 0; i < count; i++) {
      const d = seeds[i];
      const a = d.a + time * d.speed;
      dummy.position.set(Math.cos(a) * d.radius, d.y + Math.sin(time * 0.7 + d.phase) * 0.08, Math.sin(a) * d.radius * 0.7);
      // Slightly stretched, like a drop in flight.
      dummy.scale.set(d.size, d.size * 1.2, d.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group position={[x, 0, 0]}>
      <instancedMesh key={count} ref={ref} args={[drop.geometry, drop.material, count]} frustumCulled={false} />
    </group>
  );
}
