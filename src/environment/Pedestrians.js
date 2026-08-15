import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ROAD_CENTERS, ROAD_HALF_WIDTH, SIDEWALK_WIDTH } from "../config.js";

// ==========================
// Pedestrians
// ==========================
// Course concept: Instancing. Small glowing humanoid silhouettes drift
// along every sidewalk, giving the street level some life without
// costing more than a single extra draw call for the whole crowd.
const SIDEWALK_OFFSET = ROAD_HALF_WIDTH + SIDEWALK_WIDTH / 2;
const PER_SIDEWALK = 3;

const dummy = new THREE.Object3D();

const PEDESTRIAN_COLORS = [
  new THREE.Color(0x66e0ff),
  new THREE.Color(0xff77dd),
  new THREE.Color(0xffcc66),
  new THREE.Color(0xaaffcc),
];

function createPedestrianGeometry() {
  const body = new THREE.BoxGeometry(0.24, 0.85, 0.15);
  body.translate(0, 0.425, 0);

  const head = new THREE.BoxGeometry(0.16, 0.18, 0.16);
  head.translate(0, 0.94, 0);

  const merged = mergeGeometries([body, head], false);
  body.dispose();
  head.dispose();
  return merged;
}

function buildSlots() {
  const slots = [];
  for (const horizontal of [true, false]) {
    for (const road of ROAD_CENTERS) {
      for (const side of [1, -1]) {
        for (let i = 0; i < PER_SIDEWALK; i++) {
          slots.push({ horizontal, road, side });
        }
      }
    }
  }
  return slots;
}

export class Pedestrians {
  constructor(scene) {
    const slots = buildSlots();
    this.count = slots.length;
    this._elapsed = 0;

    const geometry = createPedestrianGeometry();
    const material = new THREE.MeshBasicMaterial();
    this.mesh = new THREE.InstancedMesh(geometry, material, this.count);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(this.count * 3),
      3,
    );
    scene.add(this.mesh);

    this.people = slots.map((slot) => ({
      ...slot,
      direction: Math.random() > 0.5 ? 1 : -1,
      position: THREE.MathUtils.randFloat(-70, 70),
      speed: 0.6 + Math.random() * 0.8,
      bobPhase: Math.random() * Math.PI * 2,
    }));

    for (let i = 0; i < this.count; i++) {
      this.mesh.setColorAt(
        i,
        PEDESTRIAN_COLORS[Math.floor(Math.random() * PEDESTRIAN_COLORS.length)],
      );
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(delta) {
    this._elapsed += delta;

    for (let i = 0; i < this.count; i++) {
      const person = this.people[i];
      person.position += person.speed * person.direction * delta;

      if (person.position > 75) person.position = -75;
      if (person.position < -75) person.position = 75;

      const bob = Math.abs(Math.sin(this._elapsed * 5 + person.bobPhase)) * 0.04;
      const offset = SIDEWALK_OFFSET * person.side;
      const rotationY = person.horizontal
        ? person.direction > 0
          ? Math.PI / 2
          : -Math.PI / 2
        : person.direction > 0
          ? 0
          : Math.PI;

      if (person.horizontal) {
        dummy.position.set(person.position, bob, person.road + offset);
      } else {
        dummy.position.set(person.road + offset, bob, person.position);
      }
      dummy.rotation.set(0, rotationY, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
