import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  CITY_EXTENT,
  ROAD_CENTERS,
  ROAD_HALF_WIDTH,
  SIDEWALK_WIDTH,
} from "../config.js";

// ==========================
// Roads
// ==========================
// Static layout, built once at startup. Every layer - asphalt,
// sidewalks, curb neon, and painted lane/crosswalk markings - is merged
// into its own single mesh, so the whole road network (any number of
// roads/intersections) still costs a fixed 5 draw calls.
//
// Sidewalks and markings are generated in segments that stop short of
// every crossing road (see segmentRanges), so a raised sidewalk band
// never cuts across a perpendicular road's driving surface.
//
// "Modern cyberpunk" touches: the asphalt gets a procedural modular-panel
// texture instead of a flat color, and the curb neon strips carry a
// pulse-gradient texture whose UV offset is animated each frame, so
// light visibly flows along the road edges (Roads.update()).

const ROAD_LENGTH = CITY_EXTENT * 2;
const ROAD_HALF_LENGTH = ROAD_LENGTH / 2;

const EDGE_LINE_WIDTH = 0.12;

const LANE_LINE_WIDTH = 0.14;
const DASH_LENGTH = 1.4;
const DASH_GAP = 1.3;

const CROSSWALK_STRIPE_COUNT = 5;
const CROSSWALK_STRIPE_WIDTH = 0.4;
const CROSSWALK_STRIPE_GAP = 0.35;
const CROSSWALK_OFFSET = ROAD_HALF_WIDTH + 1.1;

const ASPHALT_Y = 0.015;
const SIDEWALK_Y = 0.02;
const PAINT_Y = 0.028;
const NEON_Y = 0.035;

const PANEL_SIZE = 3; // world units per asphalt panel tile
const NEON_PULSE_PERIOD = 2.2; // world units per neon UV repeat

// `uvRepeatUnit`, when given, bakes a UV repeat of size/unit into the
// quad so a tiled texture keeps consistent scale across differently
// sized merged segments (same trick used for building facades).
function quad(sizeX, sizeZ, cx, cz, y, uvRepeatUnit) {
  const geometry = new THREE.PlaneGeometry(sizeX, sizeZ);

  if (uvRepeatUnit) {
    const uv = geometry.attributes.uv;
    const repeatX = sizeX / uvRepeatUnit;
    const repeatZ = sizeZ / uvRepeatUnit;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * repeatX, uv.getY(i) * repeatZ);
    }
    uv.needsUpdate = true;
  }

  geometry.rotateX(-Math.PI / 2);
  geometry.translate(cx, y, cz);
  return geometry;
}

// Splits a road's [-halfLength, halfLength] run into pieces that skip
// past every crossing road's intersection box.
function segmentRanges(halfLength, crossings, gapHalfWidth) {
  const cuts = [...crossings].sort((a, b) => a - b);
  const ranges = [];
  let cursor = -halfLength;

  for (const c of cuts) {
    const gapStart = c - gapHalfWidth;
    const gapEnd = c + gapHalfWidth;
    if (gapStart > cursor) ranges.push([cursor, gapStart]);
    cursor = Math.max(cursor, gapEnd);
  }
  if (cursor < halfLength) ranges.push([cursor, halfLength]);

  return ranges;
}

function addDashedLine(list, fixedPositions, crossings, axis) {
  const period = DASH_LENGTH + DASH_GAP;
  const count = Math.floor(ROAD_LENGTH / period);
  const start = -ROAD_HALF_LENGTH + DASH_LENGTH / 2;

  for (const fixed of fixedPositions) {
    for (let i = 0; i < count; i++) {
      const t = start + i * period;
      if (crossings.some((c) => Math.abs(t - c) < ROAD_HALF_WIDTH)) continue;

      if (axis === "x") {
        list.push(quad(DASH_LENGTH, LANE_LINE_WIDTH, t, fixed, PAINT_Y));
      } else {
        list.push(quad(LANE_LINE_WIDTH, DASH_LENGTH, fixed, t, PAINT_Y));
      }
    }
  }
}

// bandAxis "x": stripes are thin along X, span the road's Z-width -
// used for crosswalks that cross an X-road. "z" is the perpendicular case.
function addCrosswalk(list, cx, cz, bandAxis) {
  const stripeLen = ROAD_HALF_WIDTH * 2 - 1.2;
  const pitch = CROSSWALK_STRIPE_WIDTH + CROSSWALK_STRIPE_GAP;
  const totalThickness =
    CROSSWALK_STRIPE_COUNT * CROSSWALK_STRIPE_WIDTH +
    (CROSSWALK_STRIPE_COUNT - 1) * CROSSWALK_STRIPE_GAP;
  const start = -totalThickness / 2 + CROSSWALK_STRIPE_WIDTH / 2;

  for (let i = 0; i < CROSSWALK_STRIPE_COUNT; i++) {
    const offset = start + i * pitch;
    if (bandAxis === "x") {
      list.push(quad(CROSSWALK_STRIPE_WIDTH, stripeLen, cx + offset, cz, PAINT_Y));
    } else {
      list.push(quad(stripeLen, CROSSWALK_STRIPE_WIDTH, cx, cz + offset, PAINT_Y));
    }
  }
}

function buildMesh(group, geometries, material) {
  if (geometries.length === 0) return null;
  const mesh = new THREE.Mesh(mergeGeometries(geometries, false), material);
  group.add(mesh);
  for (const geometry of geometries) geometry.dispose();
  return mesh;
}

// Modular pavement panels with faint seam lines and light speckle -
// reads as engineered/sci-fi ground rather than plain painted asphalt.
function createAsphaltPanelTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0a0a10";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(120, 210, 255, 0.16)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

  ctx.strokeStyle = "rgba(90, 160, 200, 0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.moveTo(0, canvas.height / 2);
  ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();

  for (let i = 0; i < 200; i++) {
    const shade = 10 + Math.floor(Math.random() * 10);
    ctx.fillStyle = `rgba(${shade + 6}, ${shade + 8}, ${shade + 14}, ${(0.1 + Math.random() * 0.15).toFixed(2)})`;
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const size = 0.5 + Math.random() * 1.4;
    ctx.fillRect(x, y, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A single soft pulse on a transparent strip - tiled and offset-animated
// to read as energy flowing along the curb line.
function createNeonPulseTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 8;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 64, 0);
  gradient.addColorStop(0.0, "rgba(255,255,255,0.12)");
  gradient.addColorStop(0.45, "rgba(255,255,255,0.12)");
  gradient.addColorStop(0.55, "rgba(255,255,255,1)");
  gradient.addColorStop(0.65, "rgba(255,255,255,0.12)");
  gradient.addColorStop(1.0, "rgba(255,255,255,0.12)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 8);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export class Roads {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = "Roads";

    const asphalt = [];
    const sidewalks = [];
    const neonX = []; // cyan curb lighting along X-roads
    const neonZ = []; // pink curb lighting along Z-roads
    const paint = []; // lane dashes + crosswalks

    for (const z of ROAD_CENTERS) {
      asphalt.push(
        quad(ROAD_LENGTH, ROAD_HALF_WIDTH * 2, 0, z, ASPHALT_Y, PANEL_SIZE),
      );

      for (const [start, end] of segmentRanges(
        ROAD_HALF_LENGTH,
        ROAD_CENTERS,
        ROAD_HALF_WIDTH,
      )) {
        const length = end - start;
        if (length <= 0.01) continue;
        const center = (start + end) / 2;

        const nearZ = z - ROAD_HALF_WIDTH;
        const farZ = z + ROAD_HALF_WIDTH;

        sidewalks.push(quad(length, SIDEWALK_WIDTH, center, nearZ - SIDEWALK_WIDTH / 2, SIDEWALK_Y));
        sidewalks.push(quad(length, SIDEWALK_WIDTH, center, farZ + SIDEWALK_WIDTH / 2, SIDEWALK_Y));
        neonX.push(quad(length, EDGE_LINE_WIDTH, center, nearZ, NEON_Y, NEON_PULSE_PERIOD));
        neonX.push(quad(length, EDGE_LINE_WIDTH, center, farZ, NEON_Y, NEON_PULSE_PERIOD));
      }
    }

    for (const x of ROAD_CENTERS) {
      asphalt.push(
        quad(ROAD_HALF_WIDTH * 2, ROAD_LENGTH, x, 0, ASPHALT_Y, PANEL_SIZE),
      );

      for (const [start, end] of segmentRanges(
        ROAD_HALF_LENGTH,
        ROAD_CENTERS,
        ROAD_HALF_WIDTH,
      )) {
        const length = end - start;
        if (length <= 0.01) continue;
        const center = (start + end) / 2;

        const nearX = x - ROAD_HALF_WIDTH;
        const farX = x + ROAD_HALF_WIDTH;

        sidewalks.push(quad(SIDEWALK_WIDTH, length, nearX - SIDEWALK_WIDTH / 2, center, SIDEWALK_Y));
        sidewalks.push(quad(SIDEWALK_WIDTH, length, farX + SIDEWALK_WIDTH / 2, center, SIDEWALK_Y));
        neonZ.push(quad(EDGE_LINE_WIDTH, length, nearX, center, NEON_Y, NEON_PULSE_PERIOD));
        neonZ.push(quad(EDGE_LINE_WIDTH, length, farX, center, NEON_Y, NEON_PULSE_PERIOD));
      }
    }

    addDashedLine(paint, ROAD_CENTERS, ROAD_CENTERS, "x");
    addDashedLine(paint, ROAD_CENTERS, ROAD_CENTERS, "z");

    for (const z of ROAD_CENTERS) {
      for (const x of ROAD_CENTERS) {
        addCrosswalk(paint, x - CROSSWALK_OFFSET, z, "x");
        addCrosswalk(paint, x + CROSSWALK_OFFSET, z, "x");
        addCrosswalk(paint, x, z - CROSSWALK_OFFSET, "z");
        addCrosswalk(paint, x, z + CROSSWALK_OFFSET, "z");
      }
    }

    const asphaltMesh = buildMesh(
      this.group,
      asphalt,
      new THREE.MeshStandardMaterial({
        color: 0x0d0d14,
        map: createAsphaltPanelTexture(),
        roughness: 0.32,
        metalness: 0.4,
        envMapIntensity: 0.5,
      }),
    );
    this.asphaltMaterial = asphaltMesh.material;
    buildMesh(
      this.group,
      sidewalks,
      new THREE.MeshStandardMaterial({ color: 0x181b26, roughness: 0.8, metalness: 0.1 }),
    );

    const neonXMesh = buildMesh(
      this.group,
      neonX,
      new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        map: createNeonPulseTexture(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    const neonZMesh = buildMesh(
      this.group,
      neonZ,
      new THREE.MeshBasicMaterial({
        color: 0xff0088,
        map: createNeonPulseTexture(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    buildMesh(
      this.group,
      paint,
      new THREE.MeshBasicMaterial({ color: 0xdff6ff }),
    );

    this._flowMaterials = [neonXMesh?.material, neonZMesh?.material].filter(
      Boolean,
    );
  }

  // Scrolls the curb neon's pulse texture, so light visibly travels
  // along the road edges - a cheap, purely UV-driven animation.
  update(elapsed) {
    for (const material of this._flowMaterials) {
      material.map.offset.x = (elapsed * 0.5) % 1;
    }
  }
}
