import { useEffect, useRef, useState } from "react";
import type { Structure } from "../core/anatomy";
import type { EngineHandle } from "./useEngine";

/**
 * Fingertip "hold to select": calls onPick when the index fingertip rests on
 * the same structure for `ms`. Returns 0..1 progress for a meter.
 */
export function useDwellPick(h: EngineHandle, active: boolean, onPick: (s: Structure) => void, ms = 1200): number {
  const [progress, setProgress] = useState(0);
  const state = useRef<{ id: string | null; since: number }>({ id: null, since: 0 });
  const cb = useRef(onPick);
  cb.current = onPick;

  useEffect(() => {
    if (!active) {
      setProgress(0);
      return;
    }
    return h.onEveryFrame((f) => {
      const engine = h.engine.current;
      if (!engine || !f.fingertip) {
        state.current = { id: null, since: 0 };
        setProgress(0);
        return;
      }
      const st = engine.pick(f.fingertip.x, f.fingertip.y, 55);
      const now = performance.now();
      if (!st) {
        state.current = { id: null, since: now };
        setProgress(0);
        return;
      }
      if (state.current.id !== st.id) state.current = { id: st.id, since: now };
      const p = Math.min(1, (now - state.current.since) / ms);
      setProgress(p);
      if (p >= 1) {
        state.current = { id: null, since: now };
        cb.current(st);
      }
    });
  }, [h, active, ms]);

  return progress;
}
