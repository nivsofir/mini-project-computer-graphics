import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// ==========================
// Shared vehicle geometry
// ==========================
// The compound car shape (chassis + cabin + thruster pods + mirrors +
// light bars + underglow) and its matching light-trail ribbon are used
// by both civilian Traffic and Police - factored out here so both
// systems instance the exact same geometry instead of duplicating it.

export function tintGeometry(geometry, [r, g, b]) {
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
export function createCarGeometry() {
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
export function createTrailGeometry() {
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

export function createTrailFadeTexture() {
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

// Rotates a local-space (x, z) offset by a Y-axis yaw, matching
// three.js's rotation convention - used to place things (rear trail
// attachment points, roof-mounted light bars) relative to a vehicle
// whatever direction it's currently facing.
export function rotateYOffset(lx, lz, rotationY) {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  return {
    dx: lx * cos + lz * sin,
    dz: -lx * sin + lz * cos,
  };
}
