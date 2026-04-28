"use client";

import { useEffect, useMemo, useState } from "react";
import { StageAudio, type Cue } from "@/lib/stage-audio";

/**
 * React wrapper around StageAudio. Returns a stable instance plus an
 * `enabled` flag the UI can use to render the "Audio aktivieren" gate.
 *
 * Persists the enabled flag in localStorage so reloads don't bug the host
 * — though the audio context still needs an actual user gesture to resume,
 * we re-enable on the first click thereafter.
 */
const STORAGE_KEY = "pb:stage-audio-enabled";

export function useStageAudio() {
  const audio = useMemo(() => new StageAudio(), []);
  const [enabled, setEnabled] = useState(false);

  // Sync into the audio engine if the user previously enabled.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const prev = window.localStorage.getItem(STORAGE_KEY);
    if (prev === "1") setEnabled(true);
  }, []);

  const enable = async () => {
    await audio.enable();
    setEnabled(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "1");
    }
  };

  const play = (cue: Cue) => {
    if (!enabled) return;
    // Auto-recover if browser suspended the context (tab inactive, etc.).
    if (!audio.isEnabled()) {
      audio.enable().then(() => audio.play(cue));
      return;
    }
    audio.play(cue);
  };

  return { enabled, enable, play };
}
