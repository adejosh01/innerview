// Shared AI-tutor logic used by both the local dev server (server/tutor.mjs)
// and the Vercel serverless functions (api/tutor.js, api/tutor/status.js).
// Only text is sent to Claude (question + selected structure). Never camera frames.
import Anthropic from "@anthropic-ai/sdk";

const SYSTEM = `You are an anatomy tutor inside an educational AR app that overlays a generic 3D anatomy model on the user's webcam image.
Answer in 2-4 short sentences of plain language suited to a curious student. If a structure is selected, relate your answer to it.
You are not a doctor: for symptoms, pain, injuries or diagnosis, give general educational information only and suggest seeing a clinician. Never claim to see or assess the user's body; the model is generic, not a scan of them.`;

export const MAX_BODY = 8_000;

export const hasKey = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

let client = null;
const getClient = () => (client ??= new Anthropic());

/** Lets the app show "AI tutor not connected yet" instead of failing on the first question. */
export function tutorStatus() {
  return { status: 200, json: { connected: hasKey() } };
}

/** Validates the request body and asks Claude. Returns { status, json }. */
export async function askTutor(body) {
  if (!hasKey()) return { status: 503, json: { error: "AI tutor isn't connected yet: no API key configured." } };
  const question = String(body?.question ?? "").slice(0, 600).trim();
  if (!question) return { status: 400, json: { error: "question required" } };
  const structure = body?.structure ? String(body.structure).slice(0, 120) : null;
  const visible = Array.isArray(body?.visibleLayers) ? body.visibleLayers.slice(0, 10).map(String) : [];
  const context = [
    structure ? `Selected structure: ${structure}.` : "No structure selected.",
    visible.length ? `Visible layers: ${visible.join(", ")}.` : "",
  ].join(" ");

  try {
    const response = await getClient().beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content: `${context}\n\nQuestion: ${question}` }],
    });
    if (response.stop_reason === "refusal") {
      return { status: 200, json: { answer: "I can't help with that one. Try asking about how a structure works." } };
    }
    const answer = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return { status: 200, json: { answer: answer || "No answer returned." } };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { status: 500, json: { error: "Tutor server has no valid API key." } };
    if (err instanceof Anthropic.RateLimitError) return { status: 429, json: { error: "Tutor is busy, try again shortly." } };
    if (err instanceof Anthropic.APIError) return { status: 502, json: { error: `Claude API error ${err.status}` } };
    console.error(err);
    return { status: 500, json: { error: "Tutor failed." } };
  }
}
