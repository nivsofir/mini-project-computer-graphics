import * as THREE from "three";

// ==========================
// Reflection Probe
// ==========================
// Course concept: Environment mapping / reflections. A single CubeCamera
// periodically captures the neon skyline into a small cube render
// target, which is applied as an envMap on the wet-looking ground/road
// materials - real reflections of the actual city, not a fake static
// gradient, but updated only a few times a second (not every frame) so
// the extra render stays cheap. Objects passed as `hideDuringCapture`
// are hidden for that one capture so a reflective surface doesn't
// reflect itself.
export class ReflectionProbe {
  constructor(scene, renderer, position, options = {}) {
    this.scene = scene;
    this.renderer = renderer;
    this.hideDuringCapture = options.hideDuringCapture ?? [];
    this.updateInterval = options.updateInterval ?? 0.35;
    this._elapsed = this.updateInterval; // capture on the first update

    const resolution = options.resolution ?? 128;
    this.renderTarget = new THREE.WebGLCubeRenderTarget(resolution, {
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });

    // far=450 comfortably exceeds the sky dome's 400-unit radius (Sky.js),
    // so the reflection's sky portion shows the real gradient, not a clip.
    this.cubeCamera = new THREE.CubeCamera(0.5, 450, this.renderTarget);
    this.cubeCamera.position.copy(position);
    scene.add(this.cubeCamera);
  }

  get texture() {
    return this.renderTarget.texture;
  }

  update(delta) {
    this._elapsed += delta;
    if (this._elapsed < this.updateInterval) return;
    this._elapsed = 0;

    for (const object of this.hideDuringCapture) object.visible = false;
    this.cubeCamera.update(this.renderer, this.scene);
    for (const object of this.hideDuringCapture) object.visible = true;
  }

  dispose() {
    this.scene.remove(this.cubeCamera);
    this.renderTarget.dispose();
  }
}
