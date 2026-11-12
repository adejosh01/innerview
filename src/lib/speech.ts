/** Read-aloud via the browser's built-in speech synthesis (on-device, no network). */
export const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;

export function speak(text: string): void {
  if (!speechSupported) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1;
  u.pitch = 1;
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith(navigator.language.slice(0, 2)) && v.localService);
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (speechSupported) window.speechSynthesis.cancel();
}
