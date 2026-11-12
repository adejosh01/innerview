import type { CSSProperties, ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const { label, value, min, max, step = 0.01, format = (v) => v.toFixed(2), onChange } = props;
  const fill = `${((value - min) / (max - min)) * 100}%`;
  return (
    <label className="slider">
      <span className="top">
        <span>{label}</span>
        <output>{format(value)}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--fill": fill } as CSSProperties}
        onChange={(e) => onChange(+e.target.value)}
      />
    </label>
  );
}

export function Check(props: { label: string; checked: boolean; swatch?: string; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      {props.swatch && <span className="swatch" style={{ background: props.swatch }} aria-hidden />}
      {props.label}
    </label>
  );
}

export function Segmented<T extends string>(props: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`btn ${props.value === o.value ? "active" : ""}`}
          aria-pressed={props.value === o.value}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Section(props: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details className="section" open={props.defaultOpen ?? true}>
      <summary>
        {props.title}
        <ChevronDown aria-hidden />
      </summary>
      <div className="body">{props.children}</div>
    </details>
  );
}
