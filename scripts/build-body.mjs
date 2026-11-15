// Builds public/models/body.glb: real BodyParts3D skeleton (CC BY-SA 2.1 JP),
// re-expressed in frames that MediaPipe Pose can drive.
//
//   node scripts/build-body.mjs <bodyparts3d-dir>
//
// <bodyparts3d-dir> holds partof_element_parts.txt and the unzipped
// partof_BP3D_4.0_obj_99 folder.
//
// Frames (all dimensionless):
//  - Torso parts (ribs, sternum, spine, pelvis, clavicles, scapulae):
//      P = midShoulder + u·(Rshoulder − Lshoulder) + v·(midHip − midShoulder) + w·(anterior · 2.5·shoulderWidth)
//    Shoulders = humeral head centres, hips = femoral head centres. At runtime the
//    same basis is built from pose landmarks (see src/core/body.ts).
//  - Limb bones: proximal joint at origin, distal joint at (0,1,0), x/z scaled by the
//    same bone length (uniform), +z = anterior (toward the camera when facing it).
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { weld, simplifyPrimitive, reorder, meshopt, dedup, prune } from "@gltf-transform/functions";
import { MeshoptSimplifier, MeshoptEncoder } from "meshoptimizer";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = process.argv[2];
if (!SRC || !existsSync(join(SRC, "partof_element_parts.txt"))) {
  console.error("usage: node scripts/build-body.mjs <bodyparts3d-dir>  (needs partof_element_parts.txt + partof_BP3D_4.0_obj_99/)");
  process.exit(1);
}
const OBJ_DIR = (() => {
  const stack = [SRC];
  while (stack.length) {
    const d = stack.pop();
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      if (e.name === "partof_BP3D_4.0_obj_99") return join(d, e.name);
      stack.push(join(d, e.name));
    }
  }
  throw new Error("partof_BP3D_4.0_obj_99 not found");
})();

// concept id → element files
const elements = new Map();
for (const line of readFileSync(join(SRC, "partof_element_parts.txt"), "utf8").split("\n").slice(1)) {
  const [c, , e] = line.trim().split("\t");
  if (!c || !e) continue;
  if (!elements.has(c)) elements.set(c, new Set());
  elements.get(c).add(e);
}
const els = (...concepts) => [...new Set(concepts.flatMap((c) => [...(elements.get(c) ?? [])]))];
const without = (a, b) => a.filter((x) => !b.includes(x));

/** OBJ → { pos: number[] (mm, BP3D axes), idx: number[] } */
function readObj(el) {
  const f = join(OBJ_DIR, `${el}.obj`);
  if (!existsSync(f)) throw new Error(`missing ${f}`);
  const pos = [];
  const idx = [];
  for (const line of readFileSync(f, "utf8").split("\n")) {
    if (line.startsWith("v ")) {
      const [, x, y, z] = line.trim().split(/\s+/);
      pos.push(+x, +y, +z);
    } else if (line.startsWith("f ")) {
      const vs = line.trim().split(/\s+/).slice(1).map((t) => parseInt(t, 10) - 1);
      for (let i = 1; i + 1 < vs.length; i++) idx.push(vs[0], vs[i], vs[i + 1]);
    }
  }
  return { pos, idx };
}
function merge(list) {
  const pos = [];
  const idx = [];
  for (const el of list) {
    const o = readObj(el);
    const base = pos.length / 3;
    pos.push(...o.pos);
    for (const i of o.idx) idx.push(i + base);
  }
  return { pos, idx };
}

// ── vector helpers (BP3D: +X subject-left, −Y anterior, +Z up; mm)
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(...a);
const norm = (a) => mul(a, 1 / len(a));
const mid = (a, b) => mul(add(a, b), 0.5);

function points(mesh) {
  const out = [];
  for (let i = 0; i < mesh.pos.length; i += 3) out.push([mesh.pos[i], mesh.pos[i + 1], mesh.pos[i + 2]]);
  return out;
}
const centroid = (pts) => mul(pts.reduce((a, p) => add(a, p), [0, 0, 0]), 1 / pts.length);
/** Centroid of the top/bottom `frac` of a bone along Z, optionally the medial half only. */
function endCentre(pts, which, frac = 0.05, medial = false) {
  const zs = pts.map((p) => p[2]);
  const zmin = Math.min(...zs), zmax = Math.max(...zs);
  const cut = (zmax - zmin) * frac;
  let sel = pts.filter((p) => (which === "top" ? p[2] > zmax - cut : p[2] < zmin + cut));
  if (medial) {
    const mx = sel.reduce((a, p) => a + Math.abs(p[0]), 0) / sel.length;
    sel = sel.filter((p) => Math.abs(p[0]) <= mx);
  }
  return centroid(sel);
}

// ── source meshes
const C = {
  ribcage: "FMA7480", sternum: "FMA7485", thoracic: "FMA9140", lumbar: "FMA16203", pelvis: "FMA16580",
  clavR: "FMA13322", clavL: "FMA13323", scapR: "FMA13395", scapL: "FMA13396",
  humR: "FMA23130", humL: "FMA23131", radR: "FMA23464", radL: "FMA23465", ulnR: "FMA23467", ulnL: "FMA23468",
  femR: "FMA24474", femL: "FMA24475", tibR: "FMA24477", tibL: "FMA24478", fibR: "FMA24480", fibL: "FMA24481",
  patR: "FMA24486", patL: "FMA24487",
};
const sternumEls = els(C.sternum);
const meshes = {
  ribs: merge(without(els(C.ribcage), sternumEls)),
  sternum: merge(sternumEls),
  spine: merge(els(C.thoracic, C.lumbar)),
  pelvis: merge(els(C.pelvis)),
  clavicles: merge(els(C.clavL, C.clavR)),
  scapulae: merge(els(C.scapL, C.scapR)),
  "humerus-l": merge(els(C.humL)),
  "humerus-r": merge(els(C.humR)),
  "forearm-l": merge(els(C.radL, C.ulnL)),
  "forearm-r": merge(els(C.radR, C.ulnR)),
  "femur-l": merge(els(C.femL, C.patL)),
  "femur-r": merge(els(C.femR, C.patR)),
  "tibia-l": merge(els(C.tibL, C.fibL)),
  "tibia-r": merge(els(C.tibR, C.fibR)),
};

// ── joint centres
const P = Object.fromEntries(Object.entries(meshes).map(([k, m]) => [k, points(m)]));
const femurOnly = { l: points(merge(els(C.femL))), r: points(merge(els(C.femR))) };
const tibiaOnly = { l: points(merge(els(C.tibL))), r: points(merge(els(C.tibR))) };
const J = {};
for (const s of ["l", "r"]) {
  J[`shoulder-${s}`] = endCentre(P[`humerus-${s}`], "top", 0.06);
  J[`elbow-${s}`] = endCentre(P[`humerus-${s}`], "bottom", 0.05);
  J[`wrist-${s}`] = endCentre(P[`forearm-${s}`], "bottom", 0.04);
  J[`hip-${s}`] = endCentre(femurOnly[s], "top", 0.07, true); // femoral head is medial-top
  J[`knee-${s}`] = endCentre(femurOnly[s], "bottom", 0.05);
  J[`ankle-${s}`] = endCentre(tibiaOnly[s], "bottom", 0.04);
}

// ── torso frame
const midSh = mid(J["shoulder-l"], J["shoulder-r"]);
const midHip = mid(J["hip-l"], J["hip-r"]);
const ax = sub(J["shoulder-r"], J["shoulder-l"]);
const ay = sub(midHip, midSh);
const shoulderW = len(ax);
const az = mul([0, -1, 0], shoulderW * 2.5); // anterior, matching runtime depth scale
// invert the 3x3 basis [ax ay az]
const det = dot(ax, cross(ay, az));
const inv = [cross(ay, az), cross(az, ax), cross(ax, ay)].map((r) => mul(r, 1 / det));
const toTorso = (p) => {
  const d = sub(p, midSh);
  return [dot(inv[0], d), dot(inv[1], d), dot(inv[2], d)];
};

// ── limb frames: proximal → distal
const LIMB_JOINTS = {
  "humerus-l": ["shoulder-l", "elbow-l"], "humerus-r": ["shoulder-r", "elbow-r"],
  "forearm-l": ["elbow-l", "wrist-l"], "forearm-r": ["elbow-r", "wrist-r"],
  "femur-l": ["hip-l", "knee-l"], "femur-r": ["hip-r", "knee-r"],
  "tibia-l": ["knee-l", "ankle-l"], "tibia-r": ["knee-r", "ankle-r"],
};
function limbTransform(a, b) {
  const A = J[a], B = J[b];
  const L = len(sub(B, A));
  const ey = norm(sub(B, A));
  let ez = sub([0, -1, 0], mul(ey, dot([0, -1, 0], ey))); // anterior, made perpendicular to the bone
  ez = norm(ez);
  const ex = cross(ey, ez);
  return (p) => {
    const d = sub(p, A);
    return [dot(d, ex) / L, dot(d, ey) / L, dot(d, ez) / L];
  };
}

const BUDGET = {
  ribs: 16000, sternum: 2000, spine: 14000, pelvis: 10000, clavicles: 2000, scapulae: 5000,
  "humerus-l": 3000, "humerus-r": 3000, "forearm-l": 3500, "forearm-r": 3500,
  "femur-l": 4000, "femur-r": 4000, "tibia-l": 4000, "tibia-r": 4000,
};

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
const doc = new Document();
doc.createBuffer();
const scene = doc.createScene("body");
const stats = [];
for (const [id, m] of Object.entries(meshes)) {
  const tf = LIMB_JOINTS[id] ? limbTransform(...LIMB_JOINTS[id]) : toTorso;
  const out = new Float32Array(m.pos.length);
  for (let i = 0; i < m.pos.length; i += 3) out.set(tf([m.pos[i], m.pos[i + 1], m.pos[i + 2]]), i);
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(out))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(m.idx)));
  scene.addChild(doc.createNode(id).setMesh(doc.createMesh(id).addPrimitive(prim)));
  stats.push({ id, tris: m.idx.length / 3 });
}
await doc.transform(weld());
for (const mesh of doc.getRoot().listMeshes()) {
  const st = stats.find((s) => s.id === mesh.getName());
  for (const prim of mesh.listPrimitives()) {
    simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: Math.min(1, BUDGET[st.id] / st.tris), error: 0.003 });
    st.out = prim.getIndices().getCount() / 3;
  }
}
await doc.transform(dedup(), prune(), reorder({ encoder: MeshoptEncoder }), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
await io.write(join(ROOT, "public", "models", "body.glb"), doc);

for (const s of stats) console.log(`${s.id.padEnd(11)} ${String(s.tris).padStart(7)} → ${String(Math.round(s.out)).padStart(6)} tris`);
const r = (v) => v.map((x) => Math.round(x)).join(", ");
console.log(`shoulders L ${r(J["shoulder-l"])}  R ${r(J["shoulder-r"])}  width ${Math.round(shoulderW)} mm`);
console.log(`hips      L ${r(J["hip-l"])}  R ${r(J["hip-r"])}`);
console.log("wrote public/models/body.glb");
