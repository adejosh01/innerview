import * as THREE from "three";
import { createAnatomyMaterial, type AnatomyMaterial, type SharedUniforms } from "./materials";

/**
 * Procedural placeholder anatomy, authored directly in MediaPipe's canonical
 * face space (centimetres, +y up, +z out of the face, +x = subject's LEFT).
 * Reference points (canonical_face_model.obj): nose tip (0,-1.1,7.5),
 * forehead (0,8.3,4.5), chin (0,-9.4,4.3), cheeks (±7.7,0.7,-2.4).
 *
 * Real meshes (BodyParts3D / Z-Anatomy glTF) can replace any structure later:
 * see loadGltfOverrides().
 */

export type LayerId = "skull" | "brain" | "muscles" | "eyes" | "spine";

/** Layers a structure can belong to: head layers plus the screen-space body and hand overlays. */
export type StructureLayer = LayerId | "body" | "hands";

export interface Structure {
  id: string;
  name: string;
  layer: StructureLayer;
  /** Label / pick anchor in head space (unused when `screen` is set). */
  anchor: THREE.Vector3;
  /**
   * For screen-space overlays (body, hands): current anchor in stage CSS px,
   * un-mirrored image orientation (x right, y down), or null when not tracked.
   */
  screen?: () => { x: number; y: number } | null;
  info: string;
  materials: AnatomyMaterial[];
  object: THREE.Object3D;
}

export interface Anatomy {
  root: THREE.Group; // receives face pose
  fit: THREE.Group; // receives user fit (scale/offset)
  layers: Record<LayerId, THREE.Group>;
  jaw: THREE.Group;
  /** Jaw pivot at rest (temporomandibular joints), head space. */
  jawRest: THREE.Vector3;
  eyes: { left: THREE.Object3D; right: THREE.Object3D };
  structures: Structure[];
  allMaterials: AnatomyMaterial[];
}

const BONE_X = "#bfe6ff";
const BONE_S = "#e9e1cf";
const BRAIN_X = "#ff9fd0";
const BRAIN_S = "#e8a3a8";
const MUSCLE_X = "#ff6a5a";
const MUSCLE_S = "#b8423b";
const EYE_X = "#9fffe0";
const EYE_S = "#f4f4f0";

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Cheap deterministic pseudo-noise for organic surfaces. */
function noise3(p: THREE.Vector3, f: number): number {
  return (
    Math.sin(p.x * f + 1.3) * Math.sin(p.y * f * 1.21 + 0.7) * Math.sin(p.z * f * 0.93 + 2.1) +
    0.5 * Math.sin(p.x * f * 2.3 + 0.4) * Math.sin(p.y * f * 2.1 + 1.9) * Math.sin(p.z * f * 2.7)
  );
}

function deform(geo: THREE.BufferGeometry, fn: (p: THREE.Vector3) => void): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    fn(p);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Tube through a list of points with per-point radius. */
function tube(points: THREE.Vector3[], radius: number, segments = 48, closed = false): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3(points, closed, "centripetal");
  return new THREE.TubeGeometry(curve, segments, radius, 10, closed);
}

/** A muscle belly: ellipsoid stretched between two points. */
function belly(a: THREE.Vector3, b: THREE.Vector3, width: number, thickness: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.SphereGeometry(1, 24, 16);
  g.scale(width / 2, len / 2, thickness / 2);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), dir);
  g.applyQuaternion(q);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

export function buildAnatomy(shared: SharedUniforms): Anatomy {
  const root = new THREE.Group();
  root.name = "anatomy-root";
  root.matrixAutoUpdate = false;
  const fit = new THREE.Group();
  root.add(fit);

  const layers = {} as Record<LayerId, THREE.Group>;
  (["skull", "brain", "muscles", "eyes", "spine"] as LayerId[]).forEach((id) => {
    const g = new THREE.Group();
    g.name = id;
    layers[id] = g;
    fit.add(g);
  });
  // Render order: inner structures first so additive glow stacks nicely and
  // solid mode draws skull over brain.
  layers.brain.renderOrder = 1;
  layers.eyes.renderOrder = 2;
  layers.spine.renderOrder = 2;
  layers.skull.renderOrder = 3;
  layers.muscles.renderOrder = 4;

  const structures: Structure[] = [];
  const allMaterials: AnatomyMaterial[] = [];

  const mat = (x: string, s: string) => {
    const m = createAnatomyMaterial(shared, x, s);
    allMaterials.push(m);
    return m;
  };

  const add = (
    parent: THREE.Object3D,
    s: Omit<Structure, "materials" | "object">,
    geos: THREE.BufferGeometry[],
    colors: [string, string],
  ): Structure => {
    const m = mat(colors[0], colors[1]);
    const obj = new THREE.Group();
    obj.name = s.id;
    geos.forEach((g) => obj.add(new THREE.Mesh(g, m)));
    parent.add(obj);
    const st: Structure = { ...s, materials: [m], object: obj };
    structures.push(st);
    return st;
  };

  // ───────────────────────── SKULL ─────────────────────────
  const CRANIUM_C = v3(0, 3.2, -4.6);
  // Open bowl (no floor): ends around the ear/cheekbone line, tapering inward like the skull base.
  const cranium = deform(new THREE.SphereGeometry(1, 64, 48, 0, Math.PI * 2, 0, Math.PI * 0.68), (p) => {
    const y = p.y;
    const taper = y < 0 ? 1 + 0.35 * y : 1; // narrower toward the base
    p.set(p.x * 7.2 * taper, p.y * 9.0, p.z * 9.6 * (y < 0 ? 1 + 0.15 * y : 1));
    // flatten temples slightly
    p.x *= 1 - 0.08 * Math.exp(-((y - 0.1) ** 2) * 8);
    // occipital bulge
    if (p.z < -4) p.z -= 0.6 * Math.max(0, 1 - Math.abs(y));
    // flatter forehead
    if (p.z > 6) p.z = 6 + (p.z - 6) * 0.55;
    p.add(CRANIUM_C);
  });
  add(
    layers.skull,
    {
      id: "cranium",
      name: "Cranium",
      layer: "skull",
      anchor: v3(0, 11.5, -2),
      info: "The braincase: eight fused bones (frontal, two parietal, two temporal, occipital, sphenoid, ethmoid) protecting the brain.",
    },
    [cranium],
    [BONE_X, BONE_S],
  );

  // Orbits (eye sockets)
  const orbits: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const t = new THREE.TorusGeometry(1.75, 0.32, 10, 36);
    t.scale(1.05, 0.9, 1);
    t.translate(sx * 3.15, 2.7, 3.7);
    orbits.push(t);
  }
  add(
    layers.skull,
    {
      id: "orbits",
      name: "Orbits",
      layer: "skull",
      anchor: v3(4.9, 3.6, 3.6),
      info: "Bony eye sockets formed by seven bones; they house the eyeball, its muscles, nerves and fat.",
    },
    orbits,
    [BONE_X, BONE_S],
  );

  // Zygomatic bones + arches
  const zyg: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    zyg.push(tube([v3(sx * 3.6, 0.6, 4.1), v3(sx * 5.4, 0.4, 2.6), v3(sx * 6.8, 0.8, -0.2), v3(sx * 6.6, 0.9, -3.0)], 0.38, 24));
    const cheek = new THREE.SphereGeometry(1, 20, 14);
    cheek.scale(1.5, 1.1, 0.9);
    cheek.translate(sx * 4.6, 0.7, 3.4);
    zyg.push(cheek);
  }
  add(
    layers.skull,
    {
      id: "zygomatic",
      name: "Zygomatic bones",
      layer: "skull",
      anchor: v3(5.6, 0.2, 2.8),
      info: "The cheekbones. Their arches anchor the masseter, the main chewing muscle.",
    },
    zyg,
    [BONE_X, BONE_S],
  );

  // Nasal aperture + nasal bones
  const nasal = new THREE.TorusGeometry(1.0, 0.22, 10, 32);
  nasal.scale(0.85, 1.35, 1);
  nasal.translate(0, -0.6, 5.6);
  const nasalBone = tube([v3(0, 3.6, 5.4), v3(0, 2.0, 6.3), v3(0, 0.9, 6.6)], 0.28, 12);
  add(
    layers.skull,
    {
      id: "nasal",
      name: "Nasal aperture",
      layer: "skull",
      anchor: v3(0, -0.3, 6.6),
      info: "The pear-shaped opening of the nasal cavity. The visible nose is mostly cartilage, which doesn't show on X-ray.",
    },
    [nasal, nasalBone],
    [BONE_X, BONE_S],
  );

  // Maxilla with upper teeth
  const maxillaGeos: THREE.BufferGeometry[] = [
    tube([v3(-4.6, -1.4, 2.8), v3(-3.4, -2.9, 4.0), v3(0, -3.3, 5.0), v3(3.4, -2.9, 4.0), v3(4.6, -1.4, 2.8)], 0.5, 32),
  ];
  const teethArc = (y: number, zFront: number) => {
    const out: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI * 0.42 + (i / 13) * Math.PI * 0.84;
      const r = 2.9;
      const t = new THREE.BoxGeometry(0.42, 0.8, 0.55);
      t.rotateY(a);
      t.translate(Math.sin(a) * r, y, zFront - 2.9 + Math.cos(a) * r);
      out.push(t);
    }
    return out;
  };
  maxillaGeos.push(...teethArc(-3.75, 4.9));
  add(
    layers.skull,
    {
      id: "maxilla",
      name: "Maxilla & upper teeth",
      layer: "skull",
      anchor: v3(-3.2, -3.4, 4.6),
      info: "The upper jaw. It holds the upper teeth and forms the floor of the orbits and the nasal cavity.",
    },
    maxillaGeos,
    [BONE_X, BONE_S],
  );

  // Mandible on a pivot at the temporomandibular joints
  const TMJ = v3(0, 0.6, -3.4);
  const jaw = new THREE.Group();
  jaw.name = "jaw";
  jaw.position.copy(TMJ);
  layers.skull.add(jaw);
  const local = (p: THREE.Vector3) => p.clone().sub(TMJ);
  const mandibleGeos: THREE.BufferGeometry[] = [
    tube(
      [
        local(v3(-6.0, 0.4, -3.3)), // condyle
        local(v3(-5.6, -3.4, -2.6)), // ramus
        local(v3(-5.3, -6.0, -1.4)), // angle
        local(v3(-3.6, -7.8, 2.0)),
        local(v3(0, -8.9, 3.9)), // chin
        local(v3(3.6, -7.8, 2.0)),
        local(v3(5.3, -6.0, -1.4)),
        local(v3(5.6, -3.4, -2.6)),
        local(v3(6.0, 0.4, -3.3)),
      ],
      0.55,
      64,
    ),
  ];
  const lower = teethArc(-4.75, 4.7);
  lower.forEach((g) => g.translate(-TMJ.x, -TMJ.y, -TMJ.z));
  mandibleGeos.push(...lower);
  add(
    jaw,
    {
      id: "mandible",
      name: "Mandible",
      layer: "skull",
      anchor: v3(0, -9.2, 4.2),
      info: "The lower jaw, the only movable bone of the skull. It hinges at the temporomandibular joint just in front of each ear.",
    },
    mandibleGeos,
    [BONE_X, BONE_S],
  );

  // ───────────────────────── SPINE ─────────────────────────
  const verts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const y = -5.0 - i * 2.1;
    const body = new THREE.CylinderGeometry(1.1, 1.1, 1.3, 18);
    body.translate(0, y, -5.4 + i * 0.12);
    const spinous = tube([v3(0, y, -6.4), v3(0, y - 0.4, -8.2)], 0.25, 6);
    verts.push(body, spinous);
  }
  add(
    layers.spine,
    {
      id: "cervical",
      name: "Cervical spine",
      layer: "spine",
      anchor: v3(-1.6, -12, -5.4),
      info: "Seven neck vertebrae (C1–C7). C1 (atlas) lets you nod, and C2 (axis) lets you turn your head.",
    },
    verts,
    [BONE_X, BONE_S],
  );

  // ───────────────────────── BRAIN ─────────────────────────
  const hemi = (sx: number) =>
    deform(new THREE.SphereGeometry(1, 72, 54, sx > 0 ? Math.PI / 2 : Math.PI * 1.5, Math.PI), (p) => {
      const n = noise3(p, 9) * 0.035 + noise3(p, 17) * 0.015;
      p.multiplyScalar(1 + n);
      p.set(p.x * 3.05, p.y * 5.6, p.z * 8.2);
      if (p.y < -2.5) p.y = -2.5 + (p.y + 2.5) * 0.5; // flatter base
      p.x += sx * 0.12;
      p.add(v3(0, 4.6, -4.8));
    });
  // phiStart π/2 → x ≥ 0 half (subject's left); 3π/2 → x ≤ 0 half.
  add(
    layers.brain,
    {
      id: "cerebrum-l",
      name: "Left hemisphere",
      layer: "brain",
      anchor: v3(4.2, 8.6, -4),
      info: "In most people the left hemisphere leads language and the right side of the body's movement and sensation.",
    },
    [hemi(1)],
    [BRAIN_X, BRAIN_S],
  );
  add(
    layers.brain,
    {
      id: "cerebrum-r",
      name: "Right hemisphere",
      layer: "brain",
      anchor: v3(-4.2, 8.6, -4),
      info: "The right hemisphere leads spatial attention, face recognition and the left side of the body.",
    },
    [hemi(-1)],
    [BRAIN_X, BRAIN_S],
  );
  const cerebellum = deform(new THREE.SphereGeometry(1, 40, 24), (p) => {
    p.multiplyScalar(1 + Math.sin(p.y * 40) * 0.02);
    p.set(p.x * 4.4, p.y * 1.9, p.z * 2.6);
    p.add(v3(0, -0.4, -10.4));
  });
  add(
    layers.brain,
    {
      id: "cerebellum",
      name: "Cerebellum",
      layer: "brain",
      anchor: v3(3.6, -1.2, -11),
      info: "Coordinates balance, posture and fine-tuned movement. It holds more than half of the brain's neurons.",
    },
    [cerebellum],
    [BRAIN_X, BRAIN_S],
  );
  const stem = tube([v3(0, 2.0, -6.2), v3(0, -1.0, -6.6), v3(0, -4.0, -6.0)], 0.75, 16);
  add(
    layers.brain,
    {
      id: "brainstem",
      name: "Brainstem",
      layer: "brain",
      anchor: v3(-1.5, -2.8, -6.2),
      info: "Connects brain to spinal cord and runs automatic functions such as breathing, heart rate and swallowing.",
    },
    [stem],
    [BRAIN_X, BRAIN_S],
  );

  // ───────────────────────── EYES ─────────────────────────
  const makeEye = (sx: number) => {
    const g = new THREE.Group();
    g.position.set(sx * 3.15, 2.62, 2.35);
    const ball = new THREE.SphereGeometry(1.2, 32, 24);
    const iris = new THREE.TorusGeometry(0.42, 0.12, 8, 28);
    iris.translate(0, 0, 1.14);
    const nerve = tube([v3(0, 0, -1.1), v3(-sx * 0.6, 0.1, -3.0), v3(-sx * 1.4, 0.4, -5.5)], 0.22, 12);
    const st = add(
      g,
      {
        id: sx > 0 ? "eye-l" : "eye-r",
        name: sx > 0 ? "Left eye" : "Right eye",
        layer: "eyes",
        anchor: v3(sx * 3.15, 4.4, 3.2),
        info: "About 2.4 cm across. Behind it, the optic nerve carries signals to the visual cortex at the back of the brain.",
      },
      [ball, iris, nerve],
      [EYE_X, EYE_S],
    );
    layers.eyes.add(g);
    return st.object.parent!;
  };
  const eyes = { left: makeEye(1), right: makeEye(-1) };

  // ───────────────────────── MUSCLES ─────────────────────────
  const muscle = (
    id: string,
    name: string,
    anchor: THREE.Vector3,
    info: string,
    geos: THREE.BufferGeometry[],
    parent: THREE.Object3D = layers.muscles,
  ) => add(parent, { id, name, layer: "muscles", anchor, info }, geos, [MUSCLE_X, MUSCLE_S]);

  const mirrored = (f: (sx: number) => THREE.BufferGeometry) => [f(-1), f(1)];

  muscle(
    "temporalis",
    "Temporalis",
    v3(7.6, 5.0, -3.5),
    "A fan-shaped chewing muscle on the side of the head. Clench your teeth and you can feel it at your temples.",
    mirrored((sx) => {
      const g = new THREE.SphereGeometry(1, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.55);
      g.scale(3.6, 0.6, 3.9); // pole (y) becomes the thin outward axis after rotation
      g.rotateZ(sx * -Math.PI / 2);
      g.translate(sx * 7.0, 3.2, -2.4); // over the temporal fossa (BodyParts3D-fitted)
      return g;
    }),
  );
  muscle(
    "masseter",
    "Masseter",
    v3(6.4, -4.2, 0.4),
    "Runs from cheekbone to jaw angle; for its size, one of the strongest muscles in the body. It closes the jaw when you chew.",
    mirrored((sx) => belly(v3(sx * 6.2, -0.6, 0.3), v3(sx * 5.0, -6.8, -2.6), 2.4, 1.0)), // zygomatic arch → jaw angle
  );
  muscle(
    "frontalis",
    "Frontalis",
    v3(0, 9.4, 5.2),
    "Raises the eyebrows and wrinkles the forehead. Driven live by your brow movement.",
    mirrored((sx) => belly(v3(sx * 2.4, 4.0, 4.9), v3(sx * 2.6, 10.0, 3.9), 3.4, 0.4)),
  );
  muscle(
    "zygomaticus",
    "Zygomaticus major",
    v3(4.6, -2.0, 4.6),
    "The smiling muscle: it pulls the mouth corners up and out. Smile to see it activate.",
    mirrored((sx) => belly(v3(sx * 4.9, 0.4, 3.2), v3(sx * 2.6, -4.2, 4.4), 0.9, 0.5)),
  );
  muscle(
    "orb-oculi",
    "Orbicularis oculi",
    v3(-5.4, 4.2, 3.8),
    "A ring of muscle around each eye that closes the eyelids. It's what you squint and blink with.",
    mirrored((sx) => {
      const t = new THREE.TorusGeometry(2.0, 0.35, 10, 36);
      t.scale(1.1, 0.95, 1);
      t.translate(sx * 3.07, 2.06, 3.5);
      return t;
    }),
  );
  muscle(
    "orb-oris",
    "Orbicularis oris",
    v3(-2.8, -5.6, 5.2),
    "The ring of muscle around the lips, used for puckering, kissing and speech.",
    [
      (() => {
        const t = new THREE.TorusGeometry(2.5, 0.42, 10, 40);
        t.scale(1, 0.62, 1);
        t.translate(0, -4.3, 4.8);
        return t;
      })(),
    ],
  );
  muscle(
    "scm",
    "Sternocleidomastoid",
    v3(-5.2, -11, -1.5),
    "Runs from behind the ear to the collarbone and breastbone, and turns and tilts the head.",
    mirrored((sx) => belly(v3(sx * 6.2, -2.6, -5.6), v3(sx * 1.6, -19.5, 1.0), 2.0, 1.4)),
  );

  return { root, fit, layers, jaw, jawRest: TMJ.clone(), eyes, structures, allMaterials };
}

/** Which blendshapes drive which muscles (0..1 activation). */
export function muscleActivations(bs: Record<string, number>): Record<string, number> {
  const g = (k: string) => bs[k] ?? 0;
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  return {
    frontalis: clamp((g("browInnerUp") + (g("browOuterUpLeft") + g("browOuterUpRight")) / 2) * 1.2),
    zygomaticus: clamp(((g("mouthSmileLeft") + g("mouthSmileRight")) / 2) * 1.4),
    "orb-oculi": clamp(((g("eyeSquintLeft") + g("eyeSquintRight") + g("eyeBlinkLeft") + g("eyeBlinkRight")) / 4) * 1.6),
    "orb-oris": clamp((g("mouthPucker") + g("mouthFunnel")) * 1.3),
    masseter: clamp(g("jawOpen") * 0.6 + (g("mouthPressLeft") + g("mouthPressRight")) * 0.6),
    temporalis: clamp(g("jawOpen") * 0.4 + (g("mouthPressLeft") + g("mouthPressRight")) * 0.5),
    scm: 0,
  };
}
