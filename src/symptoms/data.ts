import type { ToggleId } from "../core/engine";

/** Body areas the intake offers; tapping a structure on the reflection also picks one. */
export interface Area {
  id: string;
  label: string;
  /** Structures highlighted while this area is selected. */
  structures: string[];
  layers: Partial<Record<ToggleId, boolean>>;
}

const HEAD = { skull: true, brain: false, muscles: true, eyes: true, spine: true, body: false, outline: false };

export const AREAS: Area[] = [
  { id: "head", label: "Head / headache", structures: ["frontal", "parietal", "temporal", "occipital", "temporalis", "frontalis"], layers: HEAD },
  { id: "jaw", label: "Jaw / teeth", structures: ["mandible", "maxilla", "masseter", "temporalis"], layers: HEAD },
  { id: "face", label: "Face / sinuses", structures: ["maxilla", "nasal", "zygomatic", "frontal"], layers: HEAD },
  { id: "eyes", label: "Eyes / vision", structures: ["eye-l", "eye-r", "extraocular", "orb-oculi"], layers: HEAD },
  { id: "ears", label: "Ears / balance", structures: ["temporal", "cerebellum"], layers: { ...HEAD, brain: true } },
  { id: "neck", label: "Neck / throat", structures: ["cervical", "scm", "hyoid"], layers: HEAD },
  { id: "shoulders", label: "Shoulders / arms / hands", structures: ["clavicles", "scapulae", "humerus", "forearm", "hands"], layers: { ...HEAD, body: true, hands: true } },
  { id: "back", label: "Back", structures: ["spine", "scapulae", "cervical", "pelvis"], layers: { ...HEAD, body: true } },
  { id: "chest", label: "Chest / breathing", structures: ["ribs", "sternum"], layers: { ...HEAD, body: true } },
  { id: "tummy", label: "Stomach / abdomen", structures: ["pelvis", "spine"], layers: { ...HEAD, body: true } },
  { id: "hips", label: "Hips / legs / feet", structures: ["pelvis", "femur", "tibia", "feet"], layers: { ...HEAD, body: true } },
  { id: "other", label: "Somewhere else / whole body", structures: [], layers: HEAD },
];

/** Map a tapped structure to the most sensible intake area. */
export function areaForStructure(id: string): Area | undefined {
  const map: Record<string, string> = {
    frontal: "head", parietal: "head", occipital: "head", temporal: "head", "lobe-frontal": "head", "lobe-parietal": "head",
    "lobe-temporal": "head", "lobe-occipital": "head", limbic: "head", insula: "head", deep: "head", ventricles: "head",
    brainstem: "head", cerebellum: "ears", temporalis: "jaw", frontalis: "head",
    mandible: "jaw", masseter: "jaw", "orb-oris": "jaw",
    maxilla: "face", nasal: "face", zygomatic: "face", sphenoid: "face", zygomaticus: "face",
    "eye-l": "eyes", "eye-r": "eyes", extraocular: "eyes", "orb-oculi": "eyes",
    cervical: "neck", scm: "neck", hyoid: "neck",
    clavicles: "shoulders", scapulae: "shoulders", humerus: "shoulders", forearm: "shoulders", hands: "shoulders",
    ribs: "chest", sternum: "chest", spine: "back", pelvis: "hips", femur: "hips", tibia: "hips", feet: "hips",
  };
  return AREAS.find((a) => a.id === map[id]);
}

export const DURATIONS = ["less than a day", "1-3 days", "4-7 days", "1-4 weeks", "1-3 months", "more than 3 months"] as const;
export const AGES = ["under 12", "12-17", "18-29", "30-44", "45-64", "65+", "prefer not to say"] as const;
export const SEXES = ["female", "male", "intersex", "prefer not to say"] as const;

/**
 * Warning signs that need emergency care. Ticking any of these shows urgent
 * guidance immediately, without waiting for (or needing) the AI.
 */
export const RED_FLAGS = [
  "Chest pain, pressure or tightness",
  "Severe trouble breathing",
  "Face drooping, arm or leg weakness, or slurred speech",
  "Sudden, severe 'worst ever' headache",
  "Headache with fever and a stiff neck",
  "Fainting, seizure or confusion",
  "Sudden loss of vision or double vision",
  "Head injury with vomiting, drowsiness or blacking out",
  "Heavy bleeding that won't stop",
  "Thoughts of harming yourself or others",
] as const;

export type Urgency = "emergency" | "urgent" | "soon" | "routine" | "self_care";

export const URGENCY: Record<Urgency, { label: string; action: string; tone: "danger" | "warning" | "brand" | "success" }> = {
  emergency: { label: "Get emergency help now", action: "Call your local emergency number (for example 911, 112 or 999) or go to the nearest emergency department.", tone: "danger" },
  urgent: { label: "Get seen today", action: "Contact an urgent care clinic, your doctor's same-day line, or an out-of-hours service today.", tone: "warning" },
  soon: { label: "Book an appointment soon", action: "Arrange to see a doctor or other clinician within the next few days.", tone: "brand" },
  routine: { label: "Mention it at a routine visit", action: "Bring it up at your next regular appointment, sooner if it changes.", tone: "brand" },
  self_care: { label: "Usually fine to manage at home", action: "Look after yourself and watch for the warning signs below.", tone: "success" },
};

export interface SymptomResult {
  urgency: Urgency;
  urgency_reason: string;
  recap: string;
  possible_causes: { name: string; how_common: "common" | "less_common" | "rare"; why_it_fits: string; what_a_doctor_may_check: string }[];
  related_structures: string[];
  self_care: string[];
  seek_help_if: string[];
  questions_for_doctor: string[];
  doctor_summary: string;
  needs_more_info: string[];
}

export interface Intake {
  area: string;
  description: string;
  duration: string;
  severity: number;
  age: string;
  sex: string;
  redFlags: string[];
  consent: boolean;
}

export const emptyIntake = (): Intake => ({
  area: "",
  description: "",
  duration: "",
  severity: 4,
  age: "",
  sex: "",
  redFlags: [],
  consent: false,
});

/** Plain-text note to bring to an appointment (works with or without the AI). */
export function doctorNote(intake: Intake, result?: SymptomResult | null): string {
  const area = AREAS.find((a) => a.id === intake.area)?.label ?? "not given";
  const lines = [
    "Symptom summary (prepared with Innerview, for discussion with a clinician)",
    `Date: ${new Date().toLocaleString()}`,
    "",
    `Area: ${area}`,
    `How long: ${intake.duration || "not given"}`,
    `Severity (0-10): ${intake.severity}`,
    `Age range: ${intake.age || "not given"}   Sex at birth: ${intake.sex || "not given"}`,
    `Warning signs ticked: ${intake.redFlags.length ? intake.redFlags.join("; ") : "none"}`,
    "",
    "In my own words:",
    intake.description.trim(),
  ];
  if (result) {
    lines.push("", "Summary:", result.doctor_summary);
    if (result.questions_for_doctor.length) lines.push("", "Questions I'd like to ask:", ...result.questions_for_doctor.map((q) => `- ${q}`));
  }
  lines.push("", "This is not a diagnosis. It was generated from my own description to help me explain my symptoms.");
  return lines.join("\n");
}
