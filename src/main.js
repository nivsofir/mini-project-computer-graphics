import * as THREE from "three";

import "./style.css";

import { CITY_EXTENT } from "./config.js";
import { SeededRandom, randomSeed } from "./utils/SeededRandom.js";
import { CityGenerator } from "./city/CityGenerator.js";
import { Roads } from "./environment/Roads.js";
import { Rain } from "./environment/Rain.js";
import { RainSplashes } from "./environment/RainSplashes.js";
import { Lightning } from "./environment/Lightning.js";
import { LightningBolt } from "./environment/LightningBolt.js";
import { Weather } from "./environment/Weather.js";
import { Traffic } from "./environment/Traffic.js";
import { Pedestrians } from "./environment/Pedestrians.js";
import { createSky } from "./environment/Sky.js";
import { createSkylineSilhouette } from "./environment/SkylineSilhouette.js";
import { createGroundTexture } from "./city/ProceduralTextures.js";
import { CinematicCamera } from "./camera/CinematicCamera.js";
import { PostProcessing } from "./rendering/PostProcessing.js";
import { ReflectionProbe } from "./rendering/ReflectionProbe.js";
import { createUI } from "./ui/UI.js";

// ==========================
// Scene
// ==========================

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02030a);
scene.fog = new THREE.FogExp2(0x140a2e, 0.012);

// ==========================
// Camera (Perspective projection)
// ==========================

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  500,
);
camera.position.set(35, 30, 35);

// ==========================
// Renderer
// ==========================
// Performance: pixel ratio pinned to 1. On a high-DPI display this
// avoids rendering (and post-processing) 4x the pixels for a mostly
// invisible sharpness gain - the single biggest lever for frame time.
//
// antialias is left off: every frame renders through EffectComposer
// into offscreen (non-multisampled) render targets, so MSAA on the
// renderer's own default framebuffer never actually applies to anything
// on screen - it would just cost extra GPU memory for nothing.

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

// Diagnostic: logged once, from inside the render loop, so real
// GPU/driver + per-frame draw-call cost can be read from devtools.
// autoReset is off because EffectComposer issues one renderer.render()
// call per pass internally, and each of those resets renderer.info by
// default - without this, only the last pass's tiny draw would show up.
// We reset it ourselves once per animate() frame instead.
renderer.info.autoReset = false;
{
  const gl = renderer.getContext();
  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  const gpu = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    : "(WEBGL_debug_renderer_info unavailable)";
  console.log("[cyberpunk-city] GPU:", gpu);
}

// ==========================
// Sky
// ==========================

scene.add(createSky());

// ==========================
// Post processing
// ==========================

const postProcessing = new PostProcessing(renderer, scene, camera);
postProcessing.setSize(window.innerWidth, window.innerHeight, 1);

// ==========================
// Lighting
// ==========================

const ambientLight = new THREE.AmbientLight(0x445577, 1.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0x8899ff, 3);
directionalLight.position.set(20, 40, 10);
scene.add(directionalLight);

const pinkLight = new THREE.PointLight(0xff0088, 150, 40);
pinkLight.position.set(15, 8, 10);
scene.add(pinkLight);

const blueLight = new THREE.PointLight(0x00aaff, 150, 40);
blueLight.position.set(-15, 8, -10);
scene.add(blueLight);

const lightningBolt = new LightningBolt(scene);
const lightning = new Lightning(ambientLight, directionalLight, () => lightningBolt.strike());

// ==========================
// Ground
// ==========================

const groundSize = CITY_EXTENT * 2 + 30;
const groundTexture = createGroundTexture(new SeededRandom(1));
groundTexture.repeat.set(groundSize / 6, groundSize / 6);

const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
const groundMaterial = new THREE.MeshStandardMaterial({
  color: 0x050509,
  map: groundTexture,
  roughness: 0.55,
  metalness: 0.15,
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// ==========================
// Roads (static, seed-independent)
// ==========================

const roads = new Roads();
scene.add(roads.group);

// ==========================
// Reflection probe (wet street look)
// ==========================
// A live capture of the neon skyline, applied as an envMap on the
// ground/road materials so they show real reflections of the city
// instead of a flat specular sheen. Updated a few times a second, not
// every frame - see ReflectionProbe.js.

const reflectionProbe = new ReflectionProbe(
  scene,
  renderer,
  new THREE.Vector3(0, 4, 0),
  { resolution: 128, updateInterval: 0.35, hideDuringCapture: [ground, roads.group] },
);
groundMaterial.envMap = reflectionProbe.texture;
groundMaterial.envMapIntensity = 0.6;
roads.asphaltMaterial.envMap = reflectionProbe.texture;

// ==========================
// Distant skyline (static backdrop, not tied to the city seed)
// ==========================

scene.add(createSkylineSilhouette(new SeededRandom(9973)));

// ==========================
// Procedural city
// ==========================

let currentSeed = randomSeed();
const cityGenerator = new CityGenerator();
scene.add(cityGenerator.group);

function regenerateCity(seed) {
  currentSeed = seed;
  cityGenerator.generate(seed);
}

regenerateCity(currentSeed);

// ==========================
// Traffic + rain
// ==========================

const traffic = new Traffic(scene);
const pedestrians = new Pedestrians(scene);
const rain = new Rain(scene, 0);
const rainSplashes = new RainSplashes(scene);
const onRainLand = (x, z) => rainSplashes.spawn(x, z);

// ==========================
// Weather (sunny -> raining -> lightning)
// ==========================

const weather = new Weather({
  scene,
  rain,
  lightning,
  ambientLight,
  directionalLight,
});
let currentWeatherLevel = 0;
weather.setLevel(currentWeatherLevel);

// ==========================
// Cinematic camera
// ==========================

const cinematicCamera = new CinematicCamera(camera, renderer.domElement);

// ==========================
// UI overlay
// ==========================

const ui = createUI({
  seed: currentSeed,
  cinematicMode: cinematicCamera.cinematicMode,
  fogDensity: scene.fog.density,
  bloomStrength: postProcessing.bloomPass.strength,
  cameraSpeed: cinematicCamera.speed,
  weatherLevel: currentWeatherLevel,

  onGenerate: () => {
    const seed = randomSeed();
    regenerateCity(seed);
    ui.setSeed(seed);
  },
  onSeedSubmit: (seed) => {
    regenerateCity(seed);
  },
  onToggleCamera: () => cinematicCamera.toggle(),
  onFogChange: (density) => {
    scene.fog.density = density;
  },
  onBloomChange: (strength) => {
    postProcessing.setBloomStrength(strength);
  },
  onSpeedChange: (speed) => {
    cinematicCamera.setSpeed(speed);
  },
  onWeatherChange: (level) => {
    currentWeatherLevel = level;
    weather.setLevel(level);
  },
});

// ==========================
// Keyboard controls
// ==========================

window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    const isCinematic = cinematicCamera.toggle();
    ui.setCameraMode(isCinematic);
  }
});

// ==========================
// Resize
// ==========================

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  postProcessing.setSize(window.innerWidth, window.innerHeight, 1);
});

// ==========================
// Render loop
// ==========================

const clock = new THREE.Clock();

// Rolling FPS readout - averaged over ~0.4s so the UI number doesn't
// jitter frame-to-frame.
let fpsFrames = 0;
let fpsElapsed = 0;
const FPS_UPDATE_INTERVAL = 0.4;

let statsLogged = false;

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.05);

  rain.update(delta, onRainLand);
  rainSplashes.update(delta);
  traffic.update(delta);
  pedestrians.update(delta);
  cinematicCamera.update(delta);
  cityGenerator.update(clock.elapsedTime);
  roads.update(clock.elapsedTime);
  lightning.update(delta);
  lightningBolt.update(lightning.flashIntensity);
  postProcessing.setFlash(lightning.flashIntensity);
  reflectionProbe.update(delta);

  renderer.info.reset();
  postProcessing.render();

  // One-time diagnostic, read right after a render so renderer.info
  // reflects this frame's real draw-call/triangle cost before it resets.
  if (!statsLogged && clock.elapsedTime > 2) {
    statsLogged = true;
    console.log("[cyberpunk-city] renderer.info:", {
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    });
  }

  fpsFrames++;
  fpsElapsed += delta;
  if (fpsElapsed >= FPS_UPDATE_INTERVAL) {
    ui.setFPS(fpsFrames / fpsElapsed);
    fpsFrames = 0;
    fpsElapsed = 0;
  }
}

requestAnimationFrame(animate);
