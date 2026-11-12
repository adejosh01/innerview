import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, Lock, PlugZap, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import type { TutorStatus } from "../hooks/useTutorStatus";
import { speak, speechSupported, stopSpeaking } from "../lib/speech";
import type { Structure } from "../core/anatomy";

type Msg = { role: "q" | "a" | "err"; text: string };

/**
 * Optional AI tutor. Sends ONLY text (question, selected structure name, visible
 * layers) to the local tutor server at /api/tutor, which calls Claude. Camera
 * frames never leave the device.
 */
export function TutorPanel(props: {
  structure: Structure | null;
  visibleLayers: string[];
  prefill: string | null;
  status: TutorStatus;
  onClose: () => void;
}) {
  const offline = props.status !== "connected";
  const [log, setLog] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [readAloud, setReadAloud] = useState(false);
  useEffect(() => stopSpeaking, []);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (props.prefill) setQ(props.prefill);
  }, [props.prefill]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  async function ask(e: FormEvent | null, preset?: string) {
    e?.preventDefault();
    const question = (preset ?? q).trim();
    if (!question || busy) return;
    setQ("");
    setLog((l) => [...l, { role: "q", text: question }]);
    setBusy(true);
    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, structure: props.structure?.name ?? null, visibleLayers: props.visibleLayers }),
      });
      const data = (await res.json().catch(() => ({}))) as { answer?: string; error?: string };
      if (!res.ok || !data.answer) throw new Error(data.error ?? `Tutor unavailable (${res.status})`);
      setLog((l) => [...l, { role: "a", text: data.answer! }]);
      if (readAloud) speak(data.answer);
    } catch (err) {
      const msg =
        err instanceof TypeError
          ? "Can't reach the tutor server. Run `npm run tutor` with ANTHROPIC_API_KEY set in .env."
          : (err as Error).message;
      setLog((l) => [...l, { role: "err", text: msg }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card tutor" aria-label="AI anatomy tutor">
      <header>
        <h3>
          <Sparkles aria-hidden />
          AI tutor{props.structure ? ` · ${props.structure.name}` : ""}
        </h3>
        <span style={{ display: "flex", gap: 2 }}>
          {speechSupported && (
            <button
              className={`btn ghost icon ${readAloud ? "active" : ""}`}
              onClick={() => {
                if (readAloud) stopSpeaking();
                setReadAloud(!readAloud);
              }}
              aria-pressed={readAloud}
              aria-label="Read answers aloud"
              title="Read answers aloud"
            >
              {readAloud ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />}
            </button>
          )}
          <button className="btn ghost icon" onClick={props.onClose} aria-label="Close tutor">
            <X aria-hidden />
          </button>
        </span>
      </header>
      <p className="privacy">
        <Lock aria-hidden />
        Only your typed question and the selected structure's name are sent. Video never leaves your device. Educational,
        not medical advice.
      </p>
      {props.status === "not-connected" && (
        <div className="offline">
          <PlugZap aria-hidden />
          <div>
            <strong>AI tutor isn't connected yet</strong>
            <p>
              Everything else works without it: tap any structure for its info card, take the quiz, or use Listen to hear
              descriptions. The tutor switches on once an Anthropic API key is added on the server.
            </p>
          </div>
        </div>
      )}
      <div className="log" ref={logRef}>
        {log.length === 0 && !offline && (
          <div className="suggest">
            {(props.structure
              ? [`What does the ${props.structure.name} do?`, "Why is it shaped like that?", "What can go wrong with it?"]
              : ["How does the jaw hinge work?", "Which muscles make a smile?", "What protects the brain?"]
            ).map((sug) => (
              <button key={sug} type="button" className="btn" onClick={() => ask(null, sug)}>
                {sug}
              </button>
            ))}
          </div>
        )}
        {log.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.text}
          </div>
        ))}
        {busy && <div className="msg a note">Thinking…</div>}
      </div>
      <form onSubmit={ask}>
        <textarea
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={offline ? (props.status === "checking" ? "Connecting…" : "AI tutor not connected yet") : "Ask about anatomy…"}
          disabled={offline}
          aria-label="Question"
          maxLength={600}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) ask(e);
          }}
        />
        <button className="btn primary icon" disabled={offline || busy || !q.trim()} aria-label="Ask">
          <ArrowUp aria-hidden />
        </button>
      </form>
    </section>
  );
}
