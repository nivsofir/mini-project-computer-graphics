import * as THREE from "three";

// ==========================
// Sky gradient dome
// ==========================
// Course concept: Procedural Textures / Transformations, applied to
// vertex colors instead of a canvas. A large inward-facing sphere with a
// baked vertical color gradient (dark zenith -> deep violet -> warm
// horizon glow) replaces the flat background color, at the cost of a
// single extra draw call with no lighting or texture sampling involved.
export function createSky() {
  const radius = 400;
  const geometry = new THREE.SphereGeometry(radius, 24, 16);
  const position = geometry.attributes.position;

  const horizon = new THREE.Color(0x3a1240);
  const mid = new THREE.Color(0x140a2e);
  const zenith = new THREE.Color(0x02030a);

  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();

  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i) / radius; // -1 (down) .. 1 (up)
    const t = THREE.MathUtils.clamp((y + 1) / 2, 0, 1); // 0 down .. 1 up

    if (t > 0.55) {
      color.copy(mid).lerp(zenith, (t - 0.55) / 0.45);
    } else {
      color.copy(horizon).lerp(mid, t / 0.55);
    }

    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });

  const sky = new THREE.Mesh(geometry, material);
  sky.renderOrder = -1;
  return sky;
}
