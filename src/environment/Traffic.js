import * as THREE from "three";
import { ROAD_CENTERS } from "../config.js";
import {
  createCarGeometry,
  createTrailGeometry,
  createTrailFadeTexture,
} from "./VehicleGeometry.js";

// ==========================
// Traffic - flying + ground cars
// ==========================
// Course concept: Instancing. Each car is a small compound shape
// (chassis + cabin + thruster pods + mirrors + light bars + underglow,
// see VehicleGeometry.js) merged into ONE BufferGeometry, so however
// car-like it looks, the whole traffic system is still a single
// InstancedMesh / one draw call. A second InstancedMesh renders a
// fading light-trail ribbon behind every car, synced to the same
// per-car transform each frame - one more draw call for the whole
// fleet's trails combined.
//
// Most traffic flies at one of three altitude bands; a fourth "ground"
// tier drives right on the road surface instead (no hover bob), so the
// street below isn't empty while most of the fleet is airborne.
//
// Collision avoidance: cars don't run a physics simulation. Instead
// every car is assigned a *unique* (road, lane, altitude) slot up
// front, enumerated below, so no two cars ever share the same lane at
// the same height - they simply cannot run into each other. Police.js
// uses its own separate lane offsets (0 and 0.3) that civilian traffic
// never touches, so the two systems can't collide either.
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
