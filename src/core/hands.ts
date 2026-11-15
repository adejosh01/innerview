import * as THREE from "three";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { createAnatomyMaterial, createSharedUniforms, type AnatomyMaterial, type SharedUniforms } from "./materials";
import { createOccluderMaterial, FanPolygon, placeCapsule, unitCapsule } from "./occluder";
import type { Structure } from "./anatomy";

/** Finger segments used for the occlusion silhouette (fatter than bones). */
const FINGER_SEGS: [number, number][] = [
  [1, 2], [2, 3], [3, 4], [5, 6], [6, 7], [7, 8], [9, 10], [10, 11], [11, 12], [13, 14], [14, 15], [15, 16], [17, 18], [18, 19], [19, 20],
];
const PALM_RING = [0, 1, 2, 5, 9, 13, 17];

/** Bones as landmark index pairs. Metacarpals start partway from the wrist to leave room for the carpals. */
const BONES: [number, number, number][] = [
  // [from, to, radius factor]
  [0, 1, 1.15], [1, 2, 1.0], [2, 3, 0.9], [3, 4, 0.8], // thumb
  [0, 5, 0.85], [5, 6, 0.9], [6, 7, 0.75], [7, 8, 0.65], // index
  [0, 9, 0.9], [9, 10, 0.95], [10, 11, 0.8], [11, 12, 0.65], // middle
  [0, 13, 0.85], [13, 14, 0.88], [14, 15, 0.75], [15, 16, 0.62], // ring
  [0, 17, 0.8], [17, 18, 0.78], [18, 19, 0.65], [19, 20, 0.55], // pinky
];
const METACARPAL_START = 0.22;

/** Unit bone along +Y (0..1) with knobbly epiphyses at both ends. */
export function boneGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const ends = Math.pow(Math.abs(2 * t - 1), 6);
    const r = 0.5 + 0.55 * ends;
    pts.push(new THREE.Vector2(r * Math.sin(Math.PI * t) ** 0.35, t));
  }
  return new THREE.LatheGeometry(pts, 14);
}

/**
 * Hand skeletons drawn in an orthographic, pixel-space scene laid over the video.
 * (MediaPipe hand landmarks are normalised image coordinates, so a screen-space
 * rig is the most robust way to keep bones glued to fingers.)
 */
export class HandBones {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(0, 1, 0, -1, -5000, 5000);
  readonly uniforms: SharedUniforms = createSharedUniforms();
  readonly material: AnatomyMaterial;
  private hands: THREE.Group[] = [];
  private geo = boneGeometry();
  private carpalGeo = new THREE.SphereGeometry(1, 14, 10);
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  visible = true;

  /** Labelled structure for the hands (anchor = palm of the first tracked hand). */
  readonly structures: Structure[] = [];
  private palm: { x: number; y: number } | null = null;

  /** Depth-only silhouettes of the real hands, drawn before the head anatomy. */
  readonly occluderScene = new THREE.Scene();
  occlusion = true;
  private occluders: { group: THREE.Group; palm: FanPolygon }[] = [];
  private occMat = createOccluderMaterial();
  private capsuleGeo = unitCapsule();

  constructor() {
    this.material = createAnatomyMaterial(this.uniforms, "#bfe6ff", "#e9e1cf");
    this.structures.push({
      id: "hands",
      name: "Hand & wrist bones",
      layer: "hands",
      anchor: new THREE.Vector3(),
      info: "Each hand has 27 bones: 8 small carpals in the wrist, 5 metacarpals across the palm and 14 phalanges in the fingers and thumb. That many joints is what makes fine movements like writing possible.",
      materials: [this.material],
      object: this.scene,
      screen: () => (this.visible ? this.palm : null),
    });
    for (let h = 0; h < 2; h++) {
      const g = new THREE.Group();
      BONES.forEach(() => g.add(new THREE.Mesh(this.geo, this.material)));
      for (let c = 0; c < 6; c++) g.add(new THREE.Mesh(this.carpalGeo, this.material));
      g.visible = false;
      this.hands.push(g);
      this.scene.add(g);

      const og = new THREE.Group();
      FINGER_SEGS.forEach(() => og.add(new THREE.Mesh(this.capsuleGeo, this.occMat)));
      og.add(new THREE.Mesh(this.capsuleGeo, this.occMat)); // forearm
      const palm = new FanPolygon(PALM_RING.length);
      og.add(new THREE.Mesh(palm.geometry, this.occMat));
      og.visible = false;
      this.occluders.push({ group: og, palm });
      this.occluderScene.add(og);
    }
  }

  resize(w: number, h: number): void {
    this.camera.left = 0;
    this.camera.right = w;
    this.camera.top = 0;
    this.camera.bottom = -h;
    this.camera.updateProjectionMatrix();
  }

  /** Poses the bone meshes from MediaPipe hand landmarks (stage CSS px space). */
  update(hands: { landmarks: NormalizedLandmark[] }[], w: number, h: number): void {
    const toPx = (lm: NormalizedLandmark, out: THREE.Vector3) => out.set(lm.x * w, -lm.y * h, -lm.z * w);
    const first = hands[0]?.landmarks;
    this.palm = first ? { x: ((first[0].x + first[5].x + first[17].x) / 3) * w, y: ((first[0].y + first[5].y + first[17].y) / 3) * h } : null;
    this.hands.forEach((g, hi) => {
      const hand = hands[hi];
      const occ = this.occluders[hi];
      occ.group.visible = this.occlusion && !!hand;
      if (hand && this.occlusion) this.updateOccluder(occ, hand.landmarks, toPx);
      g.visible = this.visible && !!hand;
      if (!g.visible || !hand) return;
      const L = hand.landmarks;
      // scale from palm length (wrist → middle MCP), robust to hand distance
      const palm = toPx(L[0], this.tmpA).distanceTo(toPx(L[9], this.tmpB));
      const baseR = palm * 0.075;
      BONES.forEach(([a, b, rf], i) => {
        const m = g.children[i] as THREE.Mesh;
        toPx(L[a], this.tmpA);
        toPx(L[b], this.tmpB);
        if (a === 0) this.tmpA.lerp(this.tmpB, METACARPAL_START);
        const dir = this.tmpB.clone().sub(this.tmpA);
        const len = dir.length();
        // shorten slightly so joints show a gap like a real radiograph
        const gap = Math.min(len * 0.08, baseR * 0.6);
        m.position.copy(this.tmpA).addScaledVector(dir.normalize(), gap);
        m.quaternion.setFromUnitVectors(this.up, dir);
        const r = baseR * rf;
        m.scale.set(r, Math.max(len - gap * 2, 1), r);
      });
      // carpals: a small cluster around the wrist toward the palm
      const wrist = toPx(L[0], this.tmpA).clone();
      const mid = toPx(L[9], this.tmpB).clone();
      const side = toPx(L[5], new THREE.Vector3()).sub(toPx(L[17], new THREE.Vector3()));
      for (let c = 0; c < 6; c++) {
        const m = g.children[BONES.length + c] as THREE.Mesh;
        const row = c < 3 ? 0.08 : 0.17;
        const col = (c % 3) - 1;
        m.position.copy(wrist).lerp(mid, row).addScaledVector(side, col * 0.22);
        m.scale.setScalar(baseR * 1.25);
      }
    });
  }

  private updateOccluder(
    occ: { group: THREE.Group; palm: FanPolygon },
    L: NormalizedLandmark[],
    toPx: (lm: NormalizedLandmark, out: THREE.Vector3) => THREE.Vector3,
  ): void {
    const P = (i: number) => toPx(L[i], new THREE.Vector3()).setZ(0);
    const palmLen = P(0).distanceTo(P(9));
    const fingerR = palmLen * 0.12;
    FINGER_SEGS.forEach(([a, b], i) => placeCapsule(occ.group.children[i], P(a), P(b), fingerR));
    // forearm: extend from the wrist away from the middle finger
    const wrist = P(0);
    const away = wrist.clone().sub(P(9)).normalize();
    placeCapsule(occ.group.children[FINGER_SEGS.length], wrist, wrist.clone().addScaledVector(away, palmLen * 2.5), palmLen * 0.38);
    // palm: slightly inflated ring
    const ring = PALM_RING.map(P);
    const c = ring.reduce((acc, p) => acc.add(p), new THREE.Vector3()).divideScalar(ring.length);
    occ.palm.set(ring.map((p) => p.clone().sub(c).multiplyScalar(1.12).add(c)));
  }

  dispose(): void {
    this.capsuleGeo.dispose();
    this.occMat.dispose();
    this.geo.dispose();
    this.carpalGeo.dispose();
    this.material.dispose();
  }
}
