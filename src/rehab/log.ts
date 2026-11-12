import { useCallback, useState } from "react";

/** One completed (or stopped) exercise in a session. Stored only in this browser. */
export interface LogEntry {
  id: string;
  name: string;
  reps: number;
  setsDone: number;
  setsPlanned: number;
  repsPerSet: number;
  best: number;
  unit: string;
  seconds: number;
  at: string; // ISO time
}

const KEY = "innerview:rehab:v1";

function load(): LogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as LogEntry[];
  } catch {
    return [];
  }
}
function save(l: LogEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(l.slice(-500)));
  } catch {
    /* storage unavailable */
  }
}

const dayKey = (iso: string) => iso.slice(0, 10);

export function useRehabLog() {
  const [log, setLog] = useState<LogEntry[]>(load);
  const add = useCallback((e: LogEntry) => {
    setLog((l) => {
      const next = [...l, e];
      save(next);
      return next;
    });
  }, []);
  const clear = useCallback(() => {
    setLog([]);
    save([]);
  }, []);
  const today = log.filter((e) => dayKey(e.at) === dayKey(new Date().toISOString()));
  return { log, today, add, clear };
}

export type RehabLog = ReturnType<typeof useRehabLog>;

/** Plain-text summary the patient can choose to share with their clinician. */
export function summaryText(entries: LogEntry[]): string {
  const lines = [
    "Innerview: exercise summary",
    `Generated ${new Date().toLocaleString()}`,
    "",
    "General exercise guidance, measured with a webcam. Not a medical assessment; measurements are approximate.",
    "",
  ];
  const byDay = new Map<string, LogEntry[]>();
  for (const e of entries) byDay.set(dayKey(e.at), [...(byDay.get(dayKey(e.at)) ?? []), e]);
  for (const [day, es] of [...byDay.entries()].sort()) {
    lines.push(day);
    for (const e of es) {
      lines.push(
        `  ${new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}  ${e.name}: ${e.reps} reps (${e.setsDone}/${e.setsPlanned} sets of ${e.repsPerSet}), best range ≈ ${Math.round(e.best)}${e.unit}, ${Math.round(e.seconds / 60)} min`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}
