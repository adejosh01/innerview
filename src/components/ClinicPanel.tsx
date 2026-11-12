import { ArrowLeft, Eraser, Maximize2, MousePointer2, PenLine, ShieldCheck, Undo2 } from "lucide-react";
import type { EngineHandle } from "../hooks/useEngine";
import { TOPICS, type Topic } from "../clinic/topics";
import { Section, Segmented, Slider } from "./ui";

export const PEN_COLORS = ["#ffd166", "#3cc8f5", "#f0605a", "#ffffff"];

export type ClinicTool = "point" | "pen";

export interface ClinicState {
  topic: Topic | null;
  step: number;
  tool: ClinicTool;
  color: string;
}

export function ClinicPanel(props: {
  h: EngineHandle;
  state: ClinicState;
  onTopic: (t: Topic | null) => void;
  onStep: (i: number) => void;
  onTool: (t: ClinicTool) => void;
  onColor: (c: string) => void;
  onUndo: () => void;
  onClear: () => void;
  onPatientView: () => void;
  onBack: () => void;
}) {
  const { h, state } = props;
  const s = h.settings;
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <>
      <div className="clinic-head">
        <button className="btn ghost" onClick={props.onBack}>
          <ArrowLeft aria-hidden />
          Back to Explore
        </button>
        <span className="privacy-badge" title="Clinic mode keeps nothing unless you press Photo or Record">
          <ShieldCheck aria-hidden />
          Nothing is saved
        </span>
      </div>

      <Section title="Explain a topic">
        <div className="topic-list">
          {TOPICS.map((t) => (
            <button
              key={t.id}
              className={`topic ${state.topic?.id === t.id ? "active" : ""}`}
              onClick={() => props.onTopic(state.topic?.id === t.id ? null : t)}
              aria-pressed={state.topic?.id === t.id}
            >
              <span className="t-title">{t.title}</span>
              <span className="t-sub">{t.summary}</span>
              <span className="t-aud">{t.audience}</span>
            </button>
          ))}
        </div>
        {state.topic && (
          <ol className="step-list" aria-label={`${state.topic.title} steps`}>
            {state.topic.steps.map((st, i) => (
              <li key={i}>
                <button className={i === state.step ? "active" : ""} onClick={() => props.onStep(i)}>
                  <span className="num">{i + 1}</span>
                  {st.title}
                </button>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Draw">
        <Segmented
          label="Tool"
          value={state.tool}
          options={[
            { value: "point", label: "Point" },
            { value: "pen", label: "Pen" },
          ]}
          onChange={props.onTool}
        />
        <div className="pen-row">
          {PEN_COLORS.map((c) => (
            <button
              key={c}
              className={`swatch-btn ${state.color === c ? "active" : ""}`}
              style={{ background: c }}
              aria-label={`Pen colour ${c}`}
              aria-pressed={state.color === c}
              onClick={() => {
                props.onColor(c);
                props.onTool("pen");
              }}
            />
          ))}
          <span className="spacer" />
          <button className="btn icon" onClick={props.onUndo} aria-label="Undo last stroke" title="Undo (Z)">
            <Undo2 aria-hidden />
          </button>
          <button className="btn icon" onClick={props.onClear} aria-label="Clear drawings" title="Clear all">
            <Eraser aria-hidden />
          </button>
        </div>
        <p className="note">
          {state.tool === "pen" ? (
            <>
              <PenLine aria-hidden className="inline-icon" /> Drawings stick to the head and move with the patient.
            </>
          ) : (
            <>
              <MousePointer2 aria-hidden className="inline-icon" /> Tap a structure to show its info.
            </>
          )}
        </p>
      </Section>

      <Section title="View">
        <Segmented
          label="Render style"
          value={s.look}
          options={[
            { value: "xray", label: "X-ray" },
            { value: "solid", label: "Solid" },
          ]}
          onChange={(look) => h.patch({ look })}
        />
        <Slider label="Real face showing through" value={s.realBlend} min={0} max={1} format={pct} onChange={(realBlend) => h.patch({ realBlend })} />
        <button className="btn" style={{ width: "100%", marginTop: 10 }} onClick={props.onPatientView}>
          <Maximize2 aria-hidden />
          Patient view (P)
        </button>
        <p className="note">Shortcuts: ← → steps · P patient view · D pen · Z undo · Esc leave patient view</p>
      </Section>

      <p className="clinic-disclaimer">
        Educational illustration using a generic anatomy model. It is not a scan of the patient and is not intended for
        diagnosis or treatment decisions.
      </p>
    </>
  );
}
