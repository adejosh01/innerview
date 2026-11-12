// Vercel serverless function: POST /api/tutor (AI tutor). Set ANTHROPIC_API_KEY in Vercel env vars.
import { askTutor, MAX_BODY } from "../server/tutorCore.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  if (JSON.stringify(req.body ?? {}).length > MAX_BODY) return res.status(413).json({ error: "request too large" });
  const { status, json } = await askTutor(req.body);
  res.status(status).json(json);
}
