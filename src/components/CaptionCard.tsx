import { ChevronLeft, ChevronRight, Hand, Volume2, X } from "lucide-react";
import type { Topic } from "../clinic/topics";
import { speak, speechSupported } from "../lib/speech";

/** Large patient-facing caption for the current Clinic-mode step. */
export function CaptionCard(props: {
  topic: Topic;
  step: number;
  onStep: (i: number) => void;
  onClose: () => void;
}) {
  const { topic, step } = props;
  const st = topic.steps[step];
  const last = topic.steps.length - 1;
  return (
    <div className="card caption-card" aria-live="polite">
      <div className="caption-top">
        <span className="eyebrow">
          {topic.title} · {step + 1}/{topic.steps.length}
        </span>
        <span style={{ display: "flex", gap: 2 }}>
          {speechSupported && (
            <button className="btn ghost icon" onClick={() => speak(`${st.title}. ${st.text}`)} aria-label="Read aloud">
              <Volume2 aria-hidden />
            </button>
          )}
          <button className="btn ghost icon" onClick={props.onClose} aria-label="Close topic">
            <X aria-hidden />
          </button>
        </span>
      </div>
      <h3>{st.title}</h3>
      <p className="caption-text">{st.text}</p>
      {st.prompt && (
        <div className="prompt">
          <Hand aria-hidden />
          {st.prompt}
        </div>
      )}
      <div className="caption-nav">
        <button className="btn" disabled={step === 0} onClick={() => props.onStep(step - 1)} aria-label="Previous step">
          <ChevronLeft aria-hidden />
        </button>
        <div className="dots" aria-hidden>
          {topic.steps.map((_, i) => (
            <span key={i} className={i === step ? "on" : ""} />
          ))}
        </div>
        <button className="btn primary" disabled={step === last} onClick={() => props.onStep(step + 1)} aria-label="Next step">
          <ChevronRight aria-hidden />
        </button>
      </div>
      <div className="caption-foot">Educational illustration · generic model · not a diagnosis</div>
    </div>
  );
}
