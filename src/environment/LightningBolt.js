import * as THREE from "three";

// ==========================
// Lightning bolt geometry
// ==========================
// Course concept: Procedural Generation (fractal midpoint displacement).
// A jagged fork is built by recursively splitting a start->end segment at
// its midpoint, nudging that midpoint sideways, and repeating on the two
// halves with the nudge amount halved each level - the same technique
// used for fractal terrain/coastlines, applied to a single line instead
// of a heightmap. One or two shorter side-branches peel off the main bolt
// partway down for a less mechanical silhouette.
//
// Redrawn only at the instant a strike begins (see Lightning's onStrike
// callback) - during the flash itself only material opacity animates, so
// this never touches geometry per frame.
const MAX_DEPTH = 6;
const MIN_DISPLACE = 0.4;
const BRANCH_COUNT = 2;
const BRANCH_DEPTH = 3;

// Sized generously for MAX_DEPTH=6 main path plus a couple of shorter
// branches; unused tail vertices are excluded via setDrawRange each strike.
const MAX_SEGMENTS = 400;

function displace(start, end, depth, sway, points) {
  if (depth <= 0 || sway < MIN_DISPLACE) {
    points.push(end);
    return;
  }

  const mid = start.clone().lerp(end, 0.5 + (Math.random() - 0.5) * 0.3);
  mid.x += (Math.random() - 0.5) * sway;
  mid.z += (Math.random() - 0.5) * sway;

  displace(start, mid, depth - 1, sway * 0.5, points);
  displace(mid, end, depth - 1, sway * 0.5, points);
}

function buildPath(start, end, depth, sway) {
  const points = [start];
  displace(start, end, depth, sway, points);
  return points;
}

export class LightningBolt {
  constructor(scene) {
    this.scene = scene;

    const positions = new Float32Array(MAX_SEGMENTS * 2 * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setDrawRange(0, 0);

    const material = new THREE.LineBasicMaterial({
      color: 0xdff2ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.line = new THREE.LineSegments(geometry, material);
    this.line.frustumCulled = false;
    scene.add(this.line);

    this._segmentCount = 0;
  }

  // Picks a random strike location roughly above the city and rebuilds
  // the jagged path from scratch. Called once per strike, not per frame.
  strike() {
    const start = new THREE.Vector3(
      THREE.MathUtils.randFloatSpread(90),
      THREE.MathUtils.randFloat(65, 95),
      THREE.MathUtils.randFloatSpread(90),
    );
    const end = new THREE.Vector3(
      start.x + THREE.MathUtils.randFloatSpread(20),
      THREE.MathUtils.randFloat(4, 22),
      start.z + THREE.MathUtils.randFloatSpread(20),
    );

    const mainPath = buildPath(start, end, MAX_DEPTH, 14);

    const positions = this.line.geometry.attributes.position.array;
    let vertex = 0;
    const pushSegment = (a, b) => {
      if (vertex + 6 > positions.length) return;
      positions[vertex++] = a.x;
      positions[vertex++] = a.y;
      positions[vertex++] = a.z;
      positions[vertex++] = b.x;
      positions[vertex++] = b.y;
      positions[vertex++] = b.z;
    };

    for (let i = 0; i < mainPath.length - 1; i++) {
      pushSegment(mainPath[i], mainPath[i + 1]);
    }

    // A couple of shorter forks branching off random points along the
    // main bolt, angled slightly outward rather than following its path.
    for (let b = 0; b < BRANCH_COUNT; b++) {
      const originIndex = 1 + Math.floor(Math.random() * (mainPath.length - 2));
      const origin = mainPath[originIndex];
      const branchEnd = new THREE.Vector3(
        origin.x + THREE.MathUtils.randFloatSpread(24),
        Math.max(0, origin.y - THREE.MathUtils.randFloat(10, 25)),
        origin.z + THREE.MathUtils.randFloatSpread(24),
      );
      const branchPath = buildPath(origin, branchEnd, BRANCH_DEPTH, 8);
      for (let i = 0; i < branchPath.length - 1; i++) {
        pushSegment(branchPath[i], branchPath[i + 1]);
      }
    }

    this._segmentCount = vertex / 3;
    this.line.geometry.attributes.position.needsUpdate = true;
    this.line.geometry.setDrawRange(0, this._segmentCount);
  }

  // `intensity` is Lightning's own 0..1 flicker curve - reused directly so
  // the bolt's brightness decays in lockstep with the light-intensity spike.
  update(intensity) {
    this.line.material.opacity = intensity;
    this.line.visible = intensity > 0.001;
  }

  dispose() {
    this.scene.remove(this.line);
    this.line.geometry.dispose();
    this.line.material.dispose();
  }
}
