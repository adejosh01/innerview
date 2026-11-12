import { Activity, ArrowLeft, Download, PersonStanding, ScanFace, Trash2, TriangleAlert } from "lucide-react";
import { EXERCISES, type Area, type Exercise } from "../rehab/exercises";
import { summaryText, type RehabLog } from "../rehab/log";
import { Section } from "./ui";

const AREAS: Area[] = ["Neck", "Jaw", "Shoulders & arms"];

export function RehabPanel(props: {
  log: RehabLog;
  active: Exercise | null;
  onStart: (e: Exercise) => void;
  onBack: () => void;
}) {
  const { log, active } = props;

  function download() {
    const blob = new Blob([summaryText(log.log)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `innerview-exercise-summary-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  return (
    <>
      <div className="clinic-head">
        <button className="btn ghost" onClick={props.onBack}>
          <ArrowLeft aria-hidden />
          Back to Explore
        </button>
      </div>

      <div className="safety">
        <TriangleAlert aria-hidden />
        <p>
          General exercise guidance only, not treatment. If a clinician gave you exercises, follow their plan. Move gently and
          stop if anything hurts.
        </p>
      </div>

      {AREAS.map((area) => (
        <Section key={area} title={area}>
          <div className="topic-list">
            {EXERCISES.filter((e) => e.area === area).map((e) => (
              <button key={e.id} className={`topic ${active?.id === e.id ? "active" : ""}`} onClick={() => props.onStart(e)}>
                <span className="t-title">{e.name}</span>
                <span className="t-sub">{e.instructions}</span>
                <span className="t-aud">
                  {e.needs === "body" ? <PersonStanding aria-hidden className="inline-icon" /> : <ScanFace aria-hidden className="inline-icon" />}{" "}
                  {e.needs === "body" ? "Upper body in view" : "Face only, can sit"} · {e.sets}×{e.reps}
                  {e.mode === "hold" ? ` · ${e.holdSec}s holds` : ""}
                </span>
              </button>
            ))}
          </div>
        </Section>
      ))}

      <Section title="Today">
        {log.today.length === 0 ? (
          <p className="note">No exercises yet today.</p>
        ) : (
          <ul className="today-list">
            {log.today.map((e, i) => (
              <li key={i}>
                <Activity aria-hidden className="inline-icon" />
                <span>{e.name}</span>
                <span className="muted">
                  {e.reps} reps · best {Math.round(e.best)}
                  {e.unit}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" onClick={download} disabled={!log.log.length}>
            <Download aria-hidden />
            Download summary
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              if (confirm("Delete all exercise history on this device?")) log.clear();
            }}
            disabled={!log.log.length}
          >
            <Trash2 aria-hidden />
            Clear
          </button>
        </div>
        <p className="note">History stays in this browser. You choose whether to share the summary.</p>
      </Section>
    </>
  );
}
