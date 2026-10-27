import * as THREE from 'three';

/** How far the crease swings sideways (unit-sphere x) at its widest. */
export const CREASE_S = 0.07;

/**
 * Procedural roasted coffee bean.
 *
 * Shape: an elongated ellipsoid with a flatter face on the +z side carrying
 * a deep centre crease (the bean's "cut"), and a fuller domed back. The
 * crease sits at u = 0.25 of the sphere's UV wrap so the matching textures in
 * `beanTextures.ts` line up with it. A little asymmetry along the long axis
 * keeps the silhouette from reading as a perfect capsule.
 */
export function createBeanGeometry(radius = 0.5, segments = 26) {
  const geo = new THREE.SphereGeometry(radius, segments, segments);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Unit-sphere coordinates.
    const nx = v.x / radius;
    const ny = v.y / radius;
    const nz = v.z / radius;

    // Plump oval, slightly egg-shaped: one tip a touch narrower than the other.
    const taper = 1 - ny * 0.06;
    const x = nx * radius * 1.04 * taper;
    const y = ny * radius * 1.3;
    let z = nz * radius * 0.74;

    if (nz > 0) {
      // Flatter cut face with a deep gaussian crease along the long axis that
      // fades out before the tips. The crease bottoms out to a narrow slit
      // and wanders in a slight S, like a real bean's (matched in beanTextures).
      z *= 0.88;
      const cx = nx - CREASE_S * Math.sin(Math.PI * ny) * Math.sqrt(Math.max(0, 1 - ny * ny));
      const groove = Math.exp(-(cx * cx) / 0.01);
      const ends = 1 - Math.pow(Math.abs(ny), 4);
      z -= groove * ends * nz * 0.26 * radius;
      // The two halves bulge either side of the crease.
      const lip = Math.exp(-((Math.abs(cx) - 0.2) ** 2) / 0.02);
      z += lip * ends * nz * 0.03 * radius;
    } else {
      // Fuller, rounder back.
      z *= 1.12;
    }

    // Soft lumps so the surface isn't a perfect machined ellipsoid.
    const lumps =
      1 +
      0.022 * Math.sin(3.1 * nx + 1.3) * Math.sin(2.3 * ny + 0.4) +
      0.014 * Math.sin(4.3 * nz + 2.1 * ny + 0.7) +
      0.008 * Math.sin(7.0 * ny + 3.0 * nx);

    pos.setXYZ(i, x * lumps, y * lumps, z * lumps);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}
