// ==========================
// Vignette / chromatic aberration shader
// ==========================
// A single cheap full-screen pass (one texture read x3 + a smoothstep)
// for a more cinematic frame edge - kept intentionally minimal so
// post-processing stays lightweight.
export const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    vignetteStrength: { value: 1.15 },
    aberration: { value: 0.0025 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float vignetteStrength;
    uniform float aberration;
    varying vec2 vUv;

    void main() {
      vec2 toCenter = vUv - 0.5;
      float dist = length(toCenter);
      vec2 dir = toCenter / max(dist, 0.0001);

      float r = texture2D(tDiffuse, vUv - dir * aberration * dist).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv + dir * aberration * dist).b;

      vec3 color = vec3(r, g, b);
      float vignette = smoothstep(0.85, 0.2, dist * vignetteStrength);
      color *= mix(1.0, vignette, 0.55);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};
