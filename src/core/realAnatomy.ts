import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { Anatomy, LayerId, Structure } from "./anatomy";
import { createAnatomyMaterial, type AnatomyMaterial, type SharedUniforms } from "./materials";

/**
 * Real anatomy from BodyParts3D (CC BY-SA 2.1 JP), built by
 * scripts/build-anatomy.mjs into public/models/anatomy.glb, already in
 * canonical face space. Swapped in over the procedural placeholders when it
 * loads; if the file is missing the procedural models simply stay.
 */

interface Meta {
  name: string;
  layer: LayerId;
  info: string;
  /** Procedural structure(s) this replaces. */
  replaces?: string[];
}

const COLORS: Record<LayerId, [string, string]> = {
  skull: ["#bfe6ff", "#e9e1cf"],
  spine: ["#bfe6ff", "#e9e1cf"],
  brain: ["#ff9fd0", "#e8a3a8"],
  eyes: ["#9fffe0", "#f4f4f0"],
  muscles: ["#ff6a5a", "#b8423b"],
};

const META: Record<string, Meta> = {
  frontal: { name: "Frontal bone", layer: "skull", replaces: ["cranium"], info: "Forms the forehead and the roofs of the eye sockets. At birth it is two halves that fuse in early childhood." },
  parietal: { name: "Parietal bones", layer: "skull", info: "A pair of curved plates forming the top and upper sides of the skull, joined along the sagittal suture." },
  temporal: { name: "Temporal bones", layer: "skull", info: "House the inner and middle ear, and form the jaw joint with the mandible just in front of the ear canal." },
  occipital: { name: "Occipital bone", layer: "skull", info: "The back and base of the skull. The spinal cord passes through its large opening, the foramen magnum." },
  sphenoid: { name: "Sphenoid & ethmoid", layer: "skull", replaces: ["orbits"], info: "Butterfly-shaped bones deep in the skull that tie the cranium and face together and cradle the pituitary gland." },
  zygomatic: { name: "Zygomatic bones", layer: "skull", replaces: ["zygomatic"], info: "The cheekbones. Their arches anchor the masseter, the main chewing muscle." },
  maxilla: { name: "Maxilla & palate", layer: "skull", replaces: ["maxilla"], info: "The upper jaw and hard palate. It holds the upper teeth and forms the floor of the eye sockets and nasal cavity." },
  nasal: { name: "Nasal bones & cavity", layer: "skull", replaces: ["nasal"], info: "The bridge of the nose, the vomer and the scroll-shaped conchae that warm and humidify the air you breathe." },
  mandible: { name: "Mandible", layer: "skull", replaces: ["mandible"], info: "The lower jaw, the only movable bone of the skull. It hinges at the temporomandibular joints just in front of the ears." },
  hyoid: { name: "Hyoid bone", layer: "skull", info: "A U-shaped bone in the neck that touches no other bone. It anchors the tongue and helps you swallow." },
  cervical: { name: "Cervical spine", layer: "spine", replaces: ["cervical"], info: "Seven neck vertebrae (C1–C7) with discs between them. C1 (atlas) lets you nod; C2 (axis) lets you turn your head." },
  "lobe-frontal": { name: "Frontal lobe", layer: "brain", replaces: ["cerebrum-l", "cerebrum-r"], info: "Planning, decision-making, personality and voluntary movement. The precentral gyrus at its back is the primary motor cortex." },
  "lobe-parietal": { name: "Parietal lobe", layer: "brain", info: "Processes touch, temperature and pain, and builds your sense of where your body is in space." },
  "lobe-temporal": { name: "Temporal lobe", layer: "brain", info: "Hearing, language comprehension and recognising faces and objects." },
  "lobe-occipital": { name: "Occipital lobe", layer: "brain", info: "The visual cortex. Signals from your eyes end up here, at the back of the brain." },
  limbic: { name: "Limbic structures", layer: "brain", info: "The cingulate gyrus and hippocampus: involved in emotion, motivation and forming new memories." },
  insula: { name: "Insula", layer: "brain", info: "A hidden lobe folded deep inside, involved in taste, interoception (sensing your body's state) and emotion." },
  deep: { name: "Deep brain structures", layer: "brain", info: "The basal ganglia, internal capsule and hypothalamus. They relay signals, help control movement, and regulate hunger, temperature and hormones." },
  ventricles: { name: "Ventricles", layer: "brain", info: "Fluid-filled chambers that make and circulate cerebrospinal fluid, which cushions the brain." },
  cerebellum: { name: "Cerebellum", layer: "brain", replaces: ["cerebellum"], info: "Coordinates balance, posture and fine-tuned movement. It holds more than half of the brain's neurons." },
  brainstem: { name: "Brainstem", layer: "brain", replaces: ["brainstem"], info: "Midbrain, pons and medulla. It connects brain to spinal cord and runs breathing, heart rate and swallowing." },
  "eye-l": { name: "Left eye", layer: "eyes", replaces: ["eye-l"], info: "About 2.4 cm across: sclera, cornea, iris and lens. The optic nerve carries its signals to the occipital lobe." },
  "eye-r": { name: "Right eye", layer: "eyes", replaces: ["eye-r"], info: "About 2.4 cm across: sclera, cornea, iris and lens. The optic nerve carries its signals to the occipital lobe." },
  extraocular: { name: "Eye muscles", layer: "muscles", info: "Six muscles per eye (four rectus, two oblique) plus the eyelid lifter. They aim both eyes together with remarkable precision." },
  scm: { name: "Sternocleidomastoid", layer: "muscles", replaces: ["scm"], info: "Runs from behind the ear to the collarbone and breastbone, and turns and tilts the head." },
};

export interface RealAnatomyResult {
  replaced: number;
  added: number;
}

/** Loads the glb and swaps real meshes into the anatomy rig. */
export async function loadRealAnatomy(
  anatomy: Anatomy,
  shared: SharedUniforms,
  url = `${import.meta.env.BASE_URL}models/anatomy.glb`,
): Promise<RealAnatomyResult | null> {
  const head = await fetch(url, { method: "HEAD" }).catch(() => null);
  if (!head?.ok || !(head.headers.get("content-type") ?? "").match(/gltf|octet|model/)) return null;

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const meshes = new Map<string, THREE.BufferGeometry>();
  gltf.scene.updateMatrixWorld(true); // meshopt quantisation stores scale/offset on nodes
  gltf.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      // de-quantise into plain float positions so we can recentre/re-pivot freely
      const g = (o as THREE.Mesh).geometry.clone();
      const p = g.attributes.position;
      if (p.normalized || !(p.array instanceof Float32Array)) {
        const f = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) f.set([p.getX(i), p.getY(i), p.getZ(i)], i * 3);
        g.setAttribute("position", new THREE.BufferAttribute(f, 3));
      }
      g.applyMatrix4(o.matrixWorld);
      g.computeVertexNormals();
      meshes.set(o.name, g);
    }
  });

  let replaced = 0;
  let added = 0;
  const remove = (id: string) => {
    const i = anatomy.structures.findIndex((s) => s.id === id);
    if (i < 0) return;
    const st = anatomy.structures[i];
    st.object.parent?.remove(st.object);
    st.materials.forEach((m) => {
      const k = anatomy.allMaterials.indexOf(m);
      if (k >= 0) anatomy.allMaterials.splice(k, 1);
      m.dispose();
    });
    anatomy.structures.splice(i, 1);
    replaced++;
  };

  for (const [id, meta] of Object.entries(META)) {
    const geo = meshes.get(id);
    if (!geo) continue;
    meta.replaces?.forEach(remove);

    const [xc, sc] = COLORS[meta.layer];
    const mat: AnatomyMaterial = createAnatomyMaterial(shared, xc, sc);
    anatomy.allMaterials.push(mat);
    geo.computeBoundingBox();
    const centre = geo.boundingBox!.getCenter(new THREE.Vector3());
    let parent: THREE.Object3D = anatomy.layers[meta.layer];
    let anchor = centre.clone();

    if (id === "mandible") {
      // re-pivot the jaw on the condyles (top-most, back-most mandible points)
      const pivot = condylePivot(geo);
      anatomy.jaw.position.copy(pivot);
      anatomy.jawRest.copy(pivot);
      geo.translate(-pivot.x, -pivot.y, -pivot.z);
      parent = anatomy.jaw;
      anchor = new THREE.Vector3(centre.x, geo.boundingBox!.min.y + pivot.y + 0.4, geo.boundingBox!.max.z + pivot.z - 0.6);
    } else if (id === "eye-l" || id === "eye-r") {
      const eye = id === "eye-l" ? anatomy.eyes.left : anatomy.eyes.right;
      eye.position.copy(centre);
      geo.translate(-centre.x, -centre.y, -centre.z);
      parent = eye;
      anchor = centre.clone().add(new THREE.Vector3(0, 1.6, 0.5));
    }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = id;
    const obj = new THREE.Group();
    obj.name = id;
    obj.add(mesh);
    parent.add(obj);
    const st: Structure = { id, name: meta.name, layer: meta.layer, anchor, info: meta.info, materials: [mat], object: obj };
    anatomy.structures.push(st);
    added++;
  }
  return { replaced, added };
}

function condylePivot(geo: THREE.BufferGeometry): THREE.Vector3 {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  let maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) maxY = Math.max(maxY, pos.getY(i));
  const p = new THREE.Vector3();
  const acc = new THREE.Vector3();
  let n = 0;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    if (p.y > maxY - 0.6) {
      acc.add(p);
      n++;
    }
  }
  acc.divideScalar(Math.max(n, 1));
  return new THREE.Vector3(0, acc.y - 0.3, acc.z);
}
