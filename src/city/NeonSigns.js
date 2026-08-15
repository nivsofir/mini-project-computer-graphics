import * as THREE from "three";
import {
  createNeonSignTexture,
  createGlowHaloTexture,
} from "./ProceduralTextures.js";

// ==========================
// Procedural Neon Signs
// ==========================
// Course concept: Procedural Textures. Each sign's text/border/glow is
// drawn on a canvas at generation time and mapped onto a small plane.
// Count is capped so sign textures (the one part of the city that is NOT
// batched, since each carries unique text) stay a small, fixed draw-call
// cost regardless of city size.

const NEON_WORDS = [
  "NEXUS",
  "NEON",
  "CYBER",
  "VOID",
  "NOVA",
  "2077",
  "SYNTH",
  "BYTE",
];

const NEON_COLORS = ["#00ffff", "#ff0088", "#ff00ff", "#ffaa00", "#4488ff"];

const MAX_SIGNS = 60;
const SIGN_CHANCE = 0.22;
const SIGNS_PER_BUILDING_MIN = 1;
const SIGNS_PER_BUILDING_MAX = 3;

// A small boost keeps signs a little more distinct from ordinary lit
// windows under bloom without blowing out into a glare - kept modest on
// purpose (this used to be 1.7, which read as too bright).
const SIGN_BRIGHTNESS = 1.2;
const HALO_SIZE_MULT = 1.3;

const haloDummy = new THREE.Object3D();

export function createNeonSigns(rng, buildingPlans) {
  const group = new THREE.Group();
  group.name = "NeonSigns";

  // All sign glow halos share one texture + one InstancedMesh, tinted
  // per-instance, so a whole city of signs costs one extra draw call.
  const haloGeometry = new THREE.PlaneGeometry(1, 1);
  const haloMaterial = new THREE.MeshBasicMaterial({
    map: createGlowHaloTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const haloMesh = new THREE.InstancedMesh(
    haloGeometry,
    haloMaterial,
    MAX_SIGNS,
  );
  haloMesh.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(MAX_SIGNS * 3),
    3,
  );

  let signCount = 0;

  for (const plan of buildingPlans) {
    if (signCount >= MAX_SIGNS) break;
    if (!rng.bool(SIGN_CHANCE)) continue;

    const { x, z, footprintW, footprintD, baseHeight } = plan;

    // A selected building gets a small cluster of signs rather than
    // exactly one - stacked in their own height band so they never
    // overlap, whichever face each one lands on.
    const signsHere = Math.min(
      rng.int(SIGNS_PER_BUILDING_MIN, SIGNS_PER_BUILDING_MAX),
      MAX_SIGNS - signCount,
    );

    const bandBottom = Math.max(1, baseHeight * 0.22);

    for (let band = 0; band < signsHere; band++) {
      const text = rng.pick(NEON_WORDS);
      const color = rng.pick(NEON_COLORS);
      const texture = createNeonSignTexture(text, color);

      // Pick a face first, then size the sign to that face's actual
      // width - never wider than the wall it's mounted on. baseHeight
      // (not the full building height) keeps it below any narrower
      // setback/spire above.
      const onFrontFace = rng.bool(0.5);
      const faceWidth = onFrontFace ? footprintW : footprintD;

      const signWidth = Math.min(faceWidth * 0.82, 4.2);
      const signHeight = signWidth * 0.38;

      const bandTop = Math.max(bandBottom + 0.5, baseHeight - signHeight);
      const bandSize = (bandTop - bandBottom) / signsHere;
      const signY =
        bandBottom +
        bandSize * (band + 0.5) +
        rng.range(-bandSize * 0.15, bandSize * 0.15);

      const geometry = new THREE.PlaneGeometry(signWidth, signHeight);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        color: new THREE.Color(SIGN_BRIGHTNESS, SIGN_BRIGHTNESS, SIGN_BRIGHTNESS),
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      const sign = new THREE.Mesh(geometry, material);

      let normalX = 0;
      let normalZ = 0;

      if (onFrontFace) {
        sign.position.set(x, signY, z + footprintD / 2 + 0.03);
        normalZ = 1;
      } else {
        sign.position.set(x + footprintW / 2 + 0.03, signY, z);
        sign.rotation.y = Math.PI / 2;
        normalX = 1;
      }

      group.add(sign);

      const haloSize = signWidth * HALO_SIZE_MULT;
      haloDummy.position.set(
        sign.position.x + normalX * 0.05,
        sign.position.y,
        sign.position.z + normalZ * 0.05,
      );
      haloDummy.rotation.set(0, sign.rotation.y, 0);
      haloDummy.scale.set(haloSize, haloSize, haloSize);
      haloDummy.updateMatrix();
      haloMesh.setMatrixAt(signCount, haloDummy.matrix);
      haloMesh.setColorAt(signCount, new THREE.Color(color));

      signCount++;
      if (signCount >= MAX_SIGNS) break;
    }
  }

  haloMesh.count = signCount;
  haloMesh.instanceMatrix.needsUpdate = true;
  if (haloMesh.instanceColor) haloMesh.instanceColor.needsUpdate = true;
  group.add(haloMesh);

  return group;
}

export function disposeNeonSigns(group) {
  group.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry.dispose();
    child.material.map?.dispose();
    child.material.dispose();
  });
}
