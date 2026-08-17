import * as THREE from "three";
import { createGlowHaloTexture } from "../city/ProceduralTextures.js";

// ==========================
// Snow particle system
// ==========================
// Course concept: Particle Systems. Structurally a slower, drifting
// cousin of Rain - one THREE.Points cloud, positions mutated in place in
// a single Float32Array each frame, no per-flake allocation. Unlike rain
// streaks, flakes fall slowly and sway side to side (a sine offset from a
// per-flake "home" x/z rather than an accumulating velocity, so drift
// can't wander a flake out of the spread over time) and use the same
// soft radial-gradient sprite already generated for neon sign halos.
const SPREAD = 140;
const MAX_HEIGHT = 80;
const SWAY_FREQUENCY = 0.5;

export class Snow {
  constructor(scene, count = 0) {
    this.scene = scene;
    this.points = null;
    this.homeX = null;
    this.homeZ = null;
    this.speeds = null;
    this.swayPhase = null;
    this.swayAmount = null;
    this.count = 0;
    this.time = 0;
    // Multiplies both fall speed and sway - Weather ramps this up for the
    // "heavy snow" tier so a blizzard visibly falls faster/windier than
    // steady snow, without needing to rebuild the particle buffers.
    this.intensity = 1;
    this._texture = createGlowHaloTexture();
    this._build(count);
  }

  _build(count) {
    this.count = count;
    const positions = new Float32Array(count * 3);
    const homeX = new Float32Array(count);
    const homeZ = new Float32Array(count);
    const speeds = new Float32Array(count);
    const swayPhase = new Float32Array(count);
    const swayAmount = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      homeX[i] = THREE.MathUtils.randFloatSpread(SPREAD);
      homeZ[i] = THREE.MathUtils.randFloatSpread(SPREAD);
      speeds[i] = 0.05 + Math.random() * 0.1;
      swayPhase[i] = Math.random() * Math.PI * 2;
      swayAmount[i] = 0.6 + Math.random() * 1.4;

      const y = Math.random() * MAX_HEIGHT;
      positions[i * 3] = homeX[i];
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = homeZ[i];
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      map: this._texture,
      color: 0xf4f9ff,
      size: 0.4,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });

    this.homeX = homeX;
    this.homeZ = homeZ;
    this.speeds = speeds;
    this.swayPhase = swayPhase;
    this.swayAmount = swayAmount;
    this.points = new THREE.Points(geometry, material);
    this.scene.add(this.points);
  }

  // Rebuilds the particle buffers with a new flake count (driven by
  // Weather's snow intensity).
  setCount(count) {
    count = Math.max(0, Math.round(count));
    if (count === this.count) return;

    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.dispose();
    this._build(count);
  }

  setIntensity(intensity) {
    this.intensity = intensity;
  }

  update(delta) {
    if (this.count === 0) return;
    this.time += delta * this.intensity;

    const positions = this.points.geometry.attributes.position.array;

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      positions[i3 + 1] -= this.speeds[i] * delta * 60 * this.intensity;

      if (positions[i3 + 1] < 0) {
        this.homeX[i] = THREE.MathUtils.randFloatSpread(SPREAD);
        this.homeZ[i] = THREE.MathUtils.randFloatSpread(SPREAD);
        positions[i3 + 1] = MAX_HEIGHT * (0.7 + Math.random() * 0.3);
      }

      const sway = Math.sin(this.time * SWAY_FREQUENCY + this.swayPhase[i]) * this.swayAmount[i] * this.intensity;
      positions[i3] = this.homeX[i] + sway;
      positions[i3 + 2] = this.homeZ[i] + sway * 0.6;
    }

    this.points.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.dispose();
    this._texture.dispose();
  }
}
