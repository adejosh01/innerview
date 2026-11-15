import { useCallback, useState } from "react";
import { emptyIntake, type Intake, type SymptomResult } from "./data";

export type CheckState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "emergency" }
  | { status: "result"; result: SymptomResult }
  | { status: "refused" }
  | { status: "error"; message: string };

/**
 * Symptom Check state. Red flags short-circuit to emergency guidance on the
 * device (no AI needed). Otherwise the intake is sent to /api/symptoms only
 * after the user ticks consent. Nothing is saved.
 */
export function useSymptomCheck() {
  const [intake, setIntake] = useState<Intake>(emptyIntake);
  const [state, setState] = useState<CheckState>({ status: "idle" });

  const patch = useCallback((p: Partial<Intake>) => setIntake((i) => ({ ...i, ...p })), []);

  const reset = useCallback(() => {
    setIntake(emptyIntake());
    setState({ status: "idle" });
  }, []);

  const submit = useCallback(async () => {
    if (intake.redFlags.length) {
      setState({ status: "emergency" });
      return;
    }
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/symptoms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(intake),
      });
      const data = (await res.json().catch(() => ({}))) as { result?: SymptomResult; refused?: boolean; error?: string };
      if (data.refused) return setState({ status: "refused" });
      if (!res.ok || !data.result) throw new Error(data.error ?? `Symptom check unavailable (${res.status})`);
      setState({ status: "result", result: data.result });
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof TypeError ? "Can't reach the server. Check your connection and try again." : (e as Error).message,
      });
    }
  }, [intake]);

  return { intake, patch, state, submit, reset, setState };
}

export type SymptomCheck = ReturnType<typeof useSymptomCheck>;
