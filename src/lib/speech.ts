/**
 * Read-aloud via the browser's built-in speech synthesis (on-device, no network).
 *
 * Works around common browser quirks:
 *  - Chrome drops an utterance spoken in the same tick as cancel(), so when
 *    something is already speaking we cancel, then speak on the next tick.
 *  - Chrome can garbage-collect an utterance mid-speech; we keep a reference.
 *  - Chrome sometimes leaves the engine "paused"; we resume() before speaking.
 *  - iOS only allows speech that starts inside a tap. The first utterance must
 *    come straight from a click handler; after that, timed speech (like rep
 *    counting) is allowed. Call unlockSpeech() from a tap to arm it.
 *  - Voices load asynchronously; we pick one once they're available.
 */
export const speechSupported =
  typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

let current: SpeechSynthesisUtterance | null = null;
let voice: SpeechSynthesisVoice | null = null;

function pickVoice(): void {
  if (!speechSupported) return;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;
  const lang = (navigator.language || "en-US").toLowerCase();
  const base = lang.slice(0, 2);
  voice =
    voices.find((v) => v.lang.toLowerCase() === lang && v.localService) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(base) && v.localService) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(base)) ??
    voices.find((v) => v.default) ??
    null;
}

if (speechSupported) {
  pickVoice();
  window.speechSynthesis.addEventListener?.("voiceschanged", pickVoice);
}

function utter(text: string): void {
  const synth = window.speechSynthesis;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice?.lang ?? navigator.language ?? "en-US";
  if (voice) u.voice = voice;
  u.rate = 1;
  u.pitch = 1;
  u.volume = 1;
  u.onend = u.onerror = () => {
    if (current === u) current = null;
  };
  current = u; // keep a reference so it isn't garbage-collected mid-speech
  if (synth.paused) synth.resume();
  synth.speak(u);
}

export function speak(text: string): void {
  if (!speechSupported || !text.trim()) return;
  const synth = window.speechSynthesis;
  if (!voice) pickVoice();
  if (synth.speaking || synth.pending) {
    synth.cancel();
    setTimeout(() => utter(text), 80);
  } else {
    utter(text); // synchronous: keeps iOS's "started from a tap" requirement
  }
}

export function stopSpeaking(): void {
  if (!speechSupported) return;
  current = null;
  window.speechSynthesis.cancel();
}

/** Call from a tap before speech that will start later (e.g. voice rep counting). */
export function unlockSpeech(confirmation = "Voice on"): void {
  speak(confirmation);
}
