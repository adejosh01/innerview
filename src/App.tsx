import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { Activity, Camera, Circle, Compass, Expand, GraduationCap, HeartPulse, Hand, Home, Info, Lock, Minimize2, MonitorPlay, ScanFace, Shrink, Sparkles, Square, Stethoscope, Target } from "lucide-react";
import { useEngine } from "./hooks/useEngine";
import { useTutorStatus } from "./hooks/useTutorStatus";
import type { Structure } from "./core/anatomy";
import { ControlPanel } from "./components/ControlPanel";
import { InfoCard } from "./components/InfoCard";
import { QuizCard } from "./components/QuizCard";
import { TutorPanel } from "./components/TutorPanel";
import { Credits } from "./components/Credits";
import { Logo, LogoMark } from "./components/Logo";
import { ClinicPanel, PEN_COLORS, type ClinicState } from "./components/ClinicPanel";
import { CaptionCard } from "./components/CaptionCard";
import { Segmented } from "./components/ui";
import { settingsForStep, type Topic } from "./clinic/topics";
import { LearnPanel } from "./components/LearnPanel";
import { LessonCard } from "./components/LessonCard";
import { lessonView, type Lesson } from "./learn/lessons";
import { useLearnProgress } from "./learn/progress";
import { RehabPanel } from "./components/RehabPanel";
import { ExerciseCard } from "./components/ExerciseCard";
import type { Exercise } from "./rehab/exercises";
import { useRehabLog } from "./rehab/log";

import { SymptomPanel } from "./components/SymptomPanel";
import { SymptomResultCard } from "./components/SymptomResultCard";
import { useSymptomCheck } from "./symptoms/useSymptomCheck";
import { AREAS, areaForStructure } from "./symptoms/data";

type Mode = "explore" | "learn" | "rehab" | "symptoms" | "clinic";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

export default function App() {
  const h = useEngine();
  const tutorStatus = useTutorStatus();
  const { settings, frame, running } = h;
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [selected, setSelected] = useState<Structure | null>(null);
  const [quiz, setQuiz] = useState(false);
  const [quizClick, setQuizClick] = useState<Structure | null>(null);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [tutorPrefill, setTutorPrefill] = useState<string | null>(null);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [mode, setMode] = useState<Mode>("explore");
  const [patientView, setPatientView] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Full screen: CSS takes the video edge to edge everywhere; where the browser
  // allows it (Android, desktop) we also enter real fullscreen to hide the browser UI.
  function setFullscreen(on: boolean) {
    setExpanded(on);
    const doc = document as Document & { webkitExitFullscreen?: () => void; webkitFullscreenElement?: Element };
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    try {
      if (on && !document.fullscreenElement) {
        if (el.requestFullscreen) el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
        else el.webkitRequestFullscreen?.();
      } else if (!on && (document.fullscreenElement || doc.webkitFullscreenElement)) {
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
        else doc.webkitExitFullscreen?.();
      }
    } catch {
      /* fullscreen not allowed here (e.g. iPhone Safari): CSS expansion still applies */
    }
  }

  // leaving browser fullscreen (Esc, back gesture) also collapses the view
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setExpanded(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFullscreen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);
  const [clinic, setClinic] = useState<ClinicState>({ topic: null, step: 0, tool: "point", color: PEN_COLORS[0] });
  const drawing = useRef(false);
  const learn = useLearnProgress();
  const [lesson, setLesson] = useState<{ l: Lesson; step: number } | null>(null);
  const [lessonClick, setLessonClick] = useState<Structure | null>(null);
  const rehabLog = useRehabLog();
  const symptoms = useSymptomCheck();

  /** Pick a symptom area: show and highlight the related anatomy. */
  function chooseArea(areaId: string) {
    symptoms.patch({ area: areaId });
    const area = AREAS.find((a) => a.id === areaId);
    if (!area) return;
    h.patch({ layers: { ...h.settings.layers, ...area.layers }, reveal: "whole" });
    h.engine.current?.setHighlights(area.structures);
  }

  // when results arrive, show the related anatomy (switching on any layer it lives in)
  useEffect(() => {
    if (symptoms.state.status !== "result") return;
    const ids = symptoms.state.result.related_structures;
    const engine = h.engine.current;
    if (!engine) return;
    const layers = new Set(engine.allStructures().filter((st) => ids.includes(st.id)).map((st) => st.layer));
    if (layers.size) h.patch({ layers: { ...h.settings.layers, ...Object.fromEntries([...layers].map((l) => [l, true])) } });
    engine.setHighlights(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symptoms.state]);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [exerciseRun, setExerciseRun] = useState(0); // remount key so restarting is clean

  function startExercise(e: Exercise | null) {
    setSelected(null);
    setExercise(e);
    setExerciseRun((n) => n + 1);
    if (e) {
      h.patch({ layers: { ...h.settings.layers, ...e.layers }, reveal: "whole", labels: false, muscleActivation: true });
      h.engine.current?.setHighlights(e.highlight);
    } else {
      h.engine.current?.setHighlights([]);
    }
  }

  function goLesson(l: Lesson | null, step = 0) {
    setLessonClick(null);
    setSelected(null);
    if (!l) {
      setLesson(null);
      h.engine.current?.setHighlights([]);
      return;
    }
    setLesson({ l, step });
    const v = lessonView(l, step);
    h.patch({ layers: { ...h.settings.layers, ...v.layers }, ...(v.reveal ? { reveal: v.reveal } : {}), ...(v.look ? { look: v.look } : {}), labels: false });
  }

  // ── clinic mode ──
  const goStep = useCallback(
    (topic: Topic | null, step: number) => {
      setClinic((c) => ({ ...c, topic, step }));
      if (topic) h.patch(settingsForStep(h.settings, topic, step));
    },
    [h],
  );

  function enterMode(m: Mode) {
    setMode(m);
    setQuiz(false);
    setSelected(null);
    if (m !== "learn") goLesson(null);
    if (m !== "rehab") setExercise(null);
    if (m === "symptoms" && symptoms.intake.area) chooseArea(symptoms.intake.area);
    if (m !== "clinic") {
      setPatientView(false);
      setClinic((c) => ({ ...c, topic: null, tool: "point" }));
      h.engine.current?.clearStrokes();
    }
  }

  /** Home: stop the camera and go back to the start screen. */
  function goHome() {
    if (recording) return; // don't silently drop a recording
    setFullscreen(false);
    h.stop();
    enterMode("explore");
    setTutorOpen(false);
  }

  // step highlights win in clinic mode; otherwise the tapped structure
  useEffect(() => {
    if (quiz || (mode === "learn" && lesson) || (mode === "rehab" && exercise) || mode === "symptoms") return; // these manage their own highlights
    const stepIds = mode === "clinic" && clinic.topic ? clinic.topic.steps[clinic.step].highlight : [];
    h.engine.current?.setHighlights([...stepIds, ...(selected ? [selected.id] : [])]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, quiz, mode, clinic.topic, clinic.step, h.engine, !!lesson, !!exercise]);

  // keyboard shortcuts for the presenter
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (mode !== "clinic" || !running) return;
      const topic = clinic.topic;
      if (e.key === "ArrowRight" && topic && clinic.step < topic.steps.length - 1) goStep(topic, clinic.step + 1);
      else if (e.key === "ArrowLeft" && topic && clinic.step > 0) goStep(topic, clinic.step - 1);
      else if (e.key.toLowerCase() === "p") setPatientView((v) => !v);
      else if (e.key === "Escape") setPatientView(false);
      else if (e.key.toLowerCase() === "d") setClinic((c) => ({ ...c, tool: c.tool === "pen" ? "point" : "pen" }));
      else if (e.key.toLowerCase() === "z") h.engine.current?.undoStroke();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, running, clinic, goStep, h.engine]);

  const penActive = mode === "clinic" && clinic.tool === "pen" && running;

  function onPointerDown(e: PointerEvent) {
    if (!penActive) return;
    const engine = h.engine.current!;
    const p = engine.clientToStage(e.clientX, e.clientY);
    if (engine.beginStroke(p.x, p.y, clinic.color, 4)) {
      drawing.current = true;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    }
  }
  function onPointerMove(e: PointerEvent) {
    if (!drawing.current) return;
    const engine = h.engine.current!;
    const p = engine.clientToStage(e.clientX, e.clientY);
    engine.extendStroke(p.x, p.y);
  }
  function onPointerUp() {
    if (!drawing.current) return;
    drawing.current = false;
    h.engine.current?.endStroke();
  }

  async function start() {
    setStarting(true);
    setError(null);
    try {
      await h.start();
    } catch (e) {
      const err = e as DOMException;
      setError(
        err.name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access in your browser's site settings and try again."
          : err.name === "NotFoundError"
            ? "No camera found. Try the demo instead."
            : `Couldn't start: ${err.message}`,
      );
    } finally {
      setStarting(false);
    }
  }

  // ?demo in the URL opens straight into the camera-free demo (handy for sharing links)
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.has("demo")) h.startDemo();
    // dev-only shortcuts for visual checks: ?demo&all&labels&solid
    if (import.meta.env.DEV) {
      if (q.has("all")) h.patch({ layers: { ...h.settings.layers, skull: true, brain: true, muscles: true } });
      if (q.has("labels")) h.patch({ labels: true });
      if (q.has("body")) h.setLayer("body", true);
      if (q.has("symptoms")) setMode("symptoms");
      const rx = q.get("rehab");
      if (rx !== null) {
        setMode("rehab");
        import("./rehab/exercises").then(({ EXERCISES }) => {
          const e = EXERCISES.find((x) => x.id === rx);
          if (e) startExercise(e);
        });
      }
      const lt = q.get("learn");
      if (lt !== null) {
        setMode("learn");
        import("./learn/lessons").then(({ LESSONS }) => {
          const l = LESSONS.find((x) => x.id === lt);
          if (l) goLesson(l, Number(q.get("step") ?? 0));
        });
      }
      const ct = q.get("clinic");
      if (ct !== null) {
        setMode("clinic");
        import("./clinic/topics").then(({ TOPICS }) => {
          const t = TOPICS.find((x) => x.id === ct);
          if (t) goStep(t, Number(q.get("step") ?? 0));
        });
        if (q.has("pv")) setPatientView(true);
      }
      if (q.has("solid")) h.patch({ look: "solid", realBlend: 0 });
      if (q.has("canon")) import("./dev/alignment").then((m) => h.engine.current?.addHeadSpaceHelper(m.canonicalFacePoints()));
      if (q.has("yaw")) (globalThis as { __demoYaw?: number }).__demoYaw = Number(q.get("yaw"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onStageClick(e: MouseEvent) {
    const engine = h.engine.current;
    if (!engine || !running || penActive) return;
    const p = engine.clientToStage(e.clientX, e.clientY);
    const st = engine.pick(p.x, p.y);
    if (quiz) {
      if (st) setQuizClick({ ...st });
      return;
    }
    if (mode === "learn" && lesson) {
      if (st) setLessonClick({ ...st });
      return;
    }
    if (mode === "symptoms") {
      // tapping the reflection picks the body area for the symptom check
      const area = st && areaForStructure(st.id);
      if (area) chooseArea(area.id);
      return;
    }
    setSelected(st);
  }

  async function screenshot() {
    const blob = await h.engine.current?.screenshot();
    if (blob) download(blob, `innerview-${stamp()}.png`);
  }

  async function toggleRecording() {
    const engine = h.engine.current!;
    if (engine.isRecording) {
      const blob = await engine.stopRecording();
      setRecording(false);
      if (blob) download(blob, `innerview-${stamp()}.${blob.type.includes("mp4") ? "mp4" : "webm"}`);
    } else if (engine.startRecording()) {
      setRecording(true);
    }
  }

  const hint = !running
    ? null
    : h.demo
      ? "Demo head. Start the camera to see it on you."
      : !frame?.faceFound
        ? "Looking for your face. Face the camera in good light."
        : penActive && !frame.faceFound
          ? "Drawing needs a tracked face."
          : settings.reveal === "lens" && !frame.fingertip
          ? "Hold up a hand: your index fingertip is the X-ray lens."
          : settings.layers.body && frame.bodyFound === null
            ? "Loading body tracking…"
            : settings.layers.body && frame.bodyFound === false
              ? "Step back so your shoulders and hips are in view."
              : null;

  const visibleLayers = Object.entries(settings.layers)
    .filter(([, on]) => on)
    .map(([k]) => k);

  const stop = (e: MouseEvent) => e.stopPropagation();

  return (
    <div className={`app ${patientView ? "patient-view" : ""} ${mode === "clinic" ? "clinic" : ""} ${running ? "" : "idle"} ${expanded && running ? "expanded" : ""}`}>
      <header className="header">
        <button className="logo-btn" onClick={goHome} title={running ? "Home: stop the camera and go back to the start screen" : "Home"} aria-label="Home">
          <Logo />
        </button>
        {running && (
          <button className="btn ghost home-btn" onClick={goHome} disabled={recording} title="Back to the start screen">
            <Home aria-hidden />
            <span className="label">Home</span>
          </button>
        )}
        {running && (
          <Segmented
            label="Mode"
            value={mode}
            options={[
              { value: "explore", label: "Explore" },
              { value: "learn", label: "Learn" },
              { value: "rehab", label: "Rehab" },
              { value: "symptoms", label: "Symptoms" },
              { value: "clinic", label: "Clinic" },
            ]}
            onChange={enterMode}
          />
        )}
        {running && (
          <span className={`pill ${recording ? "rec" : h.demo ? "demo" : "live"}`}>
            <span className="dot" />
            {recording ? "Recording" : h.demo ? "Demo" : "Live"}
            {frame && !h.demo && <span className="num">{frame.fps.toFixed(0)} fps</span>}
          </span>
        )}
        <span className="spacer" />
        {patientView && (
          <button className="btn" onClick={() => setPatientView(false)}>
            <Minimize2 aria-hidden />
            <span className="label">Exit patient view</span>
          </button>
        )}
        {h.demo && (
          <button className="btn primary" onClick={start} disabled={starting}>
            <Camera aria-hidden />
            <span className="label">{starting ? "Loading…" : "Use my camera"}</span>
          </button>
        )}
        <button className="btn ghost" onClick={() => setCreditsOpen(true)}>
          <Info aria-hidden />
          <span className="label">About</span>
        </button>
      </header>

      <main
        className={`viewport ${penActive ? "pen" : ""}`}
        onClick={onStageClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="stage-wrap">
        <div ref={h.containerRef} className="stage-host" />

        {!running && (
          <section className="start">
            <div className="mark">
              <LogoMark size={64} />
            </div>
            <h1>
              See <em>inside</em> your own head.
            </h1>
            <p className="lead">
              A live X-ray mirror. Your skull, brain, muscles and hand bones, tracked to your face and hands through your webcam.
            </p>
            <div className="ctas">
              <button className="btn primary lg" onClick={start} disabled={starting}>
                <Camera aria-hidden />
                {starting ? "Loading models…" : "Start camera"}
              </button>
              <button className="btn lg" onClick={h.startDemo} disabled={starting}>
                <MonitorPlay aria-hidden />
                Try the demo
              </button>
            </div>
            {error && <p className="error">{error}</p>}
            <div className="trust">
              <span>
                <Lock aria-hidden /> Video stays on your device
              </span>
              <span>
                <ScanFace aria-hidden /> Generic adult model, not a scan of you
              </span>
              <span>
                <Info aria-hidden /> Educational, not a medical tool
              </span>
            </div>
          </section>
        )}

        {hint && (
          <div className="hint">
            {settings.reveal === "lens" ? <Hand aria-hidden /> : <ScanFace aria-hidden />}
            {hint}
          </div>
        )}
        {error && running && <div className="hint" style={{ top: 60, color: "var(--danger)" }}>{error}</div>}

        {running && !patientView && (
          <nav className="toolbar" aria-label="Actions" onClick={stop}>
            <button className="btn" onClick={screenshot} title="Save a screenshot">
              <Camera aria-hidden />
              <span className="label">Photo</span>
            </button>
            <button className={`btn ${recording ? "danger" : ""}`} onClick={toggleRecording} title="Record a clip">
              {recording ? <Square aria-hidden /> : <Circle aria-hidden />}
              <span className="label">{recording ? "Stop" : "Record"}</span>
            </button>
            <span className="sep" />
            {mode === "explore" && (
            <button
              className={`btn ${quiz ? "active" : ""}`}
              onClick={() => {
                setSelected(null);
                setQuizClick(null);
                setQuiz((q) => !q);
              }}
            >
              <Target aria-hidden />
              <span className="label">Quiz</span>
            </button>
            )}
            <button
              className={`btn ${tutorOpen ? "active" : ""}`}
              onClick={() => setTutorOpen((o) => !o)}
              title={tutorStatus === "connected" ? "Ask the AI tutor" : "AI tutor isn't connected yet"}
            >
              <Sparkles aria-hidden />
              <span className="label">AI tutor</span>
              {tutorStatus === "not-connected" && <span className="badge">Off</span>}
            </button>
            <span className="sep" />
            <button
              className={`btn ${expanded ? "active" : ""}`}
              onClick={() => setFullscreen(!expanded)}
              title={expanded ? "Exit full screen" : "Full screen"}
              aria-label={expanded ? "Exit full screen" : "Full screen"}
            >
              {expanded ? <Shrink aria-hidden /> : <Expand aria-hidden />}
              <span className="label">{expanded ? "Exit" : "Full screen"}</span>
            </button>
          </nav>
        )}
        {expanded && (
          <button className="btn expand-exit" onClick={(e) => { e.stopPropagation(); setFullscreen(false); }} aria-label="Exit full screen">
            <Shrink aria-hidden />
          </button>
        )}
        </div>

        <div className="dock">

        {selected && !quiz && (
          <div onClick={stop}>
            <InfoCard
              structure={selected}
              activation={frame?.activations[selected.id]}
              onClose={() => setSelected(null)}
              onAsk={() => {
                setTutorPrefill(`What does the ${selected.name} do?`);
                setTutorOpen(true);
              }}
            />
          </div>
        )}
        {mode === "symptoms" && running && (
          <div onClick={stop}>
            <SymptomResultCard
              state={symptoms.state}
              intake={symptoms.intake}
              structures={h.engine.current?.allStructures() ?? []}
              onHighlight={(ids) => h.engine.current?.setHighlights(ids)}
              onClose={() => symptoms.setState({ status: "idle" })}
            />
          </div>
        )}
        {mode === "rehab" && running && exercise && (
          <div onClick={stop}>
            <ExerciseCard key={exerciseRun} h={h} exercise={exercise} log={rehabLog} onClose={() => startExercise(null)} />
          </div>
        )}
        {mode === "rehab" && running && !exercise && (
          <div className="card caption-card empty" onClick={stop}>
            <span className="eyebrow">Rehab mode</span>
            <p className="caption-text">Pick an exercise from the list. Reps are counted automatically from your movement.</p>
          </div>
        )}
        {mode === "learn" && running && lesson && (
          <div onClick={stop}>
            <LessonCard
              h={h}
              lesson={lesson.l}
              step={lesson.step}
              clickPick={lessonClick}
              learn={learn}
              onStep={(i) => goLesson(lesson.l, i)}
              onHighlight={(ids) => h.engine.current?.setHighlights(ids)}
              onClose={() => goLesson(null)}
            />
          </div>
        )}
        {mode === "learn" && running && !lesson && (
          <div className="card caption-card empty" onClick={stop}>
            <span className="eyebrow">Learn mode</span>
            <p className="caption-text">Pick a lesson from the list. Each one takes a few minutes and ends with quick checks.</p>
          </div>
        )}
        {mode === "clinic" && running && clinic.topic && (
          <div onClick={stop}>
            <CaptionCard topic={clinic.topic} step={clinic.step} onStep={(i) => goStep(clinic.topic, i)} onClose={() => goStep(null, 0)} />
          </div>
        )}
        {mode === "clinic" && running && !clinic.topic && !patientView && (
          <div className="card caption-card empty" onClick={stop}>
            <span className="eyebrow">
              <Stethoscope aria-hidden className="inline-icon" /> Clinic mode
            </span>
            <p className="caption-text">Pick a topic from the list to walk a patient through it, or switch to the pen to draw on the anatomy.</p>
          </div>
        )}
        {quiz && (
          <div onClick={stop}>
            <QuizCard h={h} clickAnswer={quizClick} onExit={() => setQuiz(false)} />
          </div>
        )}
        </div>


        {tutorOpen && (
          <div
            className="sheet-scrim"
            aria-hidden
            onClick={(e) => {
              e.stopPropagation();
              setTutorOpen(false);
            }}
          />
        )}
        {tutorOpen && (
          <div onClick={stop}>
            <TutorPanel
              structure={selected}
              visibleLayers={visibleLayers}
              prefill={tutorPrefill}
              status={tutorStatus}
              onClose={() => {
                setTutorOpen(false);
                setTutorPrefill(null);
              }}
            />
          </div>
        )}
      </main>

      <aside className="panel" aria-label="Controls">
        {mode === "symptoms" && running ? (
          <SymptomPanel check={symptoms} aiStatus={tutorStatus} onArea={chooseArea} onBack={() => enterMode("explore")} />
        ) : mode === "rehab" && running ? (
          <RehabPanel log={rehabLog} active={exercise} onStart={startExercise} onBack={() => enterMode("explore")} />
        ) : mode === "learn" && running ? (
          <LearnPanel
            learn={learn}
            active={lesson?.l ?? null}
            step={lesson?.step ?? 0}
            onOpen={(l, step) => goLesson(l, step ?? 0)}
            onStep={(i) => lesson && goLesson(lesson.l, i)}
            onBack={() => enterMode("explore")}
          />
        ) : mode === "clinic" && running ? (
          <ClinicPanel
            h={h}
            state={clinic}
            onTopic={(t) => goStep(t, 0)}
            onStep={(i) => goStep(clinic.topic, i)}
            onTool={(tool) => setClinic((c) => ({ ...c, tool }))}
            onColor={(color) => setClinic((c) => ({ ...c, color }))}
            onUndo={() => h.engine.current?.undoStroke()}
            onClear={() => h.engine.current?.clearStrokes()}
            onPatientView={() => setPatientView(true)}
            onBack={() => enterMode("explore")}
          />
        ) : (
          <ControlPanel h={h} />
        )}
      </aside>

      {running && !patientView && (
        <nav className="mode-tabs" aria-label="Mode">
          {(
            [
              ["explore", "Explore", Compass],
              ["learn", "Learn", GraduationCap],
              ["rehab", "Rehab", Activity],
              ["symptoms", "Symptoms", HeartPulse],
              ["clinic", "Clinic", Stethoscope],
            ] as const
          ).map(([m, label, Icon]) => (
            <button key={m} className={mode === m ? "active" : ""} onClick={() => enterMode(m)} aria-pressed={mode === m}>
              <Icon aria-hidden />
              {label}
            </button>
          ))}
        </nav>
      )}

      <Credits open={creditsOpen} onClose={() => setCreditsOpen(false)} />
    </div>
  );
}
