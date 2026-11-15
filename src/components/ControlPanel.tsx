import type { EngineHandle } from "../hooks/useEngine";
import type { EngineSettings, RevealMode, ToggleId } from "../core/engine";
import { DEFAULT_FIT } from "../core/engine";
import { RotateCcw, Wand2 } from "lucide-react";
import { Check, Section, Segmented, Slider } from "./ui";

type Preset = "skull" | "brain" | "muscles" | "everything";

const PRESETS: Record<Preset, Partial<EngineSettings["layers"]>> = {
  skull: { skull: true, brain: false, muscles: false, eyes: true, spine: true },
  brain: { skull: false, brain: true, muscles: false, eyes: true, spine: false },
  muscles: { skull: true, brain: false, muscles: true, eyes: true, spine: false },
  everything: { skull: true, brain: true, muscles: true, eyes: true, spine: true },
};

const TOGGLES: { id: ToggleId; label: string; swatch: string }[] = [
  { id: "skull", label: "Skull", swatch: "var(--bone)" },
  { id: "brain", label: "Brain", swatch: "var(--brain)" },
  { id: "muscles", label: "Muscles", swatch: "var(--muscle)" },
  { id: "eyes", label: "Eyes", swatch: "var(--eye)" },
  { id: "spine", label: "Neck spine", swatch: "var(--bone)" },
  { id: "hands", label: "Hand bones", swatch: "var(--bone)" },
  { id: "body", label: "Full body", swatch: "var(--bone)" },
  { id: "outline", label: "Head outline", swatch: "var(--brand)" },
];

const REVEALS: { value: RevealMode; label: string }[] = [
  { value: "whole", label: "Whole head" },
  { value: "left", label: "Your left half only" },
  { value: "right", label: "Your right half only" },
  { value: "top", label: "Top of the head only" },
  { value: "lower", label: "Lower face only" },
  { value: "lens", label: "X-ray lens (follows your fingertip)" },
];

function activePreset(layers: EngineSettings["layers"]): Preset | null {
  for (const [name, p] of Object.entries(PRESETS) as [Preset, Partial<EngineSettings["layers"]>][]) {
    if (Object.entries(p).every(([k, v]) => layers[k as ToggleId] === v)) return name;
  }
  return null;
}

export function ControlPanel({ h }: { h: EngineHandle }) {
  const { settings: s, patch, patchFit, setLayer, autoFit, startAutoFit, running } = h;
  const cm = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)} cm`;
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <>
      <Section title="Layers">
        <Segmented
          label="Layer presets"
          value={activePreset(s.layers)}
          options={[
            { value: "skull", label: "Skull" },
            { value: "brain", label: "Brain" },
            { value: "muscles", label: "Muscles" },
            { value: "everything", label: "All" },
          ]}
          onChange={(p) => patch({ layers: { ...s.layers, ...PRESETS[p] } })}
        />
        <div className="layer-grid">
          {TOGGLES.map((t) => (
            <Check key={t.id} label={t.label} swatch={t.swatch} checked={s.layers[t.id]} onChange={(v) => setLayer(t.id, v)} />
          ))}
        </div>
        <div style={{ marginTop: 4 }}>
          <Check label="Show labels" checked={s.labels} onChange={(v) => patch({ labels: v })} />
        </div>
      </Section>

      <Section title="Anatomy">
        <Segmented
          label="Anatomy variant"
          value={s.anatomySex}
          options={[
            { value: "neutral", label: "Neutral" },
            { value: "female", label: "Female" },
            { value: "male", label: "Male" },
          ]}
          onChange={(anatomySex) => patch({ anatomySex })}
        />
        <p className="note">Adjusts sex-specific shapes (pelvis, jaw). You choose it; it's never guessed from your face.</p>
      </Section>

      <Section title="Look">
        <Segmented
          label="Render style"
          value={s.look}
          options={[
            { value: "xray", label: "X-ray" },
            { value: "solid", label: "Solid" },
          ]}
          onChange={(look) => patch({ look })}
        />
        <Slider label="Brightness" value={s.brightness} min={0.2} max={2} onChange={(brightness) => patch({ brightness })} />
      </Section>

      <Section title="Mixed reality">
        <Slider label="Real me showing through" value={s.realBlend} min={0} max={1} format={pct} onChange={(realBlend) => patch({ realBlend })} />
        <Slider label="Edge feather" value={s.feather} min={0} max={1} format={pct} onChange={(feather) => patch({ feather })} />
        <label>
          <span className="field-label">Reveal</span>
          <select value={s.reveal} onChange={(e) => patch({ reveal: e.target.value as RevealMode })}>
            {REVEALS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        {s.reveal !== "whole" && s.reveal !== "lens" && (
          <Slider label="Cut position" value={s.cut} min={-1} max={1} onChange={(cut) => patch({ cut })} />
        )}
        <Check label="My hands hide what's behind them" checked={s.handOcclusion} onChange={(v) => patch({ handOcclusion: v })} />
        <Check label="Show tracking data" checked={s.trackingData} onChange={(v) => patch({ trackingData: v })} />
      </Section>

      <Section title="Live motion" defaultOpen={false}>
        <Check label="Jaw follows my mouth" checked={s.jawFollow} onChange={(v) => patch({ jawFollow: v })} />
        <Check label="Eyes follow my gaze" checked={s.eyeFollow} onChange={(v) => patch({ eyeFollow: v })} />
        <Check label="Muscles light up when used" checked={s.muscleActivation} onChange={(v) => patch({ muscleActivation: v })} />
        {s.muscleActivation && s.layers.muscles && (
          <p className="note">Try smiling, raising your eyebrows, squinting or puckering.</p>
        )}
        <Slider label="Steadiness" value={s.smoothing} min={0} max={1} format={pct} onChange={(smoothing) => patch({ smoothing })} />
        <Check label="Mirror view" checked={s.mirror} onChange={(v) => patch({ mirror: v })} />
      </Section>

      <Section title="Fit to my head" defaultOpen={false}>
        <div className="row">
          <button className="btn primary" disabled={!running || h.demo || autoFit.status === "running"} onClick={startAutoFit}>
            <Wand2 aria-hidden />
            {autoFit.status === "running" ? `Measuring ${Math.round(autoFit.progress * 100)}%` : "Auto-fit"}
          </button>
          <button className="btn" onClick={() => patchFit({ ...DEFAULT_FIT })}>
            <RotateCcw aria-hidden />
            Reset
          </button>
        </div>
        <p className="note">
          {autoFit.status === "done"
            ? "Fitted to your face proportions. Fine-tune below."
            : "Look straight at the camera, then press Auto-fit."}
        </p>
        <Slider label="Overall size" value={s.fit.scale} min={0.7} max={1.3} onChange={(scale) => patchFit({ scale })} />
        <Slider label="Width" value={s.fit.width} min={0.7} max={1.3} onChange={(width) => patchFit({ width })} />
        <Slider label="Height" value={s.fit.height} min={0.7} max={1.3} onChange={(height) => patchFit({ height })} />
        <Slider label="Depth" value={s.fit.depth} min={0.7} max={1.3} onChange={(depth) => patchFit({ depth })} />
        <Slider label="Jaw width" value={s.fit.jawWidth} min={0.8} max={1.2} onChange={(jawWidth) => patchFit({ jawWidth })} />
        <Slider label="Jaw length" value={s.fit.jawLength} min={0.8} max={1.2} onChange={(jawLength) => patchFit({ jawLength })} />
        <Slider label="Left / right" value={s.fit.x} min={-4} max={4} step={0.1} format={cm} onChange={(x) => patchFit({ x })} />
        <Slider label="Up / down" value={s.fit.y} min={-4} max={4} step={0.1} format={cm} onChange={(y) => patchFit({ y })} />
        <Slider label="Forward / back" value={s.fit.z} min={-4} max={4} step={0.1} format={cm} onChange={(z) => patchFit({ z })} />
      </Section>
    </>
  );
}
