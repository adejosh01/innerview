import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_FIT,
  DEFAULT_SETTINGS,
  XrayEngine,
  type EngineSettings,
  type FitSettings,
  type FrameInfo,
  type ToggleId,
} from "../core/engine";

const STORAGE_KEY = "innerview:settings:v1";
const LEGACY_STORAGE_KEY = "scan-ai:settings:v1";

function loadSettings(): EngineSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const saved = JSON.parse(raw) as Partial<EngineSettings>;
    return {
      ...structuredClone(DEFAULT_SETTINGS),
      ...saved,
      layers: { ...DEFAULT_SETTINGS.layers, ...saved.layers },
      fit: { ...DEFAULT_FIT, ...saved.fit },
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

function saveSettings(s: EngineSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable (private mode etc.): settings just won't persist */
  }
}

export type AutoFitState = { status: "idle" } | { status: "running"; progress: number } | { status: "done" };

/**
 * Bridges the framework-agnostic XrayEngine into React. Settings live in React
 * state and are pushed to the engine; per-frame info is throttled to ~10 Hz.
 */
export function useEngine() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<XrayEngine | null>(null);
  const [settings, setSettings] = useState<EngineSettings>(loadSettings);
  const [frame, setFrame] = useState<FrameInfo | null>(null);
  const [running, setRunning] = useState(false);
  const [demo, setDemo] = useState(false);
  const [autoFit, setAutoFit] = useState<AutoFitState>({ status: "idle" });
  const lastFrameUpdate = useRef(0);
  const frameListeners = useRef(new Set<(f: FrameInfo) => void>());

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const engine = new XrayEngine(
      el,
      {
        onFrame: (f) => {
          frameListeners.current.forEach((fn) => fn(f));
          const now = performance.now();
          if (now - lastFrameUpdate.current > 100) {
            lastFrameUpdate.current = now;
            setFrame(f);
          }
        },
        onAutoFitProgress: (p) => setAutoFit({ status: "running", progress: p }),
        onAutoFitDone: (fit) => {
          setAutoFit({ status: "done" });
          setSettings((s) => ({ ...s, fit }));
        },
      },
      loadSettings(),
    );
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.update(structuredClone(settings));
    saveSettings(settings);
  }, [settings]);

  const start = useCallback(async () => {
    await engineRef.current!.start();
    setDemo(false);
    setRunning(true);
  }, []);

  /** Stop camera/demo and return to the start screen. */
  const stop = useCallback(() => {
    engineRef.current?.stop();
    setDemo(false);
    setRunning(false);
    setFrame(null);
  }, []);

  const startDemo = useCallback(() => {
    engineRef.current!.startDemo();
    setDemo(true);
    setRunning(true);
  }, []);

  const patch = useCallback((p: Partial<EngineSettings>) => setSettings((s) => ({ ...s, ...p })), []);
  const patchFit = useCallback((p: Partial<FitSettings>) => setSettings((s) => ({ ...s, fit: { ...s.fit, ...p } })), []);
  const setLayer = useCallback(
    (id: ToggleId, on: boolean) => setSettings((s) => ({ ...s, layers: { ...s.layers, [id]: on } })),
    [],
  );
  const startAutoFit = useCallback(() => {
    setAutoFit({ status: "running", progress: 0 });
    engineRef.current?.startAutoFit();
  }, []);

  /** Subscribe to every frame (unthrottled) — for things like quiz dwell timing. */
  const onEveryFrame = useCallback((fn: (f: FrameInfo) => void) => {
    frameListeners.current.add(fn);
    return () => void frameListeners.current.delete(fn);
  }, []);

  return {
    containerRef,
    engine: engineRef,
    settings,
    patch,
    patchFit,
    setLayer,
    frame,
    running,
    demo,
    start,
    stop,
    startDemo,
    autoFit,
    startAutoFit,
    onEveryFrame,
  };
}

export type EngineHandle = ReturnType<typeof useEngine>;
