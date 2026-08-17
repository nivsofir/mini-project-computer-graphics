import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { VignetteShader } from "./VignetteShader.js";

// ==========================
// Post Processing
// ==========================
// Course concept: Post Processing / Bloom. Kept deliberately light -
// three passes only, modest bloom strength - so it stays cheap on a
// normal desktop GPU while still selling the neon-soaked look.
//
// Performance: UnrealBloomPass's own setSize() already halves whatever
// resolution it's given for its blur mip chain, but it's also called
// (with the FULL composer size) every time EffectComposer.setSize() runs
// on a window resize - so without correcting for that, bloom would
// quietly creep back up to half-screen-resolution blurring after any
// resize. Constructing it at half resolution, then re-applying that
// half-size after every composer.setSize() call, keeps bloom's internal
// targets at a *quarter* of the screen's pixel count consistently. Bloom
// is blurry by nature, so the quality loss is effectively invisible.
export class PostProcessing {
  constructor(renderer, scene, camera) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2),
      0.2, // strength
      0.3, // radius
      0.4, // threshold
    );
    this.composer.addPass(this.bloomPass);
    this.vignettePass = new ShaderPass(VignetteShader);
    this.composer.addPass(this.vignettePass);
    this.composer.addPass(new OutputPass());
  }

  setBloomStrength(strength) {
    this.bloomPass.strength = strength;
  }

  setFlash(intensity) {
    this.vignettePass.uniforms.flash.value = intensity;
  }

  setSize(width, height, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width / 2, height / 2);
  }

  render() {
    this.composer.render();
  }
}
