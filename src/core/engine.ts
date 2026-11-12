import * as THREE from "three";
import { FaceLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { buildAnatomy, muscleActivations, type Anatomy, type LayerId, type Structure } from "./anatomy";
import { HandBones } from "./hands";
import { BodySkeleton } from "./body";
import { loadRealAnatomy } from "./realAnatomy";
import { applyLook, createSharedUniforms, RevealKind, type LookMode } from "./materials";
import { OneEuroFilter, VectorFilter } from "./filter";
import { Tracker, type TrackingFrame } from "./tracker";

export type RevealMode = "whole" | "left" | "right" | "top" | "lower" | "lens";
export type ToggleId = LayerId | "hands" | "outline" | "body";

export interface FitSettings {
  scale: number;
  width: number;
  height: number;
  depth: number;
  x: number;
  y: number;
  z: number;
  jawWidth: number;
  jawLength: number;
}

export interface EngineSettings {
  layers: Record<ToggleId, boolean>;
  look: LookMode;
  brightness: number; // 0.2..2
  realBlend: number; // 0..1 how much of the real video shows through
  feather: number; // 0..1
  reveal: RevealMode;
  cut: number; // -1..1 moves the reveal plane
  labels: boolean;
  trackingData: boolean;
  fit: FitSettings;
  jawFollow: boolean;
  eyeFollow: boolean;
  muscleActivation: boolean;
  smoothing: number; // 0..1 (higher = steadier, more lag)
  mirror: boolean;
  handOcclusion: boolean;
}

export const DEFAULT_FIT: FitSettings = { scale: 1, width: 1, height: 1, depth: 1, x: 0, y: 0, z: 0, jawWidth: 1, jawLength: 1 };

export const DEFAULT_SETTINGS: EngineSettings = {
  layers: { skull: true, brain: false, muscles: false, eyes: true, spine: true, hands: true, outline: false, body: false },
  look: "xray",
  brightness: 1,
  realBlend: 0.35,
  feather: 0.35,
  reveal: "whole",
  cut: 0,
  labels: false,
  trackingData: false,
  fit: { ...DEFAULT_FIT },
  jawFollow: true,
  eyeFollow: true,
  muscleActivation: true,
  smoothing: 0.5,
  mirror: true,
  handOcclusion: true,
};

export interface FrameInfo {
  fps: number;
  faceFound: boolean;
  handCount: number;
  /** Full-body mode: whether a body is currently tracked (null = mode off / model loading). */
  bodyFound: boolean | null;
  blendshapes: Record<string, number>;
  activations: Record<string, number>;
  /** Index fingertip of first hand, in stage CSS px (already mirrored for display). */
  fingertip: { x: number; y: number } | null;
  /** Smoothed head rotation in degrees (yaw: turn, pitch: nod, roll: tilt); null without a face. */
  head: { yaw: number; pitch: number; roll: number } | null;
  /** Body landmarks in video pixels (x right, y down, un-mirrored) with visibility; null when body tracking is off/lost. */
  body: { x: number; y: number; v: number }[] | null;
}

export interface EngineEvents {
  onFrame?: (info: FrameInfo) => void;
  onAutoFitProgress?: (progress: number) => void;
  onAutoFitDone?: (fit: FitSettings) => void;
  /** Fired once the real (BodyParts3D) models replace the placeholders. */
  onModelsLoaded?: (info: { real: boolean }) => void;
}

/** Demo head rotation; dev builds can pin the yaw (degrees) via ?yaw= for visual checks. */
function demoEuler(t: number): THREE.Euler {
  const pinned = import.meta.env.DEV ? (globalThis as { __demoYaw?: number }).__demoYaw : undefined;
  if (pinned !== undefined) return new THREE.Euler(0, (pinned * Math.PI) / 180, 0);
  return new THREE.Euler(Math.sin(t * 0.4) * 0.12, Math.sin(t * 0.5) * 0.7, 0);
}

/** Synthetic tracking frame for demo mode. */
function demoFrame(now: number): TrackingFrame {
  const t = now / 1000;
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(0, -1, -42),
    new THREE.Quaternion().setFromEuler(demoEuler(t)),
    new THREE.Vector3(1, 1, 1),
  );
  const wave = (f: number, p = 0) => Math.max(0, Math.sin(t * f + p));
  return {
    timestamp: now,
    faceMatrix: m.toArray(),
    faceLandmarks: null,
    blendshapes: {
      jawOpen: wave(1.1) * 0.5,
      mouthSmileLeft: wave(0.7, 2),
      mouthSmileRight: wave(0.7, 2),
      browInnerUp: wave(0.9, 4),
      eyeLookOutLeft: wave(0.6) * 0.6,
      eyeLookInRight: wave(0.6) * 0.6,
    },
    hands: [],
    pose: demoPose(t),
  };
}

/** A gently swaying standing figure for demo mode (normalised image coords). */
function demoPose(t: number): NormalizedLandmark[] {
  const pts: NormalizedLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  const set = (i: number, x: number, y: number) => (pts[i] = { x, y, z: 0, visibility: 1 });
  const sway = Math.sin(t * 0.8) * 0.02;
  const arm = Math.sin(t * 1.2) * 0.06;
  set(11, 0.6 + sway, 0.72); set(12, 0.4 + sway, 0.72); // shoulders
  set(13, 0.66 + sway, 0.86); set(14, 0.34 + sway, 0.86); // elbows
  set(15, 0.68 + arm, 0.99); set(16, 0.32 - arm, 0.99); // wrists
  set(23, 0.56, 1.05); set(24, 0.44, 1.05); // hips (below frame edge is fine)
  [25, 26, 27, 28, 31, 32].forEach((i) => (pts[i] = { ...pts[i], visibility: 0 }));
  return pts;
}

// Canonical-face reference distances (cm) from canonical_face_model.obj.
const CANON_WIDTH = 15.328; // 234 ↔ 454
const CANON_HEIGHT = 17.665; // 10 ↔ 152
const CANON_DEPTH = 9.911; // nose tip 1 → cheek midpoint
const CANON_JAW_RATIO = 11.881 / CANON_WIDTH; // jaw angles 172 ↔ 397, relative to face width
const CANON_LOWER_RATIO = 8.276 / CANON_HEIGHT; // nose tip → chin, relative to face height
const AUTOFIT_FRAMES = 45;

/**
 * The AR core: camera + tracking + anatomy rendering + overlays.
 * Has no knowledge of the app's UI; everything is driven through settings and
 * methods so it can later be packaged as an SDK.
 */
export class XrayEngine {
  readonly settings: EngineSettings;
  readonly anatomy: Anatomy;
  readonly stage: HTMLDivElement;
  readonly video: HTMLVideoElement;

  private glCanvas: HTMLCanvasElement;
  private overlay: HTMLCanvasElement;
  private octx: CanvasRenderingContext2D;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(63, 4 / 3, 1, 10000);
  private shared = createSharedUniforms();
  private handBones = new HandBones();
  private body = new BodySkeleton();
  private tracker: Tracker | null = null;
  private stream: MediaStream | null = null;
  private raf = 0;
  private running = false;
  private lastVideoTime = -1;
  realModels = false;
  private demo = false;
  private frame: TrackingFrame | null = null;
  private lastFaceSeen = 0;
  private faceAlpha = 0;
  private fpsT = performance.now();
  private fpsN = 0;
  private fps = 0;

  // pose smoothing
  private posF = new VectorFilter(3, 1.2, 0.02);
  private rotF = new VectorFilter(4, 1.2, 0.02);
  private sclF = new OneEuroFilter(0.6, 0.0);
  private prevQ = new THREE.Quaternion();
  private pose = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 };
  private bsF = new Map<string, OneEuroFilter>();

  private highlights = new Set<string>();
  /** Presenter annotations, stored in head space so they move with the patient. */
  private strokes: { color: string; width: number; pts: THREE.Vector3[] }[] = [];
  private activeStroke: { color: string; width: number; pts: THREE.Vector3[] } | null = null;
  private autoFit: { w: number[]; h: number[]; d: number[]; jaw: number[]; lower: number[] } | null = null;
  private recorder: MediaRecorder | null = null;
  private recordChunks: Blob[] = [];
  private composite: HTMLCanvasElement | null = null;
  private pendingShot: ((b: Blob | null) => void) | null = null;
  private resizeObs: ResizeObserver;
  private cssW = 1;
  private cssH = 1;

  constructor(
    private container: HTMLElement,
    private events: EngineEvents = {},
    settings: Partial<EngineSettings> = {},
  ) {
    this.settings = structuredClone({ ...DEFAULT_SETTINGS, ...settings });

    this.stage = document.createElement("div");
    this.stage.className = "xr-stage";
    this.video = document.createElement("video");
    this.video.className = "xr-video";
    this.video.playsInline = true;
    this.video.muted = true;
    this.glCanvas = document.createElement("canvas");
    this.glCanvas.className = "xr-gl";
    this.overlay = document.createElement("canvas");
    this.overlay.className = "xr-overlay";
    this.stage.append(this.video, this.glCanvas, this.overlay);
    container.append(this.stage);
    this.octx = this.overlay.getContext("2d")!;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.glCanvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false;
    this.renderer.localClippingEnabled = true;

    this.anatomy = buildAnatomy(this.shared);
    this.scene.add(this.anatomy.root);
    this.anatomy.root.visible = false;

    this.resizeObs = new ResizeObserver(() => this.layout());
    this.resizeObs.observe(container);
    this.applySettings();

    loadRealAnatomy(this.anatomy, this.shared)
      .then((r) => {
        this.realModels = !!r;
        this.applySettings(); // new materials need the current look
        this.events.onModelsLoaded?.({ real: !!r });
      })
      .catch((err) => {
        console.warn("Real anatomy models failed to load; using placeholders", err);
        this.events.onModelsLoaded?.({ real: false });
      });
  }

  // ─────────────────────────── lifecycle ───────────────────────────

  async start(): Promise<void> {
    if (this.running && !this.demo) return;
    if (this.demo) this.stop();
    const [tracker, stream] = await Promise.all([
      this.tracker ? Promise.resolve(this.tracker) : Tracker.create(),
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      }),
    ]);
    this.tracker = tracker;
    this.tracker.setPoseEnabled(this.settings.layers.body);
    this.stream = stream;
    this.video.srcObject = stream;
    await this.video.play();
    this.layout();
    this.running = true;
    this.loop();
  }

  /** Camera-free preview: a slowly turning head with animated jaw and muscles. */
  startDemo(): void {
    if (this.running) return;
    this.demo = true;
    this.video.style.visibility = "hidden";
    this.layout();
    this.running = true;
    this.loop();
  }

  get isDemo(): boolean {
    return this.demo;
  }

  stop(): void {
    this.running = false;
    this.demo = false;
    this.video.style.visibility = "";
    cancelAnimationFrame(this.raf);
    this.stopRecording();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.anatomy.root.visible = false;
  }

  dispose(): void {
    this.stop();
    this.resizeObs.disconnect();
    this.tracker?.close();
    this.handBones.dispose();
    this.body.dispose();
    this.renderer.dispose();
    this.stage.remove();
  }

  get isRunning(): boolean {
    return this.running;
  }

  // ─────────────────────────── settings ───────────────────────────

  update(patch: Partial<EngineSettings>): void {
    Object.assign(this.settings, patch);
    this.applySettings();
  }

  updateFit(patch: Partial<FitSettings>): void {
    Object.assign(this.settings.fit, patch);
    this.applySettings();
  }

  setLayer(id: ToggleId, on: boolean): void {
    this.settings.layers[id] = on;
    this.applySettings();
  }

  private applySettings(): void {
    const s = this.settings;
    const a = this.anatomy;
    (Object.keys(a.layers) as LayerId[]).forEach((id) => (a.layers[id].visible = s.layers[id]));
    this.handBones.visible = s.layers.hands;
    this.body.visible = s.layers.body;
    this.tracker?.setPoseEnabled(s.layers.body);
    // the fingertip lens sits on the hand, so hand occlusion would cut a hole in it
    this.handBones.occlusion = s.handOcclusion && s.reveal !== "lens";

    a.allMaterials.forEach((m) => applyLook(m, s.look));
    applyLook(this.handBones.material, s.look);
    applyLook(this.body.material, s.look);
    this.shared.uSolid.value = s.look === "solid" ? 1 : 0;
    this.shared.uBrightness.value = s.brightness;
    // Solid: real face fades the model; X-ray: real face brightens the video.
    this.shared.uOpacity.value = s.look === "solid" ? 1 - s.realBlend * 0.9 : 1;

    const vb = s.look === "xray" ? 0.12 + s.realBlend * 0.88 : 1;
    this.video.style.filter =
      s.look === "xray" ? `grayscale(1) contrast(1.15) brightness(${vb.toFixed(3)})` : "none";

    const f = s.fit;
    a.fit.scale.set(f.scale * f.width, f.scale * f.height, f.scale * f.depth);
    a.fit.position.set(f.x, f.y, f.z);
    a.jaw.scale.set(f.jawWidth, f.jawLength, 1 + (f.jawLength - 1) * 0.5);

    const flip = s.mirror ? "scaleX(-1)" : "none";
    this.video.style.transform = flip;
    this.glCanvas.style.transform = flip;

    this.shared.uFeather.value = s.reveal === "lens" ? 0.05 + s.feather * 0.6 : 0.05 + s.feather * 3;
    this.shared.uRevealKind.value =
      s.reveal === "whole" ? RevealKind.None : s.reveal === "lens" ? RevealKind.Lens : RevealKind.Plane;
    const c = s.cut;
    const planes: Record<string, [number, number, number, number]> = {
      left: [1, 0, 0, c * 6],
      right: [-1, 0, 0, c * 6],
      top: [0, 1, 0, 3 + c * 8],
      lower: [0, -1, 0, 1 - c * 8],
    };
    const pl = planes[s.reveal];
    if (pl) this.shared.uPlane.value.set(...pl);

    const k = 0.2 + (1 - s.smoothing) * 2.5; // min cutoff
    this.posF.setParams(k, 0.02);
    this.rotF.setParams(k, 0.02);
  }

  // ─────────────────────────── layout ───────────────────────────

  private layout(): void {
    const vw = this.video.videoWidth || 1280;
    const vh = this.video.videoHeight || 720;
    const cw = this.container.clientWidth;
    const ch = this.container.clientHeight;
    // Desktop (landscape space): show the whole frame. Phones / narrow screens, or any
    // portrait space: fill it edge to edge and crop the overflow. Phone cameras often
    // deliver portrait video, which would otherwise sit in a narrow column.
    const narrow = typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;
    const fill = narrow || ch > cw;
    const scale = fill ? Math.max(cw / vw, ch / vh) : Math.min(cw / vw, ch / vh);
    this.cssW = Math.round(vw * scale);
    this.cssH = Math.round(vh * scale);
    Object.assign(this.stage.style, { width: `${this.cssW}px`, height: `${this.cssH}px` });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.cssW, this.cssH, false);
    this.overlay.width = Math.round(this.cssW * dpr);
    this.overlay.height = Math.round(this.cssH * dpr);
    this.octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.camera.aspect = vw / vh;
    this.camera.updateProjectionMatrix();
    this.handBones.resize(this.cssW, this.cssH);
  }

  // ─────────────────────────── main loop ───────────────────────────

  private loop = (): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();

    if (this.demo) {
      this.frame = demoFrame(now);
      this.fpsN++;
    } else if (this.video.readyState >= 2 && this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      this.frame = this.tracker!.detect(this.video, now);
      this.fpsN++;
    }
    if (now - this.fpsT > 1000) {
      this.fps = (this.fpsN * 1000) / (now - this.fpsT);
      this.fpsN = 0;
      this.fpsT = now;
    }

    const fr = this.frame;
    const faceFound = !!fr?.faceMatrix;
    if (fr?.faceMatrix) {
      this.lastFaceSeen = now;
      this.updatePose(fr.faceMatrix, fr.timestamp);
      if (this.autoFit && fr.faceLandmarks) this.sampleAutoFit(fr.faceLandmarks);
    }
    // fade out when tracking is lost instead of freezing in place
    const target = now - this.lastFaceSeen < 300 ? 1 : 0;
    this.faceAlpha += (target - this.faceAlpha) * 0.2;
    this.anatomy.root.visible = this.faceAlpha > 0.02;

    const bs = this.smoothBlendshapes(fr?.blendshapes ?? {}, now);
    const act = this.settings.muscleActivation ? muscleActivations(bs) : {};
    this.animateAnatomy(bs, act, now);

    const hands = fr?.hands ?? [];
    this.handBones.update(hands, this.cssW, this.cssH);
    this.body.update(fr?.pose ?? null, this.cssW, this.cssH);
    const tipNorm = hands[0]?.landmarks[8] ?? null;
    this.updateReveal(tipNorm);

    this.render();
    this.drawOverlay(fr, tipNorm);
    if (this.recorder || this.pendingShot) this.compositeFrame();

    this.events.onFrame?.({
      fps: this.fps,
      faceFound,
      handCount: hands.length,
      bodyFound: !this.settings.layers.body ? null : this.demo || this.tracker?.poseReady ? !!fr?.pose : null,
      blendshapes: bs,
      activations: act,
      fingertip: tipNorm ? this.normToStage(tipNorm) : null,
      head: faceFound ? this.headAngles() : null,
      body: fr?.pose
        ? fr.pose.map((p) => ({ x: p.x * (this.video.videoWidth || 1280), y: p.y * (this.video.videoHeight || 720), v: p.visibility ?? 1 }))
        : null,
    });
  };

  /** Head rotation relative to facing the camera, in degrees. */
  private headAngles(): { yaw: number; pitch: number; roll: number } {
    const e = new THREE.Euler().setFromQuaternion(this.pose.q, "YXZ");
    const d = THREE.MathUtils.radToDeg;
    return { yaw: d(e.y), pitch: d(e.x), roll: d(e.z) };
  }

  private updatePose(m: number[], t: number): void {
    const mat = new THREE.Matrix4().fromArray(m);
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    mat.decompose(p, q, s);
    if (q.dot(this.prevQ) < 0) q.set(-q.x, -q.y, -q.z, -q.w); // keep hemisphere continuous
    const pf = this.posF.filter([p.x, p.y, p.z], t);
    const qf = this.rotF.filter([q.x, q.y, q.z, q.w], t);
    this.pose.p.set(pf[0], pf[1], pf[2]);
    this.pose.q.set(qf[0], qf[1], qf[2], qf[3]).normalize();
    this.prevQ.copy(this.pose.q);
    this.pose.s = this.sclF.filter((s.x + s.y + s.z) / 3, t);
    const root = this.anatomy.root;
    root.matrix.compose(this.pose.p, this.pose.q, new THREE.Vector3().setScalar(this.pose.s));
    root.matrixWorldNeedsUpdate = true;
  }

  private smoothBlendshapes(raw: Record<string, number>, t: number): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      let f = this.bsF.get(k);
      if (!f) this.bsF.set(k, (f = new OneEuroFilter(1.5, 0.3)));
      out[k] = f.filter(v, t);
    }
    return out;
  }

  private animateAnatomy(bs: Record<string, number>, act: Record<string, number>, now: number): void {
    const s = this.settings;
    const g = (k: string) => bs[k] ?? 0;
    const jaw = this.anatomy.jaw;
    if (s.jawFollow) {
      jaw.rotation.x = g("jawOpen") * 0.42;
      jaw.rotation.y = (g("jawLeft") - g("jawRight")) * 0.12;
      jaw.position.z = this.anatomy.jawRest.z + g("jawForward") * 0.5;
    } else {
      jaw.rotation.set(0, 0, 0);
      jaw.position.z = this.anatomy.jawRest.z;
    }
    const { left, right } = this.anatomy.eyes;
    if (s.eyeFollow) {
      left.rotation.y = (g("eyeLookOutLeft") - g("eyeLookInLeft")) * 0.5;
      left.rotation.x = -(g("eyeLookUpLeft") - g("eyeLookDownLeft")) * 0.4;
      right.rotation.y = -(g("eyeLookOutRight") - g("eyeLookInRight")) * 0.5;
      right.rotation.x = -(g("eyeLookUpRight") - g("eyeLookDownRight")) * 0.4;
    } else {
      left.rotation.set(0, 0, 0);
      right.rotation.set(0, 0, 0);
    }
    this.shared.uTime.value = now / 1000;
    for (const st of this.anatomy.structures) {
      const a = st.layer === "muscles" ? act[st.id] ?? 0 : 0;
      const hi = this.highlights.has(st.id) ? 1 : 0;
      for (const m of st.materials) {
        m.uniforms.uActivation.value += (a - m.uniforms.uActivation.value) * 0.35;
        m.uniforms.uHighlight.value = hi;
        m.uniforms.uLayerAlpha.value = this.faceAlpha;
      }
    }
  }

  private updateReveal(tip: NormalizedLandmark | null): void {
    this.anatomy.root.updateMatrixWorld(true);
    this.shared.uWorldToHead.value.copy(this.anatomy.fit.matrixWorld).invert();
    if (this.settings.reveal === "lens") {
      const dpr = this.renderer.getPixelRatio();
      if (tip) {
        // GL fragment coords: origin bottom-left, in the un-mirrored canvas space.
        this.shared.uLens.value.set(tip.x * this.cssW * dpr, (1 - tip.y) * this.cssH * dpr, this.cssH * dpr * 0.16);
      } else {
        this.shared.uLens.value.set(-1e4, -1e4, 1);
      }
    }
    // hand bones share look settings but never get revealed/clipped
    // thin overlay bones have little rim area, so boost them in x-ray mode
    const overlayBoost = this.settings.look === "xray" ? 2.2 : 1;
    for (const u of [this.handBones.uniforms, this.body.uniforms]) {
      u.uBrightness.value = this.shared.uBrightness.value * overlayBoost;
      u.uSolid.value = this.shared.uSolid.value;
      u.uOpacity.value = this.shared.uOpacity.value;
    }
  }

  private render(): void {
    const r = this.renderer;
    r.clear();
    if (this.handBones.occlusion) r.render(this.handBones.occluderScene, this.handBones.camera);
    r.render(this.scene, this.camera);
    r.clearDepth();
    r.render(this.body.scene, this.handBones.camera);
    r.clearDepth();
    r.render(this.handBones.scene, this.handBones.camera);
  }

  // ─────────────────────────── overlay ───────────────────────────

  /** Normalised image coords → stage CSS px, accounting for mirroring. */
  private normToStage(lm: { x: number; y: number }): { x: number; y: number } {
    const x = lm.x * this.cssW;
    return { x: this.settings.mirror ? this.cssW - x : x, y: lm.y * this.cssH };
  }

  /** Dev aid: attach an object in head space (e.g. the canonical face points). */
  addHeadSpaceHelper(o: THREE.Object3D): void {
    this.anatomy.fit.add(o);
  }

  /** Head-space point → stage CSS px (mirrored for display), or null if behind camera. */
  projectHeadPoint(p: THREE.Vector3): { x: number; y: number } | null {
    const v = p.clone().applyMatrix4(this.anatomy.fit.matrixWorld).project(this.camera);
    if (v.z > 1) return null;
    return this.normToStage({ x: (v.x + 1) / 2, y: (1 - v.y) / 2 });
  }

  visibleStructures(): Structure[] {
    return this.anatomy.structures.filter((s) => this.settings.layers[s.layer]);
  }

  private drawOverlay(fr: TrackingFrame | null, tip: NormalizedLandmark | null): void {
    const ctx = this.octx;
    const s = this.settings;
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    const face = fr?.faceLandmarks;

    if (face && s.layers.outline) {
      ctx.save();
      ctx.strokeStyle = "rgba(140,220,255,0.8)";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "#5cd6ff";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      for (const c of FaceLandmarker.FACE_LANDMARKS_FACE_OVAL) {
        const a = this.normToStage(face[c.start]);
        const b = this.normToStage(face[c.end]);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
      ctx.restore();
    }

    if (s.trackingData) {
      ctx.save();
      if (face) {
        ctx.fillStyle = "rgba(120,255,200,0.7)";
        for (const lm of face) {
          const p = this.normToStage(lm);
          ctx.fillRect(p.x - 0.75, p.y - 0.75, 1.5, 1.5);
        }
      }
      ctx.fillStyle = "rgba(255,210,120,0.95)";
      for (const h of fr?.hands ?? []) {
        for (const lm of h.landmarks) {
          const p = this.normToStage(lm);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.font = "12px ui-monospace, monospace";
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      const top = Object.entries(fr?.blendshapes ?? {})
        .filter(([k]) => k !== "_neutral")
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([k, v]) => `${k} ${v.toFixed(2)}`);
      [`${this.fps.toFixed(0)} fps`, face ? "face ✓" : "face —", `hands ${fr?.hands.length ?? 0}`, ...top].forEach(
        (line, i) => ctx.fillText(line, 12, 20 + i * 16),
      );
      ctx.restore();
    }

    if (s.labels && this.anatomy.root.visible) this.drawLabels();
    if (this.anatomy.root.visible) this.drawStrokes();

    if (s.reveal === "lens" && tip) {
      const p = this.normToStage(tip);
      ctx.save();
      ctx.strokeStyle = "rgba(160,230,255,0.6)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.cssH * 0.16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * Labels are laid out in two columns beside the head (left / right of the
   * projected centre), stacked to avoid overlap, with leader lines to anchors.
   */
  private drawLabels(): void {
    const ctx = this.octx;
    const centre = this.projectHeadPoint(new THREE.Vector3(0, 1, -2));
    const edge = this.projectHeadPoint(new THREE.Vector3(9.5, 1, -2));
    if (!centre || !edge) return;
    const radius = Math.max(60, Math.abs(edge.x - centre.x));
    const ROW = 19;

    type Item = { st: Structure; p: { x: number; y: number }; y: number };
    const sides: Record<"l" | "r", Item[]> = { l: [], r: [] };
    for (const st of this.visibleStructures()) {
      const p = this.projectHeadPoint(st.anchor);
      if (!p) continue;
      sides[p.x < centre.x ? "l" : "r"].push({ st, p, y: p.y });
    }

    ctx.save();
    ctx.font = "600 12px \"Inter Variable\", system-ui, sans-serif";
    ctx.textBaseline = "middle";
    for (const side of ["l", "r"] as const) {
      const items = sides[side].sort((a, b) => a.p.y - b.p.y);
      // stack downward, then pull the block back up if it overflows the stage
      for (let i = 1; i < items.length; i++) items[i].y = Math.max(items[i].y, items[i - 1].y + ROW);
      const overflow = (items.at(-1)?.y ?? 0) - (this.cssH - 12);
      if (overflow > 0) items.forEach((it) => (it.y -= overflow));
      for (let i = items.length - 2; i >= 0; i--) items[i].y = Math.min(items[i].y, items[i + 1].y - ROW);

      const colX = side === "l" ? centre.x - radius - 16 : centre.x + radius + 16;
      for (const { st, p, y } of items) {
        const hi = this.highlights.has(st.id);
        ctx.strokeStyle = hi ? "rgba(255,220,80,0.95)" : "rgba(255,255,255,0.45)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(colX, y);
        ctx.stroke();
        ctx.fillStyle = hi ? "#ffe066" : "#fff";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        const w = ctx.measureText(st.name).width;
        const tx = side === "l" ? colX - 6 - w : colX + 6;
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(tx - 4, y - 9, w + 8, 18);
        ctx.fillStyle = hi ? "#ffe066" : "#fff";
        ctx.fillText(st.name, tx, y);
      }
    }
    ctx.restore();
  }

  // ─────────────────────────── annotations ───────────────────────────

  /**
   * Stage CSS px → head space, by casting a ray onto the plane through the head
   * centre that faces the camera. Strokes drawn there behave like stickers on
   * the head: they follow it as it moves and turns.
   */
  stageToHead(x: number, y: number): THREE.Vector3 | null {
    if (!this.anatomy.root.visible) return null;
    const ix = this.settings.mirror ? this.cssW - x : x;
    const ndc = new THREE.Vector2((ix / this.cssW) * 2 - 1, 1 - (y / this.cssH) * 2);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const fit = this.anatomy.fit;
    fit.updateMatrixWorld(true);
    const centre = new THREE.Vector3(0, 2, 2).applyMatrix4(fit.matrixWorld);
    const normal = this.camera.position.clone().sub(centre).normalize();
    const hit = ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(normal, centre), new THREE.Vector3());
    return hit ? hit.applyMatrix4(fit.matrixWorld.clone().invert()) : null;
  }

  beginStroke(x: number, y: number, color: string, width = 4): boolean {
    const p = this.stageToHead(x, y);
    if (!p) return false;
    this.activeStroke = { color, width, pts: [p] };
    this.strokes.push(this.activeStroke);
    return true;
  }

  extendStroke(x: number, y: number): void {
    const p = this.activeStroke && this.stageToHead(x, y);
    if (!p) return;
    const last = this.activeStroke!.pts.at(-1)!;
    if (last.distanceTo(p) > 0.08) this.activeStroke!.pts.push(p); // ~1 mm spacing
  }

  endStroke(): void {
    this.activeStroke = null;
  }

  undoStroke(): void {
    this.strokes.pop();
  }

  clearStrokes(): void {
    this.strokes = [];
    this.activeStroke = null;
  }

  get strokeCount(): number {
    return this.strokes.length;
  }

  private drawStrokes(): void {
    if (!this.strokes.length) return;
    const ctx = this.octx;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const st of this.strokes) {
      const pts = st.pts.map((p) => this.projectHeadPoint(p)).filter((p): p is { x: number; y: number } => !!p);
      if (!pts.length) continue;
      ctx.strokeStyle = st.color;
      ctx.fillStyle = st.color;
      ctx.lineWidth = st.width;
      ctx.shadowColor = st.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      if (pts.length === 1) {
        ctx.arc(pts[0].x, pts[0].y, st.width, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ─────────────────────────── interaction ───────────────────────────

  /** Nearest visible structure to a stage CSS-px point (e.g. a click or fingertip). */
  pick(x: number, y: number, maxDist = 70): Structure | null {
    if (!this.anatomy.root.visible) return null;
    let best: Structure | null = null;
    let bestD = maxDist;
    for (const st of this.visibleStructures()) {
      const p = this.projectHeadPoint(st.anchor);
      if (!p) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) {
        bestD = d;
        best = st;
      }
    }
    return best;
  }

  /** Convert a client (mouse) position to stage CSS px. */
  clientToStage(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.stage.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }

  setHighlights(ids: string[]): void {
    this.highlights = new Set(ids);
  }

  // ─────────────────────────── auto-fit ───────────────────────────

  /** Measures the user's face proportions over ~1.5 s and adjusts width/height/depth. */
  startAutoFit(): void {
    this.autoFit = { w: [], h: [], d: [], jaw: [], lower: [] };
  }

  private sampleAutoFit(L: NormalizedLandmark[]): void {
    const af = this.autoFit!;
    const W = this.video.videoWidth;
    const H = this.video.videoHeight;
    const inv = this.pose.q.clone().invert();
    const P = (i: number) => new THREE.Vector3(L[i].x * W, -L[i].y * H, -L[i].z * W).applyQuaternion(inv);
    const width = Math.abs(P(454).x - P(234).x);
    const height = Math.abs(P(10).y - P(152).y);
    const cheekZ = (P(234).z + P(454).z) / 2;
    const depth = Math.abs(P(1).z - cheekZ);
    af.w.push(width);
    af.h.push(height);
    af.d.push(depth);
    af.jaw.push(Math.abs(P(397).x - P(172).x) / width);
    af.lower.push(Math.abs(P(1).y - P(152).y) / height);
    this.events.onAutoFitProgress?.(af.w.length / AUTOFIT_FRAMES);
    if (af.w.length < AUTOFIT_FRAMES) return;

    const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const rw = median(af.w) / CANON_WIDTH;
    const rh = median(af.h) / CANON_HEIGHT;
    const rd = median(af.d) / CANON_DEPTH;
    const m = Math.cbrt(rw * rh * rd); // overall size is already handled by the pose matrix
    const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
    this.autoFit = null;
    this.updateFit({
      width: +clamp(rw / m, 0.85, 1.15).toFixed(3),
      height: +clamp(rh / m, 0.85, 1.15).toFixed(3),
      depth: +clamp(rd / m, 0.9, 1.1).toFixed(3),
      jawWidth: +clamp(median(af.jaw) / CANON_JAW_RATIO, 0.85, 1.15).toFixed(3),
      jawLength: +clamp(median(af.lower) / CANON_LOWER_RATIO, 0.85, 1.15).toFixed(3),
    });
    this.events.onAutoFitDone?.({ ...this.settings.fit });
  }

  // ─────────────────────────── capture ───────────────────────────

  private compositeFrame(): void {
    const dpr = this.renderer.getPixelRatio();
    const w = Math.round(this.cssW * dpr);
    const h = Math.round(this.cssH * dpr);
    if (!this.composite) this.composite = document.createElement("canvas");
    const c = this.composite;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = c.getContext("2d")!;
    ctx.save();
    if (this.settings.mirror) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.filter = this.video.style.filter || "none";
    ctx.drawImage(this.video, 0, 0, w, h);
    ctx.filter = "none";
    ctx.drawImage(this.glCanvas, 0, 0, w, h); // same task as render → buffer still valid
    ctx.restore();
    ctx.drawImage(this.overlay, 0, 0, w, h);
    ctx.font = `${12 * dpr}px system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText("Innerview · educational illustration · anatomy: BodyParts3D (CC BY-SA)", 10 * dpr, h - 10 * dpr);

    if (this.pendingShot) {
      const cb = this.pendingShot;
      this.pendingShot = null;
      c.toBlob(cb, "image/png");
    }
  }

  screenshot(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.running) return resolve(null);
      this.pendingShot = resolve;
    });
  }

  startRecording(): boolean {
    if (!this.running || this.recorder) return false;
    this.compositeFrame();
    const stream = this.composite!.captureStream(30);
    const type = ["video/mp4", "video/webm;codecs=vp9", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
    this.recordChunks = [];
    this.recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    this.recorder.ondataavailable = (e) => e.data.size && this.recordChunks.push(e.data);
    this.recorder.start(250);
    return true;
  }

  stopRecording(): Promise<Blob | null> {
    const rec = this.recorder;
    if (!rec) return Promise.resolve(null);
    this.recorder = null;
    return new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(this.recordChunks, { type: rec.mimeType }));
      rec.stop();
    });
  }

  get isRecording(): boolean {
    return !!this.recorder;
  }
}
