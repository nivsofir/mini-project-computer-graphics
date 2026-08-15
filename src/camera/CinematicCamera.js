import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ==========================
// Cinematic Camera
// ==========================
// Course concepts: Catmull-Rom Splines, Quaternions/SLERP, Perspective
// Camera & LookAt transformations.
//
// The flight path threads down the centerline of every road (matching
// the fixed road grid in config.js), so the automatic camera never
// clips through buildings. Motion along the spline uses getPointAt(),
// which walks the curve by *arc length* rather than by parameter t, so
// speed stays visually constant even though control points are unevenly
// spaced. Orientation is smoothed independently of position via
// quaternion SLERP, which avoids the mechanical "snapping" you get from
// directly setting lookAt() every frame.
//
// Height clearance: flying traffic (see Traffic.js) uses altitude bands
// at 9/13/17 with a lane offset of only ±1.3 from the road centerline -
// almost exactly where this path already runs. The raw control points
// below span roughly 12-19, which used to sit right on top of that
// traffic. CAMERA_HEIGHT_OFFSET lifts the whole path above the highest
// flying lane with real clearance, without changing its route shape.
const CAMERA_HEIGHT_OFFSET = 9;

function pathPoint(x, y, z) {
  return new THREE.Vector3(x, y + CAMERA_HEIGHT_OFFSET, z);
}

export class CinematicCamera {
  constructor(camera, domElement) {
    this.camera = camera;
    this.cinematicMode = true;
    this.speed = 0.000015;
    this.elapsed = 0;

    this.path = new THREE.CatmullRomCurve3(
      [
        // South road
        pathPoint(-50, 12, -50),
        pathPoint(-25, 16, -50),
        pathPoint(0, 13, -50),
        pathPoint(25, 18, -50),
        pathPoint(45, 14, -50),

        // Smooth corner
        pathPoint(49, 15, -49),
        pathPoint(50, 17, -45),

        // East road
        pathPoint(50, 14, -25),
        pathPoint(50, 19, 0),
        pathPoint(50, 13, 25),
        pathPoint(50, 16, 45),

        // Smooth corner
        pathPoint(49, 15, 49),
        pathPoint(45, 17, 50),

        // North road
        pathPoint(25, 14, 50),
        pathPoint(0, 19, 50),
        pathPoint(-25, 13, 50),
        pathPoint(-45, 17, 50),

        // Smooth corner
        pathPoint(-49, 15, 49),
        pathPoint(-50, 18, 45),

        // West road
        pathPoint(-50, 14, 25),
        pathPoint(-50, 19, 0),
        pathPoint(-50, 13, -25),
        pathPoint(-50, 16, -45),

        // Smooth corner back to start
        pathPoint(-49, 15, -49),
        pathPoint(-45, 17, -50),
      ],
      true,
      "centripetal",
    );

    this.path.arcLengthDivisions = 1000;
    this.path.updateArcLengths();

    this.controls = new OrbitControls(camera, domElement);
    this.controls.target.set(0, 8, 0);
    this.controls.enableDamping = true;
    this.controls.enabled = false;

    // Reused temporaries - never allocated inside the render loop.
    this._position = new THREE.Vector3();
    this._lookAt = new THREE.Vector3();
    this._lookAtMatrix = new THREE.Matrix4();
    this._targetQuaternion = new THREE.Quaternion();
  }

  setMode(cinematic) {
    this.cinematicMode = cinematic;
    this.controls.enabled = !cinematic;
  }

  toggle() {
    this.setMode(!this.cinematicMode);
    return this.cinematicMode;
  }

  setSpeed(speed) {
    this.speed = speed;
  }

  update(delta) {
    if (!this.cinematicMode) {
      this.controls.update();
      return;
    }

    this.elapsed += delta * 1000;
    const t = (this.elapsed * this.speed) % 1;

    // Uniform movement based on arc length, not the spline's raw parameter.
    this.path.getPointAt(t, this._position);
    this.path.getPointAt((t + 0.008) % 1, this._lookAt);

    this.camera.position.copy(this._position);

    this._lookAtMatrix.lookAt(this.camera.position, this._lookAt, this.camera.up);
    this._targetQuaternion.setFromRotationMatrix(this._lookAtMatrix);

    // Frame-rate independent smoothing toward the target orientation.
    const rotationSmoothing = 1 - Math.exp(-5 * delta);
    this.camera.quaternion.slerp(this._targetQuaternion, rotationSmoothing);
  }
}
