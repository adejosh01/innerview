import { useEffect, useRef, useState } from "react";
import { Check, Pause, Play, RotateCcw, Square, Volume2, X } from "lucide-react";
import type { EngineHandle } from "../hooks/useEngine";
import { RepCounter, type Exercise } from "../rehab/exercises";
import type { RehabLog } from "../rehab/log";
import { speak, speechSupported } from "../lib/speech";

const REST_SEC = 15;
const CALIBRATE_MS = 1200;

type Phase = "calibrating" | "active" | "resting" | "paused" | "done";

/** Live coaching card for one exercise: counts reps, shows range and cues. */
export function ExerciseCard(props: { h: EngineHandle; exercise: Exercise; log: RehabLog; onClose: () => void }) {
  const { h, exercise: ex, log } = props;
  const [, setTick] = useState(0);
  const [phase, setPhase] = useState<Phase>(ex.calibrate ? "calibrating" : "active");
  const [voice, setVoice] = useState(false);

  const s = useRef({
    counter: new RepCounter(ex),
    set: 1,
    totalReps: 0,
    value: null as number | null,
    baseline: { value: null as number | null },
    calib: [] as number[],
    calibStart: performance.now(),
    restUntil: 0,
    started: performance.now(),
    logged: false,
  });
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  function finish() {
    const st = s.current;
    if (!st.logged && st.totalReps > 0) {
      st.logged = true;
      log.add({
        id: ex.id,
        name: ex.name,
        reps: st.totalReps,
        setsDone: st.set - (st.counter.reps < ex.reps ? 1 : 0),
        setsPlanned: ex.sets,
        repsPerSet: ex.reps,
        best: st.counter.best,
        unit: ex.unit,
        seconds: (performance.now() - st.started) / 1000,
        at: new Date().toISOString(),
      });
    }
    setPhase("done");
  }

  useEffect(() => {
    let lastPaint = 0;
    const off = h.onEveryFrame((f) => {
      const st = s.current;
      const now = performance.now();
      const ph = phaseRef.current;

      if (ph === "calibrating") {
        const c = ex.calibrate?.(f);
        if (c !== null && c !== undefined) st.calib.push(c);
        if (now - st.calibStart > CALIBRATE_MS && st.calib.length >= 5) {
          st.calib.sort((a, b) => a - b);
          st.baseline.value = st.calib[Math.floor(st.calib.length / 2)];
          setPhase("active");
        }
      } else if (ph === "resting" && now >= st.restUntil) {
        st.counter = new RepCounter(ex);
        st.counter.best = 0;
        setPhase("active");
        if (voiceRef.current) speak(`Set ${st.set}. ${ex.cues.go}.`);
      }

      st.value = ex.measure(f, st.baseline);
      if (ph === "active") {
        const best = st.counter.best;
        if (st.counter.update(st.value, now)) {
          st.totalReps++;
          if (voiceRef.current) speak(String(st.counter.reps));
          if (st.counter.reps >= ex.reps) {
            if (st.set >= ex.sets) {
              finish();
            } else {
              st.set++;
              st.restUntil = now + REST_SEC * 1000;
              setPhase("resting");
              if (voiceRef.current) speak("Set done. Rest.");
            }
          }
        }
        st.counter.best = Math.max(best, st.counter.best);
      }
      if (now - lastPaint > 66) {
        lastPaint = now;
        setTick((t) => t + 1);
      }
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h, ex]);

  const st = s.current;
  const c = st.counter;
  const v = st.value;
  const pct = (x: number) => `${Math.max(0, Math.min(100, (x / ex.max) * 100))}%`;
  const cue =
    phase === "calibrating"
      ? "Hold still for a moment…"
      : v === null
        ? ex.needs === "body"
          ? "Step back so your shoulders and arms are in view."
          : "Face the camera so your face is tracked."
        : c.phase === "out"
          ? ex.mode === "hold" && c.holdProgress < 1
            ? ex.cues.more
            : ex.cues.back
          : v > ex.target * 0.7
            ? ex.cues.more
            : ex.cues.go;

  if (phase === "done") {
    return (
      <div className="card caption-card lesson-done" aria-live="polite">
        <Check aria-hidden className="done-icon" style={{ color: "var(--success)" }} />
        <h3>{ex.name}: done</h3>
        <p className="caption-text">
          {st.totalReps} reps · best range ≈ {Math.round(c.best)}
          {ex.unit}
        </p>
        <p className="note">Saved to today's summary on this device.</p>
        <div className="actions">
          <button className="btn" onClick={props.onClose}>
            Back to exercises
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card caption-card exercise-card" aria-live="polite">
      <div className="caption-top">
        <span className="eyebrow">
          {ex.area} · set {Math.min(st.set, ex.sets)}/{ex.sets}
        </span>
        <span style={{ display: "flex", gap: 2 }}>
          {speechSupported && (
            <button
              className={`btn ghost icon ${voice ? "active" : ""}`}
              onClick={() => setVoice(!voice)}
              aria-pressed={voice}
              aria-label="Voice counting"
              title="Count reps out loud"
            >
              <Volume2 aria-hidden />
            </button>
          )}
          <button className="btn ghost icon" onClick={props.onClose} aria-label="Close exercise">
            <X aria-hidden />
          </button>
        </span>
      </div>

      <div className="ex-main">
        <div>
          <h3>{ex.name}</h3>
          <p className="ex-instr">{ex.instructions}</p>
        </div>
        <div className="rep-count" aria-label={`${c.reps} of ${ex.reps} reps`}>
          <strong>{c.reps}</strong>
          <span>/ {ex.reps}</span>
        </div>
      </div>

      <div className="gauge" aria-hidden>
        <div className="fill" style={{ width: v === null ? "0%" : pct(v) }} />
        <div className="mark rest" style={{ left: pct(ex.rest) }} />
        <div className="mark target" style={{ left: pct(ex.target) }} />
        <div className="mark best" style={{ left: pct(c.best) }} title="Best this set" />
      </div>
      <div className="gauge-legend">
        <span>
          Now {v === null ? "–" : Math.round(v)}
          {ex.unit}
        </span>
        <span>
          Target {ex.target}
          {ex.unit}
        </span>
        <span>
          Best {Math.round(c.best)}
          {ex.unit}
        </span>
      </div>

      {ex.mode === "hold" && phase === "active" && (
        <div className="meter" aria-label="Hold timer">
          <div style={{ width: `${c.holdProgress * 100}%`, background: "var(--success)" }} />
        </div>
      )}

      <div className={`prompt ${phase === "resting" ? "rest" : ""}`}>
        {phase === "resting"
          ? `Rest: next set in ${Math.max(0, Math.ceil((st.restUntil - performance.now()) / 1000))}s`
          : phase === "paused"
            ? "Paused"
            : cue}
      </div>

      <div className="actions">
        {phase === "paused" ? (
          <button className="btn" onClick={() => setPhase("active")}>
            <Play aria-hidden /> Resume
          </button>
        ) : (
          <button className="btn" onClick={() => setPhase("paused")} disabled={phase !== "active"}>
            <Pause aria-hidden /> Pause
          </button>
        )}
        <button
          className="btn"
          onClick={() => {
            st.counter = new RepCounter(ex);
            st.set = 1;
            st.totalReps = 0;
            st.started = performance.now();
            setPhase("active");
          }}
        >
          <RotateCcw aria-hidden /> Restart
        </button>
        <button className="btn primary" onClick={finish}>
          <Square aria-hidden /> Finish
        </button>
      </div>
      <div className="caption-foot">Move slowly and stay within a comfortable range. Stop if it hurts.</div>
    </div>
  );
}
