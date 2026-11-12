import { useEffect, useState } from "react";

export type TutorStatus = "checking" | "connected" | "not-connected";

/**
 * Asks the tutor server whether an API key is configured. Anything other than a
 * clear "connected" (server not running, static hosting, no key) counts as
 * not connected, so the UI can say so up front.
 */
export function useTutorStatus(): TutorStatus {
  const [status, setStatus] = useState<TutorStatus>("checking");
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/tutor/status", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { connected?: boolean } | null) => setStatus(d?.connected ? "connected" : "not-connected"))
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setStatus("not-connected");
      });
    return () => ctrl.abort();
  }, []);
  return status;
}
