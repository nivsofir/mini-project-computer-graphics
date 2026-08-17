import * as THREE from "three";

// ==========================
// Weather
// ==========================
// A named weather type drives several independently-owned systems by
// looking up a fixed preset and applying it to their existing public
// setters - Rain, Snow, Lightning and the scene's mood lighting don't
// know "weather" exists, Weather just conducts them.
//
// Each preset is a flat target (not a ramp) - picking a type snaps
// straight to it, same as choosing a fixed setting rather than dialing a
// continuous dial. "storm" layers lightning on top of rain; "blizzard"
// layers extra snow density/speed/accumulation-rate on top of "snow"
// rather than being a wholly separate system.
const MAX_RAIN = 5000;
const MAX_SNOW = 1400;
const MAX_SNOW_HEAVY = 6000;
const HEAVY_FALL_MULTIPLIER = 1.4; // up to 2.4x fall speed/sway at full heavy

const AMBIENT_SUNNY_MUL = 1.15;
const AMBIENT_RAIN_MUL = 0.95;
const AMBIENT_STORM_MUL = 0.8;
const AMBIENT_SNOW_MUL = 1.0;
const AMBIENT_HEAVY_MUL = 0.92;

// rain/storm/snow/heavy are 0..1 intensities within their own system;
// ambientMul scales the base mood lighting.
const PRESETS = {
  sunny: { rain: 0, storm: 0, snow: 0, heavy: 0, ambientMul: AMBIENT_SUNNY_MUL },
  rain: { rain: 1, storm: 0, snow: 0, heavy: 0, ambientMul: AMBIENT_RAIN_MUL },
  storm: { rain: 1, storm: 1, snow: 0, heavy: 0, ambientMul: AMBIENT_STORM_MUL },
  snow: { rain: 0, storm: 0, snow: 1, heavy: 0, ambientMul: AMBIENT_SNOW_MUL },
  blizzard: { rain: 0, storm: 0, snow: 1, heavy: 1, ambientMul: AMBIENT_HEAVY_MUL },
};

export const WEATHER_TYPES = Object.keys(PRESETS);

export class Weather {
  constructor({ scene, rain, snow, lightning, ambientLight, directionalLight }) {
    this.scene = scene;
    this.rain = rain;
    this.snow = snow;
    this.lightning = lightning;
    this.ambientLight = ambientLight;
    this.directionalLight = directionalLight;

    this.baseAmbientIntensity = ambientLight.intensity;
    this.baseDirectionalIntensity = directionalLight.intensity;

    this.type = "sunny";
    // 0..1, read every frame by SnowAccumulation (rain/lightning only need
    // updates when the type changes, but accumulation is a rate integrated
    // over time, so main.js polls these each frame).
    this.snowT = 0;
    this.heavyT = 0;
  }

  setType(type) {
    const preset = PRESETS[type];
    if (!preset) return;

    this.type = type;
    this.snowT = preset.snow;
    this.heavyT = preset.heavy;

    this.rain.setCount(Math.round(preset.rain * MAX_RAIN));
    this.lightning.setStormLevel(preset.storm);

    const snowMax = THREE.MathUtils.lerp(MAX_SNOW, MAX_SNOW_HEAVY, preset.heavy);
    this.snow.setCount(Math.round(preset.snow * snowMax));
    this.snow.setIntensity(1 + preset.heavy * HEAVY_FALL_MULTIPLIER);

    this.lightning.setBaseIntensity(
      this.baseAmbientIntensity * preset.ambientMul,
      this.baseDirectionalIntensity * preset.ambientMul,
    );
  }
}
