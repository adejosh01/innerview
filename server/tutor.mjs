// Local dev server for the optional AI tutor (production uses api/ on Vercel).
// Run: put ANTHROPIC_API_KEY in .env, then `npm run tutor` (Vite proxies /api → this server).
import http from "node:http";
import { askTutor, hasKey, MAX_BODY, tutorStatus } from "./tutorCore.mjs";

const PORT = Number(process.env.TUTOR_PORT ?? 8787);

function send(res, { status, json }) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(json));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/api/tutor/status") return send(res, tutorStatus());
  if (req.method !== "POST" || req.url !== "/api/tutor") return send(res, { status: 404, json: { error: "not found" } });
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) return send(res, { status: 413, json: { error: "request too large" } });
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return send(res, { status: 400, json: { error: "invalid JSON" } });
  }
  send(res, await askTutor(body));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`AI tutor listening on http://127.0.0.1:${PORT}/api/tutor`);
  if (!hasKey()) console.warn("No ANTHROPIC_API_KEY set: the app will show the tutor as not connected. Add it to .env and restart.");
});
