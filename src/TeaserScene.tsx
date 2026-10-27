import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { createBeanGeometry } from '@/three/beanGeometry';
import { buildBeanMaps, createBeanMaterial } from '@/three/beanTextures';
import { lerp, mulberry32, smoothstep } from '@/three/math';
import { goldGlow, radialTexture, softShadow } from '@/three/textures';
import { TEASER_IMG } from './assets';
import { BASE, CAP_RECT, cutoutBottle } from './cutout';
import { CoffeeSwirl, Droplets, Leaves, Stone, type SwirlState } from './scenery';

const IMG_W = 960;
const IMG_H = 1280;

// Bottle billboard placement (world units).
const BOTTLE_H = 2.95;
const BOTTLE_W = BOTTLE_H * (IMG_W / IMG_H);
const BOTTLE_Y = -0.22;

/** teaser.webp pixel → world position on the bottle plane. */
const px2x = (px: number) => (px / IMG_W - 0.5) * BOTTLE_W;
const py2y = (py: number) => BOTTLE_Y + (0.5 - py / IMG_H) * BOTTLE_H;

const POUR_X = px2x(477);
const MOUTH_Y = py2y(112);
const MOUTH_R = (px2x(588) - px2x(368)) / 2;

const STREAM_TOP = 3.4;

// Coffee level in teaser.webp rows: bottom of the liquid, where the shoulder
// starts narrowing, and the full line in the neck.
const LIQUID = { bottom: 1195, shoulder: 330, full: 205 };

// One loop of the teaser, in seconds.
const CYCLE = 13;
const K = {
  fadeIn: 0.6,
  unscrewStart: 0.8,
  unscrewEnd: 2.0,
  liftEnd: 3.0,
  pourStart: 2.6,
  dropTime: 0.5,
  fillEnd: 8.8,
  pourStop: 8.9,
  returnStart: 9.5,
  returnEnd: 10.6,
  screwEnd: 11.5,
  fadeOutStart: 12.3,
};

/** Top of the stone the bottle stands on: the underside of the glass. */
const STAND_Y = py2y(BASE.y);

/**
 * The coffee swirl: once the bottle is full it rises from the stone and wraps
 * round the bottle while the cap goes back on, then drains away.
 */
function swirlState(time: number): SwirlState {
  const t = loopTime(time);
  return { head: smoothstep(8.7, 10.0, t), tail: smoothstep(11.2, 12.4, t), opacity: bottleOpacity(t) };
}

/** Bottle visibility: fades in empty at the start of a loop, out (full) at the end. */
const bottleOpacity = (t: number) => smoothstep(0, K.fadeIn, t) * (1 - smoothstep(K.fadeOutStart, CYCLE, t));

/**
 * Coffee level as a teaser.webp row. Constant flow, so the wide body fills
 * slowly and the narrow shoulder and neck catch up quickly at the end.
 */
function fillRow(t: number) {
  const f = smoothstep(K.pourStart + K.dropTime, K.fillEnd, t);
  if (f < 0.85) return lerp(LIQUID.bottom, LIQUID.shoulder, f / 0.85);
  return lerp(LIQUID.shoulder, LIQUID.full, (f - 0.85) / 0.15);
}

useTexture.preload(TEASER_IMG);

export default function TeaserScene() {
  return (
    <>
      {/* Same studio lighting rig as the home page hero beans (StoryScene). */}
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={3} color="#fff1dc" position={[0, 5, 2]} scale={[6, 3, 1]} target={[0, 0, 0]} />
        <Lightformer form="ring" intensity={2.2} color="#d4af6a" position={[0, 2, -6]} scale={5} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.2} color="#bcd6ff" position={[-6, 1, 2]} scale={[2, 5, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.5} color="#ffd9a3" position={[6, 0, 3]} scale={[2, 4, 1]} target={[0, 0, 0]} />
      </Environment>
      <ambientLight intensity={0.3} color="#fff4e6" />
      <hemisphereLight color="#fff3db" groundColor="#120b05" intensity={0.4} />
      <directionalLight position={[4, 6, 4]} intensity={2.8} color="#fff2df" />
      <directionalLight position={[-5, 3, -3]} intensity={2.1} color="#d4af6a" />
      <directionalLight position={[-4, 1, 3]} intensity={0.6} color="#cfe3ff" />
      <pointLight position={[0, -2, 3]} intensity={1} color="#c9a04e" />
      <fog attach="fog" args={['#040f09', 8, 17]} />

      <CameraFit />
      <BackGlow />
      <FloatingBeans />
      <PourStream />
      <BottleBillboard />
      <Mouth />
      <Stone x={POUR_X} topY={STAND_Y} />
      <Leaves x={POUR_X} topY={STAND_Y} />
      <CoffeeSwirl x={POUR_X} bottom={STAND_Y + 0.12} top={py2y(LIQUID.shoulder) + 0.15} radius={0.72} state={swirlState} />
      <Droplets x={POUR_X} bottom={STAND_Y + 0.15} top={1.3} opacity={(time) => bottleOpacity(loopTime(time))} />
      <Dust />
    </>
  );
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

/** Below this width/height the teaser switches to its stacked phone layout (matches Teaser.tsx). */
export const PORTRAIT_ASPECT = 0.8;

/** Seconds into the current loop. */
// `?t=5` starts the loop 5 s in — handy for jumping straight to the pour.
const START_OFFSET = Number(new URLSearchParams(window.location.search).get('t')) || 0;
const loopTime = (t: number) => (t + START_OFFSET) % CYCLE;

function BackGlow() {
  const tex = useMemo(() => goldGlow(), []);
  return (
    <mesh position={[0, 0.3, -2.5]} scale={[7, 7, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={tex} transparent opacity={0.22} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

/**
 * The teaser.webp bottle, drawn so it can be shown filling: above the coffee
 * line the dark liquid is turned see-through (empty glass keeps only its
 * highlights and edges), below it the original photo shows through, and the
 * label always stays solid. Works in teaser.webp pixel space.
 */
const bodyFrag = /* glsl */ `
  uniform sampler2D map;
  uniform float uFillRow;
  uniform float uTime;
  uniform float uPour;
  uniform float uOpacity;
  varying vec2 vUv;

  const vec2 IMG = vec2(960.0, 1280.0);

  float labelMask(vec2 px) {
    float u = (px.x - 477.0) / 152.0;
    float arch = 70.0 * u * u;
    float inX = step(325.0, px.x) * step(px.x, 630.0);
    float inY = step(432.0 + arch, px.y) * step(px.y, 1088.0 - arch);
    return inX * inY;
  }

  void main() {
    vec4 c = texture2D(map, vUv);
    vec2 px = vec2(vUv.x, 1.0 - vUv.y) * IMG;
    vec3 col = c.rgb;
    float alpha = c.a;

    if (labelMask(px) < 0.5 && px.y < ${LIQUID.bottom}.0) {
      // Liquid surface: gentle slosh, plus ripples where the stream lands.
      float hit = exp(-pow((px.x - 477.0) / 45.0, 2.0));
      float surface = uFillRow
        + sin(px.x * 0.045 + uTime * 3.0) * 1.6
        + hit * uPour * (3.0 + sin(uTime * 15.0) * 2.5);

      if (px.y < surface) {
        // Empty glass: dark coffee becomes see-through, reflections and the
        // silhouette edge stay.
        float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        float shine = smoothstep(0.015, 0.22, lum);
        float aL = texture2D(map, vUv - vec2(7.0 / IMG.x, 0.0)).a;
        float aR = texture2D(map, vUv + vec2(7.0 / IMG.x, 0.0)).a;
        float edge = 1.0 - min(aL, aR);
        vec3 glass = mix(vec3(lum) * 1.25 + vec3(0.012, 0.02, 0.016), c.rgb, 0.3);
        col = mix(glass, vec3(0.42, 0.48, 0.45), edge * 0.35);
        alpha = c.a * max(0.07 + 0.93 * shine, edge * 0.75);
      } else if (px.y < surface + 9.0) {
        // Crema line at the top of the coffee.
        float k = 1.0 - (px.y - surface) / 9.0;
        col = mix(col, vec3(0.42, 0.17, 0.035), 0.75 * k);
      }
    }

    gl_FragColor = vec4(col, alpha * uOpacity);
    #include <colorspace_fragment>
  }
`;

const bodyVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

function BottleBillboard() {
  const src = useTexture(TEASER_IMG);
  const tex = useMemo(() => cutoutBottle(src.image as HTMLImageElement), [src]);
  const shadows = useMemo(
    () => ({
      soft: softShadow(),
      contact: radialTexture([
        [0, 'rgba(0,0,0,0.95)'],
        [0.55, 'rgba(0,0,0,0.6)'],
        [1, 'rgba(0,0,0,0)'],
      ]),
    }),
    [],
  );
  const bodyMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: bodyVert,
        fragmentShader: bodyFrag,
        transparent: true,
        depthWrite: false,
        uniforms: {
          map: { value: tex.body },
          uFillRow: { value: LIQUID.bottom },
          uTime: { value: 0 },
          uPour: { value: 0 },
          uOpacity: { value: 0 },
        },
      }),
    [tex],
  );
  useEffect(
    () => () => {
      tex.body.dispose();
      tex.cap.dispose();
      shadows.soft.dispose();
      shadows.contact.dispose();
      bodyMat.dispose();
    },
    [tex, shadows, bodyMat],
  );
  const softRef = useRef<THREE.MeshBasicMaterial>(null);
  const contactRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const t = loopTime(time);
    const o = bottleOpacity(t);
    const { head, tail } = streamState(t);
    const u = bodyMat.uniforms;
    u.uFillRow.value = fillRow(t);
    u.uTime.value = time;
    u.uPour.value = head >= 1 && tail <= 0 ? 1 : 0;
    u.uOpacity.value = o;
    if (softRef.current) softRef.current.opacity = 0.75 * o;
    if (contactRef.current) contactRef.current.opacity = 0.9 * o;
  });

  // Underside of the glass in world units.
  const baseY = py2y(BASE.y);
  const baseW = (BASE.halfW * 2 * BOTTLE_W) / IMG_W;

  return (
    <group>
      {/*
        Two-part grounding shadow, drawn just behind the bottle so its upper
        half is hidden by the glass: a wide, soft ambient-occlusion pool and
        a tight, dark contact line right where the glass meets the surface.
      */}
      <mesh position={[0, baseY - 0.03, -0.05]} scale={[baseW * 2.3, 0.34, 1]} renderOrder={-1}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial ref={softRef} map={shadows.soft} transparent opacity={0} depthWrite={false} fog={false} />
      </mesh>
      <mesh position={[0, baseY - 0.005, -0.04]} scale={[baseW * 1.08, 0.075, 1]} renderOrder={-1}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial ref={contactRef} map={shadows.contact} transparent opacity={0} depthWrite={false} fog={false} />
      </mesh>
      {/* Drawn after the stream (renderOrder) so the label and coffee cover it. */}
      <mesh position={[0, BOTTLE_Y, 0]} material={bodyMat} renderOrder={2}>
        <planeGeometry args={[BOTTLE_W, BOTTLE_H]} />
      </mesh>
      <Cap map={tex.cap} />
    </group>
  );
}

// The original gold cap from teaser.webp, as its own layer.
const CAP_W = (CAP_RECT.w / IMG_W) * BOTTLE_W;
const CAP_PLANE_H = (CAP_RECT.h / IMG_H) * BOTTLE_H;
const CAP_X = px2x(CAP_RECT.x + CAP_RECT.w / 2);
const CAP_Y = py2y(CAP_RECT.y + CAP_RECT.h / 2);

/** Twists loose, lifts off for the pour, then drops back and tightens. */
function Cap({ map }: { map: THREE.Texture }) {
  const ref = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((state) => {
    const m = ref.current;
    if (!m) return;
    const t = loopTime(state.clock.elapsedTime);

    const unscrew = smoothstep(K.unscrewStart, K.unscrewEnd, t);
    const lift = smoothstep(K.unscrewEnd - 0.2, K.liftEnd, t);
    const back = smoothstep(K.returnStart, K.returnEnd, t);
    const screw = smoothstep(K.returnEnd, K.screwEnd, t);

    // Off-screen height while the pour is running.
    const away = 3.6;
    // Small back-and-forth rock while it's being twisted.
    const twisting = (t < K.returnStart ? unscrew * (1 - unscrew) : screw * (1 - screw)) * 4;
    let y: number;
    let tilt: number;
    if (t < K.returnStart) {
      y = CAP_Y + unscrew * 0.05 + lift * lift * away;
      tilt = lift * 0.35;
    } else {
      y = lerp(CAP_Y + 0.05 + away, CAP_Y + 0.05, back) - screw * 0.05;
      tilt = (1 - back) * 0.35;
    }
    // Same plane as the bottle (z = 0): any z offset makes perspective scale
    // and shift the cap, so it floats above the neck instead of seating on it.
    m.position.set(CAP_X + tilt * 0.3, y, 0);
    m.rotation.z = -tilt + Math.sin(t * 22) * 0.035 * twisting;
    if (matRef.current) matRef.current.opacity = bottleOpacity(t);
  });

  return (
    <mesh ref={ref} position={[CAP_X, CAP_Y, 0]} renderOrder={3}>
      <planeGeometry args={[CAP_W, CAP_PLANE_H]} />
      <meshBasicMaterial ref={matRef} map={map} transparent opacity={0} toneMapped={false} depthWrite={false} fog={false} />
    </mesh>
  );
}

/** Thin glass lip on the open neck once the cap is off. */
function Mouth() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    // Only while the cap is away; it covers the neck the rest of the time.
    const t = loopTime(state.clock.elapsedTime);
    if (ref.current) ref.current.visible = t > K.unscrewEnd && t < K.returnEnd;
  });
  return (
    <mesh ref={ref} position={[POUR_X, MOUTH_Y + 0.012, 0]} rotation={[-Math.PI / 2 + 0.2, 0, 0]} renderOrder={3}>
      <torusGeometry args={[MOUTH_R * 0.95, 0.022, 12, 96]} />
      <meshPhysicalMaterial
        color="#2a241c"
        metalness={0}
        roughness={0.08}
        clearcoat={1}
        clearcoatRoughness={0.05}
        envMapIntensity={2}
        transparent
        opacity={0.85}
      />
    </mesh>
  );
}

/** 0..1 how far the front of the stream has fallen, and how far its tail has. */
function streamState(t: number) {
  const head = smoothstep(K.pourStart, K.pourStart + K.dropTime, t);
  const tail = smoothstep(K.pourStop, K.pourStop + K.dropTime, t);
  return { head, tail };
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
    p.x += (sin(y * 1.6 - uTime * 2.2) * 0.014 + sin(y * 4.0 + uTime * 5.0) * 0.005) * smoothstep(${MOUTH_Y.toFixed(3)}, uTop, y);

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

    gl_FragColor = vec4(col, mix(0.82, 0.97, facing));
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
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uHead: { value: 0 },
          uTail: { value: 0 },
          uTop: { value: STREAM_TOP },
          uBottom: { value: py2y(LIQUID.bottom) },
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
    u.uBottom.value = py2y(fillRow(t)) - 0.01;
    if (meshRef.current) meshRef.current.visible = head > 0 && tail < 1;
  });

  // Just behind the bottle plane: visible through the empty glass, hidden by
  // the label and by the coffee once it's below the surface.
  return (
    <mesh ref={meshRef} geometry={geo} material={material} position={[POUR_X, 0, -0.06]} renderOrder={1} frustumCulled={false} />
  );
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
  const geometry = useMemo(() => createBeanGeometry(0.5, mobile ? 40 : 64), [mobile]);
  // Phones get a lighter crinkle map: quicker to generate, and the beans are smaller on screen.
  const maps = useMemo(() => buildBeanMaps(3, mobile ? 512 : 1024), [mobile]);
  const material = useMemo(() => createBeanMaterial(maps, 0.75), [maps]);
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
      { n: mobile ? 4 : 8, zMin: 1.6, zMax: 3.2, sMin: 0.37, sMax: 0.53, clear: 1.6, avoid: true },
      { n: mobile ? 12 : 22, zMin: -0.8, zMax: 1.0, sMin: 0.26, sMax: 0.37, clear: 0.75, avoid: true },
      { n: mobile ? 8 : 14, zMin: -3.5, zMax: -1.5, sMin: 0.21, sMax: 0.28, clear: 0.45, avoid: false },
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
      // Small roast-to-roast variation; near-neutral so it shades the texture rather than tinting it orange.
      c.setHSL(0.07 + r() * 0.02, 0.08 + r() * 0.12, 0.62 + r() * 0.26);
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
