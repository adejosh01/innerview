import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Hand, PartyPopper, RotateCcw, Volume2, X } from "lucide-react";
import type { Structure } from "../core/anatomy";
import type { EngineHandle } from "../hooks/useEngine";
import { useDwellPick } from "../hooks/useDwellPick";
import { isCheck, type Lesson } from "../learn/lessons";
import { lessonScore, type LearnProgress } from "../learn/progress";
import { speak, speechSupported } from "../lib/speech";

type Result = { correct: boolean; text: string } | null;

/**
 * Lesson player. Explain steps read like Clinic captions; check steps must be
 * answered (point at the structure, or pick an option) before moving on.
 */
export function LessonCard(props: {
  h: EngineHandle;
  lesson: Lesson;
  step: number;
  /** A structure the learner clicked on the stage (for point checks). */
  clickPick: Structure | null;
  learn: LearnProgress;
  onStep: (i: number) => void;
  onHighlight: (ids: string[]) => void;
  onClose: () => void;
}) {
  const { h, lesson, step, learn } = props;
  const st = lesson.steps[step];
  const last = lesson.steps.length - 1;
  const [result, setResult] = useState<Result>(null);
  const [done, setDone] = useState(false);
  const engine = h.engine.current;

  // reset per step; highlight explain steps, never reveal the answer of a check
  useEffect(() => {
    setResult(null);
    learn.reach(lesson.id, step);
    if (st.kind === "point") props.onHighlight([]);
    else if (st.kind === "choice") props.onHighlight(st.highlight ?? []);
    else props.onHighlight(st.highlight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id, step]);

  function answerPoint(picked: Structure) {
    if (st.kind !== "point" || result?.correct) return;
    const correct = picked.id === st.target;
    learn.recordCheck(lesson.id, step, correct);
    setResult({ correct, text: correct ? `Yes! That's the ${st.targetName}.` : `That's the ${picked.name}. ${st.hint}` });
    props.onHighlight(correct ? [st.target] : [picked.id]);
  }

  function answerChoice(i: number) {
    if (st.kind !== "choice" || result?.correct) return;
    const correct = i === st.answer;
    learn.recordCheck(lesson.id, step, correct);
    setResult({ correct, text: correct ? st.explain : "Not quite. Try again." });
  }

  // clicks on the stage answer point checks
  useEffect(() => {
    if (props.clickPick && st.kind === "point") answerPoint(props.clickPick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.clickPick]);

  const dwell = useDwellPick(h, st.kind === "point" && !result?.correct, answerPoint);

  const blocked = isCheck(st) && !result?.correct;

  function next() {
    if (step < last) props.onStep(step + 1);
    else {
      learn.complete(lesson.id);
      setDone(true);
      props.onHighlight([]);
    }
  }

  if (done) {
    const { correct, total } = lessonScore(lesson, learn.progress[lesson.id]);
    return (
      <div className="card caption-card lesson-done" aria-live="polite">
        <PartyPopper aria-hidden className="done-icon" />
        <h3>Lesson complete</h3>
        <p className="caption-text">
          {lesson.title}: {correct}/{total} checks right on the first try.
        </p>
        <div className="actions">
          <button
            className="btn"
            onClick={() => {
              setDone(false);
              props.onStep(0);
            }}
          >
            <RotateCcw aria-hidden />
            Review again
          </button>
          <button className="btn primary" onClick={props.onClose}>
            Back to lessons
          </button>
        </div>
      </div>
    );
  }

  const readText = st.kind === "point" ? `Find the ${st.targetName}.` : st.kind === "choice" ? st.question : `${st.title}. ${st.text}`;

  return (
    <div className="card caption-card" aria-live="polite">
      <div className="caption-top">
        <span className="eyebrow">
          {lesson.title} · {step + 1}/{lesson.steps.length}
          {isCheck(st) && <span className="badge check-badge">Check</span>}
        </span>
        <span style={{ display: "flex", gap: 2 }}>
          {speechSupported && (
            <button className="btn ghost icon" onClick={() => speak(readText)} aria-label="Read aloud">
              <Volume2 aria-hidden />
            </button>
          )}
          <button className="btn ghost icon" onClick={props.onClose} aria-label="Close lesson">
            <X aria-hidden />
          </button>
        </span>
      </div>

      <h3>{st.title}</h3>

      {st.kind === "point" && (
        <>
          <p className="caption-text">
            Point to the <strong>{st.targetName}</strong>.
          </p>
          <div className="prompt">
            <Hand aria-hidden />
            Hold your fingertip on it, or click it.
          </div>
          <div className="meter" aria-hidden>
            <div style={{ width: `${dwell * 100}%` }} />
          </div>
          {!engine?.visibleStructures().some((s) => s.id === st.target) && (
            <p className="note">This structure isn't available in the current model.</p>
          )}
        </>
      )}

      {st.kind === "choice" && (
        <>
          <p className="caption-text">{st.question}</p>
          <div className="choices">
            {st.options.map((o, i) => (
              <button
                key={o}
                className={`btn choice ${result?.correct && i === st.answer ? "right" : ""}`}
                onClick={() => answerChoice(i)}
                disabled={!!result?.correct}
              >
                {o}
              </button>
            ))}
          </div>
        </>
      )}

      {!st.kind || st.kind === "explain" ? (
        <>
          <p className="caption-text">{st.text}</p>
          {st.prompt && (
            <div className="prompt">
              <Hand aria-hidden />
              {st.prompt}
            </div>
          )}
        </>
      ) : null}

      {result && (
        <div className={`feedback-row ${result.correct ? "good" : "bad"}`}>
          {result.correct && <Check aria-hidden />}
          {result.text}
        </div>
      )}

      <div className="caption-nav">
        <button className="btn" disabled={step === 0} onClick={() => props.onStep(step - 1)} aria-label="Previous step">
          <ChevronLeft aria-hidden />
        </button>
        <div className="dots" aria-hidden>
          {lesson.steps.map((s, i) => (
            <span key={i} className={`${i === step ? "on" : ""} ${isCheck(s) ? "chk" : ""}`} />
          ))}
        </div>
        <button
          className="btn primary"
          disabled={blocked}
          onClick={next}
          aria-label={step === last ? "Finish lesson" : "Next step"}
          title={blocked ? "Answer the check to continue" : undefined}
        >
          {step === last ? <Check aria-hidden /> : <ChevronRight aria-hidden />}
        </button>
      </div>
      {blocked && st.kind === "point" && (
        <button
          className="btn ghost skip"
          onClick={() => {
            learn.recordCheck(lesson.id, step, false); // revealing counts as a miss
            setResult({ correct: true, text: `Here it is: the ${st.targetName}.` });
            props.onHighlight([st.target]);
          }}
        >
          Show me
        </button>
      )}
    </div>
  );
}
