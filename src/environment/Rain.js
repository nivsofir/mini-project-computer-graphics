import * as THREE from "three";

// ==========================
// Rain particle system
// ==========================
// Course concept: Particle Systems. Every raindrop is a short line
// segment (not a flat square dot), rendered as one THREE.LineSegments -
// positions live in a single Float32Array mutated in place each frame
// (no per-drop object allocation), then re-uploaded to the GPU with one
// needsUpdate flag.
const SPREAD = 140;
const MAX_HEIGHT = 80;

// Diagonal lean baked into each streak (ratio of sideways offset to
// streak length) so rain reads as wind-blown instead of falling
// perfectly straight down. Only Y is animated per frame, so this can't
// drift drops out of bounds the way an accumulating sideways velocity
// would.
const WIND_LEAN = { x: 0.28, z: 0.12 };

export class Rain {
  constructor(scene, count = 2500) {
    this.scene = scene;
    this.lines = null;
    this.speeds = null;
    this.streakLengths = null;
    this.count = 0;
    this._build(count);
  }

  _build(count) {
    this.count = count;
    // Two vertices per drop (head + tail) for a LineSegments streak.
    const positions = new Float32Array(count * 2 * 3);
    const speeds = new Float32Array(count);
    const streakLengths = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const speed = 0.3 + Math.random() * 0.7;
      speeds[i] = speed;
      // Faster drops read as slightly longer motion-blurred streaks.
      streakLengths[i] = 0.4 + speed * 0.6;

      const x = THREE.MathUtils.randFloatSpread(SPREAD);
      const y = Math.random() * MAX_HEIGHT;
      const z = THREE.MathUtils.randFloatSpread(SPREAD);
      this._setDrop(positions, i, x, y, z, streakLengths[i]);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({
      color: 0x9fd0ff,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.speeds = speeds;
    this.streakLengths = streakLengths;
    this.lines = new THREE.LineSegments(geometry, material);
    this.scene.add(this.lines);
  }

  // Writes both endpoints of one streak: the head (leading, lower) and
  // the tail (trailing, higher and leaned sideways for the wind look).
  _setDrop(positions, i, x, y, z, streakLength) {
    const i6 = i * 6;
    positions[i6] = x;
    positions[i6 + 1] = y;
    positions[i6 + 2] = z;
    positions[i6 + 3] = x + WIND_LEAN.x * streakLength;
    positions[i6 + 4] = y + streakLength;
    positions[i6 + 5] = z + WIND_LEAN.z * streakLength;
  }

  // Rebuilds the particle buffers with a new drop count (used by the
  // "Rain Amount" UI slider).
  setCount(count) {
    count = Math.max(0, Math.round(count));
    if (count === this.count) return;

    this.scene.remove(this.lines);
    this.lines.geometry.dispose();
    this.lines.material.dispose();
    this._build(count);
  }

  // `onLand(x, z)`, if given, fires once per drop the moment it reaches
  // the ground - used to spawn splash particles without Rain needing to
  // know anything about the splash system itself.
  update(delta, onLand) {
    if (this.count === 0) return;
    const positions = this.lines.geometry.attributes.position.array;

    for (let i = 0; i < this.count; i++) {
      const i6 = i * 6;
      const fall = this.speeds[i] * delta * 60;

      positions[i6 + 1] -= fall; // head y
      positions[i6 + 4] -= fall; // tail y

      if (positions[i6 + 1] < 0) {
        if (onLand) onLand(positions[i6], positions[i6 + 2]);

        const x = THREE.MathUtils.randFloatSpread(SPREAD);
        const y = 60 + Math.random() * 20;
        const z = THREE.MathUtils.randFloatSpread(SPREAD);
        this._setDrop(positions, i, x, y, z, this.streakLengths[i]);
      }
    }

    this.lines.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.lines);
    this.lines.geometry.dispose();
    this.lines.material.dispose();
  }
}
