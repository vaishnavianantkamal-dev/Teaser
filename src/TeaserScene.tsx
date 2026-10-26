import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { createBeanGeometry } from '@/three/beanGeometry';
import { buildBeanMaps, createBeanMaterial } from '@/three/beanTextures';
import { mulberry32 } from '@/three/math';
import { goldGlow } from '@/three/textures';
import Bottle3D, { BOTTLE_BASE_Y, coffeeLevelY } from './Bottle3D';
import { MOUTH_Y } from './bottleModel';
import { loopTime, streamState } from './timeline';

/** Where the pour starts (above the top of the frame). */
const STREAM_TOP = 3.4;

/** Below this width/height the teaser switches to its stacked phone layout (matches Teaser.tsx). */
export const PORTRAIT_ASPECT = 0.8;

export default function TeaserScene() {
  const { size } = useThree();
  const mobile = size.width < 640;

  return (
    <>
      {/* Same studio lighting rig as the home page hero beans (StoryScene). */}
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={3} color="#fff1dc" position={[0, 5, 2]} scale={[6, 3, 1]} target={[0, 0, 0]} />
        <Lightformer form="ring" intensity={2.2} color="#d4af6a" position={[0, 2, -6]} scale={5} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.2} color="#bcd6ff" position={[-6, 1, 2]} scale={[2, 5, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.5} color="#ffd9a3" position={[6, 0, 3]} scale={[2, 4, 1]} target={[0, 0, 0]} />
        {/* Tall softbox strips: the bright vertical highlights that make glass read as glass. */}
        <Lightformer form="rect" intensity={5} color="#fff6ea" position={[-3, 0.5, 4]} scale={[0.5, 7, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={3} color="#ffe9cc" position={[3.5, 0.5, 3.5]} scale={[0.4, 7, 1]} target={[0, 0, 0]} />
      </Environment>
      <ambientLight intensity={0.3} color="#fff4e6" />
      <hemisphereLight color="#fff3db" groundColor="#120b05" intensity={0.4} />
      <directionalLight position={[4, 6, 4]} intensity={2.8} color="#fff2df" />
      <directionalLight position={[-5, 3, -3]} intensity={2.1} color="#d4af6a" />
      <directionalLight position={[-4, 1, 3]} intensity={0.6} color="#cfe3ff" />
      <pointLight position={[0, -2, 3]} intensity={1} color="#c9a04e" />
      <fog attach="fog" args={['#040f09', 8, 17]} />

      <Backdrop />
      <CameraFit />
      <BackGlow />
      <FloatingBeans />
      <PourStream />
      <Bottle3D mobile={mobile} />
      <Dust />
    </>
  );
}

/**
 * The home page's forest-green backdrop, painted into the 3D scene itself
 * (not just behind the canvas) so the glass refracts it like a real
 * background.
 */
function Backdrop() {
  const { scene } = useThree();
  const tex = useMemo(() => {
    const w = 512;
    const h = 512;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#020504';
    ctx.fillRect(0, 0, w, h);
    // radial-gradient(ellipse 80% 60% at 50% 38%, …) — same as the hero.
    ctx.save();
    ctx.translate(w * 0.5, h * 0.38);
    ctx.scale(w * 0.8, h * 0.6);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, '#0d2818');
    g.addColorStop(0.45, '#071a10');
    g.addColorStop(0.78, '#030a06');
    g.addColorStop(1, '#020504');
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
    // Soft forest glow, lower right.
    const f = ctx.createRadialGradient(w * 0.92, h * 0.78, 0, w * 0.92, h * 0.78, w * 0.35);
    f.addColorStop(0, 'rgba(45,81,56,0.22)');
    f.addColorStop(1, 'rgba(45,81,56,0)');
    ctx.fillStyle = f;
    ctx.fillRect(0, 0, w, h);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);

  useEffect(() => {
    const prev = scene.background;
    scene.background = tex;
    return () => {
      scene.background = prev;
      tex.dispose();
    };
  }, [scene, tex]);
  return null;
}

/**
 * On tall phone screens, pull back and shift the view down a little so the
 * bottle leaves room underneath for the title.
 */
function CameraFit() {
  const { camera, size } = useThree();
  useEffect(() => {
    const portrait = size.width / size.height < PORTRAIT_ASPECT;
    camera.position.set(0, portrait ? -0.5 : 0, portrait ? 10 : 8);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}

function BackGlow() {
  const tex = useMemo(() => goldGlow(), []);
  return (
    <mesh position={[0, 0.3, -2.5]} scale={[7, 7, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={tex} transparent opacity={0.22} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

const streamVert = /* glsl */ `
  uniform float uTime;
  uniform float uHead;
  uniform float uTail;
  uniform float uTop;
  uniform float uBottom;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vT;
  varying float vY;
  varying float vAngle;

  void main() {
    float t = 0.5 - position.y;          // 0 at the top, 1 at the coffee surface
    float y = mix(uTop, uBottom, t);     // world height, so ripples don't stretch as the level rises
    float a = atan(position.z, position.x);

    // Thick up top, thinning as it accelerates, with soft ripples.
    float r = mix(0.1, 0.072, smoothstep(uTop, uBottom, y));
    r *= 1.0 + 0.06 * sin(y * 9.0 + uTime * 12.0) + 0.03 * sin(y * 23.0 + uTime * 21.0);
    // Rounded front and tail.
    r *= sqrt(clamp((uHead - t) / 0.02, 0.0, 1.0)) * sqrt(clamp((t - uTail) / 0.02, 0.0, 1.0));

    // Twisting ribbon, like a real pour.
    float twist = 0.16 * sin(y * 2.4 + uTime * 5.0);
    vec3 p = vec3(position.x * r * (1.0 + twist), y, position.z * r * (1.0 - twist));
    // Gentle sway up top, pinned where it enters the bottle.
    p.x += (sin(y * 1.6 - uTime * 2.2) * 0.014 + sin(y * 4.0 + uTime * 5.0) * 0.005) * smoothstep(${(BOTTLE_BASE_Y + MOUTH_Y).toFixed(3)}, uTop, y);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vNormal = normalize(normalMatrix * normalize(vec3(position.x, 0.0, position.z)));
    vView = normalize(-mv.xyz);
    vT = t;
    vY = y;
    vAngle = a;
    gl_Position = projectionMatrix * mv;
  }
`;

const streamFrag = /* glsl */ `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vT;
  varying float vY;
  varying float vAngle;

  void main() {
    vec3 n = normalize(vNormal);
    float facing = clamp(abs(dot(n, vView)), 0.0, 1.0);

    // Backlit cold brew: deep amber at the edges, glowing orange through the core.
    vec3 edge = vec3(0.06, 0.012, 0.002);
    vec3 body = vec3(0.34, 0.075, 0.006);
    vec3 core = vec3(0.80, 0.24, 0.02);
    vec3 col = mix(edge, body, smoothstep(0.0, 0.55, facing));
    col = mix(col, core, smoothstep(0.7, 1.0, facing) * 0.6);

    // Spiral bands from the twist, sliding down the stream.
    float band = sin(vAngle * 2.0 + vY * 12.0 + uTime * 9.0);
    col *= 0.85 + 0.3 * smoothstep(0.2, 1.0, band);

    // Glossy highlights from the key light and a soft rim.
    vec3 l = normalize(vec3(-0.45, 0.35, 0.82));
    vec3 h = normalize(l + vView);
    float spec = pow(max(dot(n, h), 0.0), 70.0);
    col += vec3(1.0, 0.8, 0.55) * spec * 0.9;
    col += vec3(0.35, 0.12, 0.02) * pow(1.0 - facing, 3.0) * 0.5;

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

function PourStream() {
  const geo = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 28, 260, true), []);
  // Built directly (not via JSX props) so the uniforms object we mutate each
  // frame is guaranteed to be the one the shader reads.
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: streamVert,
        fragmentShader: streamFrag,
        uniforms: {
          uTime: { value: 0 },
          uHead: { value: 0 },
          uTail: { value: 0 },
          uTop: { value: STREAM_TOP },
          uBottom: { value: coffeeLevelY(0) },
        },
      }),
    [],
  );
  useEffect(
    () => () => {
      geo.dispose();
      material.dispose();
    },
    [geo, material],
  );
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const t = loopTime(time);
    const { head, tail } = streamState(t);
    const u = material.uniforms;
    u.uTime.value = time;
    u.uHead.value = head * 1.02;
    u.uTail.value = tail * 1.02;
    // Lands on the rising coffee surface inside the bottle.
    u.uBottom.value = coffeeLevelY(t) - 0.01;
    if (meshRef.current) meshRef.current.visible = head > 0 && tail < 1;
  });

  // Opaque, so the glass's transmission pass refracts it: it's seen falling
  // through the neck inside the bottle, and disappears into the coffee.
  return <mesh ref={meshRef} geometry={geo} material={material} frustumCulled={false} />;
}

/**
 * Vertical extent of the DOM title (see Teaser.tsx) in screen space, -1
 * bottom .. 1 top. Mirrors its CSS: split either side of the bottle on wide
 * screens, stacked under it on portrait ones (where everything from the
 * title down to the tagline is kept clear).
 */
function titleBand(w: number, h: number) {
  if (w / h < PORTRAIT_ASPECT) {
    const fontPx = Math.min(64, Math.max(32, 0.095 * w));
    const topPx = h - 0.13 * h - fontPx - 30;
    return { lo: -1.2, hi: 1 - (2 * topPx) / h };
  }
  const fontPx = Math.min(144, Math.max(56, Math.min(0.082 * w, 0.17 * h)));
  const half = (fontPx * 0.9 + 70) / h; // glyphs + eyebrow lines, as a fraction of half-height
  return { lo: -half, hi: half };
}

/** Remaps v in -1..1 onto [-1, lo] ∪ [hi, 1], keeping the relative order and spacing. */
function skipBand(v: number, lo: number, hi: number) {
  const below = Math.max(0, lo + 1);
  const above = Math.max(0, 1 - hi);
  const total = below + above;
  if (total <= 0.05) return v;
  const pos = ((v + 1) / 2) * total;
  return pos < below ? -1 + pos : hi + (pos - below);
}

/** Roasted beans hovering around the bottle, kept clear of the centre column. */
function FloatingBeans() {
  const { viewport, camera, size } = useThree();
  const mobile = size.width < 640;
  const geometry = useMemo(() => createBeanGeometry(0.5, mobile ? 30 : 40), [mobile]);
  const maps = useMemo(() => buildBeanMaps(3), []);
  const material = useMemo(() => createBeanMaterial(maps, 0.02), [maps]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      maps.color.dispose();
      maps.bump.dispose();
      maps.roughness.dispose();
    },
    [geometry, material, maps],
  );
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Three depth layers, like the home page hero: a few huge beans close to the
  // camera at the frame edges, a ring of mid-size ones around the bottle and
  // smaller ones further back for depth.
  const seeds = useMemo(() => {
    const r = mulberry32(5);
    const layers = [
      // `clear`: half-width (in bottle-plane units) of the column kept free for the bottle and pour.
      // `avoid`: stays out of the title band (the far layer just drifts behind the text).
      { n: mobile ? 4 : 8, zMin: 1.6, zMax: 3.2, sMin: 0.42, sMax: 0.6, clear: 1.6, avoid: true },
      { n: mobile ? 12 : 22, zMin: -0.8, zMax: 1.0, sMin: 0.3, sMax: 0.42, clear: 0.75, avoid: true },
      { n: mobile ? 8 : 14, zMin: -3.5, zMax: -1.5, sMin: 0.24, sMax: 0.32, clear: 0.45, avoid: false },
    ];
    const out: Array<{
      nx: number; ny: number; z: number; scale: number; clear: number; avoid: boolean;
      rx: number; ry: number; rz: number; spin: number; bob: number; phase: number;
    }> = [];
    for (const L of layers) {
      // Stratified: alternate left/right and spread evenly top to bottom so
      // no side ends up with a pile of beans.
      const rows = Math.ceil(L.n / 2);
      for (let k = 0; k < L.n; k++) {
        const side = k % 2 ? 1 : -1;
        out.push({
          nx: side * (0.05 + r() * 0.95),
          ny: ((Math.floor(k / 2) + 0.15 + r() * 0.7) / rows) * 2 - 1,
          clear: L.clear,
          avoid: L.avoid,
          z: L.zMin + r() * (L.zMax - L.zMin),
          scale: L.sMin + r() * (L.sMax - L.sMin),
          rx: r() * 6, ry: r() * 6, rz: r() * 6,
          spin: (0.2 + r() * 0.5) * (r() < 0.5 ? -1 : 1),
          bob: 0.06 + r() * 0.12,
          phase: r() * Math.PI * 2,
        });
      }
    }
    return out;
  }, [mobile]);
  const count = seeds.length;

  const colors = useMemo(() => {
    const r = mulberry32(11);
    const arr = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      c.setHSL(0.06 + r() * 0.03, 0.15 + r() * 0.2, 0.42 + r() * 0.2);
      arr.set([c.r, c.g, c.b], i * 3);
    }
    return arr;
  }, [count]);

  useEffect(() => {
    if (meshRef.current) meshRef.current.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
  }, [colors]);

  const pointer = useRef(new THREE.Vector2());

  useFrame((state, dt) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const time = state.clock.elapsedTime;
    const cam = camera as THREE.PerspectiveCamera;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const band = titleBand(size.width, size.height);

    for (let i = 0; i < count; i++) {
      const s = seeds[i];
      // Spread across the visible frustum at this bean's depth.
      const dist = cam.position.z - s.z;
      const halfH = dist * tanHalf * 0.95;
      const halfW = halfH * viewport.aspect;
      // Map |nx| onto the space either side of the bottle column at this depth.
      const clearW = s.clear > 0 ? Math.min(halfW * 0.85, (s.clear * dist) / cam.position.z + s.scale * 0.7) : 0;
      const x = Math.sign(s.nx) * (clearW + Math.abs(s.nx) * (halfW - clearW)) + Math.sin(time * 0.2 + s.phase) * 0.08;
      // Squeeze the title band out of this bean's vertical range (screen-space -1..1).
      const ny = s.avoid ? skipBand(s.ny, band.lo - (s.scale * 0.75) / halfH, band.hi + (s.scale * 0.75) / halfH) : s.ny;
      const y = cam.position.y + ny * halfH + Math.sin(time * 0.6 + s.phase) * s.bob;
      dummy.position.set(x, y, s.z);
      dummy.rotation.set(s.rx + time * s.spin, s.ry + time * s.spin * 0.7, s.rz + Math.sin(time * 0.3 + s.phase) * 0.4);
      dummy.scale.setScalar(s.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    // Soft parallax with the pointer.
    pointer.current.lerp(state.pointer, 1 - Math.exp(-2 * dt));
    if (groupRef.current) {
      groupRef.current.rotation.y = pointer.current.x * 0.05;
      groupRef.current.rotation.x = -pointer.current.y * 0.035;
    }
  });

  return (
    <group ref={groupRef}>
      <instancedMesh ref={meshRef} args={[geometry, material, count]} frustumCulled={false} />
    </group>
  );
}

function Dust() {
  const count = 140;
  const ref = useRef<THREE.Points>(null);
  const { positions, base } = useMemo(() => {
    const r = mulberry32(99);
    const base = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      base[i * 3] = (r() - 0.5) * 12;
      base[i * 3 + 1] = (r() - 0.5) * 7;
      base[i * 3 + 2] = -4 + r() * 5;
    }
    return { positions: base.slice(), base };
  }, []);

  useFrame((state) => {
    const pts = ref.current;
    if (!pts) return;
    const time = state.clock.elapsedTime;
    const arr = pts.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      arr[i * 3] = base[i * 3] + Math.sin(time * 0.15 + i) * 0.4;
      arr[i * 3 + 1] = ((base[i * 3 + 1] + 3.5 + time * 0.06) % 7) - 3.5;
      arr[i * 3 + 2] = base[i * 3 + 2] + Math.cos(time * 0.1 + i * 0.5) * 0.3;
    }
    pts.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.025}
        color="#e2c88d"
        sizeAttenuation
        transparent
        opacity={0.4}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
