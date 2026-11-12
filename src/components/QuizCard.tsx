import { useEffect, useRef, useState } from "react";
import type { Structure } from "../core/anatomy";
import type { EngineHandle } from "../hooks/useEngine";

const DWELL_MS = 1200;

function pickTarget(pool: Structure[], prev?: Structure): Structure {
  const options = pool.filter((s) => s.id !== prev?.id);
  return options[Math.floor(Math.random() * options.length)] ?? pool[0];
}

/**
 * "Point to the …" quiz. Answer by holding your index fingertip on a structure
 * for ~1 s, or by clicking it. Only structures in visible layers are asked.
 */
export function QuizCard({ h, clickAnswer, onExit }: { h: EngineHandle; clickAnswer: Structure | null; onExit: () => void }) {
  const engine = h.engine.current!;
  const pool = engine.visibleStructures();
  const [target, setTarget] = useState<Structure | null>(() => (pool.length ? pickTarget(pool) : null));
  const [score, setScore] = useState({ right: 0, asked: 1 });
  const [feedback, setFeedback] = useState<{ text: string; good: boolean } | null>(null);
  const [dwell, setDwell] = useState(0);
  const dwellRef = useRef<{ id: string | null; since: number }>({ id: null, since: 0 });
  const lockRef = useRef(false);

  const answer = (picked: Structure) => {
    if (!target || lockRef.current) return;
    lockRef.current = true;
    const good = picked.id === target.id;
    setFeedback({ good, text: good ? `Correct! That's the ${target.name}.` : `That's the ${picked.name}. Keep looking…` });
    engine.setHighlights(good ? [target.id] : [picked.id]);
    setTimeout(() => {
      lockRef.current = false;
      dwellRef.current = { id: null, since: 0 };
      engine.setHighlights([]);
      if (good) {
        const fresh = engine.visibleStructures();
        setTarget(pickTarget(fresh, target));
        setScore((s) => ({ right: s.right + 1, asked: s.asked + 1 }));
        setFeedback(null);
      } else {
        setFeedback({ good: false, text: "Try again." });
      }
    }, 1400);
  };

  // fingertip dwell
  useEffect(() => {
    return h.onEveryFrame((f) => {
      if (lockRef.current || !f.fingertip) {
        if (!f.fingertip) setDwell(0);
        return;
      }
      const st = engine.pick(f.fingertip.x, f.fingertip.y, 55);
      const now = performance.now();
      const d = dwellRef.current;
      if (!st) {
        dwellRef.current = { id: null, since: now };
        setDwell(0);
        return;
      }
      if (d.id !== st.id) dwellRef.current = { id: st.id, since: now };
      const p = Math.min(1, (now - dwellRef.current.since) / DWELL_MS);
      setDwell(p);
      if (p >= 1) answer(st);
    });
  });

  useEffect(() => {
    if (clickAnswer) answer(clickAnswer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clickAnswer]);

  useEffect(() => () => engine.setHighlights([]), [engine]);

  if (!target) {
    return (
      <div className="card quiz-card">
        <h3>Quiz</h3>
        <p>Turn on at least one layer to start the quiz.</p>
        <button className="btn" onClick={onExit}>
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="card quiz-card" aria-live="polite">
      <div className="eyebrow" style={{ justifyContent: "center" }}>
        Point to · {score.right}/{score.asked - 1} correct
      </div>
      <div className="target">{target.name}</div>
      <div className="meter" aria-hidden>
        <div style={{ width: `${dwell * 100}%` }} />
      </div>
      <div className={`feedback ${feedback ? (feedback.good ? "good" : "bad") : ""}`}>
        {feedback?.text ?? "Hold your fingertip on it, or click it."}
      </div>
      <div className="actions">
        <button
          className="btn"
          onClick={() => {
            setTarget(pickTarget(engine.visibleStructures(), target));
            setScore((s) => ({ ...s, asked: s.asked + 1 }));
            setFeedback(null);
          }}
        >
          Skip
        </button>
        <button className="btn" onClick={onExit}>
          End quiz
        </button>
      </div>
    </div>
  );
}
