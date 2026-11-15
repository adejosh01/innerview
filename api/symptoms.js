// Vercel serverless function: POST /api/symptoms (Symptom Check). Uses ANTHROPIC_API_KEY.
// Nothing is logged or stored; the description is forwarded to Claude and the answer returned.
import { checkSymptoms } from "../server/symptomsCore.mjs";

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  if (JSON.stringify(req.body ?? {}).length > 6000) return res.status(413).json({ error: "request too large" });
  const { status, json } = await checkSymptoms(req.body);
  res.status(status).json(json);
}
