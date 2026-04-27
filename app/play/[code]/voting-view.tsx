"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
    <main className="flex flex-1 flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <Badge variant="secondary">{ROUND_LABELS[match.round]}</Badge>
        <Badge variant="default">Voting läuft</Badge>
      </header>

      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Wer hat besser geprompt?</h1>
        <p className="text-muted-foreground text-sm">
          Tippe auf das Bild, das deiner Meinung nach gewinnen soll.
        </p>
        {match.task_text && (
          <p className="text-muted-foreground pt-1 text-xs">
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
        <p className="text-muted-foreground text-center text-sm">
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
      className={`flex flex-col gap-2 overflow-hidden rounded-md border-2 p-2 text-left transition-all ${
        selected
          ? "border-foreground bg-foreground/5 ring-foreground ring-2"
          : "border-border bg-card hover:border-foreground/40"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold">{name}</span>
        {selected && <Badge variant="default">Deine Wahl</Badge>}
      </div>
      {resultUrl ? (
        <div className="bg-muted relative aspect-square w-full overflow-hidden rounded-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resultUrl}
            alt={`Ergebnis von ${name}`}
            className="h-full w-full object-contain"
          />
        </div>
      ) : (
        <div className="bg-muted text-muted-foreground flex aspect-square w-full items-center justify-center rounded-md text-sm italic">
          Keine Bildgenerierung
        </div>
      )}
    </button>
  );
}
