import * as THREE from "three";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { boneGeometry } from "./hands";
import { createAnatomyMaterial, createSharedUniforms, type AnatomyMaterial, type SharedUniforms } from "./materials";

/**
 * Full-body skeleton driven by MediaPipe Pose (33 landmarks), drawn in the same
 * pixel-space orthographic scene style as the hands.
 *
 * Long bones are placed between joints; the rib cage and pelvis are authored in
 * a local "torso frame" (x = shoulder-to-shoulder, y = shoulders-to-hips) and
 * mapped with an affine matrix so they stretch with the person.
 */

// MediaPipe Pose indices
const L_SH = 11, R_SH = 12, L_EL = 13, R_EL = 14, L_WR = 15, R_WR = 16;
const L_HIP = 23, R_HIP = 24, L_KN = 25, R_KN = 26, L_AN = 27, R_AN = 28, L_FT = 31, R_FT = 32;

/** [from, to, radius as fraction of shoulder width] */
const LIMBS: [number, number, number][] = [
  [L_SH, L_EL, 0.05], [R_SH, R_EL, 0.05], // humerus
  [L_EL, L_WR, 0.038], [R_EL, R_WR, 0.038], // radius/ulna
  [L_HIP, L_KN, 0.065], [R_HIP, R_KN, 0.065], // femur
  [L_KN, L_AN, 0.05], [R_KN, R_AN, 0.05], // tibia
  [L_AN, L_FT, 0.035], [R_AN, R_FT, 0.035], // foot
];
const VERTEBRAE = 17; // T1–L5
const MIN_VIS = 0.5;

const v3 = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

function tube(points: THREE.Vector3[], r: number, seg = 24): THREE.TubeGeometry {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), seg, r, 6, false);
}

/** Rib cage in torso-frame units (front view). */
function ribCageGeometry(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 10; i++) {
    const y = 0.1 + i * 0.05;
    const w = 0.2 + 0.2 * Math.sin((Math.PI * (i + 2)) / 14);
    const drop = 0.1 + i * 0.012;
    for (const sx of [-1, 1]) {
      out.push(
        tube(
          [v3(sx * 0.02, y), v3(sx * w * 0.55, y - 0.012), v3(sx * w, y + 0.04), v3(sx * w * 0.96, y + drop * 0.8), v3(sx * w * 0.7, y + drop)],
          0.011,
        ),
      );
    }
  }
  out.push(tube([v3(0, 0.08), v3(0, 0.25), v3(0, 0.44)], 0.024, 8)); // sternum
  return out;
}

/** Pelvis in hip-frame units (x = hip-to-hip, +y = down, origin at mid-hip; wings sit above). */
function pelvisGeometry(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    // ilium: a thin plate with a thicker iliac crest along its rim
    const wing = new THREE.SphereGeometry(1, 20, 14);
    wing.scale(0.34, 0.36, 0.05);
    wing.rotateZ(sx * 0.35);
    wing.translate(sx * 0.55, -0.28, 0);
    out.push(wing);
    out.push(tube([v3(sx * 0.2, -0.45), v3(sx * 0.55, -0.66), v3(sx * 0.86, -0.42), v3(sx * 0.75, -0.08)], 0.035, 16));
    out.push(tube([v3(sx * 0.5, 0.05), v3(sx * 0.35, 0.3), v3(0, 0.38)], 0.05, 12)); // pubic arch
  }
  const sacrum = new THREE.SphereGeometry(1, 16, 12);
  sacrum.scale(0.2, 0.32, 0.1);
  sacrum.translate(0, -0.12, 0);
  out.push(sacrum);
  return out;
}

export class BodySkeleton {
  readonly scene = new THREE.Scene();
  readonly uniforms: SharedUniforms = createSharedUniforms();
  readonly material: AnatomyMaterial;
  visible = false;

  private root = new THREE.Group();
  private limbs: THREE.Mesh[] = [];
  private clavicles: THREE.Mesh[] = [];
  private vertebrae: THREE.Mesh[] = [];
  private ribs = new THREE.Group();
  private pelvis = new THREE.Group();
  private boneGeo = boneGeometry();
  private vertGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
  private up = v3(0, 1, 0);

  constructor() {
    this.material = createAnatomyMaterial(this.uniforms, "#bfe6ff", "#e9e1cf");
    LIMBS.forEach(() => this.limbs.push(new THREE.Mesh(this.boneGeo, this.material)));
    for (let i = 0; i < 2; i++) this.clavicles.push(new THREE.Mesh(this.boneGeo, this.material));
    for (let i = 0; i < VERTEBRAE; i++) this.vertebrae.push(new THREE.Mesh(this.vertGeo, this.material));
    ribCageGeometry().forEach((g) => this.ribs.add(new THREE.Mesh(g, this.material)));
    pelvisGeometry().forEach((g) => this.pelvis.add(new THREE.Mesh(g, this.material)));
    this.ribs.matrixAutoUpdate = false;
    this.pelvis.matrixAutoUpdate = false;
    this.root.add(...this.limbs, ...this.clavicles, ...this.vertebrae, this.ribs, this.pelvis);
    this.root.visible = false;
    this.scene.add(this.root);
  }

  private place(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number): void {
    const dir = b.clone().sub(a);
    const len = Math.max(dir.length(), 1);
    m.position.copy(a);
    m.quaternion.setFromUnitVectors(this.up, dir.divideScalar(len));
    m.scale.set(r, len, r);
  }

  update(pose: NormalizedLandmark[] | null, w: number, h: number): void {
    this.root.visible = this.visible && !!pose;
    if (!this.root.visible || !pose) return;
    const P = (i: number) => v3(pose[i].x * w, -pose[i].y * h, 0);
    const ok = (...ids: number[]) => ids.every((i) => (pose[i].visibility ?? 1) >= MIN_VIS);

    const lSh = P(L_SH), rSh = P(R_SH), lHip = P(L_HIP), rHip = P(R_HIP);
    const shoulderW = Math.max(lSh.distanceTo(rSh), 20);
    const midSh = lSh.clone().add(rSh).multiplyScalar(0.5);
    const midHip = lHip.clone().add(rHip).multiplyScalar(0.5);
    const torsoOk = ok(L_SH, R_SH, L_HIP, R_HIP);

    LIMBS.forEach(([a, b, rf], i) => {
      const m = this.limbs[i];
      m.visible = ok(a, b);
      if (m.visible) this.place(m, P(a), P(b), shoulderW * rf);
    });

    // clavicles: shoulder → sternal notch (slightly below shoulder line)
    const notch = midSh.clone().lerp(midHip, 0.06);
    this.clavicles.forEach((m, i) => {
      m.visible = ok(L_SH, R_SH);
      if (m.visible) this.place(m, i ? rSh : lSh, notch, shoulderW * 0.025);
    });

    // spine: neck base → sacrum; vertebrae grow toward the lumbar end
    const spineTop = midSh.clone().lerp(midHip, -0.02);
    const spineBot = midHip.clone().lerp(midSh, 0.08);
    const spineDir = spineBot.clone().sub(spineTop);
    const step = spineDir.length() / VERTEBRAE;
    this.vertebrae.forEach((m, i) => {
      m.visible = torsoOk;
      if (!torsoOk) return;
      const t = (i + 0.5) / VERTEBRAE;
      m.position.copy(spineTop).addScaledVector(spineDir, t);
      m.quaternion.setFromUnitVectors(this.up, spineDir.clone().normalize());
      const r = shoulderW * (0.035 + 0.025 * t);
      m.scale.set(r, step * 0.7, r);
    });

    // rib cage & pelvis via affine torso frames
    this.ribs.visible = this.pelvis.visible = torsoOk;
    if (torsoOk) {
      // Local frames use +y = "down the torso" (geometry above was authored that way).
      const ax = rSh.clone().sub(lSh); // x unit = shoulder to shoulder
      const down = midHip.clone().sub(midSh); // y unit = shoulders → hips
      // A deep z axis keeps tube normals in the screen plane after the
      // non-uniform x/y stretch, so the x-ray rim glow stays visible.
      const az = v3(0, 0, shoulderW * 2.5);
      this.ribs.matrix.makeBasis(ax, down, az).setPosition(midSh);
      this.ribs.matrixWorldNeedsUpdate = true;

      const hx = rHip.clone().sub(lHip);
      const hipW = hx.length();
      const hipDown = down.clone().normalize().multiplyScalar(hipW);
      this.pelvis.matrix.makeBasis(hx, hipDown, v3(0, 0, hipW * 2.5)).setPosition(midHip);
      this.pelvis.matrixWorldNeedsUpdate = true;
    }
  }

  dispose(): void {
    this.boneGeo.dispose();
    this.vertGeo.dispose();
    this.material.dispose();
  }
}
