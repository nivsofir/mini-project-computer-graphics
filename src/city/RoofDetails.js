import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// ==========================
// Building Details (rooftop + ground floor)
// ==========================
// Course concept: Instancing. Antennas, comm towers, AC/mechanical boxes,
// glowing roof strips and ground-floor entrance lights are simple shapes,
// but there can be hundreds of them across a city. Each detail *type*
// shares one geometry and one material and is drawn with a single
// InstancedMesh, so a city with 500+ of these props still costs only a
// handful of draw calls total.

const dummy = new THREE.Object3D();

function createAntennaGeometry() {
  const geometry = new THREE.CylinderGeometry(0.03, 0.06, 2.4, 6);
  geometry.translate(0, 1.2, 0);
  return geometry;
}

function createCommTowerGeometry() {
  const pole = new THREE.CylinderGeometry(0.08, 0.12, 3.2, 6);
  pole.translate(0, 1.6, 0);

  const bar1 = new THREE.BoxGeometry(1.2, 0.06, 0.06);
  bar1.translate(0, 1.0, 0);

  const bar2 = new THREE.BoxGeometry(0.9, 0.06, 0.06);
  bar2.translate(0, 2.0, 0);

  const tip = new THREE.BoxGeometry(0.22, 0.22, 0.22);
  tip.translate(0, 3.25, 0);

  return mergeGeometries([pole, bar1, bar2, tip]);
}

function createRoofBoxGeometry() {
  const geometry = new THREE.BoxGeometry(1, 0.6, 1);
  geometry.translate(0, 0.3, 0);
  return geometry;
}

function createGlowStripGeometry() {
  const geometry = new THREE.BoxGeometry(1, 0.08, 0.1);
  geometry.translate(0, 0.04, 0);
  return geometry;
}

function createSpireGeometry() {
  const geometry = new THREE.ConeGeometry(0.18, 3.4, 8);
  geometry.translate(0, 1.7, 0);
  return geometry;
}

function createEntranceGlowGeometry() {
  const geometry = new THREE.BoxGeometry(1, 0.12, 0.08);
  geometry.translate(0, 0.06, 0);
  return geometry;
}

// Unit height (0..1 locally), scaled per-instance by addPipe's height arg.
function createPipeGeometry() {
  const geometry = new THREE.CylinderGeometry(0.09, 0.09, 1, 6);
  geometry.translate(0, 0.5, 0);
  return geometry;
}

function createVentGeometry() {
  const drum = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 10);
  drum.translate(0, 0.15, 0);

  const cap = new THREE.CylinderGeometry(0.42, 0.42, 0.05, 10);
  cap.translate(0, 0.32, 0);

  return mergeGeometries([drum, cap]);
}

export class RoofDetailSystem {
  constructor(maxCount) {
    this.group = new THREE.Group();
    this.group.name = "RoofDetails";

    const metalMaterial = new THREE.MeshStandardMaterial({
      color: 0x2c2f38,
      roughness: 0.55,
      metalness: 0.75,
    });

    const glowMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

    this.antennaMesh = new THREE.InstancedMesh(
      createAntennaGeometry(),
      metalMaterial,
      maxCount,
    );
    this.commTowerMesh = new THREE.InstancedMesh(
      createCommTowerGeometry(),
      metalMaterial,
      maxCount,
    );
    this.roofBoxMesh = new THREE.InstancedMesh(
      createRoofBoxGeometry(),
      metalMaterial,
      maxCount,
    );
    this.glowStripMesh = new THREE.InstancedMesh(
      createGlowStripGeometry(),
      glowMaterial,
      maxCount,
    );
    this.glowStripMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(maxCount * 3),
      3,
    );

    this.spireMesh = new THREE.InstancedMesh(
      createSpireGeometry(),
      glowMaterial,
      maxCount,
    );
    this.spireMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(maxCount * 3),
      3,
    );

    this.entranceMesh = new THREE.InstancedMesh(
      createEntranceGlowGeometry(),
      glowMaterial,
      maxCount,
    );
    this.entranceMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(maxCount * 3),
      3,
    );

    this.pipeMesh = new THREE.InstancedMesh(
      createPipeGeometry(),
      metalMaterial,
      maxCount,
    );
    this.ventMesh = new THREE.InstancedMesh(
      createVentGeometry(),
      metalMaterial,
      maxCount,
    );

    this.counts = {
      antenna: 0,
      commTower: 0,
      roofBox: 0,
      glowStrip: 0,
      spireLight: 0,
      entrance: 0,
      pipe: 0,
      vent: 0,
    };

    for (const mesh of [
      this.antennaMesh,
      this.commTowerMesh,
      this.roofBoxMesh,
      this.glowStripMesh,
      this.spireMesh,
      this.entranceMesh,
      this.pipeMesh,
      this.ventMesh,
    ]) {
      mesh.count = 0;
      this.group.add(mesh);
    }
  }

  _place(mesh, index, x, y, z, scaleX, scaleY, scaleZ, rotationY) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rotationY, 0);
    dummy.scale.set(scaleX, scaleY, scaleZ);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }

  addAntenna(x, y, z) {
    const i = this.counts.antenna++;
    this._place(this.antennaMesh, i, x, y, z, 1, 1, 1, 0);
  }

  addCommTower(x, y, z, rotationY = 0) {
    const i = this.counts.commTower++;
    this._place(this.commTowerMesh, i, x, y, z, 1, 1, 1, rotationY);
  }

  addRoofBox(x, y, z, scale = 1, rotationY = 0) {
    const i = this.counts.roofBox++;
    this._place(this.roofBoxMesh, i, x, y, z, scale, scale, scale, rotationY);
  }

  addGlowStrip(x, y, z, width = 1, rotationY = 0, color = 0x00ffff) {
    const i = this.counts.glowStrip++;
    this._place(this.glowStripMesh, i, x, y, z, width, 1, 1, rotationY);
    this.glowStripMesh.setColorAt(i, new THREE.Color(color));
  }

  addSpireLight(x, y, z, color = 0x00ffff) {
    const i = this.counts.spireLight++;
    this._place(this.spireMesh, i, x, y, z, 1, 1, 1, 0);
    this.spireMesh.setColorAt(i, new THREE.Color(color));
  }

  addEntranceGlow(x, y, z, width = 1, rotationY = 0, color = 0x00ffff) {
    const i = this.counts.entrance++;
    this._place(this.entranceMesh, i, x, y, z, width, 1, 1, rotationY);
    this.entranceMesh.setColorAt(i, new THREE.Color(color));
  }

  addPipe(x, y, z, height = 1, rotationY = 0) {
    const i = this.counts.pipe++;
    this._place(this.pipeMesh, i, x, y, z, 1, height, 1, rotationY);
  }

  addVent(x, y, z, scale = 1, rotationY = 0) {
    const i = this.counts.vent++;
    this._place(this.ventMesh, i, x, y, z, scale, scale, scale, rotationY);
  }

  // Adds every rooftop detail described in a building plan's roofDetails list.
  addFromPlan(roofDetails) {
    for (const detail of roofDetails) {
      switch (detail.type) {
        case "antenna":
          this.addAntenna(detail.x, detail.y, detail.z);
          break;
        case "commTower":
          this.addCommTower(detail.x, detail.y, detail.z, detail.rotationY);
          break;
        case "roofBox":
          this.addRoofBox(
            detail.x,
            detail.y,
            detail.z,
            detail.scale,
            detail.rotationY,
          );
          break;
        case "glowStrip":
          this.addGlowStrip(
            detail.x,
            detail.y,
            detail.z,
            detail.width,
            detail.rotationY,
            detail.color,
          );
          break;
        case "spireLight":
          this.addSpireLight(detail.x, detail.y, detail.z, detail.color);
          break;
        case "entranceGlow":
          this.addEntranceGlow(
            detail.x,
            detail.y,
            detail.z,
            detail.width,
            detail.rotationY,
            detail.color,
          );
          break;
        case "pipe":
          this.addPipe(detail.x, detail.y, detail.z, detail.height, detail.rotationY);
          break;
        case "vent":
          this.addVent(detail.x, detail.y, detail.z, detail.scale, detail.rotationY);
          break;
      }
    }
  }

  // Call once after all details have been added, to upload GPU buffers
  // and hide any unused instance capacity.
  finalize() {
    this.antennaMesh.count = this.counts.antenna;
    this.commTowerMesh.count = this.counts.commTower;
    this.roofBoxMesh.count = this.counts.roofBox;
    this.glowStripMesh.count = this.counts.glowStrip;
    this.spireMesh.count = this.counts.spireLight;
    this.entranceMesh.count = this.counts.entrance;
    this.pipeMesh.count = this.counts.pipe;
    this.ventMesh.count = this.counts.vent;

    this.antennaMesh.instanceMatrix.needsUpdate = true;
    this.commTowerMesh.instanceMatrix.needsUpdate = true;
    this.roofBoxMesh.instanceMatrix.needsUpdate = true;
    this.glowStripMesh.instanceMatrix.needsUpdate = true;
    this.glowStripMesh.instanceColor.needsUpdate = true;
    this.spireMesh.instanceMatrix.needsUpdate = true;
    this.spireMesh.instanceColor.needsUpdate = true;
    this.entranceMesh.instanceMatrix.needsUpdate = true;
    this.entranceMesh.instanceColor.needsUpdate = true;
    this.pipeMesh.instanceMatrix.needsUpdate = true;
    this.ventMesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const mesh of [
      this.antennaMesh,
      this.commTowerMesh,
      this.roofBoxMesh,
      this.glowStripMesh,
      this.spireMesh,
      this.entranceMesh,
      this.pipeMesh,
      this.ventMesh,
    ]) {
      mesh.geometry.dispose();
    }
    this.antennaMesh.material.dispose();
    this.glowStripMesh.material.dispose();
  }
}
