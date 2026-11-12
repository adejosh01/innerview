import type { EngineSettings, RevealMode, ToggleId } from "../core/engine";
import type { LookMode } from "../core/materials";

/**
 * Clinic-mode walkthroughs: patient-education explanations a clinician can
 * step through while the patient sees their own reflection.
 *
 * Wording rule: these describe general anatomy and how things usually work.
 * They never diagnose, assess the person on screen, or recommend treatment.
 * Keep it that way, because that's what keeps this mode non-regulated.
 */

export interface TopicStep {
  title: string;
  /** Patient-facing caption: plain language, 1–3 sentences. */
  text: string;
  /** Structure ids to highlight (missing ids are ignored). */
  highlight: string[];
  layers?: Partial<Record<ToggleId, boolean>>;
  reveal?: RevealMode;
  look?: LookMode;
  /** Optional prompt for the patient, e.g. "Open your mouth slowly". */
  prompt?: string;
}

export interface Topic {
  id: string;
  title: string;
  /** Who typically uses it. */
  audience: string;
  summary: string;
  steps: TopicStep[];
}

const HEAD_ONLY: Partial<Record<ToggleId, boolean>> = { body: false, outline: false };

export const TOPICS: Topic[] = [
  {
    id: "tmj",
    title: "Jaw joint (TMJ)",
    audience: "Dental · ENT · Physio",
    summary: "How the jaw hinges and slides, and the muscles that move it.",
    steps: [
      {
        title: "Your lower jaw",
        text: "This is the mandible, the only bone in your skull that moves. It hangs from the skull at two joints, one in front of each ear.",
        highlight: ["mandible"],
        layers: { ...HEAD_ONLY, skull: true, muscles: false, brain: false, eyes: true, spine: false },
        reveal: "whole",
        look: "xray",
      },
      {
        title: "The joint in front of your ear",
        text: "Each temporomandibular joint (TMJ) sits where the mandible meets the temporal bone. A small disc of cartilage between them cushions the movement.",
        highlight: ["mandible", "temporal"],
        reveal: "lower",
      },
      {
        title: "Hinge and slide",
        text: "When you open wide, the jaw first rotates like a hinge, then slides forward. Watch the model move with you.",
        highlight: ["mandible"],
        prompt: "Open your mouth slowly, then close.",
      },
      {
        title: "The chewing muscles",
        text: "The masseter (cheek) and temporalis (temple) close the jaw. They are among the strongest muscles in the body for their size.",
        highlight: ["masseter", "temporalis"],
        layers: { muscles: true },
        reveal: "whole",
        prompt: "Gently clench your teeth: you can feel both muscles tighten.",
      },
    ],
  },
  {
    id: "bruxism",
    title: "Teeth grinding & clenching",
    audience: "Dental",
    summary: "Which muscles do the work when teeth clench or grind.",
    steps: [
      {
        title: "Upper and lower jaw",
        text: "Your upper teeth sit in the maxilla, which doesn't move. Your lower teeth sit in the mandible, which does.",
        highlight: ["maxilla", "mandible"],
        layers: { ...HEAD_ONLY, skull: true, muscles: true, brain: false, eyes: true, spine: false },
        reveal: "lower",
        look: "xray",
      },
      {
        title: "The muscles that clench",
        text: "Clenching and grinding are powered mainly by the masseter and temporalis. Working them for long periods, often during sleep, can leave them feeling tired or tight.",
        highlight: ["masseter", "temporalis"],
        prompt: "Clench gently and watch them light up.",
      },
      {
        title: "Where tension is felt",
        text: "Because the temporalis spreads across the side of the head, tension in it is often felt at the temples.",
        highlight: ["temporalis", "temporal"],
        reveal: "whole",
      },
    ],
  },
  {
    id: "sinuses",
    title: "Sinuses & nasal passages",
    audience: "ENT · GP",
    summary: "Where the air-filled sinuses sit inside the facial bones.",
    steps: [
      {
        title: "The nasal cavity",
        text: "Air enters through the nasal cavity, where scroll-shaped bones called conchae warm and moisten it.",
        highlight: ["nasal"],
        layers: { ...HEAD_ONLY, skull: true, muscles: false, brain: false, eyes: true, spine: false },
        reveal: "whole",
        look: "xray",
      },
      {
        title: "Maxillary sinuses",
        text: "The largest sinuses are hollow spaces inside the maxilla, under the cheeks and just above the upper back teeth.",
        highlight: ["maxilla"],
      },
      {
        title: "Frontal sinuses",
        text: "The frontal sinuses sit in the frontal bone, just above the eyebrows.",
        highlight: ["frontal"],
      },
      {
        title: "Deep sinuses",
        text: "The ethmoid and sphenoid sinuses lie deeper, between and behind the eyes. All the sinuses drain into the nasal cavity through small openings.",
        highlight: ["sphenoid", "nasal"],
      },
    ],
  },
  {
    id: "headache",
    title: "Tension headache: muscles",
    audience: "GP · Physio",
    summary: "Head and neck muscles commonly involved in tension.",
    steps: [
      {
        title: "Forehead",
        text: "The frontalis muscle raises your eyebrows and wrinkles your forehead.",
        highlight: ["frontalis"],
        layers: { ...HEAD_ONLY, skull: true, muscles: true, brain: false, eyes: true, spine: true },
        reveal: "whole",
        look: "xray",
        prompt: "Raise your eyebrows.",
      },
      {
        title: "Temples",
        text: "The temporalis covers the side of the head. It works whenever you chew or clench.",
        highlight: ["temporalis"],
      },
      {
        title: "Neck",
        text: "The sternocleidomastoid runs from behind the ear to the collarbone. It turns and tilts your head, and sits alongside the neck vertebrae.",
        highlight: ["scm", "cervical"],
        prompt: "Turn your head slowly to one side.",
      },
    ],
  },
  {
    id: "brain",
    title: "Brain basics",
    audience: "GP · Neuro · Education",
    summary: "The main regions of the brain and how the skull protects them.",
    steps: [
      {
        title: "Protected by the skull",
        text: "The brain sits inside the cranium, cushioned by a layer of fluid.",
        highlight: ["frontal", "parietal", "occipital", "temporal"],
        layers: { ...HEAD_ONLY, skull: true, brain: true, muscles: false, eyes: false, spine: false },
        reveal: "whole",
        look: "xray",
      },
      {
        title: "Frontal lobe",
        text: "Behind your forehead: planning, decision-making, personality and starting voluntary movement.",
        highlight: ["lobe-frontal"],
        layers: { skull: false },
      },
      {
        title: "Parietal & temporal lobes",
        text: "The parietal lobe handles touch and body position. The temporal lobe, near the ears, handles hearing, language and memory.",
        highlight: ["lobe-parietal", "lobe-temporal"],
      },
      {
        title: "Occipital lobe & cerebellum",
        text: "At the back, the occipital lobe processes vision. Below it, the cerebellum coordinates balance and smooth movement.",
        highlight: ["lobe-occipital", "cerebellum"],
      },
      {
        title: "Brainstem & fluid spaces",
        text: "The brainstem runs automatic functions like breathing and heart rate. The ventricles make the fluid that cushions the brain.",
        highlight: ["brainstem", "ventricles"],
      },
    ],
  },
  {
    id: "eyes",
    title: "Eye movement",
    audience: "Optometry · Neuro",
    summary: "How six small muscles aim each eye.",
    steps: [
      {
        title: "The eyeball",
        text: "Each eye is about 2.4 cm across, protected inside a bony socket called the orbit.",
        highlight: ["eye-l", "eye-r"],
        layers: { ...HEAD_ONLY, skull: true, eyes: true, muscles: true, brain: false, spine: false },
        reveal: "whole",
        look: "xray",
      },
      {
        title: "Six muscles per eye",
        text: "Four straight (rectus) and two angled (oblique) muscles rotate the eye up, down and side to side. Both eyes move together with great precision.",
        highlight: ["extraocular"],
        prompt: "Look left, then right, then up.",
      },
      {
        title: "Blinking and squinting",
        text: "The orbicularis oculi is the ring of muscle around each eye that closes the eyelids.",
        highlight: ["orb-oculi"],
        prompt: "Blink slowly, then squint.",
      },
    ],
  },
  {
    id: "neck",
    title: "Neck & posture",
    audience: "Physio · Chiro · GP",
    summary: "The neck vertebrae and the muscles that hold the head up.",
    steps: [
      {
        title: "Seven neck vertebrae",
        text: "Your neck has seven vertebrae (C1–C7) with cushioning discs between them. Together they carry a head that weighs about 5 kg.",
        highlight: ["cervical"],
        layers: { ...HEAD_ONLY, skull: true, spine: true, muscles: true, brain: false, eyes: false },
        reveal: "whole",
        look: "xray",
      },
      {
        title: "Nodding and turning",
        text: "The top vertebra (atlas) lets you nod; the second (axis) lets you turn your head.",
        highlight: ["cervical"],
        prompt: "Nod slowly, then turn side to side.",
      },
      {
        title: "Muscles that hold the head",
        text: "The sternocleidomastoid on each side turns and tilts the head. When the head drifts forward, neck muscles work harder to hold it up.",
        highlight: ["scm", "cervical"],
      },
      {
        title: "Shoulders and spine",
        text: "Step back to see how the neck continues into the spine, shoulders and rib cage.",
        highlight: [],
        layers: { body: true },
        prompt: "Step back so your shoulders are in view.",
      },
    ],
  },
];

/** Apply a step on top of the current settings (steps inherit from earlier steps). */
export function settingsForStep(current: EngineSettings, topic: Topic, stepIndex: number): Partial<EngineSettings> {
  const layers = { ...current.layers };
  let reveal = current.reveal;
  let look = current.look;
  for (let i = 0; i <= stepIndex; i++) {
    const st = topic.steps[i];
    Object.assign(layers, st.layers ?? {});
    reveal = st.reveal ?? reveal;
    look = st.look ?? look;
  }
  return { layers, reveal, look, labels: false };
}
