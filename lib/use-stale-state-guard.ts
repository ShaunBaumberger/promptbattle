"use client";

import { useEffect, useRef } from "react";

/**
 * Safety net for stale UI state when Supabase realtime misses an event
 * (network blips, suspended tabs on phones, dropped websockets after
 * sleep, etc.). Runs `refetch`:
 *
 *   * whenever the document transitions from hidden → visible (catches
 *     phones unlocking, tab switching back, etc.)
 *   * every `intervalMs` while the document is visible (background poll
 *     while the user is actively looking)
 *
 * Realtime stays the primary update path — this just guarantees the UI
 * converges on the truth even if a few events are dropped.
 */
export function useStaleStateGuard(
  refetch: () => void | Promise<void>,
  intervalMs: number = 10_000,
) {
  // Keep the latest refetch in a ref so the effect doesn't tear down on
  // every render just because the callback identity changed.
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    if (typeof document === "undefined") return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (intervalId != null) return;
      intervalId = setInterval(() => refetchRef.current(), intervalMs);
    };
    const stopPolling = () => {
      if (intervalId == null) return;
      clearInterval(intervalId);
      intervalId = null;
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        // Tab just came back into focus — refetch immediately, then resume
        // the regular poll.
        refetchRef.current();
        startPolling();
      } else {
        // Don't burn cycles polling while hidden — the visibility handler
        // will catch us up when we come back.
        stopPolling();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    if (document.visibilityState === "visible") startPolling();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      stopPolling();
    };
  }, [intervalMs]);
}
