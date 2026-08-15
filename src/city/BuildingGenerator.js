import * as THREE from "three";

// ==========================
// Building Generator
// ==========================
// Course concepts: Procedural Modeling + Transformations.
//
// Five silhouette archetypes are built from stacked/scaled unit boxes so
// the skyline reads as more than a grid of identical towers:
//   standard      - classic single-block skyscraper
//   tiered        - large base, mid section, narrow crown (setback tower)
//   towerRoof     - tall block topped with a comms-tower rooftop structure
//   thinHighrise  - narrow, extra tall
//   industrial    - short and wide, low-rise
//
// Performance: every box geometry returned here already has its facade UVs
// baked in (repeat + random offset) and is translated into world space via
// BufferGeometry.translate(). CityGenerator merges all boxes that share a
// texture index into one BufferGeometry, so texture variety does not cost
// extra draw calls or extra GPU texture uploads (see ProceduralTextures.js).

const ARCHETYPES = [
  "standard",
  "tiered",
  "towerRoof",
  "thinHighrise",
  "industrial",
  "landmark",
];

const ROOF_GLOW_COLORS = [0x00ffff, 0xff0088, 0xff33ff, 0xffaa00, 0x66ff99];

function pickArchetype(rng, distance) {
  // Landmarks are rare and only ever rise near downtown, for a clear
  // visual hierarchy against the rest of the skyline.
  if (distance < 12 && rng.bool(0.05)) return "landmark";

  const roll = rng.next();

  if (distance > 40) {
    // Outskirts lean low and utilitarian.
    if (roll < 0.35) return "industrial";
    if (roll < 0.6) return "standard";
    if (roll < 0.8) return "thinHighrise";
    if (roll < 0.93) return "tiered";
    return "towerRoof";
  }

  // Downtown leans tall and dramatic.
  if (roll < 0.24) return "standard";
  if (roll < 0.48) return "tiered";
  if (roll < 0.7) return "towerRoof";
  if (roll < 0.88) return "thinHighrise";
  return "industrial";
}

function bakeFacadeUV(geometry, repeatX, repeatY, offsetX, offsetY) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i) * repeatX + offsetX;
    const v = uv.getY(i) * repeatY + offsetY;
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
}

function bakeVertexTint(geometry, tint) {
  const vertexCount = geometry.attributes.position.count;
  const colors = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

// Builds one box segment of a building, with baked facade UVs and a
// baked per-building vertex color tint, already translated to its final
// world-space position.
function createFacadeBox(rng, width, height, depth, cx, cy, cz, tint) {
  const geometry = new THREE.BoxGeometry(width, height, depth);

  const repeatX = Math.max(1, width / 3);
  const repeatY = Math.max(2, height / 5);
  const offsetX = rng.next();
  const offsetY = rng.next();

  bakeFacadeUV(geometry, repeatX, repeatY, offsetX, offsetY);
  bakeVertexTint(geometry, tint);
  geometry.translate(cx, cy, cz);

  return geometry;
}

function addCommonRoofDetails(rng, plan) {
  if (plan.type === "landmark") return; // already has its own spire

  const { x, z, footprintW, footprintD, roofY, type } = plan;

  if (type !== "industrial" && rng.bool(0.35)) {
    plan.roofDetails.push({
      type: "antenna",
      x: x + rng.range(-footprintW * 0.25, footprintW * 0.25),
      y: roofY,
      z: z + rng.range(-footprintD * 0.25, footprintD * 0.25),
    });
  }

  if (rng.bool(0.3)) {
    plan.roofDetails.push({
      type: "roofBox",
      x: x + rng.range(-footprintW * 0.2, footprintW * 0.2),
      y: roofY,
      z: z + rng.range(-footprintD * 0.2, footprintD * 0.2),
      scale: 0.6 + rng.next() * 0.6,
      rotationY: rng.next() * Math.PI * 2,
    });
  }

  if (rng.bool(0.25)) {
    plan.roofDetails.push({
      type: "glowStrip",
      x,
      y: roofY,
      z,
      width: Math.min(footprintW, footprintD) * 0.8,
      rotationY: rng.bool(0.5) ? 0 : Math.PI / 2,
      color: rng.pick(ROOF_GLOW_COLORS),
    });
  }
}

// Returns a building "plan": world-translated + UV-baked box geometries
// (all tagged with the same texture bucket) plus rooftop detail requests.
// `clearance` caps footprintW/footprintD so a building at a grid cell
// right next to a road can never poke through its sidewalk (see
// CityGenerator's maxHalfFootprint).
export function generateBuilding(rng, x, z, textureCount, clearance = {}) {
  const maxWidth = clearance.maxWidth ?? Infinity;
  const maxDepth = clearance.maxDepth ?? Infinity;

  const distance = Math.hypot(x, z);
  const centerBonus = Math.max(0, 18 - distance * 0.15);
  const type = pickArchetype(rng, distance);
  const textureIndex = rng.int(0, textureCount - 1);

  const plan = {
    type,
    x,
    z,
    textureIndex,
    boxGeometries: [],
    roofDetails: [],
    footprintW: 0,
    footprintD: 0,
    // Height up to which the building is exactly footprintW x footprintD
    // wide - i.e. the base/widest box. Signs must stay within this height
    // range, since above it (tiered setbacks, landmark spires) the
    // building may already be narrower than footprintW/footprintD.
    baseHeight: 0,
    totalHeight: 0,
    roofY: 0,
  };

  // One subtle tint per building (not per box), baked as vertex colors,
  // so buildings sharing one of the 6 shared facade textures still read
  // as visually distinct without any extra materials or draw calls.
  const tint = new THREE.Color().setHSL(
    rng.next(),
    0.2 + rng.next() * 0.15,
    0.8 + rng.next() * 0.15,
  );

  const addBox = (width, height, depth, cy) => {
    plan.boxGeometries.push(
      createFacadeBox(rng, width, height, depth, x, cy, z, tint),
    );
  };

  switch (type) {
    case "tiered": {
      const footprintW = Math.min(3 + rng.next() * 2.2, maxWidth);
      const footprintD = Math.min(3 + rng.next() * 2.2, maxDepth);
      const totalHeight = 10 + rng.next() * 20 + centerBonus;

      const h1 = totalHeight * 0.5;
      const h2 = totalHeight * 0.3;
      const h3 = totalHeight * 0.2;

      let y = 0;
      addBox(footprintW, h1, footprintD, y + h1 / 2);
      y += h1;
      addBox(footprintW * 0.68, h2, footprintD * 0.68, y + h2 / 2);
      y += h2;
      addBox(footprintW * 0.42, h3, footprintD * 0.42, y + h3 / 2);
      y += h3;

      plan.footprintW = footprintW;
      plan.footprintD = footprintD;
      plan.baseHeight = h1;
      plan.totalHeight = y;
      plan.roofY = y;
      break;
    }

    case "towerRoof": {
      const footprintW = Math.min(2.8 + rng.next() * 2, maxWidth);
      const footprintD = Math.min(2.8 + rng.next() * 2, maxDepth);
      const totalHeight = 14 + rng.next() * 20 + centerBonus;

      addBox(footprintW, totalHeight, footprintD, totalHeight / 2);

      plan.footprintW = footprintW;
      plan.footprintD = footprintD;
      plan.baseHeight = totalHeight;
      plan.totalHeight = totalHeight;
      plan.roofY = totalHeight;

      plan.roofDetails.push({
        type: "commTower",
        x,
        y: totalHeight,
        z,
        rotationY: rng.next() * Math.PI * 2,
      });
      break;
    }

    case "thinHighrise": {
      const footprintW = Math.min(1.6 + rng.next() * 1, maxWidth);
      const footprintD = Math.min(1.6 + rng.next() * 1, maxDepth);
      const totalHeight = 20 + rng.next() * 22 + centerBonus;

      addBox(footprintW, totalHeight, footprintD, totalHeight / 2);

      plan.footprintW = footprintW;
      plan.footprintD = footprintD;
      plan.baseHeight = totalHeight;
      plan.totalHeight = totalHeight;
      plan.roofY = totalHeight;
      break;
    }

    case "industrial": {
      const footprintW = Math.min(4.5 + rng.next() * 3, maxWidth);
      const footprintD = Math.min(4.5 + rng.next() * 3, maxDepth);
      const totalHeight = 4 + rng.next() * 5;

      addBox(footprintW, totalHeight, footprintD, totalHeight / 2);

      plan.footprintW = footprintW;
      plan.footprintD = footprintD;
      plan.baseHeight = totalHeight;
      plan.totalHeight = totalHeight;
      plan.roofY = totalHeight;

      // Industrial buildings skip the antenna (see addCommonRoofDetails)
      // but get their own facade pipes + roof vents instead, since a
      // plain low box was otherwise the least detailed archetype.
      const pipeSide = rng.bool(0.5) ? 1 : -1;
      const pipeCount = rng.int(2, 4);
      for (let i = 0; i < pipeCount; i++) {
        plan.roofDetails.push({
          type: "pipe",
          x: x + pipeSide * (footprintW / 2 + 0.07),
          y: 0,
          z: z + rng.range(-footprintD * 0.4, footprintD * 0.4),
          height: totalHeight * (0.55 + rng.next() * 0.4),
          rotationY: 0,
        });
      }

      const ventCount = rng.int(1, 3);
      for (let i = 0; i < ventCount; i++) {
        plan.roofDetails.push({
          type: "vent",
          x: x + rng.range(-footprintW * 0.3, footprintW * 0.3),
          y: totalHeight,
          z: z + rng.range(-footprintD * 0.3, footprintD * 0.3),
          scale: 0.8 + rng.next() * 0.6,
          rotationY: rng.next() * Math.PI * 2,
        });
      }
      break;
    }

    case "landmark": {
      const footprintW = Math.min(4 + rng.next() * 1.5, maxWidth);
      const footprintD = Math.min(4 + rng.next() * 1.5, maxDepth);
      const bodyHeight = 45 + rng.next() * 25 + centerBonus;
      const spireHeight = bodyHeight * 0.25;

      addBox(footprintW, bodyHeight, footprintD, bodyHeight / 2);
      addBox(
        footprintW * 0.35,
        spireHeight,
        footprintD * 0.35,
        bodyHeight + spireHeight / 2,
      );

      plan.footprintW = footprintW;
      plan.footprintD = footprintD;
      plan.baseHeight = bodyHeight;
      plan.totalHeight = bodyHeight + spireHeight;
      plan.roofY = plan.totalHeight;

      plan.roofDetails.push({
        type: "spireLight",
        x,
        y: plan.totalHeight,
        z,
        color: rng.pick(ROOF_GLOW_COLORS),
      });
      break;
    }

    case "standard":
    default: {
      const footprintW = Math.min(2.5 + rng.next() * 2, maxWidth);
      const footprintD = Math.min(2.5 + rng.next() * 2, maxDepth);
      const totalHeight = 5 + rng.next() * 18 + centerBonus;

      addBox(footprintW, totalHeight, footprintD, totalHeight / 2);

      plan.footprintW = footprintW;
      plan.footprintD = footprintD;
      plan.baseHeight = totalHeight;
      plan.totalHeight = totalHeight;
      plan.roofY = totalHeight;
      break;
    }
  }

  addCommonRoofDetails(rng, plan);

  // Every building gets a ground-floor entrance glow, so it reads as
  // meeting the street with an actual entrance instead of just stopping.
  plan.roofDetails.push({
    type: "entranceGlow",
    x,
    y: 0.2,
    z: z + plan.footprintD / 2 + 0.03,
    width: Math.min(plan.footprintW * 0.6, 2.2),
    rotationY: 0,
    color: rng.pick(ROOF_GLOW_COLORS),
  });

  return plan;
}

export { ARCHETYPES };
