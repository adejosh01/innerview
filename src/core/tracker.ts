import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

export interface TrackingFrame {
  timestamp: number;
  /** 4x4 column-major face pose matrix (canonical face space, cm → camera space). */
  faceMatrix: number[] | null;
  faceLandmarks: NormalizedLandmark[] | null;
  /** Blendshape scores by name, e.g. jawOpen, browInnerUp. */
  blendshapes: Record<string, number>;
  hands: { landmarks: NormalizedLandmark[]; handedness: string }[];
  /** 33 body landmarks when body tracking is enabled. */
  pose: NormalizedLandmark[] | null;
}

export interface TrackerOptions {
  /** Base URL hosting wasm/ and *.task files. Self-hosted by default. */
  assetBase?: string;
  maxHands?: number;
  enableHands?: boolean;
}

/** Wraps MediaPipe face + hand landmarkers. All inference runs on-device. */
export class Tracker {
  private face!: FaceLandmarker;
  private hands: HandLandmarker | null = null;
  private pose: PoseLandmarker | null = null;
  private posePending: Promise<void> | null = null;
  private poseEnabled = false;
  private fileset!: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
  private base = "";
  private delegate: "GPU" | "CPU" = "GPU";
  private lastTs = -1;

  static async create(opts: TrackerOptions = {}): Promise<Tracker> {
    const base = opts.assetBase ?? `${import.meta.env.BASE_URL}mediapipe`;
    const fileset = await FilesetResolver.forVisionTasks(`${base}/wasm`);
    const t = new Tracker();
    t.fileset = fileset;
    t.base = base;
    const make = async (delegate: "GPU" | "CPU") => {
      t.delegate = delegate;
      t.face = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${base}/face_landmarker.task`, delegate },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
        outputFaceBlendshapes: true,
      });
      if (opts.enableHands !== false) {
        t.hands = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: `${base}/hand_landmarker.task`, delegate },
          runningMode: "VIDEO",
          numHands: opts.maxHands ?? 2,
        });
      }
    };
    try {
      await make("GPU");
    } catch (err) {
      console.warn("GPU delegate unavailable, falling back to CPU", err);
      await make("CPU");
    }
    return t;
  }

  /** Body tracking is loaded lazily the first time full-body mode is switched on. */
  setPoseEnabled(on: boolean): void {
    this.poseEnabled = on;
    if (!on || this.pose || this.posePending) return;
    this.posePending = PoseLandmarker.createFromOptions(this.fileset, {
      baseOptions: { modelAssetPath: `${this.base}/pose_landmarker_lite.task`, delegate: this.delegate },
      runningMode: "VIDEO",
      numPoses: 1,
    })
      .then((p) => void (this.pose = p))
      .catch((err) => console.error("Pose model failed to load", err))
      .finally(() => (this.posePending = null));
  }

  get poseReady(): boolean {
    return !!this.pose;
  }

  detect(video: HTMLVideoElement, now: number): TrackingFrame {
    // MediaPipe requires strictly increasing timestamps.
    const ts = now <= this.lastTs ? this.lastTs + 1 : now;
    this.lastTs = ts;

    const f = this.face.detectForVideo(video, ts);
    const blendshapes: Record<string, number> = {};
    f.faceBlendshapes?.[0]?.categories.forEach((c) => (blendshapes[c.categoryName] = c.score));

    const frame: TrackingFrame = {
      timestamp: ts,
      faceMatrix: f.facialTransformationMatrixes?.[0]?.data
        ? Array.from(f.facialTransformationMatrixes[0].data)
        : null,
      faceLandmarks: f.faceLandmarks?.[0] ?? null,
      blendshapes,
      hands: [],
      pose: null,
    };

    if (this.hands) {
      const h = this.hands.detectForVideo(video, ts);
      frame.hands = h.landmarks.map((landmarks, i) => ({
        landmarks,
        handedness: h.handedness[i]?.[0]?.categoryName ?? "Unknown",
      }));
    }
    if (this.pose && this.poseEnabled) {
      frame.pose = this.pose.detectForVideo(video, ts).landmarks[0] ?? null;
    }
    return frame;
  }

  close(): void {
    this.face?.close();
    this.hands?.close();
    this.pose?.close();
  }
}
