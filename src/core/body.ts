import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { boneGeometry } from "./hands";
import { createAnatomyMaterial, createSharedUniforms, type AnatomyMaterial, type SharedUniforms } from "./materials";
import type { Structure } from "./anatomy";

/**
 * Full-body skeleton driven by MediaPipe Pose (33 landmarks), drawn in the same
 * pixel-space orthographic scene style as the hands.
 *
 * Long bones are placed between joints; the rib cage and pelvis are authored in
 * a local "torso frame" (x = shoulder-to-shoulder, y = shoulders-to-hips) and
 * mapped with an affine matrix so they stretch with the person.
 *
 * Every bone group is a labelled, highlightable Structure with its own
 * material, so it works with labels, tap-for-info, lessons and symptom check.
 */

// MediaPipe Pose indices (11 = the subject's LEFT shoulder)
const L_SH = 11, R_SH = 12, L_EL = 13, R_EL = 14, L_WR = 15, R_WR = 16;
const L_HIP = 23, R_HIP = 24, L_KN = 25, R_KN = 26, L_AN = 27, R_AN = 28, L_FT = 31, R_FT = 32;

const VERTEBRAE = 17; // T1–L5
const MIN_VIS = 0.5;

export type AnatomySex = "neutral" | "female" | "male";

/** Pelvis proportions by anatomy: wider, shallower bowl (female) vs narrower, taller (male). */
const PELVIS_SHAPE: Record<AnatomySex, { x: number; y: number }> = {
  neutral: { x: 1, y: 1 },
  female: { x: 1.12, y: 0.88 },
  male: { x: 0.93, y: 1.07 },
};

const v3 = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

function tube(points: THREE.Vector3[], r: number, seg = 24): THREE.TubeGeometry {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), seg, r, 6, false);
}

/** Ribs in torso-frame units (front view), without the sternum. */
function ribGeometry(): THREE.BufferGeometry[] {
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

/** [from, to, radius as fraction of shoulder width] per side. */
const LIMB_PARTS: { id: string; name: string; info: string; segs: [number, number, number][] }[] = [
  {
    id: "humerus",
    name: "Humerus (upper arm)",
    info: "The single long bone of the upper arm. Its rounded head sits in the shoulder joint, the most mobile joint in the body, and its lower end forms the top of the elbow.",
    segs: [[L_SH, L_EL, 0.05], [R_SH, R_EL, 0.05]],
  },
  {
    id: "forearm",
    name: "Radius & ulna (forearm)",
    info: "Two parallel bones. The ulna forms the hinge of the elbow; the radius rotates around it so you can turn your palm up and down.",
    segs: [[L_EL, L_WR, 0.038], [R_EL, R_WR, 0.038]],
  },
  {
    id: "femur",
    name: "Femur (thigh bone)",
    info: "The longest and strongest bone in the body. Its ball-shaped head fits into the pelvis at the hip joint, and it carries your body weight down to the knee.",
    segs: [[L_HIP, L_KN, 0.065], [R_HIP, R_KN, 0.065]],
  },
  {
    id: "tibia",
    name: "Tibia & fibula (shin)",
    info: "The tibia (shin bone) carries most of the weight from knee to ankle; the thinner fibula beside it anchors muscles and stabilises the ankle.",
    segs: [[L_KN, L_AN, 0.05], [R_KN, R_AN, 0.05]],
  },
  {
    id: "feet",
    name: "Foot bones",
    info: "Each foot has 26 bones arranged in arches that absorb shock and spring you forward as you walk.",
    segs: [[L_AN, L_FT, 0.035], [R_AN, R_FT, 0.035]],
  },
];

interface Part {
  st: Structure;
  mat: AnatomyMaterial;
  pos: { x: number; y: number } | null;
}

export class BodySkeleton {
  readonly scene = new THREE.Scene();
  readonly uniforms: SharedUniforms = createSharedUniforms();
  /** Structures for labels, picking and highlighting (screen-space anchors). */
  readonly structures: Structure[] = [];
  readonly materials: AnatomyMaterial[] = [];
  visible = false;

  private root = new THREE.Group();
  private parts = new Map<string, Part>();
  private limbMeshes = new Map<string, THREE.Mesh[]>();
  private clavicles: THREE.Mesh[] = [];
  private vertebrae: THREE.Mesh[] = [];
  private sternum: THREE.Mesh;
  private ribs = new THREE.Group();
  private pelvis = new THREE.Group();
  private boneGeo = boneGeometry();
  private vertGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
  private up = v3(0, 1, 0);
  private sex: AnatomySex = "neutral";

  /** Real BodyParts3D skeleton (public/models/body.glb), when loaded. */
  private real = false;
  private torsoReal = new THREE.Group();
  private pelvisReal: THREE.Mesh | null = null;
  private pelvisCentre = new THREE.Vector3();
  /** Torso-frame (u, v) label anchors for real torso parts. */
  private torsoAnchors = new Map<string, THREE.Vector2>();

  constructor() {
    const part = (id: string, name: string, info: string): AnatomyMaterial => {
      const mat = createAnatomyMaterial(this.uniforms, "#bfe6ff", "#e9e1cf");
      this.materials.push(mat);
      const p: Part = { st: null as unknown as Structure, mat, pos: null };
      p.st = {
        id,
        name,
        layer: "body",
        anchor: new THREE.Vector3(),
        info,
        materials: [mat],
        object: this.root,
        screen: () => (this.root.visible ? p.pos : null),
      };
      this.parts.set(id, p);
      this.structures.push(p.st);
      return mat;
    };

    const clavMat = part(
      "clavicles",
      "Clavicles (collarbones)",
      "S-shaped struts between the breastbone and shoulder blades. They hold the shoulders out to the side and are among the most commonly broken bones.",
    );
    for (let i = 0; i < 2; i++) this.clavicles.push(new THREE.Mesh(this.boneGeo, clavMat));

    const sternMat = part(
      "sternum",
      "Sternum (breastbone)",
      "The flat bone at the front of the chest. The ribs attach to it through flexible cartilage, which lets the chest expand when you breathe.",
    );
    this.sternum = new THREE.Mesh(tube([v3(0, 0.08), v3(0, 0.25), v3(0, 0.44)], 0.024, 8), sternMat);

    const ribMat = part(
      "ribs",
      "Rib cage",
      "Twelve pairs of ribs protect the heart and lungs. They lift and spread with every breath, helped by the muscles between them.",
    );
    ribGeometry().forEach((g) => this.ribs.add(new THREE.Mesh(g, ribMat)));
    this.ribs.add(this.sternum);

    const spineMat = part(
      "spine",
      "Thoracic & lumbar spine",
      "Twelve thoracic vertebrae (one for each pair of ribs) and five large lumbar vertebrae in the lower back, which carry most of the upper body's weight.",
    );
    for (let i = 0; i < VERTEBRAE; i++) this.vertebrae.push(new THREE.Mesh(this.vertGeo, spineMat));

    const pelvisMat = part(
      "pelvis",
      "Pelvis",
      "A ring of bones (two hip bones and the sacrum) that transfers weight from the spine to the legs and protects the organs of the lower abdomen. Its shape differs between female and male anatomy.",
    );
    pelvisGeometry().forEach((g) => this.pelvis.add(new THREE.Mesh(g, pelvisMat)));

    part(
      "scapulae",
      "Scapulae (shoulder blades)",
      "Triangular bones on the upper back. They glide over the ribs, anchor 17 muscles, and form the socket of the shoulder joint.",
    );

    for (const lp of LIMB_PARTS) {
      const mat = part(lp.id, lp.name, lp.info);
      this.limbMeshes.set(lp.id, lp.segs.map(() => new THREE.Mesh(this.boneGeo, mat)));
    }

    this.ribs.matrixAutoUpdate = false;
    this.pelvis.matrixAutoUpdate = false;
    this.root.add(...this.clavicles, ...this.vertebrae, this.ribs, this.pelvis, ...[...this.limbMeshes.values()].flat());
    this.torsoReal.matrixAutoUpdate = false;
    this.torsoReal.visible = false;
    this.root.add(this.torsoReal);
    this.root.visible = false;
    this.scene.add(this.root);
  }

  /**
   * Swap in the real skeleton. Torso meshes are stored in the torso frame and
   * limb meshes in joint-to-joint unit frames (see scripts/build-body.mjs).
   */
  async loadReal(url = `${import.meta.env.BASE_URL}models/body.glb`): Promise<boolean> {
    const head = await fetch(url, { method: "HEAD" }).catch(() => null);
    if (!head?.ok || !(head.headers.get("content-type") ?? "").match(/gltf|octet|model/)) return false;
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
    gltf.scene.updateMatrixWorld(true);
    const geos = new Map<string, THREE.BufferGeometry>();
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const g = m.geometry.clone();
      const p = g.attributes.position;
      if (p.normalized || !(p.array instanceof Float32Array)) {
        const f = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) f.set([p.getX(i), p.getY(i), p.getZ(i)], i * 3);
        g.setAttribute("position", new THREE.BufferAttribute(f, 3));
      }
      g.applyMatrix4(m.matrixWorld);
      g.deleteAttribute("normal");
      g.computeVertexNormals();
      geos.set(o.name, g);
    });

    const matOf = (id: string) => this.parts.get(id)!.mat;
    for (const id of ["ribs", "sternum", "spine", "pelvis", "clavicles", "scapulae"]) {
      const g = geos.get(id);
      if (!g) continue;
      const mesh = new THREE.Mesh(g, matOf(id));
      g.computeBoundingBox();
      const c = g.boundingBox!.getCenter(new THREE.Vector3());
      // label anchors: a visible spot on each part, in torso-frame units
      const anchor: Record<string, [number, number]> = {
        ribs: [c.x - 0.3, c.y], sternum: [c.x, c.y], spine: [c.x, c.y + 0.25], pelvis: [c.x + 0.28, c.y],
        clavicles: [c.x - 0.28, c.y], scapulae: [c.x + 0.42, c.y + 0.05],
      };
      this.torsoAnchors.set(id, new THREE.Vector2(...anchor[id]));
      if (id === "pelvis") {
        this.pelvisReal = mesh;
        this.pelvisCentre.copy(c);
        mesh.matrixAutoUpdate = false;
      }
      this.torsoReal.add(mesh);
    }
    for (const lp of LIMB_PARTS) {
      const meshes = this.limbMeshes.get(lp.id)!;
      ["l", "r"].forEach((side, i) => {
        const g = geos.get(`${lp.id}-${side}`);
        if (g && meshes[i]) meshes[i].geometry = g;
      });
    }
    this.real = true;
    this.ribs.visible = this.pelvis.visible = false;
    this.vertebrae.forEach((m) => (m.visible = false));
    this.clavicles.forEach((m) => (m.visible = false));
    this.applySexToPelvis();
    return true;
  }

  private applySexToPelvis(): void {
    if (!this.pelvisReal) return;
    const s = PELVIS_SHAPE[this.sex];
    const c = this.pelvisCentre;
    this.pelvisReal.matrix
      .makeTranslation(c.x, c.y, c.z)
      .multiply(new THREE.Matrix4().makeScale(s.x, s.y, 1))
      .multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
    this.pelvisReal.matrixWorldNeedsUpdate = true;
  }

  get material(): AnatomyMaterial {
    return this.materials[0];
  }

  setSex(sex: AnatomySex): void {
    if (sex === this.sex) return;
    this.sex = sex;
    this.applySexToPelvis();
  }

  private place(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number): void {
    const dir = b.clone().sub(a);
    const len = Math.max(dir.length(), 1);
    m.position.copy(a);
    m.quaternion.setFromUnitVectors(this.up, dir.divideScalar(len));
    m.scale.set(r, len, r);
  }

  /** Stage px anchor (y down) from an internal ortho-space point (y up). */
  private static px(p: THREE.Vector3): { x: number; y: number } {
    return { x: p.x, y: -p.y };
  }

  update(pose: NormalizedLandmark[] | null, w: number, h: number): void {
    this.root.visible = this.visible && !!pose;
    for (const p of this.parts.values()) p.pos = null;
    if (!this.root.visible || !pose) return;
    const P = (i: number) => v3(pose[i].x * w, -pose[i].y * h, 0);
    const ok = (...ids: number[]) => ids.every((i) => (pose[i].visibility ?? 1) >= MIN_VIS);
    const setPos = (id: string, p: THREE.Vector3) => (this.parts.get(id)!.pos = BodySkeleton.px(p));

    const lSh = P(L_SH), rSh = P(R_SH), lHip = P(L_HIP), rHip = P(R_HIP);
    const shoulderW = Math.max(lSh.distanceTo(rSh), 20);
    const midSh = lSh.clone().add(rSh).multiplyScalar(0.5);
    const midHip = lHip.clone().add(rHip).multiplyScalar(0.5);
    const torsoOk = ok(L_SH, R_SH, L_HIP, R_HIP);

    for (const lp of LIMB_PARTS) {
      const meshes = this.limbMeshes.get(lp.id)!;
      let anchor: THREE.Vector3 | null = null;
      lp.segs.forEach(([a, b, rf], i) => {
        const m = meshes[i];
        m.visible = ok(a, b);
        if (!m.visible) return;
        if (this.real) {
          // real bones live in a unit joint-to-joint frame: scale uniformly by bone length
          const A = P(a), B = P(b);
          const L = Math.max(A.distanceTo(B), 1);
          m.position.copy(A);
          m.quaternion.setFromUnitVectors(this.up, B.clone().sub(A).divideScalar(L));
          m.scale.setScalar(L);
        } else {
          this.place(m, P(a), P(b), shoulderW * rf);
        }
        // label anchor: middle of the first visible segment
        anchor ??= P(a).lerp(P(b), 0.5);
      });
      if (anchor) setPos(lp.id, anchor);
    }

    // clavicles: shoulder → sternal notch (slightly below shoulder line)
    const notch = midSh.clone().lerp(midHip, 0.06);
    const clavOk = ok(L_SH, R_SH);
    this.clavicles.forEach((m, i) => {
      m.visible = clavOk && !this.real;
      if (m.visible) this.place(m, i ? rSh : lSh, notch, shoulderW * 0.025);
    });
    if (clavOk) setPos("clavicles", lSh.clone().lerp(notch, 0.45));

    // spine: neck base → sacrum; vertebrae grow toward the lumbar end
    const spineTop = midSh.clone().lerp(midHip, -0.02);
    const spineBot = midHip.clone().lerp(midSh, 0.08);
    const spineDir = spineBot.clone().sub(spineTop);
    const step = spineDir.length() / VERTEBRAE;
    this.vertebrae.forEach((m, i) => {
      m.visible = torsoOk && !this.real;
      if (!torsoOk) return;
      const t = (i + 0.5) / VERTEBRAE;
      m.position.copy(spineTop).addScaledVector(spineDir, t);
      m.quaternion.setFromUnitVectors(this.up, spineDir.clone().normalize());
      const r = shoulderW * (0.035 + 0.025 * t);
      m.scale.set(r, step * 0.7, r);
    });

    // rib cage & pelvis via affine torso frames
    this.ribs.visible = this.pelvis.visible = torsoOk && !this.real;
    this.torsoReal.visible = torsoOk && this.real;
    if (torsoOk) {
      setPos("spine", spineTop.clone().lerp(spineBot, 0.78));
      // Local frames use +y = "down the torso" (geometry above was authored that way).
      const ax = rSh.clone().sub(lSh); // x unit = shoulder to shoulder
      const down = midHip.clone().sub(midSh); // y unit = shoulders → hips
      // A deep z axis keeps tube normals in the screen plane after the
      // non-uniform x/y stretch, so the x-ray rim glow stays visible.
      const az = v3(0, 0, shoulderW * 2.5);
      this.ribs.matrix.makeBasis(ax, down, az).setPosition(midSh);
      this.ribs.matrixWorldNeedsUpdate = true;
      this.torsoReal.matrix.copy(this.ribs.matrix);
      this.torsoReal.matrixWorldNeedsUpdate = true;
      const toWorld = (x: number, y: number) => midSh.clone().addScaledVector(ax, x).addScaledVector(down, y);
      setPos("ribs", toWorld(-0.3, 0.32));
      setPos("sternum", toWorld(0, 0.22));

      const shape = PELVIS_SHAPE[this.sex];
      const hx = rHip.clone().sub(lHip).multiplyScalar(shape.x);
      const hipW = rHip.distanceTo(lHip);
      const hipDown = down.clone().normalize().multiplyScalar(hipW * shape.y);
      this.pelvis.matrix.makeBasis(hx, hipDown, v3(0, 0, hipW * 2.5)).setPosition(midHip);
      this.pelvis.matrixWorldNeedsUpdate = true;
      setPos("pelvis", midHip.clone().addScaledVector(hx, 0.55).addScaledVector(hipDown, -0.3));
      if (this.real) {
        for (const [id, uv] of this.torsoAnchors) setPos(id, toWorld(uv.x, uv.y));
      }
    }
  }

  /** Torso centre and half-width in stage px (y down), for label layout. */
  frame(): { cx: number; radius: number } | null {
    const r = this.parts.get("ribs")?.pos;
    const c = this.parts.get("clavicles")?.pos;
    if (!r && !c) return null;
    const ref = this.parts.get("sternum")?.pos ?? r ?? c!;
    const half = c && ref ? Math.max(60, Math.abs(c.x - ref.x) * 2.4) : 120;
    return { cx: ref.x, radius: half };
  }

  dispose(): void {
    this.boneGeo.dispose();
    this.vertGeo.dispose();
    this.materials.forEach((m) => m.dispose());
  }
}
