import type { TopicStep } from "../clinic/topics";

/**
 * Learn-mode lessons: short guided lessons with built-in checks.
 * Steps are either explanations (same shape as Clinic steps), "find it"
 * checks (point at a structure) or multiple-choice questions.
 */

export type ExplainStep = TopicStep & { kind?: "explain" };

export interface PointStep {
  kind: "point";
  title: string;
  /** Structure id the learner must point at. */
  target: string;
  /** Friendly name shown in the question. */
  targetName: string;
  hint: string;
  layers?: TopicStep["layers"];
  reveal?: TopicStep["reveal"];
  look?: TopicStep["look"];
}

export interface ChoiceStep {
  kind: "choice";
  title: string;
  question: string;
  options: string[];
  answer: number;
  /** Shown after answering. */
  explain: string;
  /** Structures to highlight while asking (optional). */
  highlight?: string[];
  layers?: TopicStep["layers"];
  reveal?: TopicStep["reveal"];
  look?: TopicStep["look"];
}

export type LessonStep = ExplainStep | PointStep | ChoiceStep;

export interface Lesson {
  id: string;
  title: string;
  level: "Beginner" | "Intermediate";
  minutes: number;
  summary: string;
  steps: LessonStep[];
}

export const isCheck = (s: LessonStep): s is PointStep | ChoiceStep => s.kind === "point" || s.kind === "choice";

const SKULL = { skull: true, brain: false, muscles: false, eyes: true, spine: false, body: false, outline: false };
const BRAIN = { skull: false, brain: true, muscles: false, eyes: false, spine: false, body: false, outline: false };
const FACE_MUSCLES = { skull: true, brain: false, muscles: true, eyes: true, spine: false, body: false, outline: false };

export const LESSONS: Lesson[] = [
  {
    id: "skull-101",
    title: "Bones of the skull",
    level: "Beginner",
    minutes: 4,
    summary: "The plates of the braincase and how they fit together.",
    steps: [
      {
        title: "A skull is many bones",
        text: "Your skull is made of 22 bones. Eight form the braincase (cranium) and fourteen form the face. Most are locked together by wavy joints called sutures.",
        highlight: ["frontal", "parietal", "temporal", "occipital"],
        layers: SKULL,
        reveal: "whole",
        look: "xray",
      },
      {
        title: "Frontal bone",
        text: "The frontal bone forms your forehead and the roofs of your eye sockets.",
        highlight: ["frontal"],
      },
      {
        title: "Parietal and occipital bones",
        text: "Two parietal bones form the top and sides of the head. The occipital bone forms the back and base, with a large opening for the spinal cord.",
        highlight: ["parietal", "occipital"],
      },
      {
        title: "Temporal bones",
        text: "The temporal bones sit at the sides, around your ears. They house the hearing organs and form the jaw joint.",
        highlight: ["temporal"],
      },
      { kind: "point", title: "Find it", target: "frontal", targetName: "frontal bone", hint: "It's the bone behind your forehead." },
      { kind: "point", title: "Find it", target: "temporal", targetName: "temporal bone", hint: "Look around the ear." },
      {
        kind: "choice",
        title: "Quick check",
        question: "Which bone has the opening the spinal cord passes through?",
        options: ["Frontal", "Parietal", "Occipital", "Temporal"],
        answer: 2,
        explain: "The occipital bone, at the back and base of the skull, has the foramen magnum.",
      },
    ],
  },
  {
    id: "face-jaw",
    title: "Face & jaw",
    level: "Beginner",
    minutes: 4,
    summary: "Cheekbones, upper and lower jaw, and the joint that lets you chew.",
    steps: [
      {
        title: "Cheekbones",
        text: "The zygomatic bones are your cheekbones. An arch runs back from each one toward the ear.",
        highlight: ["zygomatic"],
        layers: SKULL,
        reveal: "whole",
        look: "xray",
      },
      {
        title: "Upper jaw",
        text: "The maxilla holds your upper teeth, forms the hard palate and the floor of the eye sockets.",
        highlight: ["maxilla"],
      },
      {
        title: "Lower jaw",
        text: "The mandible is the only skull bone that moves. Try opening your mouth: the model follows.",
        highlight: ["mandible"],
        prompt: "Open and close your mouth slowly.",
      },
      { kind: "point", title: "Find it", target: "zygomatic", targetName: "cheekbone (zygomatic bone)", hint: "It's the bony point below the outer corner of your eye." },
      { kind: "point", title: "Find it", target: "mandible", targetName: "mandible", hint: "It's the bone that moves when you talk." },
      {
        kind: "choice",
        title: "Quick check",
        question: "Which bone holds your upper teeth?",
        options: ["Mandible", "Maxilla", "Zygomatic", "Nasal"],
        answer: 1,
        explain: "The maxilla holds the upper teeth; the mandible holds the lower ones.",
      },
    ],
  },
  {
    id: "brain-regions",
    title: "Regions of the brain",
    level: "Beginner",
    minutes: 5,
    summary: "The four lobes, the cerebellum and the brainstem, and what each does.",
    steps: [
      {
        title: "Four lobes",
        text: "Each side of the cerebrum has four lobes: frontal, parietal, temporal and occipital, named after the skull bones above them.",
        highlight: ["lobe-frontal", "lobe-parietal", "lobe-temporal", "lobe-occipital"],
        layers: BRAIN,
        reveal: "whole",
        look: "xray",
      },
      { title: "Frontal lobe", text: "Planning, decisions, personality and starting movement.", highlight: ["lobe-frontal"] },
      { title: "Parietal lobe", text: "Touch, temperature and knowing where your body is in space.", highlight: ["lobe-parietal"] },
      { title: "Temporal lobe", text: "Hearing, understanding language and forming memories.", highlight: ["lobe-temporal"] },
      { title: "Occipital lobe", text: "Vision. Signals from your eyes are processed here, at the back of your head.", highlight: ["lobe-occipital"] },
      {
        title: "Cerebellum and brainstem",
        text: "The cerebellum coordinates balance and smooth movement. The brainstem runs breathing and heart rate.",
        highlight: ["cerebellum", "brainstem"],
      },
      { kind: "point", title: "Find it", target: "lobe-occipital", targetName: "occipital lobe", hint: "It's at the very back of the brain." },
      {
        kind: "choice",
        title: "Quick check",
        question: "Which part of the brain mainly coordinates balance?",
        options: ["Frontal lobe", "Cerebellum", "Temporal lobe", "Brainstem"],
        answer: 1,
        explain: "The cerebellum, tucked under the back of the brain, fine-tunes balance and movement.",
      },
      {
        kind: "choice",
        title: "Quick check",
        question: "You hear your name called. Which lobe processes the sound first?",
        options: ["Occipital", "Parietal", "Temporal", "Frontal"],
        answer: 2,
        explain: "The primary auditory cortex sits in the temporal lobe, near the ears.",
      },
    ],
  },
  {
    id: "eye",
    title: "The eye and its muscles",
    level: "Beginner",
    minutes: 3,
    summary: "How the eye sits in its socket and how six muscles aim it.",
    steps: [
      {
        title: "The eyeball",
        text: "Each eye is about 2.4 cm across. The clear cornea at the front bends light; the lens behind it fine-tunes focus.",
        highlight: ["eye-l", "eye-r"],
        layers: FACE_MUSCLES,
        reveal: "whole",
        look: "xray",
      },
      {
        title: "Six muscles per eye",
        text: "Four rectus and two oblique muscles rotate each eye. Look around and watch the eyes follow your gaze.",
        highlight: ["extraocular"],
        prompt: "Look left, right, up and down.",
      },
      {
        title: "Closing the eye",
        text: "A ring-shaped muscle, the orbicularis oculi, closes the eyelids when you blink or squint.",
        highlight: ["orb-oculi"],
        prompt: "Squint gently.",
      },
      {
        kind: "choice",
        title: "Quick check",
        question: "How many muscles move each eyeball?",
        options: ["Two", "Four", "Six", "Eight"],
        answer: 2,
        explain: "Six: superior, inferior, medial and lateral rectus, plus superior and inferior oblique.",
      },
    ],
  },
  {
    id: "face-muscles",
    title: "Muscles of expression",
    level: "Intermediate",
    minutes: 4,
    summary: "The muscles you use to smile, frown and chew, with live activation.",
    steps: [
      {
        title: "Raising your eyebrows",
        text: "The frontalis lifts your eyebrows and wrinkles your forehead.",
        highlight: ["frontalis"],
        layers: FACE_MUSCLES,
        reveal: "whole",
        look: "xray",
        prompt: "Raise your eyebrows and watch it light up.",
      },
      {
        title: "Smiling",
        text: "The zygomaticus major pulls the corners of your mouth up and out toward the cheekbone.",
        highlight: ["zygomaticus"],
        prompt: "Smile!",
      },
      {
        title: "Puckering",
        text: "The orbicularis oris is the ring of muscle around your lips.",
        highlight: ["orb-oris"],
        prompt: "Pucker your lips.",
      },
      {
        title: "Chewing",
        text: "The masseter and temporalis close your jaw with a lot of force.",
        highlight: ["masseter", "temporalis"],
        prompt: "Clench your teeth gently.",
      },
      { kind: "point", title: "Find it", target: "zygomaticus", targetName: "smiling muscle (zygomaticus major)", hint: "It runs from the cheekbone to the corner of the mouth." },
      {
        kind: "choice",
        title: "Quick check",
        question: "Which muscle mainly closes your jaw when you chew?",
        options: ["Frontalis", "Masseter", "Orbicularis oris", "Zygomaticus"],
        answer: 1,
        explain: "The masseter, from cheekbone to jaw angle, is the main chewing muscle.",
      },
    ],
  },
  {
    id: "neck",
    title: "Neck & spine",
    level: "Intermediate",
    minutes: 3,
    summary: "The cervical vertebrae and the muscles that turn your head.",
    steps: [
      {
        title: "Cervical spine",
        text: "Seven vertebrae (C1–C7) form your neck, with cushioning discs between them.",
        highlight: ["cervical"],
        layers: { ...SKULL, spine: true, muscles: true },
        reveal: "whole",
        look: "xray",
      },
      {
        title: "Atlas and axis",
        text: "C1, the atlas, lets you nod 'yes'. C2, the axis, has a peg that lets you shake your head 'no'.",
        highlight: ["cervical"],
        prompt: "Nod, then shake your head slowly.",
      },
      {
        title: "Turning muscles",
        text: "Each sternocleidomastoid runs from behind the ear to the collarbone. Turning your head to one side uses the muscle on the opposite side.",
        highlight: ["scm"],
      },
      {
        title: "Throat support",
        text: "The small U-shaped hyoid bone anchors the tongue. It is the only bone that touches no other bone.",
        highlight: ["hyoid"],
      },
      { kind: "point", title: "Find it", target: "hyoid", targetName: "hyoid bone", hint: "It's in the front of the neck, under the jaw." },
      {
        kind: "choice",
        title: "Quick check",
        question: "Which vertebra lets you shake your head 'no'?",
        options: ["C1 (atlas)", "C2 (axis)", "C5", "C7"],
        answer: 1,
        explain: "The axis (C2) has a peg, the dens, that the atlas pivots around.",
      },
    ],
  },
];

/** Accumulated view settings for a lesson step (steps inherit from earlier ones). */
export function lessonView(lesson: Lesson, index: number) {
  let layers: Record<string, boolean> = {};
  let reveal: TopicStep["reveal"] | undefined;
  let look: TopicStep["look"] | undefined;
  for (let i = 0; i <= index; i++) {
    const s = lesson.steps[i];
    layers = { ...layers, ...(s.layers ?? {}) };
    reveal = s.reveal ?? reveal;
    look = s.look ?? look;
  }
  return { layers, reveal, look };
}
