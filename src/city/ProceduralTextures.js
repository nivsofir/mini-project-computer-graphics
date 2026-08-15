import * as THREE from "three";

// ==========================
// Procedural Textures
// ==========================
// Course concept: Texturing. Window facades and neon signage are never
// loaded from image files - every pixel is drawn at runtime with the
// Canvas 2D API and uploaded to the GPU as a THREE.CanvasTexture.
//
// Performance note: a fixed small pool of facade textures is generated
// once per city and then *shared* (never cloned) across every building.
// Per-building variety comes from baking a random UV offset/repeat
// directly into each building's geometry instead of creating a unique
// Texture object per building - this keeps GPU texture uploads and
// draw-call-relevant material count constant regardless of city size.

const NEON_WINDOW_COLORS = [
  "#00ffff",
  "#ff0088",
  "#ffaa33",
  "#4488ff",
  "#ffffaa",
  "#ff33ff",
];

export function createWindowTexture(rng) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;

  const ctx = canvas.getContext("2d");

  // Building wall base - a subtle vertical gradient instead of a flat
  // fill, so facades read as more than a solid color even where there
  // are no windows.
  const wallShade = 5 + Math.floor(rng.next() * 6);
  const wallGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  wallGradient.addColorStop(
    0,
    `rgb(${wallShade + 4}, ${wallShade + 5}, ${wallShade + 9})`,
  );
  wallGradient.addColorStop(
    1,
    `rgb(${wallShade}, ${wallShade + 1}, ${wallShade + 4})`,
  );
  ctx.fillStyle = wallGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const columns = 5;
  const rows = 8;
  const cellWidth = canvas.width / columns;
  const cellHeight = canvas.height / rows;

  const litChance = 0.45 + rng.next() * 0.25;
  // One floor per texture, occasionally, reads as a fully-lit lobby/office.
  const brightFloorRow = rng.bool(0.3) ? rng.int(0, rows - 1) : -1;

  for (let row = 0; row < rows; row++) {
    // Thin floor divider line for architectural structure.
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.fillRect(0, row * cellHeight, canvas.width, 1.5);

    for (let column = 0; column < columns; column++) {
      const isLit =
        row === brightFloorRow
          ? rng.next() < 0.85
          : rng.next() < litChance;

      const marginX = cellWidth * (0.2 + rng.next() * 0.06);
      const marginY = cellHeight * (0.18 + rng.next() * 0.06);

      const rectX = column * cellWidth + marginX;
      const rectY = row * cellHeight + marginY;
      const rectW = cellWidth - marginX * 2;
      const rectH = cellHeight - marginY * 2;

      if (isLit) {
        const color = rng.pick(NEON_WINDOW_COLORS);

        // Soft glow behind each lit window so bloom has something to grab.
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 9;
        ctx.fillStyle = color;
        ctx.fillRect(rectX, rectY, rectW, rectH);
        ctx.restore();
      } else {
        ctx.fillStyle = "#080910";
        ctx.fillRect(rectX, rectY, rectW, rectH);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Builds a small shared pool of facade textures, generated deterministically.
export function createWindowTexturePool(rng, count = 6) {
  const pool = [];
  for (let i = 0; i < count; i++) {
    pool.push(createWindowTexture(rng));
  }
  return pool;
}

export function disposeTexturePool(pool) {
  for (const texture of pool) texture.dispose();
}

// ==========================
// Neon sign textures
// ==========================

export function createNeonSignTexture(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 192;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Dark transparent background
  ctx.fillStyle = "rgba(3, 3, 10, 0.75)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Border
  ctx.strokeStyle = color;
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

  // Neon glow
  ctx.shadowColor = color;
  ctx.shadowBlur = 30;
  ctx.fillStyle = color;
  ctx.font = "bold 85px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// ==========================
// Neon sign glow halo
// ==========================
// A single soft white radial gradient, reused (tinted per-instance via
// InstancedMesh instanceColor) as the additive glow behind every sign -
// generated once, never per-sign.
export function createGlowHaloTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;

  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.4, "rgba(255,255,255,0.4)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// ==========================
// Ground texture
// ==========================
// A small tileable speckle pattern that breaks up the flat ground color
// into something that reads as wet asphalt once lit and bloomed.
export function createGroundTexture(rng) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#07070c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 700; i++) {
    const shade = 10 + Math.floor(rng.next() * 12);
    ctx.fillStyle = `rgba(${shade + 8}, ${shade + 10}, ${shade + 16}, ${(0.12 + rng.next() * 0.18).toFixed(2)})`;
    const x = rng.next() * canvas.width;
    const y = rng.next() * canvas.height;
    const size = 0.5 + rng.next() * 1.6;
    ctx.fillRect(x, y, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
