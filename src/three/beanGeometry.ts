import * as THREE from 'three';

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

    // Slightly egg-shaped: one tip a touch narrower than the other.
    const taper = 1 - ny * 0.06;
    const x = nx * radius * 1.0 * taper;
    const y = ny * radius * 1.42;
    let z = nz * radius * 0.7;

    if (nz > 0) {
      // Flatter cut face with a deep gaussian crease along the long axis that
      // fades out before the tips. The crease bottoms out to a narrow slit.
      z *= 0.88;
      const groove = Math.exp(-(nx * nx) / 0.03);
      const ends = 1 - Math.pow(Math.abs(ny), 4);
      z -= groove * ends * nz * 0.3 * radius;
      // A gentle raised lip either side of the crease.
      const lip = Math.exp(-((Math.abs(nx) - 0.28) ** 2) / 0.02);
      z += lip * ends * nz * 0.035 * radius;
    } else {
      // Fuller, rounder back.
      z *= 1.12;
    }

    pos.setXYZ(i, x, y, z);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}
