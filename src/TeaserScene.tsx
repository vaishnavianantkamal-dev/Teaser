import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { createBeanGeometry } from '@/three/beanGeometry';
import { buildBeanMaps, createBeanMaterial } from '@/three/beanTextures';
import { lerp, mulberry32, smoothstep } from '@/three/math';
import { goldGlow, radialTexture, softShadow } from '@/three/textures';
import { TEASER_IMG, MASK_IMG } from './assets';
import { BASE, CAP_RECT, cutoutBottle } from './cutout';
import { Droplets, Leaves, Stone } from './scenery';

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
  returnStart: 9.2,
  returnEnd: 10.1,
  screwEnd: 10.8,
  fadeOutStart: 12.3,
};

/** Top of the stone the bottle stands on: the underside of the glass. */
const STAND_Y = py2y(BASE.y);

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
useTexture.preload(MASK_IMG);

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
      <Stone x={POUR_X} topY={STAND_Y} />
      <Leaves x={POUR_X} topY={STAND_Y} />
      <Droplets x={POUR_X} bottom={STAND_Y + 0.15} top={1.3} opacity={(time) => bottleOpacity(loopTime(time))} />
      <Dust />
      <TaglineSync />
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

/** Bean radius (× its scale) used to keep beans from overlapping each other, with a little gap. */
const BEAN_REACH = 0.72;

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
 * The teaser.webp bottle, drawn so it can be shown filling with milk coffee:
 * above the coffee line the photo's dark liquid is turned see-through (empty
 * glass keeps only its highlights and edges), below it the liquid is
 * recoloured to creamy milk coffee behind the photo's glass reflections, and
 * the label always stays solid. Works in teaser.webp pixel space.
 */
const bodyFrag = /* glsl */ `
  uniform sampler2D map;
  uniform sampler2D mask;
  uniform float uFillRow;
  uniform float uTime;
  uniform float uPour;
  uniform float uOpacity;
  varying vec2 vUv;

  const vec2 IMG = vec2(960.0, 1280.0);

  void main() {
    vec4 c = texture2D(map, vUv);
    float isLabel = texture2D(mask, vUv).r;
    vec2 px = vec2(vUv.x, 1.0 - vUv.y) * IMG;
    vec3 col = c.rgb;
    float alpha = c.a;

    if (isLabel < 0.5 && px.y < ${LIQUID.bottom}.0) {
      // Liquid surface: gentle slosh, plus ripples where the stream lands.
      float hit = exp(-pow((px.x - 477.0) / 45.0, 2.0));
      float surface = uFillRow
        + sin(px.x * 0.045 + uTime * 3.0) * 1.6
        + hit * uPour * (3.0 + sin(uTime * 15.0) * 2.5);

      float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      float aL = texture2D(map, vUv - vec2(7.0 / IMG.x, 0.0)).a;
      float aR = texture2D(map, vUv + vec2(7.0 / IMG.x, 0.0)).a;
      float edge = 1.0 - min(aL, aR);

      if (px.y < surface) {
        // Empty glass: dark coffee becomes see-through, reflections and the
        // silhouette edge stay.
        float shine = smoothstep(0.015, 0.22, lum);
        vec3 glass = mix(vec3(lum) * 1.25 + vec3(0.012, 0.02, 0.016), c.rgb, 0.3);
        col = mix(glass, vec3(0.42, 0.48, 0.45), edge * 0.35);
        alpha = c.a * max(0.07 + 0.93 * shine, edge * 0.75);
      } else {
        // Filled with milk coffee (colours are linear): creamy caramel brown,
        // shading darker towards the sides so it reads as a round body of
        // liquid, with slow swirls of milk still settling.
        float side = (px.x - 477.0) / 190.0;
        vec3 milk = vec3(0.32, 0.145, 0.058) * (1.0 - 0.6 * side * side) + vec3(0.02, 0.008, 0.003);
        milk *= 0.92 + 0.1 * sin(px.y * 0.021 + px.x * 0.011 + uTime * 0.8) * sin(px.x * 0.031 - uTime * 0.5);
        // Seen through ribbed glass. The photo's own ribs barely show through
        // the pale liquid, so model them: vertical flutes round the bottle
        // that shade the liquid in their grooves and catch a glint on each
        // ridge, plus two tall reflections of the studio lights.
        float ang = asin(clamp(side, -0.999, 0.999));
        float flute = cos(ang * 22.0);
        float groove = smoothstep(0.2, 1.0, -flute);
        float ridge = smoothstep(0.7, 1.0, flute) * (0.4 + 0.6 * abs(side));
        float lights = exp(-pow((side + 0.56) / 0.07, 2.0)) * 0.9 + exp(-pow((side - 0.64) / 0.045, 2.0)) * 0.55;
        float shine = smoothstep(0.1, 0.5, lum);
        col = milk * (1.0 - 0.3 * groove);
        col += vec3(0.85, 0.9, 0.88) * (lights * 0.45 + ridge * 0.12 + shine * shine * 0.3);
        col = mix(col, vec3(0.012, 0.022, 0.016) + vec3(lum) * 0.8, edge * 0.7);
        // Thick, clear glass base under the liquid.
        float base = smoothstep(1150.0, 1195.0, px.y);
        col = mix(col, vec3(0.02, 0.03, 0.025) + vec3(0.7, 0.78, 0.74) * shine * 0.7 + milk * 0.25, base * 0.7);
        if (px.y < surface + 10.0) {
          // Pale foam line at the top of the milk coffee.
          float k = 1.0 - (px.y - surface) / 10.0;
          col = mix(col, vec3(0.6, 0.4, 0.22), 0.8 * k);
        }
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
  const [src, maskSrc] = useTexture([TEASER_IMG, MASK_IMG]);
  const tex = useMemo(() => cutoutBottle(src.image as HTMLImageElement), [src]);
  const shadows = useMemo(
    () => ({
      soft: softShadow(),
      contact: radialTexture([
        [0, 'rgba(0,0,0,0.95)'],
        [0.55, 'rgba(0,0,0,0.6)'],
        [1, 'rgba(0,0,0,0)'],
      ]),
      caustic: radialTexture([
        [0, 'rgba(255,214,160,1)'],
        [0.35, 'rgba(214,150,86,0.55)'],
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
          mask: { value: maskSrc },
          uFillRow: { value: LIQUID.bottom },
          uTime: { value: 0 },
          uPour: { value: 0 },
          uOpacity: { value: 0 },
        },
      }),
    [tex, maskSrc],
  );
  useEffect(
    () => () => {
      tex.body.dispose();
      tex.cap.dispose();
      shadows.soft.dispose();
      shadows.contact.dispose();
      shadows.caustic.dispose();
      bodyMat.dispose();
    },
    [tex, shadows, bodyMat],
  );
  const softRef = useRef<THREE.MeshBasicMaterial>(null);
  const contactRef = useRef<THREE.MeshBasicMaterial>(null);
  const glassShadowRef = useRef<THREE.MeshBasicMaterial>(null);
  const causticRef = useRef<THREE.MeshBasicMaterial>(null);

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
    // The caustic only appears once there's liquid in the glass to focus the light.
    const fill = (LIQUID.bottom - u.uFillRow.value) / (LIQUID.bottom - LIQUID.full);
    if (glassShadowRef.current) glassShadowRef.current.opacity = 0.5 * o;
    if (causticRef.current) causticRef.current.opacity = 0.55 * o * (0.25 + 0.75 * fill);
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
      {/*
        Glass shadow on the stone: lighter and softer than a solid object's,
        falling back from the key light, with a warm caustic in front where
        the glass and liquid focus light through.
      */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-0.22, baseY + 0.005, -0.3]} scale={[baseW * 2.6, 0.95, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial ref={glassShadowRef} map={shadows.soft} transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.1, baseY + 0.007, 0.3]} scale={[baseW * 1.4, 0.42, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          ref={causticRef}
          map={shadows.caustic}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
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

    // Milk coffee: creamy caramel, darker where the stream turns away.
    vec3 edge = vec3(0.07, 0.028, 0.008);
    vec3 body = vec3(0.34, 0.15, 0.06);
    vec3 core = vec3(0.52, 0.27, 0.12);
    vec3 col = mix(edge, body, smoothstep(0.0, 0.55, facing));
    col = mix(col, core, smoothstep(0.7, 1.0, facing) * 0.45);

    // Spiral bands from the twist, sliding down the stream.
    float band = sin(vAngle * 2.0 + vY * 12.0 + uTime * 9.0);
    col *= 0.85 + 0.3 * smoothstep(0.2, 1.0, band);

    // Glossy highlights from the key light and a soft rim.
    vec3 l = normalize(vec3(-0.45, 0.35, 0.82));
    vec3 h = normalize(l + vView);
    float spec = pow(max(dot(n, h), 0.0), 70.0);
    col += vec3(1.0, 0.8, 0.55) * spec * 0.9;
    col += vec3(0.35, 0.12, 0.02) * pow(1.0 - facing, 3.0) * 0.5;

    gl_FragColor = vec4(col, mix(0.92, 0.99, facing));
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

/**
 * Top-left corner kept free of beans for the logo, in screen space (-1..1):
 * beans stay right of `x` or below `y`. Mirrors the logo's CSS in Teaser.tsx
 * (position + size, plus breathing room).
 */
function logoCorner(w: number, h: number) {
  const sm = w >= 640;
  const right = (sm ? 32 + 104 : 20 + 80) + 28;
  const bottom = (sm ? 28 + 104 : 20 + 80) + 28;
  return { x: -1 + (2 * right) / w, y: 1 - (2 * bottom) / h };
}

/** The DOM taglines, faded in and out from the 3D loop (set by Teaser.tsx): on the stone, and above the bottle. */
export const taglineEl: { current: HTMLElement | null } = { current: null };
export const taglineTopEl: { current: HTMLElement | null } = { current: null };

/** "Coffee Without Compromise" on the stone is constantly visible. */
function taglineOpacity(_t: number) {
  return 1;
}

/** The tagline above the bottle appears once the cap is closed (taking over from the stone), and fades out with the bottle. */
function taglineTopOpacity(t: number) {
  return smoothstep(K.screwEnd - 0.1, K.screwEnd + 0.6, t) * (1 - smoothstep(K.fadeOutStart, CYCLE, t));
}

/** Point on the front face of the stone, just below its top edge, where the tagline sits. */
function taglineAnchor(camera: THREE.Camera, w: number, h: number, out: THREE.Vector3) {
  const portrait = w / h < PORTRAIT_ASPECT;
  return out.set(POUR_X, STAND_Y - (portrait ? 0.3 : 0.27), 0.9).project(camera);
}

function TaglineSync() {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  const last = useRef({ o: -1, top: -1, o2: -1 });
  useFrame((state) => {
    const t = loopTime(state.clock.elapsedTime);
    const topEl = taglineTopEl.current;
    if (topEl) {
      const o2 = taglineTopOpacity(t);
      if (Math.abs(o2 - last.current.o2) >= 0.002) {
        last.current.o2 = o2;
        topEl.style.opacity = o2.toFixed(3);
        topEl.style.transform = `translateY(${((1 - o2) * 14).toFixed(1)}px)`;
      }
    }
    const el = taglineEl.current;
    if (!el) return;
    const o = taglineOpacity(t);
    const top = Math.round(((1 - taglineAnchor(camera, size.width, size.height, v).y) / 2) * size.height);
    if (top !== last.current.top) {
      last.current.top = top;
      el.style.top = `${top}px`;
    }
    if (Math.abs(o - last.current.o) < 0.002) return;
    last.current.o = o;
    el.style.opacity = o.toFixed(3);
    // Centred on the anchor, rising a little as it appears.
    el.style.transform = `translateY(calc(-50% + ${((1 - o) * 14).toFixed(1)}px))`;
  });
  return null;
}

/**
 * Where the tagline sits, in screen space (-1..1): half-width and the top and
 * bottom of its box, around its anchor on the stone. Mirrors its CSS in
 * Teaser.tsx, plus breathing room; beans keep out of it.
 */
function taglineBox(w: number, h: number, anchorY: number) {
  const sm = w >= 640;
  const fontPx = Math.min(25.6, Math.max(13.6, Math.min(0.0175 * w, 0.032 * h)));
  const widthPx = 25 * fontPx * (sm ? 1.1 : 0.95) + 56;
  const halfPx = (fontPx * 1.4 + 8 + 1) / 2 + 22;
  return { halfX: widthPx / w, top: anchorY + (2 * halfPx) / h, bottom: anchorY - (2 * halfPx) / h };
}

/** Same, for the tagline above the bottle (top 9vh, or 15vh on phones). */
function taglineTopBox(w: number, h: number) {
  const sm = w >= 640;
  const fontPx = Math.min(25.6, Math.max(13.6, Math.min(0.0175 * w, 0.032 * h)));
  const widthPx = 25 * fontPx * (sm ? 1.1 : 0.95) + 56;
  const topPx = (sm ? 0.09 : 0.15) * h - 22;
  const bottomPx = topPx + 22 + fontPx * 1.4 + 8 + 1 + 22;
  return { halfX: widthPx / w, top: 1 - (2 * topPx) / h, bottom: 1 - (2 * bottomPx) / h };
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
  const anchor = useMemo(() => new THREE.Vector3(), []);
  // Per-frame scratch: each bean's position, depth and keep-clear sizes.
  const tmp = useMemo(
    () => ({
      x: new Float32Array(count),
      y: new Float32Array(count),
      dist: new Float32Array(count),
      halfH: new Float32Array(count),
      halfW: new Float32Array(count),
      clearW: new Float32Array(count),
    }),
    [count],
  );

  useFrame((state, dt) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const time = state.clock.elapsedTime;
    const cam = camera as THREE.PerspectiveCamera;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const band = titleBand(size.width, size.height);
    const logo = logoCorner(size.width, size.height);
    const tags = [
      taglineBox(size.width, size.height, taglineAnchor(camera, size.width, size.height, anchor).y),
      taglineTopBox(size.width, size.height),
    ];

    const camY = cam.position.y;
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
      const y = camY + ny * halfH + Math.sin(time * 0.6 + s.phase) * s.bob;
      tmp.x[i] = x;
      tmp.y[i] = y;
      tmp.dist[i] = dist;
      tmp.halfH[i] = halfH;
      tmp.halfW[i] = halfW;
      tmp.clearW[i] = clearW;
    }

    // No two beans overlap on screen: a few relaxation passes push apart any
    // pair whose on-screen circles touch, split evenly between them. Done in
    // screen terms (position / depth) so near and far beans are treated alike.
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < count; i++) {
        const ri = (seeds[i].scale * BEAN_REACH) / tmp.dist[i];
        for (let j = i + 1; j < count; j++) {
          const rj = (seeds[j].scale * BEAN_REACH) / tmp.dist[j];
          const ax = tmp.x[i] / tmp.dist[i];
          const ay = (tmp.y[i] - camY) / tmp.dist[i];
          const bx = tmp.x[j] / tmp.dist[j];
          const by = (tmp.y[j] - camY) / tmp.dist[j];
          let dx = bx - ax;
          let dy = by - ay;
          let d = Math.hypot(dx, dy);
          const min = ri + rj;
          if (d >= min) continue;
          if (d < 1e-5) {
            dx = 1;
            dy = 0;
            d = 1;
          }
          const push = (min - d) / 2;
          const ux = dx / d;
          const uy = dy / d;
          tmp.x[i] -= ux * push * tmp.dist[i];
          tmp.y[i] -= uy * push * tmp.dist[i];
          tmp.x[j] += ux * push * tmp.dist[j];
          tmp.y[j] += uy * push * tmp.dist[j];
        }
      }
    }

    for (let i = 0; i < count; i++) {
      const s = seeds[i];
      const halfH = tmp.halfH[i];
      const halfW = tmp.halfW[i];
      const reach = s.scale * 0.75;
      // Being pushed apart mustn't bring a bean back over the bottle or the title.
      const side = Math.sign(s.nx);
      let x = side * Math.max(side * tmp.x[i], tmp.clearW[i]);
      let y = tmp.y[i];
      if (s.avoid) {
        const sy = (y - camY) / halfH;
        const lo = band.lo - reach / halfH;
        const hi = band.hi + reach / halfH;
        if (sy > lo && sy < hi) y = camY + (sy - lo < hi - sy ? lo : hi) * halfH;
      }
      // Keep out from behind the logo: a bean reaching into its corner is
      // nudged out of it, right or down, whichever is the shorter move (so
      // they don't all pile up in one place).
      const logoX = logo.x * halfW;
      const logoY = cam.position.y + logo.y * halfH;
      const pushRight = logoX - (x - reach);
      const pushDown = y + reach - logoY;
      if (pushRight > 0 && pushDown > 0) {
        if (pushRight < pushDown) x += pushRight;
        else y -= pushDown;
      }
      // Keep both taglines' spots clear: out sideways or down, whichever is
      // the shorter move.
      for (const tag of tags) {
        const tagX = tag.halfX * halfW;
        const tagTop = camY + tag.top * halfH;
        const tagBottom = camY + tag.bottom * halfH;
        if (Math.abs(x) - reach < tagX && y + reach > tagBottom && y - reach < tagTop) {
          const out = tagX + reach - Math.abs(x);
          const down = y + reach - tagBottom;
          if (out < down) x += Math.sign(x || 1) * out;
          else y -= down;
        }
      }
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
