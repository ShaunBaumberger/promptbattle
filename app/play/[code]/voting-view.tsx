"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ROUND_LABELS } from "@/lib/rounds";
import type { Match } from "@/lib/types/database";
import { castVoteAction } from "@/app/admin/[id]/voting-actions";

interface Props {
  match: Match;
  participantId: string;
  aName: string;
  bName: string;
}

export function VotingView({ match, participantId, aName, bName }: Props) {
  const [voted, setVoted] = useState<"A" | "B" | null>(null);
  const [pending, startTransition] = useTransition();

  const cast = (choice: "A" | "B") => {
    startTransition(async () => {
      const result = await castVoteAction(match.id, participantId, choice);
      if (result.error) {
        toast.error(result.error);
      } else {
        setVoted(choice);
        toast.success(
          `Stimme abgegeben für ${choice === "A" ? aName : bName}.`,
        );
      }
    });
  };

  return (
    <main className="flex flex-1 flex-col gap-5 p-4 duration-500 animate-in fade-in slide-in-from-bottom-2">
      <header className="flex items-center justify-between">
        <span className="bg-white/10 text-white/80 inline-flex items-center rounded-full border border-white/10 px-3 py-1 text-xs font-medium uppercase tracking-widest backdrop-blur">
          {ROUND_LABELS[match.round]}
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/40 bg-sky-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-sky-300 backdrop-blur">
          <span className="bg-sky-400 inline-block h-1.5 w-1.5 animate-pulse rounded-full" />
          Voting läuft
        </span>
      </header>

      <div className="space-y-1.5 text-center">
        <h1 className="text-white text-3xl font-semibold tracking-tight">
          Wer hat besser gepromptet?
        </h1>
        <p className="text-white/60 text-sm">
          Tippe auf das Bild, das deiner Meinung nach gewinnen soll.
        </p>
        {match.task_text && (
          <p className="text-white/40 pt-2 text-xs">
            Aufgabe: „{match.task_text}"
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <VoteCard
          name={aName}
          resultUrl={match.result_a_url}
          selected={voted === "A"}
          disabled={pending}
          onClick={() => cast("A")}
        />
        <VoteCard
          name={bName}
          resultUrl={match.result_b_url}
          selected={voted === "B"}
          disabled={pending}
          onClick={() => cast("B")}
        />
      </div>

      {voted && (
        <p className="text-white/50 text-center text-sm">
          Du kannst deine Stimme bis zum Voting-Ende ändern.
        </p>
      )}
    </main>
  );
}

function VoteCard({
  name,
  resultUrl,
  selected,
  disabled,
  onClick,
}: {
  name: string;
  resultUrl: string | null;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group flex flex-col gap-3 overflow-hidden rounded-3xl border p-3 text-left backdrop-blur transition-all active:scale-[0.985] ${
        selected
          ? "border-sky-400 bg-sky-400/10 ring-2 ring-sky-400 ring-offset-2 ring-offset-background shadow-[0_0_40px_rgba(56,189,248,0.25)]"
          : "border-white/10 bg-white/5 hover:bg-white/10"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-white text-lg font-semibold">{name}</span>
        {selected && (
          <span className="rounded-full bg-sky-400 px-2.5 py-0.5 text-xs font-semibold text-black">
            Deine Wahl
          </span>
        )}
      </div>
      {resultUrl ? (
        <div className="bg-white/5 relative aspect-square w-full overflow-hidden rounded-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resultUrl}
            alt={`Ergebnis von ${name}`}
            className="h-full w-full object-contain"
          />
        </div>
      ) : (
        <div className="bg-white/5 text-white/40 flex aspect-square w-full items-center justify-center rounded-2xl text-sm italic">
          Keine Bildgenerierung
        </div>
      )}
    </button>
  );
}
