import { ArrowLeft, FileDown, HeartPulse, Lock, PlugZap, RotateCcw, Siren, TriangleAlert } from "lucide-react";
import { AGES, AREAS, DURATIONS, RED_FLAGS, SEXES, doctorNote } from "../symptoms/data";
import type { SymptomCheck } from "../symptoms/useSymptomCheck";
import type { TutorStatus } from "../hooks/useTutorStatus";
import { Section, Slider } from "./ui";

export function downloadText(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Symptom Check intake. Educational health information, not a diagnosis. */
export function SymptomPanel(props: {
  check: SymptomCheck;
  aiStatus: TutorStatus;
  onArea: (areaId: string) => void;
  onBack: () => void;
}) {
  const { check, aiStatus } = props;
  const { intake, patch, state } = check;
  const hasFlags = intake.redFlags.length > 0;
  const aiOn = aiStatus === "connected";
  const ready = intake.description.trim().length >= 8 && intake.area !== "";
  const busy = state.status === "loading";

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
          <strong>Not a diagnosis.</strong> This gives general health information to help you decide how soon to get care and
          what to ask. Always confirm with a doctor. In an emergency, call your local emergency number.
        </p>
      </div>

      <Section title="1 · Where is it?">
        <select value={intake.area} onChange={(e) => props.onArea(e.target.value)} aria-label="Body area">
          <option value="">Choose an area…</option>
          {AREAS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
        <p className="note">Or tap the area on your reflection.</p>
      </Section>

      <Section title="2 · What's happening?">
        <textarea
          className="field"
          rows={5}
          maxLength={1500}
          placeholder="Describe it in your own words: what it feels like, when it started, what makes it better or worse, anything else you've noticed."
          value={intake.description}
          onChange={(e) => patch({ description: e.target.value })}
          aria-label="Describe your symptoms"
        />
        <label>
          <span className="field-label">How long has it been going on?</span>
          <select value={intake.duration} onChange={(e) => patch({ duration: e.target.value })}>
            <option value="">Choose…</option>
            {DURATIONS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <Slider label="How bad is it? (0 = none, 10 = worst)" value={intake.severity} min={0} max={10} step={1} format={(v) => String(v)} onChange={(severity) => patch({ severity })} />
        <div className="row two">
          <label>
            <span className="field-label">Age range</span>
            <select value={intake.age} onChange={(e) => patch({ age: e.target.value })}>
              <option value="">Choose…</option>
              {AGES.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label">Sex at birth</span>
            <select value={intake.sex} onChange={(e) => patch({ sex: e.target.value })}>
              <option value="">Choose…</option>
              {SEXES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="note">Age and sex at birth change which causes are likely. Both are optional.</p>
      </Section>

      <Section title="3 · Any of these right now?">
        <div className="flag-list">
          {RED_FLAGS.map((f) => (
            <label key={f} className={`check flag ${intake.redFlags.includes(f) ? "on" : ""}`}>
              <input
                type="checkbox"
                checked={intake.redFlags.includes(f)}
                onChange={(e) => patch({ redFlags: e.target.checked ? [...intake.redFlags, f] : intake.redFlags.filter((x) => x !== f) })}
              />
              {f}
            </label>
          ))}
        </div>
        {hasFlags && (
          <div className="emergency-inline" role="alert">
            <Siren aria-hidden />
            These can be signs of an emergency. Call your local emergency number now.
          </div>
        )}
      </Section>

      <Section title="4 · Check">
        {!aiOn && !hasFlags && (
          <div className="offline compact">
            <PlugZap aria-hidden />
            <p>
              <strong>AI isn't connected yet.</strong> You can still download a summary of what you entered to show your
              doctor.
            </p>
          </div>
        )}
        {aiOn && !hasFlags && (
          <label className="check consent">
            <input type="checkbox" checked={intake.consent} onChange={(e) => patch({ consent: e.target.checked })} />
            <span>
              Send my description (not video) to Claude, Anthropic's AI, to get this information. It isn't stored by Innerview.
            </span>
          </label>
        )}
        <div className="row" style={{ marginTop: 10 }}>
          <button
            className={`btn ${hasFlags ? "danger-fill" : "primary"}`}
            disabled={hasFlags ? false : !aiOn || !ready || !intake.consent || busy}
            onClick={check.submit}
          >
            {hasFlags ? <Siren aria-hidden /> : <HeartPulse aria-hidden />}
            {hasFlags ? "Show emergency guidance" : busy ? "Checking…" : "Check symptoms"}
          </button>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button
            className="btn"
            disabled={!intake.description.trim()}
            onClick={() =>
              downloadText(
                doctorNote(intake, state.status === "result" ? state.result : null),
                `innerview-symptom-summary-${new Date().toISOString().slice(0, 10)}.txt`,
              )
            }
          >
            <FileDown aria-hidden />
            Summary for my doctor
          </button>
          <button className="btn ghost" onClick={check.reset}>
            <RotateCcw aria-hidden />
            Start over
          </button>
        </div>
        {!ready && aiOn && !hasFlags && <p className="note">Choose an area and add a short description to continue.</p>}
        <p className="note privacy-line">
          <Lock aria-hidden className="inline-icon" /> Nothing you enter is saved. Video never leaves your device.
        </p>
      </Section>
    </>
  );
}
