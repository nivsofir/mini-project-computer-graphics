import * as THREE from "three";

// ==========================
// Snow accumulation
// ==========================
// Course concept: Shaders / Procedural Textures. Rather than modelling
// actual snow geometry, road and rooftop materials are patched (via
// onBeforeCompile) to blend toward white wherever a surface faces mostly
// upward - walls and building facades (near-vertical normals) are left
// untouched, so only roads and roof caps ever whiten. A cheap world-space
// hash breaks the coverage into patches with slightly different
// thresholds, so as `coverage` rises from 0 to 1 the snow visibly spreads
// outward from many small patches instead of fading in as one flat wash.
//
// All patched materials share ONE uniform object (`this.uniform`), so
// nudging `coverage` here updates every road/building material at once
// without walking a material list each frame.
const ACCUMULATE_RATE = 1 / 45; // full coverage after ~45s of steady snowfall
const MELT_RATE = 1 / 120; // slower melt-back once snow stops
const HEAVY_RATE_MULTIPLIER = 1.5; // up to 2.5x the base rate at full heavy snow

// `snowUniform` is the shared { value } object owned by a SnowAccumulation
// instance - every material patched with it updates together whenever
// that instance's `coverage` changes, with no per-material bookkeeping.
export function applySnowCoating(material, snowUniform) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.snowAmount = snowUniform;

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>\nvarying vec3 vSnowWorldNormal;\nvarying vec3 vSnowWorldPos;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\nvSnowWorldNormal = normalize(mat3(modelMatrix) * normal);\nvSnowWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float snowAmount;
varying vec3 vSnowWorldNormal;
varying vec3 vSnowWorldPos;
float vSnowMask;
float snowHash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  float upFacing = smoothstep(0.45, 0.85, vSnowWorldNormal.y);
  float patchThreshold = snowHash(floor(vSnowWorldPos.xz * 2.5));
  float patchCoverage = smoothstep(patchThreshold - 0.5, patchThreshold + 0.5, snowAmount);
  vSnowMask = upFacing * patchCoverage;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 1.0), vSnowMask);
}`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.9, vSnowMask);`,
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.0, vSnowMask);`,
      );
  };
  material.needsUpdate = true;
}

export class SnowAccumulation {
  constructor() {
    this.uniform = { value: 0 };
    this.coverage = 0;
  }

  // `snowT` (0..1) is Weather's current snow intensity, `heavyT` (0..1) its
  // "heavy snow" tier on top - coverage grows faster the harder it's
  // snowing, and slowly melts back to bare ground once it stops entirely.
  update(delta, snowT, heavyT = 0) {
    const rate =
      snowT > 0 ? ACCUMULATE_RATE * snowT * (1 + heavyT * HEAVY_RATE_MULTIPLIER) : -MELT_RATE;
    this.coverage = THREE.MathUtils.clamp(this.coverage + rate * delta, 0, 1);
    this.uniform.value = this.coverage;
  }
}
