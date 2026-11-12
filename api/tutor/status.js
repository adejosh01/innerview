// Vercel serverless function: GET /api/tutor/status → { connected } (true once ANTHROPIC_API_KEY is set).
import { tutorStatus } from "../../server/tutorCore.mjs";

export default function handler(_req, res) {
  const { status, json } = tutorStatus();
  res.setHeader("cache-control", "no-store");
  res.status(status).json(json);
}
