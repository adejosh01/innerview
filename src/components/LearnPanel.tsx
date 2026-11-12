import { ArrowLeft, BookOpen, CheckCircle2, Clock, PlayCircle, RotateCcw } from "lucide-react";
import { LESSONS, isCheck, type Lesson } from "../learn/lessons";
import { lessonPercent, lessonScore, type LearnProgress } from "../learn/progress";
import { Section } from "./ui";

export function LearnPanel(props: {
  learn: LearnProgress;
  active: Lesson | null;
  step: number;
  onOpen: (l: Lesson, step?: number) => void;
  onStep: (i: number) => void;
  onBack: () => void;
}) {
  const { learn, active } = props;

  return (
    <>
      <div className="clinic-head">
        <button className="btn ghost" onClick={props.onBack}>
          <ArrowLeft aria-hidden />
          Back to Explore
        </button>
      </div>

      <div className="learn-overall">
        <div className="eyebrow">
          <BookOpen aria-hidden className="inline-icon" /> Your progress
        </div>
        <div className="overall-row">
          <strong>{learn.overall}%</strong>
          <div className="meter brand" aria-label={`${learn.overall}% of lessons complete`}>
            <div style={{ width: `${learn.overall}%` }} />
          </div>
        </div>
        {learn.nextLesson && !active && (
          <button className="btn primary" style={{ width: "100%" }} onClick={() => props.onOpen(learn.nextLesson!, Math.min(learn.progress[learn.nextLesson!.id]?.reached ?? 0, learn.nextLesson!.steps.length - 1))}>
            <PlayCircle aria-hidden />
            {learn.progress[learn.nextLesson.id] ? "Continue" : "Start"}: {learn.nextLesson.title}
          </button>
        )}
      </div>

      {active && (
        <Section title={active.title}>
          <ol className="step-list">
            {active.steps.map((s, i) => {
              const res = learn.progress[active.id]?.checks[i];
              return (
                <li key={i}>
                  <button className={i === props.step ? "active" : ""} onClick={() => props.onStep(i)} disabled={i > (learn.progress[active.id]?.reached ?? 0) + 1}>
                    <span className="num">{i + 1}</span>
                    {isCheck(s) ? `${s.title} ${s.kind === "point" ? "· point" : "· quiz"}` : s.title}
                    {res !== undefined && <span className={`res ${res ? "good" : "bad"}`}>{res ? "✓" : "✗"}</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </Section>
      )}

      <Section title="Lessons" defaultOpen={!active}>
        <div className="topic-list">
          {LESSONS.map((l) => {
            const p = learn.progress[l.id];
            const pct = lessonPercent(l, p);
            const { correct, total } = lessonScore(l, p);
            return (
              <button key={l.id} className={`topic ${active?.id === l.id ? "active" : ""}`} onClick={() => props.onOpen(l)}>
                <span className="t-title">
                  {p?.completed && <CheckCircle2 aria-hidden className="inline-icon done" />} {l.title}
                </span>
                <span className="t-sub">{l.summary}</span>
                <span className="t-aud">
                  <Clock aria-hidden className="inline-icon" /> {l.minutes} min · {l.level}
                  {p && ` · ${correct}/${total} checks`}
                </span>
                <span className="meter brand thin" aria-hidden>
                  <span style={{ width: `${pct}%` }} />
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <div style={{ padding: "4px 16px 16px" }}>
        <button
          className="btn ghost"
          onClick={() => {
            if (confirm("Reset all lesson progress on this device?")) learn.reset();
          }}
        >
          <RotateCcw aria-hidden />
          Reset progress
        </button>
        <p className="note">Progress is stored only in this browser.</p>
      </div>
    </>
  );
}
