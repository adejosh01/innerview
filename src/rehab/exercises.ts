import type { FrameInfo, ToggleId } from "../core/engine";

/**
 * Rehab-mode exercise library: general range-of-motion coaching measured from
 * face and body tracking. Wording rule: these are general exercise guides,
 * not treatment. Never tell users what is "normal" or "abnormal" for them.
 */

export type Area = "Neck" | "Jaw" | "Shoulders & arms";

export interface Exercise {
  id: string;
  name: string;
  area: Area;
  /** Which tracking the exercise needs. */
  needs: "face" | "body";
  instructions: string;
  /** Reps per set and number of sets. */
  reps: number;
  sets: number;
  /** "reps": count each out-and-back; "hold": count when held above target for holdSec. */
  mode: "reps" | "hold";
  holdSec?: number;
  /** Reaching `target` counts as the "out" position; dropping below `rest` resets. */
  target: number;
  rest: number;
  /** Gauge maximum and unit. */
  max: number;
  unit: string;
  /** Live measurement, or null when it can't be measured this frame. */
  measure: (f: FrameInfo, baseline: Baseline) => number | null;
  /** Optional calibration captured during the first second (e.g. resting shoulder height). */
  calibrate?: (f: FrameInfo) => number | null;
  /** Coaching cues by phase. */
  cues: { go: string; more: string; back: string };
  /** What to show while exercising. */
  layers: Partial<Record<ToggleId, boolean>>;
  highlight: string[];
}

export interface Baseline {
  value: number | null;
}

// MediaPipe Pose indices
const L_EAR = 7, R_EAR = 8, L_SH = 11, R_SH = 12, L_EL = 13, R_EL = 14, L_WR = 15, R_WR = 16, L_HIP = 23, R_HIP = 24;

type P = { x: number; y: number; v: number };
const ok = (...pts: P[]) => pts.every((p) => p && p.v >= 0.5);
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
/** Angle ABC in degrees. */
function angle(a: P, b: P, c: P): number {
  const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
  const cos = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}
/** Mean of the values that could be measured. */
function meanOf(vals: (number | null)[]): number | null {
  const v = vals.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

const NECK_VIEW = { skull: true, spine: true, muscles: true, brain: false, eyes: false, body: false, outline: false };
const JAW_VIEW = { skull: true, spine: false, muscles: true, brain: false, eyes: true, body: false, outline: false };
const BODY_VIEW = { body: true, skull: true, spine: true, muscles: false, brain: false, eyes: false, outline: false };

export const EXERCISES: Exercise[] = [
  {
    id: "neck-rotation",
    name: "Neck turns",
    area: "Neck",
    needs: "face",
    instructions: "Sit tall. Slowly turn your head to look over one shoulder, come back to centre, then turn to the other side.",
    reps: 10,
    sets: 2,
    mode: "reps",
    target: 35,
    rest: 10,
    max: 70,
    unit: "°",
    measure: (f) => (f.head ? Math.abs(f.head.yaw) : null),
    cues: { go: "Turn slowly to one side", more: "A little further, if comfortable", back: "Good. Back to centre" },
    layers: NECK_VIEW,
    highlight: ["scm", "cervical"],
  },
  {
    id: "neck-tilt",
    name: "Neck side tilts",
    area: "Neck",
    needs: "face",
    instructions: "Keep your shoulders relaxed. Tilt your ear toward one shoulder, return to centre, then tilt to the other side.",
    reps: 10,
    sets: 2,
    mode: "reps",
    target: 20,
    rest: 6,
    max: 45,
    unit: "°",
    measure: (f) => (f.head ? Math.abs(f.head.roll) : null),
    cues: { go: "Tilt ear toward shoulder", more: "A little further, if comfortable", back: "Good. Back to centre" },
    layers: NECK_VIEW,
    highlight: ["scm", "cervical"],
  },
  {
    id: "neck-nod",
    name: "Gentle nods",
    area: "Neck",
    needs: "face",
    instructions: "Slowly lower your chin toward your chest, then lift back to looking straight ahead.",
    reps: 10,
    sets: 2,
    mode: "reps",
    target: 20,
    rest: 6,
    max: 45,
    unit: "°",
    measure: (f) => (f.head ? Math.abs(f.head.pitch) : null),
    cues: { go: "Lower your chin slowly", more: "A little further, if comfortable", back: "Good. Back to level" },
    layers: NECK_VIEW,
    highlight: ["cervical"],
  },
  {
    id: "jaw-open",
    name: "Jaw opening holds",
    area: "Jaw",
    needs: "face",
    instructions: "Open your mouth slowly as far as is comfortable and hold it there, then close gently.",
    reps: 6,
    sets: 2,
    mode: "hold",
    holdSec: 3,
    target: 45,
    rest: 12,
    max: 100,
    unit: "%",
    measure: (f) => ("jawOpen" in f.blendshapes ? f.blendshapes.jawOpen * 100 : null),
    cues: { go: "Open slowly", more: "Hold it there", back: "Good. Close gently" },
    layers: JAW_VIEW,
    highlight: ["mandible", "masseter", "temporalis"],
  },
  {
    id: "shoulder-shrug",
    name: "Shoulder shrugs",
    area: "Shoulders & arms",
    needs: "body",
    instructions: "Stand or sit facing the camera with shoulders visible. Lift both shoulders toward your ears, then let them drop.",
    reps: 10,
    sets: 2,
    mode: "reps",
    target: 25,
    rest: 8,
    max: 60,
    unit: "%",
    calibrate: (f) => {
      const b = f.body;
      if (!b || !ok(b[L_EAR], b[R_EAR], b[L_SH], b[R_SH])) return null;
      const gap = (b[L_SH].y + b[R_SH].y) / 2 - (b[L_EAR].y + b[R_EAR].y) / 2;
      return gap / dist(b[L_SH], b[R_SH]);
    },
    measure: (f, base) => {
      const b = f.body;
      if (!b || !base.value || !ok(b[L_EAR], b[R_EAR], b[L_SH], b[R_SH])) return null;
      const gap = ((b[L_SH].y + b[R_SH].y) / 2 - (b[L_EAR].y + b[R_EAR].y) / 2) / dist(b[L_SH], b[R_SH]);
      return Math.max(0, (1 - gap / base.value) * 100);
    },
    cues: { go: "Lift shoulders toward your ears", more: "A little higher", back: "Good. Let them drop" },
    layers: BODY_VIEW,
    highlight: ["scm"],
  },
  {
    id: "arm-raise",
    name: "Arm raises",
    area: "Shoulders & arms",
    needs: "body",
    instructions: "Step back so your upper body is visible. Raise both arms out to the side and up as high as is comfortable, then lower slowly.",
    reps: 10,
    sets: 2,
    mode: "reps",
    target: 140,
    rest: 40,
    max: 180,
    unit: "°",
    measure: (f) => {
      const b = f.body;
      if (!b) return null;
      return meanOf([
        ok(b[L_HIP], b[L_SH], b[L_EL]) ? angle(b[L_HIP], b[L_SH], b[L_EL]) : null,
        ok(b[R_HIP], b[R_SH], b[R_EL]) ? angle(b[R_HIP], b[R_SH], b[R_EL]) : null,
      ]);
    },
    cues: { go: "Raise your arms out and up", more: "A little higher, if comfortable", back: "Good. Lower slowly" },
    layers: BODY_VIEW,
    highlight: [],
  },
  {
    id: "elbow-curl",
    name: "Elbow bends",
    area: "Shoulders & arms",
    needs: "body",
    instructions: "Keep your upper arms by your sides. Bend your elbows to bring your hands toward your shoulders, then straighten.",
    reps: 12,
    sets: 2,
    mode: "reps",
    target: 110,
    rest: 40,
    max: 160,
    unit: "°",
    // 180° − elbow angle: 0 when straight, ~140 when fully bent
    measure: (f) => {
      const b = f.body;
      if (!b) return null;
      return meanOf([
        ok(b[L_SH], b[L_EL], b[L_WR]) ? 180 - angle(b[L_SH], b[L_EL], b[L_WR]) : null,
        ok(b[R_SH], b[R_EL], b[R_WR]) ? 180 - angle(b[R_SH], b[R_EL], b[R_WR]) : null,
      ]);
    },
    cues: { go: "Bend your elbows", more: "Bring hands a little closer", back: "Good. Straighten slowly" },
    layers: BODY_VIEW,
    highlight: [],
  },
];


/** Rep counter with hysteresis (target / rest thresholds) and optional hold timing. */
export class RepCounter {
  reps = 0;
  phase: "rest" | "out" = "rest";
  holdStart = 0;
  holdProgress = 0;
  best = 0;

  private ex: Exercise;

  constructor(ex: Exercise) {
    this.ex = ex;
  }

  /** Returns true when a rep was just completed. */
  update(value: number | null, now: number): boolean {
    if (value === null) return false;
    this.best = Math.max(this.best, value);
    const { ex } = this;
    if (this.phase === "rest") {
      if (value >= ex.target) {
        this.phase = "out";
        this.holdStart = now;
      }
      this.holdProgress = 0;
      return false;
    }
    // phase "out"
    if (ex.mode === "hold") {
      if (value >= ex.target * 0.85) {
        this.holdProgress = Math.min(1, (now - this.holdStart) / ((ex.holdSec ?? 3) * 1000));
      } else if (value < ex.rest) {
        this.phase = "rest";
        const done = this.holdProgress >= 1;
        if (done) this.reps++;
        this.holdProgress = 0;
        return done;
      } else {
        this.holdStart = now; // dipped: restart the hold
        this.holdProgress = 0;
      }
      return false;
    }
    if (value < ex.rest) {
      this.phase = "rest";
      this.reps++;
      return true;
    }
    return false;
  }
}
