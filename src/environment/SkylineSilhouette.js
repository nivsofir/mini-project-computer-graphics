import * as THREE from "three";

// ==========================
// Distant skyline silhouette
// ==========================
// Course concept: Instancing + Fog. A ring of flat, unlit boxes well
// beyond the detailed city, faded by scene fog into hazy silhouettes.
// One InstancedMesh draw call buys a strong sense of scale and depth
// that hand-placed detailed buildings never could at this distance.
const RING_MIN_RADIUS = 85;
const RING_MAX_RADIUS = 155;

export function createSkylineSilhouette(rng, count = 90) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(0, 0.5, 0);

  const material = new THREE.MeshBasicMaterial({ color: 0x160b28, fog: true });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = "SkylineSilhouette";

  const dummy = new THREE.Object3D();

  for (let i = 0; i < count; i++) {
    const angle = rng.next() * Math.PI * 2;
    const radius =
      RING_MIN_RADIUS + rng.next() * (RING_MAX_RADIUS - RING_MIN_RADIUS);

    const width = 4 + rng.next() * 9;
    const depth = 4 + rng.next() * 9;
    const height = 14 + rng.next() * 60;

    dummy.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    dummy.rotation.y = rng.next() * Math.PI * 2;
    dummy.scale.set(width, height, depth);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }

  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}
