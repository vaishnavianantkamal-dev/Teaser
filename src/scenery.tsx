import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mulberry32 } from '@/three/math';
import { radialTexture } from '@/three/textures';

/**
 * Set dressing around the bottle: the dark stone it stands on, coffee leaves
 * resting on the stone, and coffee droplets drifting in the air.
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

// ---- droplets -------------------------------------------------------------------

/**
 * A droplet of milk coffee: darker at the rim, creamy caramel through the
 * middle, with a sharp white glint and a small secondary one.
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
    vec3 col = mix(vec3(0.04, 0.016, 0.005), vec3(0.34, 0.15, 0.06), smoothstep(0.15, 0.9, facing));
    // Light gathered in the lower half, as through a lens.
    col += vec3(0.25, 0.12, 0.04) * smoothstep(0.3, 0.95, -n.y) * facing;
    vec3 h1 = normalize(normalize(vec3(-0.45, 0.6, 0.7)) + v);
    vec3 h2 = normalize(normalize(vec3(0.5, -0.2, 0.8)) + v);
    col += vec3(1.0, 0.95, 0.85) * (pow(max(dot(n, h1), 0.0), 260.0) * 3.0 + pow(max(dot(n, h2), 0.0), 120.0) * 0.6);
    gl_FragColor = vec4(col, uOpacity);
    #include <colorspace_fragment>
  }
`;

/** Drop geometry + material. */
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
