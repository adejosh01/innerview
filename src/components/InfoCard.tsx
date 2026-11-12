import { useEffect } from "react";
import { Sparkles, Volume2 } from "lucide-react";
import { speak, speechSupported, stopSpeaking } from "../lib/speech";
import type { Structure } from "../core/anatomy";

const LAYER_NAMES: Record<Structure["layer"], string> = {
  skull: "Bone · skull",
  spine: "Bone · spine",
  brain: "Nervous system",
  muscles: "Muscle",
  eyes: "Sense organ",
};

export function InfoCard(props: {
  structure: Structure;
  activation?: number;
  onAsk: () => void;
  onClose: () => void;
}) {
  const { structure: st, activation } = props;
  useEffect(() => stopSpeaking, [st.id]);
  return (
    <div className="card info-card" role="dialog" aria-label={st.name}>
      <div className="eyebrow">{LAYER_NAMES[st.layer]}</div>
      <h3>{st.name}</h3>
      <p>{st.info}</p>
      {st.layer === "muscles" && activation !== undefined && (
        <div>
          <div className="eyebrow">Live activation</div>
          <div className="meter muscle">
            <div style={{ width: `${Math.round(activation * 100)}%` }} />
          </div>
        </div>
      )}
      <div className="actions">
        <button className="btn primary" onClick={props.onAsk}>
          <Sparkles aria-hidden />
          Ask the tutor
        </button>
        {speechSupported && (
          <button className="btn" onClick={() => speak(`${st.name}. ${st.info}`)} aria-label={`Read ${st.name} aloud`}>
            <Volume2 aria-hidden />
            Listen
          </button>
        )}
        <button className="btn" onClick={props.onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
