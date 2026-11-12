import { useCallback, useState } from "react";
import { isCheck, LESSONS, type Lesson } from "./lessons";

/** Per-lesson progress, kept only in this browser (nothing leaves the device). */
export interface LessonProgress {
  /** Furthest step reached (index). */
  reached: number;
  /** Results of checks by step index: true = correct first try. */
  checks: Record<number, boolean>;
  completed: boolean;
}

type ProgressMap = Record<string, LessonProgress>;
const KEY = "innerview:learn:v1";

function load(): ProgressMap {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as ProgressMap;
  } catch {
    return {};
  }
}
function save(p: ProgressMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: progress won't persist */
  }
}

export const emptyProgress = (): LessonProgress => ({ reached: 0, checks: {}, completed: false });

export function lessonScore(lesson: Lesson, p: LessonProgress | undefined) {
  const total = lesson.steps.filter(isCheck).length;
  const correct = Object.values(p?.checks ?? {}).filter(Boolean).length;
  return { correct, total };
}

export function lessonPercent(lesson: Lesson, p: LessonProgress | undefined): number {
  if (!p) return 0;
  if (p.completed) return 100;
  return Math.round(((p.reached + 1) / lesson.steps.length) * 100);
}

export function useLearnProgress() {
  const [progress, setProgress] = useState<ProgressMap>(load);

  const update = useCallback((id: string, fn: (p: LessonProgress) => LessonProgress) => {
    setProgress((all) => {
      const next = { ...all, [id]: fn(all[id] ?? emptyProgress()) };
      save(next);
      return next;
    });
  }, []);

  const reach = useCallback(
    (id: string, step: number) => update(id, (p) => ({ ...p, reached: Math.max(p.reached, step) })),
    [update],
  );
  /** Only the first attempt counts toward the score. */
  const recordCheck = useCallback(
    (id: string, step: number, correct: boolean) =>
      update(id, (p) => (step in p.checks ? p : { ...p, checks: { ...p.checks, [step]: correct } })),
    [update],
  );
  const complete = useCallback((id: string) => update(id, (p) => ({ ...p, completed: true })), [update]);
  const reset = useCallback(() => {
    setProgress({});
    save({});
  }, []);

  const overall = Math.round(LESSONS.reduce((n, l) => n + lessonPercent(l, progress[l.id]), 0) / LESSONS.length);
  const nextLesson = LESSONS.find((l) => !progress[l.id]?.completed) ?? null;

  return { progress, reach, recordCheck, complete, reset, overall, nextLesson };
}

export type LearnProgress = ReturnType<typeof useLearnProgress>;
