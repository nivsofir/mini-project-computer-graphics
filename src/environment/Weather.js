import * as THREE from "three";

// ==========================
// Weather
// ==========================
// A single scalar (0 sunny .. 1 lightning storm) drives several
// independently-owned systems by lerping/scaling their existing public
// setters - Rain, Lightning and the scene's mood lighting don't know
// "weather" exists, Weather just conducts them.
//
// Rain fades in across the first 70% of the slider; lightning only takes
// over past the 40% mark, so there's a "raining but no storm yet" middle
// stretch before thunder joins in. Ambient/directional light dims as the
// weather worsens, and Lightning is told about the new base intensity so
// its flashes decay back to the *current* mood instead of the sunny one.
const MAX_RAIN = 5000;
const RAIN_RAMP_END = 0.7;
const STORM_RAMP_START = 0.4;

const AMBIENT_SUNNY_MUL = 1.15;
const AMBIENT_STORM_MUL = 0.8;

export class Weather {
  constructor({ scene, rain, lightning, ambientLight, directionalLight }) {
    this.scene = scene;
    this.rain = rain;
    this.lightning = lightning;
    this.ambientLight = ambientLight;
    this.directionalLight = directionalLight;

    this.baseAmbientIntensity = ambientLight.intensity;
    this.baseDirectionalIntensity = directionalLight.intensity;

    this.level = 0;
  }

  // `level` is 0 (sunny) .. 1 (full lightning storm).
  setLevel(level) {
    this.level = THREE.MathUtils.clamp(level, 0, 1);

    const rainT = THREE.MathUtils.clamp(this.level / RAIN_RAMP_END, 0, 1);
    const stormT = THREE.MathUtils.clamp(
      (this.level - STORM_RAMP_START) / (1 - STORM_RAMP_START),
      0,
      1,
    );

    this.rain.setCount(Math.round(rainT * MAX_RAIN));
    this.lightning.setStormLevel(stormT);

    const ambientMul = THREE.MathUtils.lerp(AMBIENT_SUNNY_MUL, AMBIENT_STORM_MUL, this.level);
    this.lightning.setBaseIntensity(
      this.baseAmbientIntensity * ambientMul,
      this.baseDirectionalIntensity * ambientMul,
    );
  }
}
