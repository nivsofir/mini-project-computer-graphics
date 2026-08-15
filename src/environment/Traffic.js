import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ROAD_CENTERS } from "../config.js";

// ==========================
// Traffic - flying + ground cars
// ==========================
// Course concept: Instancing. Each car is a small compound shape
// (chassis + cabin + thruster pods + mirrors + light bars + underglow)
// merged into ONE BufferGeometry, so however car-like it looks, the
// whole traffic system is still a single InstancedMesh / one draw call.
// A second InstancedMesh renders a fading light-trail ribbon behind
// every car, synced to the same per-car transform each frame - one more
// draw call for the whole fleet's trails combined.
//
// Most traffic flies at one of three altitude bands; a fourth "ground"
// tier drives right on the road surface instead (no hover bob), so the
// street below isn't empty while most of the fleet is airborne.
//
// Collision avoidance: cars don't run a physics simulation. Instead
// every car is assigned a *unique* (road, lane, altitude) slot up
// front, enumerated below, so no two cars ever share the same lane at
// the same height - they simply cannot run into each other.
const GROUND_LEVEL = 0;
const FLYING_ALTITUDES = [9, 13, 17];
const ALTITUDES = [GROUND_LEVEL, ...FLYING_ALTITUDES];
const LANE_DIRECTIONS = [
  { lane: 1.3, direction: 1 },
  { lane: -1.3, direction: -1 },
];
const REAR_OFFSET = 1.05;

const dummy = new THREE.Object3D();
const trailDummy = new THREE.Object3D();

function tintGeometry(geometry, [r, g, b]) {
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

// Local space: length along +Z (front), width along X, up is +Y.
function createCarGeometry() {
  const BODY = [1, 1, 1]; // tinted by instanceColor -> the car's paint
  const GLASS = [0.08, 0.1, 0.15]; // stays dark regardless of tint
  const HEADLIGHT = [2.6, 3.0, 3.4];
  const TAILLIGHT = [3.2, 0.18, 0.15]; // red-dominant even after tint multiply
  const THRUSTER = [0.5, 1.6, 2.2]; // dim repulsor glow, not a plain dark tire
  const UNDERGLOW = [1.4, 1.6, 1.8];

  const parts = [];

  const chassis = new THREE.BoxGeometry(0.95, 0.34, 2.0);
  chassis.translate(0, 0.22, 0);
  tintGeometry(chassis, BODY);
  parts.push(chassis);

  const cabin = new THREE.BoxGeometry(0.62, 0.28, 1.05);
  cabin.translate(0, 0.53, -0.15);
  tintGeometry(cabin, GLASS);
  parts.push(cabin);

  const frontBar = new THREE.BoxGeometry(0.8, 0.1, 0.06);
  frontBar.translate(0, 0.24, 1.02);
  tintGeometry(frontBar, HEADLIGHT);
  parts.push(frontBar);

  const rearBar = new THREE.BoxGeometry(0.8, 0.1, 0.06);
  rearBar.translate(0, 0.32, -1.02);
  tintGeometry(rearBar, TAILLIGHT);
  parts.push(rearBar);

  // Repulsor pods replace wheels - glowing, not resting on the ground.
  const podPositions = [
    [0.48, 0.08, 0.65],
    [-0.48, 0.08, 0.65],
    [0.48, 0.08, -0.65],
    [-0.48, 0.08, -0.65],
  ];
  for (const [x, y, z] of podPositions) {
    const pod = new THREE.CylinderGeometry(0.14, 0.1, 0.1, 8);
    pod.translate(x, y, z);
    tintGeometry(pod, THRUSTER);
    parts.push(pod);
  }

  // Thin glowing underbelly strip - the hover/thruster field.
  const belly = new THREE.BoxGeometry(0.7, 0.04, 1.7);
  belly.translate(0, 0.03, 0);
  tintGeometry(belly, UNDERGLOW);
  parts.push(belly);

  const mirrorPositions = [
    [0.34, 0.5, 0.25],
    [-0.34, 0.5, 0.25],
  ];
  for (const [x, y, z] of mirrorPositions) {
    const mirror = new THREE.BoxGeometry(0.05, 0.05, 0.12);
    mirror.translate(x, y, z);
    tintGeometry(mirror, BODY);
    parts.push(mirror);
  }

  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return merged;
}

// A flat ribbon in the local Z-Y plane, running from the car's rear
// (z = 0, attachment point) back to the tail (z = -1). Scaled per
// instance along Z for the trail's length; UV.x = 1 at the car end
// (bright) and 0 at the tail (faded out by the gradient texture).
function createTrailGeometry() {
  const halfHeight = 0.2;
  const positions = new Float32Array([
    0, -halfHeight, 0,
    0, halfHeight, 0,
    0, halfHeight, -1,
    0, -halfHeight, -1,
  ]);
  const uvs = new Float32Array([1, 0, 1, 1, 0, 1, 0, 0]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return geometry;
}

function createTrailFadeTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 4;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 64, 0);
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(1, "rgba(255,255,255,0.9)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 4);
  return new THREE.CanvasTexture(canvas);
}

// Every swatch keeps a nonzero red channel so the (red-dominant)
// taillight bar never gets multiplied down to black.
const TRAFFIC_COLORS = [
  new THREE.Color(0xff2244),
  new THREE.Color(0x2affff),
  new THREE.Color(0xff33ff),
  new THREE.Color(0xffaa33),
];

// Every (axis, road, lane, altitude) combination gets at most one car,
// so lanes never overlap and cars can never collide.
function buildSlots() {
  const slots = [];
  for (const horizontal of [true, false]) {
    for (const road of ROAD_CENTERS) {
      for (const { lane, direction } of LANE_DIRECTIONS) {
        for (const altitude of ALTITUDES) {
          slots.push({ horizontal, road, lane, direction, altitude });
        }
      }
    }
  }
  return slots;
}

export class Traffic {
  constructor(scene) {
    const slots = buildSlots();
    this.count = slots.length;
    this._elapsed = 0;

    const geometry = createCarGeometry();
    const material = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.mesh = new THREE.InstancedMesh(geometry, material, this.count);
    scene.add(this.mesh);

    const trailMaterial = new THREE.MeshBasicMaterial({
      map: createTrailFadeTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.trailMesh = new THREE.InstancedMesh(
      createTrailGeometry(),
      trailMaterial,
      this.count,
    );
    this.trailMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(this.count * 3),
      3,
    );
    scene.add(this.trailMesh);

    this.cars = slots.map((slot) => {
      const speed = 8 + Math.random() * 10;
      return {
        ...slot,
        position: THREE.MathUtils.randFloat(-70, 70),
        speed,
        trailLength: 1.4 + speed * 0.16,
        bobPhase: Math.random() * Math.PI * 2,
        bobSpeed: 1.1 + Math.random() * 0.6,
      };
    });

    for (let i = 0; i < this.count; i++) {
      const color =
        TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)];
      this.mesh.setColorAt(i, color);
      this.trailMesh.setColorAt(i, color);
    }
    this.mesh.instanceColor.needsUpdate = true;
    this.trailMesh.instanceColor.needsUpdate = true;
  }

  update(delta) {
    this._elapsed += delta;

    for (let i = 0; i < this.count; i++) {
      const car = this.cars[i];
      car.position += car.speed * car.direction * delta;

      if (car.position > 75) car.position = -75;
      if (car.position < -75) car.position = 75;

      const bob =
        car.altitude === GROUND_LEVEL
          ? 0
          : Math.sin(this._elapsed * car.bobSpeed + car.bobPhase) * 0.15;
      const y = car.altitude + bob;
      const rotationY = car.horizontal
        ? car.direction > 0
          ? Math.PI / 2
          : -Math.PI / 2
        : car.direction > 0
          ? 0
          : Math.PI;

      let carX;
      let carZ;
      if (car.horizontal) {
        carX = car.position;
        carZ = car.road + car.lane;
      } else {
        carX = car.road + car.lane;
        carZ = car.position;
      }

      dummy.position.set(carX, y, carZ);
      dummy.rotation.set(0, rotationY, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);

      const rearX = car.horizontal ? carX - car.direction * REAR_OFFSET : carX;
      const rearZ = car.horizontal ? carZ : carZ - car.direction * REAR_OFFSET;

      trailDummy.position.set(rearX, y, rearZ);
      trailDummy.rotation.set(0, rotationY, 0);
      trailDummy.scale.set(1, 1, car.trailLength);
      trailDummy.updateMatrix();
      this.trailMesh.setMatrixAt(i, trailDummy.matrix);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    this.trailMesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.trailMesh.geometry.dispose();
    this.trailMesh.material.map.dispose();
    this.trailMesh.material.dispose();
  }
}
