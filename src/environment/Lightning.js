// ==========================
// Lightning
// ==========================
// Course concept: Lighting. A cheap atmospheric flourish - briefly spikes
// the ambient/directional light intensity on a random interval, decaying
// fast. No geometry, no extra draw calls, just two numbers animated.
const MIN_INTERVAL = 7;
const MAX_INTERVAL = 18;
const MIN_FLASH_DURATION = 0.3;
const MAX_FLASH_DURATION = 0.55;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

export class Lightning {
  constructor(ambientLight, directionalLight) {
    this.ambientLight = ambientLight;
    this.directionalLight = directionalLight;
    this.baseAmbient = ambientLight.intensity;
    this.baseDirectional = directionalLight.intensity;

    this.timer = randomBetween(MIN_INTERVAL, MAX_INTERVAL);
    this.flashTime = 0;
    this.flashDuration = 0;
  }

  update(delta) {
    if (this.flashDuration > 0) {
      this.flashTime += delta;
      const t = this.flashTime / this.flashDuration;

      if (t >= 1) {
        this.ambientLight.intensity = this.baseAmbient;
        this.directionalLight.intensity = this.baseDirectional;
        this.flashDuration = 0;
        this.timer = randomBetween(MIN_INTERVAL, MAX_INTERVAL);
        return;
      }

      // A couple of quick flickers that decay out, rather than one
      // smooth pulse - reads more like real lightning.
      const flicker = Math.max(0, Math.sin(t * Math.PI * 3)) * (1 - t);
      this.ambientLight.intensity = this.baseAmbient + flicker * 6;
      this.directionalLight.intensity = this.baseDirectional + flicker * 9;
      return;
    }

    this.timer -= delta;
    if (this.timer <= 0) {
      this.flashDuration = randomBetween(MIN_FLASH_DURATION, MAX_FLASH_DURATION);
      this.flashTime = 0;
    }
  }
}
