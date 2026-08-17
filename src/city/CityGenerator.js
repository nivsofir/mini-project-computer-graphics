import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { SeededRandom } from "../utils/SeededRandom.js";
import {
  createWindowTexturePool,
  disposeTexturePool,
} from "./ProceduralTextures.js";
import { generateBuilding } from "./BuildingGenerator.js";
import { RoofDetailSystem } from "./RoofDetails.js";
import { createNeonSigns, disposeNeonSigns } from "./NeonSigns.js";
import { applySnowCoating } from "../environment/SnowAccumulation.js";
import {
  CITY_SIZE,
  CELL_SIZE,
  ROAD_STEP,
  ROAD_HALF_WIDTH,
  SIDEWALK_WIDTH,
} from "../config.js";

const TEXTURE_COUNT = 6;

// How far a building's edge must stay from a road's centerline to clear
// its sidewalk entirely.
const ROAD_CLEARANCE = ROAD_HALF_WIDTH + SIDEWALK_WIDTH;
const MIN_HALF_FOOTPRINT = 1.0;

// Distance, in grid cells, from a grid index to the nearest road line.
function cellDistanceToRoad(index) {
  const mod = ((index % ROAD_STEP) + ROAD_STEP) % ROAD_STEP;
  return Math.min(mod, ROAD_STEP - mod);
}

// The largest half-footprint (world units) a building at this grid index
// can have along one axis without its edge crossing into the nearest
// road's sidewalk. Cells more than one step from a road are effectively
// unconstrained.
function maxHalfFootprint(index) {
  const distance = cellDistanceToRoad(index) * CELL_SIZE;
  return Math.max(MIN_HALF_FOOTPRINT, distance - ROAD_CLEARANCE);
}

// ==========================
// City Generator
// ==========================
// Course concepts: Procedural Modeling, Instancing, Z-buffer / hidden
// surface rendering (opaque merged meshes let the depth buffer do the
// heavy lifting instead of relying on per-object sorting).
//
// Performance strategy: every building's box geometries are generated in
// local CPU memory (already UV-baked + world-translated, see
// BuildingGenerator.js), bucketed by which of the 6 shared facade
// textures they use, and merged into ONE BufferGeometry per bucket. That
// means the entire city's building facades - hundreds of buildings - are
// drawn with only `TEXTURE_COUNT` draw calls total, independent of city
// size. Rooftop props reuse a handful of InstancedMesh (RoofDetails.js).
export class CityGenerator {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = "City";
    this.texturePool = [];
    this.buildingPlans = [];
    this._buildingMaterials = [];
    this._signMaterials = [];
  }

  // `snowUniform`, if given, is Weather's shared snow-coverage uniform -
  // reapplied to each freshly-built building material batch, since
  // regenerating the city always creates brand new materials.
  generate(seed, snowUniform) {
    this.dispose();

    const rng = new SeededRandom(seed);
    this.texturePool = createWindowTexturePool(rng, TEXTURE_COUNT);

    const buckets = Array.from({ length: TEXTURE_COUNT }, () => []);
    this.buildingPlans = [];

    let buildingCount = 0;
    for (let gx = -CITY_SIZE; gx <= CITY_SIZE; gx++) {
      for (let gz = -CITY_SIZE; gz <= CITY_SIZE; gz++) {
        const isRoad = gx % ROAD_STEP === 0 || gz % ROAD_STEP === 0;
        if (isRoad) continue;
        buildingCount++;
      }
    }

    // Most detail types get at most one instance per building, but
    // industrial buildings can emit up to 4 facade pipes each - so size
    // capacity with headroom rather than exactly buildingCount.
    const roofDetails = new RoofDetailSystem(Math.max(1, buildingCount) * 4);

    for (let gx = -CITY_SIZE; gx <= CITY_SIZE; gx++) {
      for (let gz = -CITY_SIZE; gz <= CITY_SIZE; gz++) {
        const isRoad = gx % ROAD_STEP === 0 || gz % ROAD_STEP === 0;
        if (isRoad) continue;

        const x = gx * CELL_SIZE;
        const z = gz * CELL_SIZE;

        const clearance = {
          maxWidth: maxHalfFootprint(gx) * 2,
          maxDepth: maxHalfFootprint(gz) * 2,
        };

        const plan = generateBuilding(rng, x, z, TEXTURE_COUNT, clearance);
        buckets[plan.textureIndex].push(...plan.boxGeometries);
        roofDetails.addFromPlan(plan.roofDetails);
        this.buildingPlans.push(plan);
      }
    }

    roofDetails.finalize();
    this.group.add(roofDetails.group);
    this._roofDetails = roofDetails;

    this._buildingMaterials = [];

    for (let i = 0; i < TEXTURE_COUNT; i++) {
      const geometries = buckets[i];
      if (geometries.length === 0) continue;

      const merged = mergeGeometries(geometries, false);
      for (const geometry of geometries) geometry.dispose();

      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: this.texturePool[i],
        emissive: 0xffffff,
        emissiveMap: this.texturePool[i],
        emissiveIntensity: 1.2,
        vertexColors: true,
        roughness: 0.8,
        metalness: 0.2,
      });
      // Idle neon-flicker animation reads these back each frame.
      material.userData.baseEmissive = 1.2;
      material.userData.flickerPhase = Math.random() * Math.PI * 2;
      if (snowUniform) applySnowCoating(material, snowUniform);
      this._buildingMaterials.push(material);

      const mesh = new THREE.Mesh(merged, material);
      mesh.name = `BuildingBatch${i}`;
      this.group.add(mesh);
    }

    const signs = createNeonSigns(rng, this.buildingPlans);
    this.group.add(signs);
    this._signs = signs;

    this._signMaterials = [];
    signs.traverse((child) => {
      if (!child.isMesh || !child.material.map) return;
      if (child.material.userData) {
        child.material.userData.baseOpacity = child.material.opacity;
        child.material.userData.flickerPhase = Math.random() * Math.PI * 2;
      }
      this._signMaterials.push(child.material);
    });

    return this.group;
  }

  // Subtle idle animation: building window glow breathes, signs flicker.
  // Cheap - only a handful of shared materials are touched per frame,
  // independent of how many buildings/signs are on screen.
  update(elapsed) {
    for (const material of this._buildingMaterials) {
      const { baseEmissive, flickerPhase } = material.userData;
      material.emissiveIntensity =
        baseEmissive + Math.sin(elapsed * 1.4 + flickerPhase) * 0.12;
    }

    for (const material of this._signMaterials) {
      const { baseOpacity, flickerPhase } = material.userData;
      material.opacity =
        baseOpacity + Math.sin(elapsed * 3.2 + flickerPhase) * 0.08;
    }
  }

  dispose() {
    for (const child of [...this.group.children]) {
      if (child.name === "RoofDetails") {
        this._roofDetails?.dispose();
      } else if (child.name === "NeonSigns") {
        disposeNeonSigns(child);
      } else if (child.isMesh) {
        child.geometry.dispose();
        child.material.dispose();
      }
      this.group.remove(child);
    }

    disposeTexturePool(this.texturePool);
    this.texturePool = [];
    this._roofDetails = null;
    this._signs = null;
    this._buildingMaterials = [];
    this._signMaterials = [];
  }
}
