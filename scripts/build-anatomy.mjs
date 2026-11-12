// Builds public/models/anatomy.glb from BodyParts3D OBJ files.
//
//   node scripts/build-anatomy.mjs <bodyparts3d-dir>
//
// <bodyparts3d-dir> must contain the unzipped "partof_BP3D_4.0_obj_99" and
// "isa_BP3D_4.0_obj_99" folders from https://dbarchive.biosciencedbc.jp/en/bodyparts3d/
// (CC BY-SA 2.1 JP). Meshes are merged per structure, transformed into
// MediaPipe's canonical face space (cm, +y up, +z out of the face), simplified
// and meshopt-compressed. The output stays under CC BY-SA (see public/models/LICENSE.md).
import { readFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { weld, simplifyPrimitive, reorder, meshopt, dedup, prune } from "@gltf-transform/functions";
import { MeshoptSimplifier, MeshoptEncoder } from "meshoptimizer";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = process.argv[2];
if (!SRC || !existsSync(SRC)) {
  console.error("usage: node scripts/build-anatomy.mjs <bodyparts3d-dir>");
  process.exit(1);
}

// ── Alignment: BodyParts3D (mm; +X subject-left, −Y anterior, +Z superior)
//    → canonical face space (cm; +x subject-left, +y up, +z anterior).
// Fitted so soft-tissue depth against MediaPipe's canonical face is realistic
// (forehead ≈0.4 cm, nasion ≈0.8 cm, chin ≈1.1 cm): eyes anchor the transform,
// the vault is compressed slightly and the lower face stretched slightly,
// because the BodyParts3D subject has a longer braincase than MediaPipe's
// average face. Re-run the fit if you change source data.
const EYE_MID_BP = { x: 0, y: -151.7, z: 1518.0 }; // midpoint of BP3D eyeball centres
const EYE_MID_CANON = { x: 0, y: 2.12, z: 1.9 };
const SCALE = 63 / 59.8 / 10; // canonical eye spacing 6.3 cm vs BP3D 59.8 mm
const PITCH_DEG = Number(process.env.ANATOMY_PITCH ?? 0);
const UP_SCALE = 0.95; // above eye level
const DOWN_SCALE = 1.05; // below eye level
const pitch = (PITCH_DEG * Math.PI) / 180;

function toCanon(x, y, z) {
  // to canonical axes, centred on the eyes
  const cx = (x - EYE_MID_BP.x) * SCALE;
  const cy = (z - EYE_MID_BP.z) * SCALE;
  const cz = -(y - EYE_MID_BP.y) * SCALE;
  // rotate about x (positive pitch moves the chin forward)
  let ry = cy * Math.cos(pitch) - cz * Math.sin(pitch);
  const rz = cy * Math.sin(pitch) + cz * Math.cos(pitch);
  ry *= ry > 0 ? UP_SCALE : DOWN_SCALE;
  return [cx + EYE_MID_CANON.x, ry + EYE_MID_CANON.y, rz + EYE_MID_CANON.z];
}

// ── Structures: id → BodyParts3D element files (FJ ids) and triangle budget.
// ids match src/core/anatomy.ts so metadata (name, info, layer) lives in code.
const STRUCTURES = {
  // skull
  frontal: { set: "partof", el: ["FJ3200"], tris: 9000 },
  parietal: { set: "partof", el: ["FJ3274", "FJ3380"], tris: 10000 },
  temporal: { set: "partof", el: ["FJ3281", "FJ3386"], tris: 10000 },
  occipital: { set: "partof", el: ["FJ3309"], tris: 8000 },
  sphenoid: { set: "partof", el: ["FJ3394", "FJ3199"], tris: 7000 },
  zygomatic: { set: "partof", el: ["FJ3287", "FJ3392"], tris: 4000 },
  maxilla: { set: "partof", el: ["FJ3269", "FJ3375", "FJ3273", "FJ3379"], tris: 8000 },
  nasal: { set: "partof", el: ["FJ3272", "FJ3378", "FJ3265", "FJ3371", "FJ3263", "FJ3369", "FJ3395"], tris: 5000 },
  mandible: { set: "partof", el: ["FJ3289"], tris: 8000 },
  hyoid: { set: "partof", el: ["FJ2772", "FJ3201"], tris: 1500 },
  // spine
  cervical: {
    set: "partof",
    el: ["FJ3176", "FJ3177", "FJ3161", "FJ3164", "FJ3167", "FJ3170", "FJ3172", "FJ3202", "FJ3213", "FJ3218", "FJ3219", "FJ3220", "FJ3221"],
    tris: 12000,
  },
  // brain
  "lobe-frontal": { set: "partof", el: ["FJ1833", "FJ1834", "FJ1787", "FJ1788", "FJ1744", "FJ1745", "FJ1800", "FJ1801"], tris: 14000 },
  "lobe-parietal": { set: "partof", el: ["FJ1797", "FJ1798", "FJ1835", "FJ1836", "FJ1841", "FJ1842", "FJ1732", "FJ1733"], tris: 10000 },
  "lobe-temporal": { set: "partof", el: ["FJ1789", "FJ1790", "FJ1746", "FJ1747", "FJ1783", "FJ1784"], tris: 9000 },
  "lobe-occipital": { set: "partof", el: ["FJ1791", "FJ1792"], tris: 5000 },
  limbic: { set: "partof", el: ["FJ1739", "FJ1740", "FJ1759", "FJ1807", "FJ1785", "FJ1786"], tris: 5000 },
  insula: { set: "partof", el: ["FJ1748", "FJ1749"], tris: 2000 },
  deep: { set: "partof", el: ["FJ1758", "FJ1806", "FJ1750", "FJ1751", "FJ1760", "FJ1808", "FJ1780", "FJ1828", "FJ1743", "FJ1795"], tris: 6000 },
  ventricles: { set: "partof", el: ["FJ1767", "FJ1814", "FJ1730", "FJ1731", "FJ1738"], tris: 3000 },
  cerebellum: { set: "partof", el: ["FJ1781", "FJ1830"], tris: 7000 },
  brainstem: { set: "partof", el: ["FJ1770", "FJ1817", "FJ1775", "FJ1822", "FJ1769", "FJ1831", "FJ1762", "FJ1810", "FJ1779", "FJ1826"], tris: 4000 },
  // eyes (each eye is its own node so it can rotate with gaze)
  "eye-l": { set: "partof", el: ["FJ1317", "FJ1289", "FJ1297", "FJ1305"], tris: 2500 },
  "eye-r": { set: "partof", el: ["FJ1368", "FJ1340", "FJ1348", "FJ1356"], tris: 2500 },
  // muscles available in BodyParts3D
  extraocular: {
    set: "isa",
    el: ["FJ1294", "FJ1295", "FJ1304", "FJ1306", "FJ1308", "FJ1322", "FJ1323", "FJ1345", "FJ1346", "FJ1355", "FJ1357", "FJ1359", "FJ1373", "FJ1374"],
    tris: 5000,
  },
  scm: { set: "isa", el: ["FJ1573", "FJ1595"], tris: 4000 },
};

const SET_DIRS = {
  partof: findObjDir("partof"),
  isa: findObjDir("isa"),
};

function findObjDir(prefix) {
  const stack = [SRC];
  while (stack.length) {
    const d = stack.pop();
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const p = join(d, e.name);
      if (e.name === `${prefix}_BP3D_4.0_obj_99`) return p;
      stack.push(p);
    }
  }
  return null;
}

/** Minimal OBJ reader: positions + triangulated faces. */
function readObj(file) {
  const pos = [];
  const idx = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line.startsWith("v ")) {
      const [, x, y, z] = line.trim().split(/\s+/);
      pos.push(...toCanon(+x, +y, +z));
    } else if (line.startsWith("f ")) {
      const vs = line.trim().split(/\s+/).slice(1).map((t) => parseInt(t, 10) - 1);
      for (let i = 1; i + 1 < vs.length; i++) idx.push(vs[0], vs[i], vs[i + 1]);
    }
  }
  return { pos, idx };
}

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;

const doc = new Document();
doc.createBuffer();
const scene = doc.createScene("anatomy");
const stats = [];

for (const [id, s] of Object.entries(STRUCTURES)) {
  const dir = SET_DIRS[s.set];
  if (!dir) {
    console.warn(`skipping ${id}: ${s.set}_BP3D_4.0_obj_99 not found under ${SRC}`);
    continue;
  }
  const pos = [];
  const idx = [];
  for (const el of s.el) {
    const f = join(dir, `${el}.obj`);
    if (!existsSync(f)) throw new Error(`Missing ${f} for ${id}`);
    const o = readObj(f);
    const base = pos.length / 3;
    pos.push(...o.pos);
    for (const i of o.idx) idx.push(i + base);
  }
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(pos)))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(idx)));
  const mesh = doc.createMesh(id).addPrimitive(prim);
  scene.addChild(doc.createNode(id).setMesh(mesh));
  stats.push({ id, tris: idx.length / 3, target: s.tris });
}

await doc.transform(weld());
for (const mesh of doc.getRoot().listMeshes()) {
  const st = stats.find((s) => s.id === mesh.getName());
  const ratio = Math.min(1, st.target / st.tris);
  // simplify per mesh so each structure gets its own triangle budget
  for (const prim of mesh.listPrimitives()) {
    simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error: 0.002 });
    st.out = prim.getIndices().getCount() / 3;
  }
}
await doc.transform(dedup(), prune(), reorder({ encoder: MeshoptEncoder }), meshopt({ encoder: MeshoptEncoder, level: "medium" }));

const outDir = join(ROOT, "public", "models");
mkdirSync(outDir, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
await io.write(join(outDir, "anatomy.glb"), doc);

for (const s of stats) console.log(`${s.id.padEnd(16)} ${String(s.tris).padStart(7)} → ${String(Math.round(s.out)).padStart(6)} tris`);
console.log(`wrote public/models/anatomy.glb (pitch ${PITCH_DEG}°)`);
