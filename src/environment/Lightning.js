import * as THREE from "three";

// ==========================
// Lightning
// ==========================
// Course concept: Lighting. Drives the ambient/directional light intensity
// spike and the flicker curve everything else (the bolt geometry in
// LightningBolt, the sky-wash in the vignette shader) reads its timing
// from - this module owns no geometry itself, just the two light numbers
// and an `onStrike` callback fired the instant a new flash begins.
//
// Strike frequency and punch both scale with `stormLevel` (0..1), driven
// externally by the Weather slider - at 0 lightning is disabled entirely,
// at 1 it strikes every couple of seconds at full intensity.
const MIN_INTERVAL = 7;
const MAX_INTERVAL = 18;
const STORM_MIN_INTERVAL = 2;
const STORM_MAX_INTERVAL = 6;
const MIN_FLASH_DURATION = 0.3;
const MAX_FLASH_DURATION = 0.55;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

export class Lightning {
  // `onStrike`, if given, fires once at the instant each new flash begins -
  // used to (re)generate the jagged bolt geometry without LightningBolt
  // needing to know anything about timing itself.
  constructor(ambientLight, directionalLight, onStrike) {
    this.ambientLight = ambientLight;
    this.directionalLight = directionalLight;
    this.onStrike = onStrike;
    this.baseAmbient = ambientLight.intensity;
    this.baseDirectional = directionalLight.intensity;

    this.stormLevel = 0;
    this.flashTime = 0;
    this.flashDuration = 0;
    this.timer = Infinity; // no strikes until a storm level is set

    // 0..1 flicker curve shared by the bolt's opacity and the vignette
    // shader's faint sky-wash, so both decay in lockstep with the light
    // intensity spike above instead of drifting out of sync.
    this.flashIntensity = 0;
  }

  // Called by Weather whenever the underlying mood lighting changes, so a
  // flash always decays back to the *current* base rather than an intensity
  // captured at construction time.
  setBaseIntensity(ambient, directional) {
    this.baseAmbient = ambient;
    this.baseDirectional = directional;
    if (this.flashDuration <= 0) {
      this.ambientLight.intensity = ambient;
      this.directionalLight.intensity = directional;
    }
  }

  setStormLevel(level) {
    const wasActive = this.stormLevel > 0;
    this.stormLevel = THREE.MathUtils.clamp(level, 0, 1);

    if (this.stormLevel <= 0) {
      // Cut off cleanly rather than waiting out an in-progress flash.
      this.flashDuration = 0;
      this.flashIntensity = 0;
      this.ambientLight.intensity = this.baseAmbient;
      this.directionalLight.intensity = this.baseDirectional;
      this.timer = Infinity;
      return;
    }

    if (!wasActive) this.timer = this._nextInterval();
  }

  _nextInterval() {
    const min = THREE.MathUtils.lerp(MAX_INTERVAL, STORM_MAX_INTERVAL, this.stormLevel);
    const max = THREE.MathUtils.lerp(MIN_INTERVAL, STORM_MIN_INTERVAL, this.stormLevel);
    return randomBetween(min, max);
  }

  update(delta) {
    if (this.flashDuration > 0) {
      this.flashTime += delta;
      const t = this.flashTime / this.flashDuration;

      if (t >= 1) {
        this.ambientLight.intensity = this.baseAmbient;
        this.directionalLight.intensity = this.baseDirectional;
        this.flashDuration = 0;
        this.flashIntensity = 0;
        this.timer = this.stormLevel > 0 ? this._nextInterval() : Infinity;
        return;
      }

      // A couple of quick flickers that decay out, rather than one
      // smooth pulse - reads more like real lightning. Punch grows with
      // storm level so light rain never throws a full-strength strike.
      const punch = THREE.MathUtils.lerp(0.4, 1.3, this.stormLevel);
      const flicker = Math.max(0, Math.sin(t * Math.PI * 3)) * (1 - t) * punch;
      this.ambientLight.intensity = this.baseAmbient + flicker * 6;
      this.directionalLight.intensity = this.baseDirectional + flicker * 9;
      this.flashIntensity = Math.min(1, flicker * 1.4);
      return;
    }

    if (this.stormLevel <= 0) return;

    this.timer -= delta;
    if (this.timer <= 0) {
      this.flashDuration = randomBetween(MIN_FLASH_DURATION, MAX_FLASH_DURATION);
      this.flashTime = 0;
      this.onStrike?.();
    }
  }
}
