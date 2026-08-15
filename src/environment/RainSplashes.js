import * as THREE from "three";

// ==========================
// Rain splashes
// ==========================
// Course concept: Particle Systems. A fixed-size pool of point sprites,
// recycled round-robin - spawning a splash never allocates, it just
// claims the next pool slot and resets its age. Fade-out uses per-vertex
// alpha (a 4-component color attribute) rather than a shader, so this
// stays a single THREE.Points draw call with a plain PointsMaterial.
const POOL_SIZE = 220;
const LIFETIME = 0.35;
const SPAWN_CHANCE = 0.1; // only some raindrops bother spawning a splash

export class RainSplashes {
  constructor(scene) {
    this.scene = scene;

    const positions = new Float32Array(POOL_SIZE * 3);
    const colors = new Float32Array(POOL_SIZE * 4);
    this.ages = new Float32Array(POOL_SIZE).fill(Infinity);
    this.nextSlot = 0;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 4));

    const material = new THREE.PointsMaterial({
      size: 0.55,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, material);
    scene.add(this.points);
  }

  // Called from Rain's onLand callback - not every drop spawns a splash,
  // both to keep the ground from looking too busy and to cheaply cap
  // the visual cost regardless of the rain amount slider.
  spawn(x, z) {
    if (Math.random() > SPAWN_CHANCE) return;

    const i = this.nextSlot;
    this.nextSlot = (this.nextSlot + 1) % POOL_SIZE;

    const positions = this.points.geometry.attributes.position.array;
    positions[i * 3] = x;
    positions[i * 3 + 1] = 0.06;
    positions[i * 3 + 2] = z;
    this.points.geometry.attributes.position.needsUpdate = true;

    this.ages[i] = 0;
  }

  update(delta) {
    const colors = this.points.geometry.attributes.color.array;

    for (let i = 0; i < POOL_SIZE; i++) {
      if (this.ages[i] === Infinity) continue;

      this.ages[i] += delta;
      const t = this.ages[i] / LIFETIME;

      if (t >= 1) {
        this.ages[i] = Infinity;
        colors[i * 4 + 3] = 0;
        continue;
      }

      const alpha = (1 - t) * 0.8;
      colors[i * 4] = 0.75;
      colors[i * 4 + 1] = 0.88;
      colors[i * 4 + 2] = 1.0;
      colors[i * 4 + 3] = alpha;
    }

    this.points.geometry.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
