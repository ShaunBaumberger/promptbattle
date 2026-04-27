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
      className="fixed inset-0 flex flex-col gap-2 overflow-hidden bg-background p-3"
    >
      <header className="flex shrink-0 items-center justify-between">
        <Badge variant="secondary">{ROUND_LABELS[match.round]}</Badge>
        <p
          className={`font-mono text-2xl font-bold ${
            showSeconds <= 10 ? "text-destructive" : "text-foreground"
          }`}
          aria-live="polite"
        >
          {showSeconds}s
        </p>
      </header>

      {match.task_text ? (
        <div className="bg-muted/40 flex shrink-0 flex-col gap-1 rounded-md border p-3">
          <p className="text-muted-foreground text-xs uppercase tracking-widest">
            Generiere ein Bild von:
          </p>
          <p className="text-foreground text-base font-medium leading-snug break-words [overflow-wrap:anywhere]">
            {match.task_text}
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={openExpanded}
          disabled={!match.task_reference_url}
          className="bg-muted relative flex h-[40%] min-h-0 shrink items-center justify-center overflow-hidden rounded-md border"
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
              <span className="bg-foreground/70 text-background pointer-events-none absolute bottom-1 right-1 rounded px-2 py-0.5 text-xs font-medium">
                Tippen zum Vergrößern
              </span>
            </>
          ) : (
            <div className="bg-muted h-full w-full animate-pulse" />
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
        className="mt-auto h-24 shrink-0 resize-none overflow-y-auto text-base [field-sizing:fixed]"
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
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <Badge variant="secondary">{ROUND_LABELS[round]}</Badge>
      <div className="flex flex-col items-center gap-3">
        <div className="border-foreground/20 border-t-foreground h-12 w-12 animate-spin rounded-full border-4" />
        <p className="text-foreground text-xl font-semibold">
          Bilder werden generiert…
        </p>
        <p className="text-muted-foreground text-sm">
          Schau auf die Bühne, gleich gibt&apos;s das Reveal.
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
    <main className="flex flex-1 flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <Badge variant="secondary">{ROUND_LABELS[round]}</Badge>
        <p className="text-muted-foreground text-sm">vs. {opponentName}</p>
      </header>
      {didWin === true && (
        <div className="rounded-md border-2 border-green-500/60 bg-green-500/10 p-3 text-center">
          <p className="text-2xl font-bold">🏆 Gewonnen!</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Du bist eine Runde weiter. Bleib in der App.
          </p>
        </div>
      )}
      {didWin === false && (
        <div className="border-destructive/40 bg-destructive/10 rounded-md border-2 p-3 text-center">
          <p className="text-2xl font-bold">Knapp daneben.</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Du bist raus. Schau das Finale auf der Bühne.
          </p>
        </div>
      )}
      <p className="text-muted-foreground text-xs uppercase tracking-widest">
        Dein Ergebnis
      </p>
      {resultUrl ? (
        <div className="bg-muted relative aspect-square w-full overflow-hidden rounded-md border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resultUrl}
            alt="Dein generiertes Bild"
            className="h-full w-full object-contain"
          />
        </div>
      ) : (
        <div className="bg-muted text-muted-foreground flex aspect-square w-full items-center justify-center rounded-md border text-sm italic">
          Bildgenerierung fehlgeschlagen
        </div>
      )}
      <div className="bg-muted/40 rounded-md border p-3">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          Dein Prompt
        </p>
        <p className="text-foreground mt-1 whitespace-pre-wrap break-words text-base">
          {prompt || <span className="text-muted-foreground italic">(leer)</span>}
        </p>
      </div>
      {didWin === null && (
        <p className="text-muted-foreground text-center text-sm">
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
