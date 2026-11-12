// Self-hosts MediaPipe WASM + model files under public/mediapipe so no
// third-party CDN is contacted at runtime (privacy + offline friendly).
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "mediapipe");
const wasmSrc = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");

if (!existsSync(wasmSrc)) {
  console.warn("[setup-mediapipe] tasks-vision not installed yet, skipping");
  process.exit(0);
}
mkdirSync(join(out, "wasm"), { recursive: true });
cpSync(wasmSrc, join(out, "wasm"), { recursive: true });

const models = {
  "face_landmarker.task":
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  "hand_landmarker.task":
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  "pose_landmarker_lite.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
};
for (const [name, url] of Object.entries(models)) {
  const dest = join(out, name);
  if (existsSync(dest)) continue;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log(`[setup-mediapipe] downloaded ${name}`);
}
