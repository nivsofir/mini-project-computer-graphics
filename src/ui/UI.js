// ==========================
// UI overlay
// ==========================
// Plain DOM + CSS, no framework. A small fixed panel in the corner so it
// never covers much of the screen (see style.css for the .ui-panel rules).
export function createUI(options) {
  const {
    seed,
    onGenerate,
    onSeedSubmit,
    onToggleCamera,
    cinematicMode,
    onFogChange,
    fogDensity,
    onBloomChange,
    bloomStrength,
    onSpeedChange,
    cameraSpeed,
    onWeatherTypeChange,
    weatherType,
    weatherTypes,
  } = options;

  const root = document.createElement("div");
  root.className = "ui-panel";

  root.innerHTML = `
    <div class="ui-title">PROCEDURAL CYBERPUNK CITY</div>
    <div class="ui-fps">FPS <span class="ui-fps-value">--</span></div>

    <div class="ui-row">
      <label class="ui-label">SEED</label>
      <input class="ui-seed-input" type="number" step="1" value="${seed}" />
    </div>

    <button class="ui-button ui-generate">GENERATE NEW CITY</button>
    <button class="ui-button ui-camera-toggle"></button>

    <div class="ui-sliders">
      <div class="ui-slider-row">
        <label>Fog Density</label>
        <input type="range" min="0" max="0.03" step="0.001" value="${fogDensity}" class="ui-fog" />
      </div>
      <div class="ui-slider-row">
        <label>Bloom Strength</label>
        <input type="range" min="0" max="1" step="0.02" value="${bloomStrength}" class="ui-bloom" />
      </div>
      <div class="ui-slider-row">
        <label>Camera Speed</label>
        <input type="range" min="0.000005" max="0.00006" step="0.000001" value="${cameraSpeed}" class="ui-speed" />
      </div>
      <div class="ui-slider-row">
        <label>Weather</label>
        <div class="ui-weather-types">
          ${weatherTypes
            .map(
              (type) =>
                `<button class="ui-weather-btn" data-type="${type}">${type[0].toUpperCase()}${type.slice(1)}</button>`,
            )
            .join("")}
        </div>
      </div>
    </div>

    <div class="ui-hint">SPACE — toggle cinematic / free camera</div>
  `;

  document.body.appendChild(root);

  const seedInput = root.querySelector(".ui-seed-input");
  const generateButton = root.querySelector(".ui-generate");
  const cameraButton = root.querySelector(".ui-camera-toggle");
  const fpsValue = root.querySelector(".ui-fps-value");
  const weatherButtons = root.querySelectorAll(".ui-weather-btn");

  function setCameraButtonLabel(isCinematic) {
    cameraButton.textContent = isCinematic
      ? "MODE: CINEMATIC"
      : "MODE: FREE CAMERA";
  }
  setCameraButtonLabel(cinematicMode);

  generateButton.addEventListener("click", () => {
    onGenerate?.();
  });

  seedInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const value = parseInt(seedInput.value, 10);
    if (!Number.isFinite(value)) return;
    onSeedSubmit?.(value);
  });

  cameraButton.addEventListener("click", () => {
    const isCinematic = onToggleCamera?.();
    setCameraButtonLabel(isCinematic);
  });

  root.querySelector(".ui-fog").addEventListener("input", (event) => {
    onFogChange?.(parseFloat(event.target.value));
  });
  root.querySelector(".ui-bloom").addEventListener("input", (event) => {
    onBloomChange?.(parseFloat(event.target.value));
  });
  root.querySelector(".ui-speed").addEventListener("input", (event) => {
    onSpeedChange?.(parseFloat(event.target.value));
  });
  function setWeatherButtonActive(type) {
    for (const button of weatherButtons) {
      button.classList.toggle("active", button.dataset.type === type);
    }
  }
  setWeatherButtonActive(weatherType);

  for (const button of weatherButtons) {
    button.addEventListener("click", () => {
      setWeatherButtonActive(button.dataset.type);
      onWeatherTypeChange?.(button.dataset.type);
    });
  }

  return {
    setSeed(newSeed) {
      seedInput.value = newSeed;
    },
    setCameraMode(isCinematic) {
      setCameraButtonLabel(isCinematic);
    },
    setFPS(fps) {
      fpsValue.textContent = Math.round(fps);
      fpsValue.classList.toggle("ui-fps-low", fps < 40);
    },
  };
}
