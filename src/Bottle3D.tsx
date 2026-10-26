import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { lerp, smoothstep } from '@/three/math';
import { radialTexture, softShadow } from '@/three/textures';
import { TEASER_IMG } from './assets';
import {
  CAP_H,
  CAP_R,
  CAP_Y,
  PX,
  createCapSideGeometry,
  createGlassGeometry,
  createLabelGeometry,
  createLiquidGeometry,
  cropPhotoTextures,
  innerRadius,
  ly,
  outerRadius,
} from './bottleModel';
import { K, fillRow, loopTime, presence } from './timeline';

/** World height of the bottle's underside. */
export const BOTTLE_BASE_Y = -1.53;

/** World height of the coffee surface at loop time t. */
export const coffeeLevelY = (t: number) => BOTTLE_BASE_Y + ly(fillRow(t));

useTexture.preload(TEASER_IMG);

type Props = { mobile: boolean };

/**
 * The Coffee Science bottle as a real 3D object: ribbed glass with
 * refraction, coffee inside that rises with the pour, the photographed
 * label wrapped round the body and a gold cap that actually unscrews.
 * Turns gently so it reads as 3D, and materialises / dissolves at the ends
 * of each loop.
 */
export default function Bottle3D({ mobile }: Props) {
  const photo = useTexture(TEASER_IMG);
  const tex = useMemo(() => cropPhotoTextures(photo.image as HTMLImageElement), [photo]);
  const { gl } = useThree();

  // Clipping keeps the coffee below its current level.
  const clip = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), []);
  useEffect(() => {
    gl.localClippingEnabled = true;
  }, [gl]);

  const geo = useMemo(
    () => ({
      glass: createGlassGeometry(mobile ? 24 : 32, mobile ? 5 : 6),
      liquid: createLiquidGeometry(),
      label: createLabelGeometry(),
      capSide: createCapSideGeometry(),
      capTop: new THREE.CircleGeometry(CAP_R, 64),
      surface: new THREE.CircleGeometry(1, 48),
      shadow: new THREE.PlaneGeometry(1, 1),
    }),
    [mobile],
  );

  const mat = useMemo(() => {
    // Real refraction (transmission) on desktop; phones get a lighter
    // see-through glass that skips the extra transmission render pass.
    const glass = mobile
      ? new THREE.MeshPhysicalMaterial({
          color: '#d8e3dc',
          transparent: true,
          opacity: 0.2,
          roughness: 0.05,
          metalness: 0,
          clearcoat: 1,
          clearcoatRoughness: 0.04,
          envMapIntensity: 1.8,
          depthWrite: false,
        })
      : new THREE.MeshPhysicalMaterial({
          color: '#ffffff',
          transmission: 1,
          thickness: 0.22,
          ior: 1.5,
          roughness: 0.035,
          metalness: 0,
          clearcoat: 1,
          clearcoatRoughness: 0.03,
          attenuationColor: new THREE.Color('#e4eee7'),
          attenuationDistance: 4,
          specularIntensity: 1,
          envMapIntensity: 2.2,
        });
    return {
      glass,
      liquid: new THREE.MeshPhysicalMaterial({
        color: '#170902',
        roughness: 0.12,
        metalness: 0,
        clearcoat: 0.6,
        envMapIntensity: 0.6,
        clippingPlanes: [clip],
      }),
      surface: new THREE.MeshStandardMaterial({
        color: '#5c2c0d',
        emissive: '#2a1004',
        roughness: 0.25,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
      // Printed label and cap keep their photographed colours (emissive), with
      // a little real lighting and sheen on top as the bottle turns.
      label: new THREE.MeshStandardMaterial({
        map: tex.label,
        emissive: '#ffffff',
        emissiveMap: tex.label,
        emissiveIntensity: 0.55,
        roughness: 0.45,
        metalness: 0.15,
        alphaTest: 0.5,
      }),
      capSide: new THREE.MeshStandardMaterial({
        map: tex.cap,
        emissive: '#ffffff',
        emissiveMap: tex.cap,
        emissiveIntensity: 0.5,
        roughness: 0.3,
        metalness: 0.55,
        side: THREE.DoubleSide,
      }),
      capTop: new THREE.MeshStandardMaterial({ color: '#c39445', metalness: 0.9, roughness: 0.28, envMapIntensity: 1.4 }),
      softShadow: new THREE.MeshBasicMaterial({ map: softShadow(), transparent: true, opacity: 0.8, depthWrite: false }),
      contactShadow: new THREE.MeshBasicMaterial({
        map: radialTexture([
          [0, 'rgba(0,0,0,0.95)'],
          [0.55, 'rgba(0,0,0,0.6)'],
          [1, 'rgba(0,0,0,0)'],
        ]),
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    };
  }, [mobile, tex, clip]);

  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose());
      Object.values(mat).forEach((m) => {
        (m as THREE.MeshBasicMaterial).map?.dispose();
        m.dispose();
      });
    },
    [geo, mat],
  );
  useEffect(
    () => () => {
      tex.label.dispose();
      tex.cap.dispose();
    },
    [tex],
  );

  const groupRef = useRef<THREE.Group>(null);
  const capRef = useRef<THREE.Group>(null);
  const surfaceRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const t = loopTime(time);
    const g = groupRef.current;
    if (!g) return;

    // Materialise / dissolve with a half turn; otherwise a slow, gentle sway.
    const p = presence(t);
    const ease = p * p * (3 - 2 * p);
    g.scale.setScalar(Math.max(0.0001, ease));
    g.visible = p > 0.001;
    g.rotation.y = Math.sin(time * 0.45) * 0.3 + (1 - ease) * Math.PI * (t < K.revealEnd ? -1 : 1);

    // Coffee level (world space; the bottle only ever turns about y, scaling from its base).
    const row = fillRow(t);
    const levelY = BOTTLE_BASE_Y + ly(row) * ease;
    clip.constant = levelY;
    const s = surfaceRef.current;
    if (s) {
      const filling = row < 1189;
      s.visible = filling;
      s.position.y = ly(row);
      const r = innerRadius(row) * PX;
      // A little slosh where the stream lands.
      const wobble = 1 + Math.sin(time * 9) * 0.01;
      s.scale.set(r * wobble, r, 1);
    }

    // Cap: unscrews (real spin), lifts off out of frame, comes back and tightens.
    const c = capRef.current;
    if (c) {
      const unscrew = smoothstep(K.unscrewStart, K.unscrewEnd, t);
      const lift = smoothstep(K.unscrewEnd - 0.2, K.liftEnd, t);
      const back = smoothstep(K.returnStart, K.returnEnd, t);
      const screw = smoothstep(K.returnEnd, K.screwEnd, t);
      const away = 4;
      let y: number;
      let spin: number;
      let tilt: number;
      if (t < K.returnStart) {
        y = CAP_Y + unscrew * 0.05 + lift * lift * away;
        spin = -unscrew * Math.PI * 4 - lift * 2;
        tilt = lift * 0.45;
      } else {
        y = lerp(CAP_Y + 0.05 + away, CAP_Y + 0.05, back) - screw * 0.05;
        spin = (1 - back) * 2 + (1 - screw) * Math.PI * 4;
        tilt = (1 - back) * 0.45;
      }
      c.position.set(tilt * 0.35, y, 0);
      c.rotation.set(0, spin, -tilt);
      c.visible = y < 3.6;
    }
  });

  const bodyR = outerRadius(700) * PX;

  return (
    <group ref={groupRef} position={[0, BOTTLE_BASE_Y, 0]}>
      {/* Grounding: soft ambient pool plus a tight contact shadow under the base. */}
      <mesh geometry={geo.shadow} material={mat.softShadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} scale={[bodyR * 4.6, bodyR * 3, 1]} renderOrder={-1} />
      <mesh geometry={geo.shadow} material={mat.contactShadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]} scale={[bodyR * 2.3, bodyR * 2.1, 1]} renderOrder={-1} />

      <mesh geometry={geo.liquid} material={mat.liquid} />
      <mesh ref={surfaceRef} geometry={geo.surface} material={mat.surface} rotation={[-Math.PI / 2, 0, 0]} />
      <mesh geometry={geo.glass} material={mat.glass} />
      <mesh geometry={geo.label} material={mat.label} />

      <group ref={capRef} position={[0, CAP_Y, 0]}>
        <mesh geometry={geo.capSide} material={mat.capSide} />
        <mesh geometry={geo.capTop} material={mat.capTop} position={[0, CAP_H / 2, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      </group>
    </group>
  );
}

