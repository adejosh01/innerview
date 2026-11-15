import { Copy, FileDown, HeartPulse, Loader2, Siren, Stethoscope, X } from "lucide-react";
import { useState } from "react";
import { doctorNote, URGENCY, type Intake } from "../symptoms/data";
import type { CheckState } from "../symptoms/useSymptomCheck";
import type { Structure } from "../core/anatomy";
import { downloadText } from "./SymptomPanel";
import { speak, speechSupported } from "../lib/speech";

const COMMON: Record<string, string> = { common: "Common", less_common: "Less common", rare: "Rare" };

/** Shows the Symptom Check outcome. Always framed as information, never a diagnosis. */
export function SymptomResultCard(props: {
  state: CheckState;
  intake: Intake;
  structures: Structure[];
  onHighlight: (ids: string[]) => void;
  onClose: () => void;
}) {
  const { state, intake } = props;
  const [copied, setCopied] = useState(false);

  if (state.status === "idle") {
    return (
      <div className="card caption-card empty">
        <span className="eyebrow">
          <HeartPulse aria-hidden className="inline-icon" /> Symptom check
        </span>
        <p className="caption-text">Tell us where it is and what's happening. You'll get possible causes to discuss with a doctor and how soon to get care.</p>
        <p className="caption-foot">Health information, not a diagnosis.</p>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="card caption-card" aria-live="polite">
        <span className="eyebrow">Symptom check</span>
        <p className="caption-text loading-row">
          <Loader2 aria-hidden className="spin" /> Looking at what you described…
        </p>
      </div>
    );
  }

  if (state.status === "emergency") {
    return (
      <div className="card caption-card sym-card urgency-danger" role="alert">
        <div className="urgency-banner">
          <Siren aria-hidden />
          <div>
            <strong>{URGENCY.emergency.label}</strong>
            <p>{URGENCY.emergency.action}</p>
          </div>
        </div>
        <p className="caption-text">You ticked: {intake.redFlags.join("; ")}. These can be signs of a serious problem that needs care right away.</p>
        {intake.redFlags.some((f) => f.startsWith("Thoughts of harming")) && (
          <p className="caption-text">If you're thinking about harming yourself, please contact emergency services or a local crisis line now. You don't have to go through this alone.</p>
        )}
        <div className="actions">
          <button className="btn" onClick={props.onClose}>
            Back
          </button>
        </div>
      </div>
    );
  }

  if (state.status === "refused" || state.status === "error") {
    return (
      <div className="card caption-card" role="alert">
        <span className="eyebrow">Symptom check</span>
        <p className="caption-text">
          {state.status === "refused"
            ? "This one can't be answered here. Please speak to a doctor or pharmacist."
            : state.message}
        </p>
        <div className="actions">
          <button className="btn" onClick={props.onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }

  const r = state.result;
  const u = URGENCY[r.urgency] ?? URGENCY.soon;
  const named = r.related_structures
    .map((id) => props.structures.find((s) => s.id === id))
    .filter((s): s is Structure => !!s);
  const note = doctorNote(intake, r);

  return (
    <div className={`card caption-card sym-card urgency-${u.tone}`} aria-live="polite">
      <div className="caption-top">
        <span className="eyebrow">
          <HeartPulse aria-hidden className="inline-icon" /> Symptom check · not a diagnosis
        </span>
        <button className="btn ghost icon" onClick={props.onClose} aria-label="Close results">
          <X aria-hidden />
        </button>
      </div>

      <div className="urgency-banner">
        {r.urgency === "emergency" ? <Siren aria-hidden /> : <Stethoscope aria-hidden />}
        <div>
          <strong>{u.label}</strong>
          <p>{u.action}</p>
          <p className="why">{r.urgency_reason}</p>
        </div>
      </div>

      <p className="recap">
        <span>What we understood: </span>
        {r.recap}
      </p>

      {r.possible_causes.length > 0 && (
        <>
          <h4 className="sym-h">Possible causes to discuss with a doctor</h4>
          <ol className="causes">
            {r.possible_causes.map((c) => (
              <li key={c.name}>
                <div className="cause-head">
                  <strong>{c.name}</strong>
                  <span className={`badge ${c.how_common}`}>{COMMON[c.how_common] ?? c.how_common}</span>
                </div>
                <p>{c.why_it_fits}</p>
                <p className="muted">A doctor may: {c.what_a_doctor_may_check}</p>
              </li>
            ))}
          </ol>
        </>
      )}

      {named.length > 0 && (
        <>
          <h4 className="sym-h">Related anatomy</h4>
          <div className="chips">
            {named.map((s) => (
              <button key={s.id} className="btn chip" onClick={() => props.onHighlight([s.id])}>
                {s.name}
              </button>
            ))}
            <button className="btn chip ghost" onClick={() => props.onHighlight(named.map((s) => s.id))}>
              Show all
            </button>
          </div>
        </>
      )}

      {r.seek_help_if.length > 0 && (
        <>
          <h4 className="sym-h">Get help sooner if</h4>
          <ul className="bullets warn">{r.seek_help_if.map((x) => <li key={x}>{x}</li>)}</ul>
        </>
      )}
      {r.self_care.length > 0 && (
        <>
          <h4 className="sym-h">Things that often help</h4>
          <ul className="bullets">{r.self_care.map((x) => <li key={x}>{x}</li>)}</ul>
        </>
      )}
      {r.needs_more_info.length > 0 && (
        <>
          <h4 className="sym-h">Details that would help a doctor</h4>
          <ul className="bullets">{r.needs_more_info.map((x) => <li key={x}>{x}</li>)}</ul>
        </>
      )}

      <div className="actions" style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={() => downloadText(note, `innerview-symptom-summary-${new Date().toISOString().slice(0, 10)}.txt`)}>
          <FileDown aria-hidden /> Summary for my doctor
        </button>
        <button
          className="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(note);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard blocked */
            }
          }}
        >
          <Copy aria-hidden /> {copied ? "Copied" : "Copy"}
        </button>
        {speechSupported && (
          <button className="btn ghost" onClick={() => speak(`${u.label}. ${r.urgency_reason} ${r.recap}`)}>
            Listen
          </button>
        )}
      </div>
      <div className="caption-foot">
        Generated by AI from your own description. It can be wrong and is not a diagnosis. Please confirm with a doctor.
      </div>
    </div>
  );
}
