# Innerview

A live X-ray mirror in the browser: skull, brain, muscles and hand bones overlaid on your face and hands through your webcam. Educational only. It is not a scan of you and not a medical tool.

## Run it

```bash
npm install        # also copies MediaPipe WASM + models into public/mediapipe
npm run dev        # http://localhost:5173  (add ?demo to open the camera-free demo)
```

Optional AI tutor (Claude):

```bash
cp .env.example .env   # add ANTHROPIC_API_KEY from https://platform.claude.com
npm run tutor          # local proxy on :8787; Vite forwards /api to it
```

Production build: `npm run build` → static files in `dist/` (any static host works; the tutor needs its own small Node host).

## Features

- Face, hand and (optional) full-body tracking on-device (MediaPipe), with One-Euro smoothing
- Real skull/brain/eye/spine anatomy (BodyParts3D), fitted to MediaPipe's face so soft-tissue depth is realistic
- Layers: skull, brain, muscles, eyes, neck spine, hand bones, head outline, labels
- X-ray / solid looks, brightness, "real me showing through" blend
- Reveal modes: whole, left/right half, top, lower face, fingertip X-ray lens, with feathered edges
- Live motion: jaw follows your mouth, eyes follow your gaze, muscles light up from your expressions
- Auto-fit to your face proportions (including jaw width/length), plus manual fit sliders
- Your hands hide the anatomy behind them
- Full-body mode: rib cage, spine, pelvis, clavicles and limb bones
- Tap any structure for info; "point to the…" quiz (fingertip dwell or click)
- Screenshot and video recording
- Read-aloud for info cards and tutor answers (on-device speech)
- Optional AI tutor (text only; video never leaves the device); shows "not connected yet" when no API key is configured
- Camera-free demo mode

## Structure

```
src/core/       framework-agnostic AR engine (future SDK)
  engine.ts     camera, tracking loop, pose, reveal, overlays, capture
  tracker.ts    MediaPipe face + hand (+ lazy pose) landmarkers
  realAnatomy.ts loads public/models/anatomy.glb over the placeholders
  body.ts       full-body skeleton from pose landmarks
  occluder.ts   depth-only hand silhouettes (hands hide anatomy)
  anatomy.ts    anatomy meshes in MediaPipe canonical face space (cm)
  materials.ts  x-ray / solid shader with reveal + lens masking
  hands.ts      screen-space hand skeleton
  filter.ts     One-Euro filter
src/hooks/      React bridge to the engine
src/components/ UI (panel, cards, tutor, credits, logo)
src/style.css   design tokens + styles (brand colours at the top)
server/tutor.mjs  optional Claude proxy (GET /api/tutor/status, POST /api/tutor)
scripts/build-anatomy.mjs  BodyParts3D OBJ → anatomy.glb converter
```

## Anatomy models and licences

`public/models/anatomy.glb` (≈0.7 MB) holds real skull bones, brain lobes, eyes, eye muscles, cervical spine and sternocleidomastoid from **BodyParts3D** (CC BY-SA 2.1 JP). It stays under that licence (see `public/models/LICENSE.md`) and is credited in the app's About dialog. If the file is missing, the app falls back to built-in simplified shapes.

Facial expression/chewing muscles, hand bones and the full-body skeleton are simplified shapes (BodyParts3D has no facial muscles; Z-Anatomy does, but ships as Blender files).

Rebuild the model:

```bash
# download + unzip partof_BP3D_4.0_obj_99.zip and isa_BP3D_4.0_obj_99.zip from
# https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html into one folder, then:
npm run build:anatomy -- /path/to/that/folder
```
