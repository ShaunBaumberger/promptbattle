"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ROUND_LABELS } from "@/lib/rounds";
import type { Match } from "@/lib/types/database";
import { lockMatchAction } from "@/app/admin/[id]/match-actions";
import { generateMatchImagesAction } from "@/app/admin/[id]/generation-actions";
import { updatePromptAction } from "./prompt-actions";

interface Props {
  match: Match;
  participantId: string;
  opponentName: string;
}

const FLUSH_INTERVAL_MS = 500;

export function MatchPlay({ match, participantId, opponentName }: Props) {
  const isPlayerA = match.player_a_id === participantId;
  const initialPrompt = isPlayerA ? match.prompt_a : match.prompt_b;
  const ownPrompt = isPlayerA ? match.prompt_a : match.prompt_b;
  const ownResultUrl = isPlayerA ? match.result_a_url : match.result_b_url;
  const didWin =
    match.status === "done" && match.winner_id != null
      ? match.winner_id === participantId
      : null;

  // Non-typing states get their own simpler views.
  if (
    match.status === "reveal" ||
    match.status === "voting" ||
    match.status === "done"
  ) {
    return (
      <ResultView
        round={match.round}
        prompt={ownPrompt}
        resultUrl={ownResultUrl}
        opponentName={opponentName}
        didWin={didWin}
      />
    );
  }
  if (match.status === "locked" || match.status === "generating") {
    return <GeneratingView round={match.round} />;
  }

  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const [remaining, setRemaining] = useState(() => calcRemaining(match.end_time));
  const [locked, setLocked] = useState(match.status !== "live");
  const [expanded, setExpanded] = useState(false);

  const latestRef = useRef(prompt);
  latestRef.current = prompt;
  const lastSentRef = useRef(initialPrompt ?? "");
  const lockCalledRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Lock the layout to the visible viewport (the area not covered by the
  // keyboard). Without this, focusing the textarea on iOS scrolls the
  // reference image off-screen because the keyboard overlays the page.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const vv = window.visualViewport;
    const apply = () => {
      const h = vv?.height ?? window.innerHeight;
      el.style.height = `${h}px`;
      // Offset for iOS: visualViewport.offsetTop > 0 when the page scrolls.
      el.style.transform = vv ? `translateY(${vv.offsetTop}px)` : "";
    };
    apply();
    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    return () => {
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
    };
  }, []);

  // Auto-open the keyboard on Android Chrome (iOS often blocks programmatic
  // focus without a user gesture, but it's harmless to try).
  useEffect(() => {
    if (locked) return;
    const id = window.setTimeout(() => textareaRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [locked]);

  // Periodic flush of typed prompt to server.
  useEffect(() => {
    if (locked) return;
    const id = setInterval(() => {
      if (latestRef.current === lastSentRef.current) return;
      const value = latestRef.current;
      lastSentRef.current = value;
      updatePromptAction(match.id, participantId, value).catch(() => {
        // swallow — next tick retries
      });
    }, FLUSH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [match.id, participantId, locked]);

  // Countdown + auto-lock at expiry.
  useEffect(() => {
    if (locked) return;
    const tick = () => {
      const r = calcRemaining(match.end_time);
      setRemaining(r);
      if (r <= 0 && !lockCalledRef.current) {
        lockCalledRef.current = true;
        const value = latestRef.current;
        if (value !== lastSentRef.current) {
          lastSentRef.current = value;
          updatePromptAction(match.id, participantId, value).catch(() => {});
        }
        const fd = new FormData();
        lockMatchAction(match.id, {}, fd).catch(() => {});
        setLocked(true);
      }
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [match.id, match.end_time, participantId, locked]);

  // React to status pushed by server.
  useEffect(() => {
    if (match.status !== "live") setLocked(true);
  }, [match.status]);

  // Auto-close the zoom modal when the match locks.
  useEffect(() => {
    if (locked) setExpanded(false);
  }, [locked]);

  // Backup auto-fire of image generation. The server action is atomic
  // (locked → generating) so it's safe if multiple clients race.
  // Key by start_time too, otherwise a replay/kill-switch with the same
  // match.id wouldn't re-fire generation.
  const generationFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (match.status !== "locked") return;
    const key = `${match.id}:${match.start_time ?? ""}`;
    if (generationFiredRef.current === key) return;
    generationFiredRef.current = key;
    generateMatchImagesAction(match.id).catch(() => {});
  }, [match.id, match.status, match.start_time]);

  const openExpanded = () => {
    // Drop keyboard before showing the full-screen overlay.
    textareaRef.current?.blur();
    setExpanded(true);
  };

  const closeExpanded = () => {
    // iOS only opens the keyboard if focus() runs synchronously inside the
    // user-gesture handler AND the target is already visible. flushSync
    // unmounts the overlay synchronously so the textarea is paintable before
    // we focus it — without this, the keyboard stays closed.
    flushSync(() => setExpanded(false));
    if (!locked) {
      textareaRef.current?.focus();
    }
  };

  const showSeconds = Math.max(0, Math.ceil(remaining));

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 flex flex-col gap-3 overflow-hidden bg-background p-4"
    >
      <header className="flex shrink-0 items-center justify-between">
        <span className="bg-white/10 text-white/80 inline-flex items-center rounded-full border border-white/10 px-3 py-1 text-xs font-medium uppercase tracking-widest backdrop-blur">
          {ROUND_LABELS[match.round]}
        </span>
        <p
          className={`tabular-nums text-3xl font-semibold tracking-tight transition-colors ${
            showSeconds <= 10 ? "text-rose-400" : "text-white"
          }`}
          aria-live="polite"
        >
          {showSeconds}s
        </p>
      </header>

      {match.task_text ? (
        <div className="bg-white/5 flex shrink-0 flex-col gap-1.5 rounded-2xl border border-white/10 p-4 backdrop-blur">
          <p className="text-white/40 text-xs uppercase tracking-widest">
            Generiere ein Bild von:
          </p>
          <p className="text-white text-lg font-medium leading-snug break-words [overflow-wrap:anywhere]">
            {match.task_text}
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={openExpanded}
          disabled={!match.task_reference_url}
          className="bg-white/5 relative flex h-[40%] min-h-0 shrink items-center justify-center overflow-hidden rounded-2xl border border-white/10 backdrop-blur"
          aria-label="Referenzbild vergrößern"
        >
          {match.task_reference_url ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={match.task_reference_url}
                alt="Referenzbild"
                className="max-h-full max-w-full object-contain"
              />
              <span className="bg-black/70 text-white/90 pointer-events-none absolute bottom-2 right-2 rounded-full border border-white/10 px-3 py-1 text-[11px] font-medium backdrop-blur">
                Tippen zum Vergrößern
              </span>
            </>
          ) : (
            <div className="bg-white/5 h-full w-full animate-pulse" />
          )}
        </button>
      )}

      <Textarea
        ref={textareaRef}
        autoFocus
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Beschreibe das Bild so präzise wie möglich…"
        disabled={locked}
        className="bg-white/5 text-white placeholder:text-white/30 focus-visible:bg-white/10 focus-visible:border-white/30 mt-auto h-24 shrink-0 resize-none overflow-y-auto rounded-2xl border-white/10 px-4 py-3 text-base backdrop-blur [field-sizing:fixed]"
      />

      {expanded && match.task_reference_url && (
        <button
          type="button"
          onClick={closeExpanded}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/95 p-4"
          aria-label="Vergrößerung schließen"
        >
          <header className="flex w-full shrink-0 items-center justify-between text-white">
            <span className="text-sm uppercase tracking-widest opacity-70">
              Tippen zum Schließen
            </span>
            <span
              className={`font-mono text-xl font-bold ${
                showSeconds <= 10 ? "text-destructive" : "text-white"
              }`}
            >
              {showSeconds}s
            </span>
          </header>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={match.task_reference_url}
            alt="Referenzbild (vergrößert)"
            className="min-h-0 max-h-full w-auto max-w-full flex-1 object-contain"
          />
        </button>
      )}
    </div>
  );
}

function GeneratingView({ round }: { round: Match["round"] }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-6 text-center duration-500 animate-in fade-in">
      <span className="bg-white/10 text-white/80 inline-flex items-center rounded-full border border-white/10 px-3 py-1 text-xs font-medium uppercase tracking-widest backdrop-blur">
        {ROUND_LABELS[round]}
      </span>
      <div className="flex flex-col items-center gap-5">
        <div className="border-white/15 border-t-sky-400 h-14 w-14 animate-spin rounded-full border-4" />
        <p className="text-white text-2xl font-semibold tracking-tight">
          Bilder werden generiert
        </p>
        <p className="text-white/50 max-w-xs text-sm leading-relaxed">
          Schau auf die Bühne — gleich gibt&apos;s das Reveal.
        </p>
      </div>
    </main>
  );
}

function ResultView({
  round,
  prompt,
  resultUrl,
  opponentName,
  didWin,
}: {
  round: Match["round"];
  prompt: string;
  resultUrl: string | null;
  opponentName: string;
  didWin: boolean | null;
}) {
  return (
    <main className="flex flex-1 flex-col gap-4 p-4 duration-500 animate-in fade-in">
      <header className="flex items-center justify-between">
        <span className="bg-white/10 text-white/80 inline-flex items-center rounded-full border border-white/10 px-3 py-1 text-xs font-medium uppercase tracking-widest backdrop-blur">
          {ROUND_LABELS[round]}
        </span>
        <p className="text-white/50 text-sm">vs. {opponentName}</p>
      </header>

      {didWin === true && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-center backdrop-blur duration-700 animate-in zoom-in-95">
          <p className="text-white text-3xl font-semibold tracking-tight">
            🏆 Gewonnen
          </p>
          <p className="text-white/60 mt-1 text-sm">
            Du bist eine Runde weiter. Bleib in der App.
          </p>
        </div>
      )}
      {didWin === false && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-center backdrop-blur duration-500 animate-in fade-in">
          <p className="text-white text-3xl font-semibold tracking-tight">
            Knapp daneben.
          </p>
          <p className="text-white/60 mt-1 text-sm">
            Du bist raus. Schau das Finale auf der Bühne.
          </p>
        </div>
      )}

      <p className="text-white/40 text-xs uppercase tracking-widest">
        Dein Ergebnis
      </p>
      {resultUrl ? (
        <div className="bg-white/5 relative aspect-square w-full overflow-hidden rounded-2xl border border-white/10 backdrop-blur">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resultUrl}
            alt="Dein generiertes Bild"
            className="h-full w-full object-contain"
          />
        </div>
      ) : (
        <div className="bg-white/5 text-white/40 flex aspect-square w-full items-center justify-center rounded-2xl border border-white/10 text-sm italic backdrop-blur">
          Bildgenerierung fehlgeschlagen
        </div>
      )}

      <div className="bg-white/5 rounded-2xl border border-white/10 p-4 backdrop-blur">
        <p className="text-white/40 text-xs uppercase tracking-widest">
          Dein Prompt
        </p>
        <p className="text-white mt-1.5 whitespace-pre-wrap break-words text-base leading-relaxed">
          {prompt || <span className="text-white/40 italic">(leer)</span>}
        </p>
      </div>

      {didWin === null && (
        <p className="text-white/50 text-center text-sm">
          Das Voting läuft auf der Bühne.
        </p>
      )}
    </main>
  );
}

function calcRemaining(endTime: string | null): number {
  if (!endTime) return 0;
  const end = new Date(endTime).getTime();
  const now = Date.now();
  return Math.max(0, (end - now) / 1000);
}
