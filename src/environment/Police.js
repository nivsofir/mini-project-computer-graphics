import * as THREE from "three";
import { ROAD_CENTERS } from "../config.js";
import {
  createCarGeometry,
  createTrailGeometry,
  createTrailFadeTexture,
  rotateYOffset,
} from "./VehicleGeometry.js";

// ==========================
// Police
// ==========================
// Course concept: Instancing, animation. Reuses the exact same car and
// trail geometry as civilian Traffic (VehicleGeometry.js), just with a
// dark navy paint job and a roof-mounted light bar that strobes red/blue.
//
// A handful of units are "chase" pairs: a police car trailing a fleeing
// car at an oscillating distance on the same lane. This is deliberately
// NOT pathfinding/pursuit AI (the project's own scope excludes NPC AI) -
// both cars just follow the same simple lane-loop every other vehicle
// in the city already uses. The illusion of a chase comes entirely from
// the oscillating gap between two positions on one shared lane.
//
// Lanes: patrol cars use offset 0 (dead-center of the road) and chase
// pairs use offset 0.35 - both values civilian Traffic never uses
// (its lanes are ±1.3), so neither system can collide with the other.
const GROUND_LEVEL = 0;
const PATROL_LANE = 0;
const CHASE_LANE = 0.35;
const REAR_OFFSET = 1.05;

const PATROL_CHANCE = 0.4;
const CHASE_CHANCE = 0.25;

const POLICE_PAINT = new THREE.Color(0x0a1220); // near-black navy
const SUSPECT_COLORS = [
  new THREE.Color(0xffaa33),
  new THREE.Color(0x2affff),
  new THREE.Color(0xff33ff),
];

const FLASH_SPEED = 9; // radians/sec in the strobe sine wave
// Roof-mounted, centered over the cabin (see VehicleGeometry's cabin at
// y in [0.39, 0.67]).
const LIGHT_OFFSET = { x: 0.18, y: 0.72, z: -0.2 };

const dummy = new THREE.Object3D();
const trailDummy = new THREE.Object3D();
const lightDummy = new THREE.Object3D();

function rotationYFor(horizontal, direction) {
  return horizontal
    ? direction > 0
      ? Math.PI / 2
      : -Math.PI / 2
    : direction > 0
      ? 0
      : Math.PI;
}

function worldPositionFor(horizontal, road, lane, position) {
  return horizontal
    ? { x: position, z: road + lane }
    : { x: road + lane, z: position };
}

function buildUnits() {
  const patrols = [];
  const chases = [];

  for (const horizontal of [true, false]) {
    for (const road of ROAD_CENTERS) {
      const roll = Math.random();
      const direction = Math.random() > 0.5 ? 1 : -1;

      if (roll < CHASE_CHANCE) {
        chases.push({
          horizontal,
          road,
          direction,
          leadPosition: THREE.MathUtils.randFloat(-70, 70),
          speed: 10 + Math.random() * 6,
          gapBase: 3.2,
          gapAmplitude: 1.8,
          gapSpeed: 0.4 + Math.random() * 0.3,
          gapPhase: Math.random() * Math.PI * 2,
          suspectColor:
            SUSPECT_COLORS[Math.floor(Math.random() * SUSPECT_COLORS.length)],
          flashPhase: Math.random() * Math.PI * 2,
        });
      } else if (roll < CHASE_CHANCE + PATROL_CHANCE) {
        patrols.push({
          horizontal,
          road,
          direction,
          position: THREE.MathUtils.randFloat(-70, 70),
          speed: 7 + Math.random() * 5,
          flashPhase: Math.random() * Math.PI * 2,
        });
      }
    }
  }

  return { patrols, chases };
}

export class Police {
  constructor(scene) {
    const { patrols, chases } = buildUnits();
    this.patrols = patrols;
    this.chases = chases;
    this._elapsed = 0;

    this.carCount = patrols.length + chases.length * 2;
    this.policeCarCount = patrols.length + chases.length; // one cop car per chase pair

    const carCapacity = Math.max(1, this.carCount);
    const lightCapacity = Math.max(1, this.policeCarCount * 2);

    const carGeometry = createCarGeometry();
    const carMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.carMesh = new THREE.InstancedMesh(carGeometry, carMaterial, carCapacity);
    scene.add(this.carMesh);

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
      carCapacity,
    );
    this.trailMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(carCapacity * 3),
      3,
    );
    scene.add(this.trailMesh);

    // Unlit box per light, strobed via instanceColor - two per police
    // car (red + blue), independent of the car's own body material.
    const lightGeometry = new THREE.BoxGeometry(0.16, 0.08, 0.12);
    const lightMaterial = new THREE.MeshBasicMaterial();
    this.lightMesh = new THREE.InstancedMesh(
      lightGeometry,
      lightMaterial,
      lightCapacity,
    );
    this.lightMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(lightCapacity * 3),
      3,
    );
    scene.add(this.lightMesh);

    this.carMesh.count = this.carCount;
    this.trailMesh.count = this.carCount;
    this.lightMesh.count = this.policeCarCount * 2;
  }

  _placeCar(index, horizontal, road, lane, direction, position, speed, color) {
    const rotationY = rotationYFor(horizontal, direction);
    const { x, z } = worldPositionFor(horizontal, road, lane, position);

    dummy.position.set(x, GROUND_LEVEL, z);
    dummy.rotation.set(0, rotationY, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    this.carMesh.setMatrixAt(index, dummy.matrix);
    this.carMesh.setColorAt(index, color);

    const { dx, dz } = rotateYOffset(0, -REAR_OFFSET, rotationY);
    trailDummy.position.set(x + dx, GROUND_LEVEL, z + dz);
    trailDummy.rotation.set(0, rotationY, 0);
    trailDummy.scale.set(1, 1, 1.4 + speed * 0.16);
    trailDummy.updateMatrix();
    this.trailMesh.setMatrixAt(index, trailDummy.matrix);
    this.trailMesh.setColorAt(index, color);

    return { x, z, rotationY };
  }

  _placeLights(index, x, z, rotationY, flashPhase) {
    const flashOn = Math.sin(this._elapsed * FLASH_SPEED + flashPhase) > 0;
    const redBrightness = flashOn ? 3.4 : 0.25;
    const blueBrightness = flashOn ? 0.25 : 3.4;

    const red = rotateYOffset(-LIGHT_OFFSET.x, LIGHT_OFFSET.z, rotationY);
    lightDummy.position.set(x + red.dx, LIGHT_OFFSET.y, z + red.dz);
    lightDummy.rotation.set(0, rotationY, 0);
    lightDummy.scale.set(1, 1, 1);
    lightDummy.updateMatrix();
    this.lightMesh.setMatrixAt(index, lightDummy.matrix);
    this.lightMesh.setColorAt(
      index,
      new THREE.Color(redBrightness, redBrightness * 0.05, redBrightness * 0.08),
    );

    const blue = rotateYOffset(LIGHT_OFFSET.x, LIGHT_OFFSET.z, rotationY);
    lightDummy.position.set(x + blue.dx, LIGHT_OFFSET.y, z + blue.dz);
    lightDummy.updateMatrix();
    this.lightMesh.setMatrixAt(index + 1, lightDummy.matrix);
    this.lightMesh.setColorAt(
      index + 1,
      new THREE.Color(blueBrightness * 0.1, blueBrightness * 0.3, blueBrightness),
    );
  }

  update(delta) {
    if (this.carCount === 0) return;
    this._elapsed += delta;

    let carIndex = 0;
    let lightIndex = 0;

    for (const unit of this.patrols) {
      unit.position += unit.speed * unit.direction * delta;
      if (unit.position > 75) unit.position = -75;
      if (unit.position < -75) unit.position = 75;

      const { x, z, rotationY } = this._placeCar(
        carIndex,
        unit.horizontal,
        unit.road,
        PATROL_LANE,
        unit.direction,
        unit.position,
        unit.speed,
        POLICE_PAINT,
      );
      this._placeLights(lightIndex, x, z, rotationY, unit.flashPhase);

      carIndex++;
      lightIndex += 2;
    }

    for (const pair of this.chases) {
      pair.leadPosition += pair.speed * pair.direction * delta;
      if (pair.leadPosition > 75) pair.leadPosition = -75;
      if (pair.leadPosition < -75) pair.leadPosition = 75;

      const gap =
        pair.gapBase +
        Math.sin(this._elapsed * pair.gapSpeed + pair.gapPhase) * pair.gapAmplitude;
      let policePosition = pair.leadPosition - pair.direction * gap;
      // Wrap the trailing car's own position independently, so it never
      // visually teleports right after the lead car wraps.
      if (policePosition > 75) policePosition -= 150;
      if (policePosition < -75) policePosition += 150;

      this._placeCar(
        carIndex,
        pair.horizontal,
        pair.road,
        CHASE_LANE,
        pair.direction,
        pair.leadPosition,
        pair.speed,
        pair.suspectColor,
      );
      carIndex++;

      const { x, z, rotationY } = this._placeCar(
        carIndex,
        pair.horizontal,
        pair.road,
        CHASE_LANE,
        pair.direction,
        policePosition,
        pair.speed,
        POLICE_PAINT,
      );
      this._placeLights(lightIndex, x, z, rotationY, pair.flashPhase);
      carIndex++;
      lightIndex += 2;
    }

    this.carMesh.instanceMatrix.needsUpdate = true;
    if (this.carMesh.instanceColor) this.carMesh.instanceColor.needsUpdate = true;
    this.trailMesh.instanceMatrix.needsUpdate = true;
    this.trailMesh.instanceColor.needsUpdate = true;
    this.lightMesh.instanceMatrix.needsUpdate = true;
    this.lightMesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.carMesh.geometry.dispose();
    this.carMesh.material.dispose();
    this.trailMesh.geometry.dispose();
    this.trailMesh.material.map.dispose();
    this.trailMesh.material.dispose();
    this.lightMesh.geometry.dispose();
    this.lightMesh.material.dispose();
  }
}
