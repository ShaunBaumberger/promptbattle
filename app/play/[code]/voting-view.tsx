"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { Match } from "@/lib/types/database";
import { castVoteAction } from "@/app/admin/[id]/voting-actions";
import { useI18n, interpolate } from "@/lib/i18n/context";

interface Props {
  match: Match;
  participantId: string;
  aName: string;
  bName: string;
}

export function VotingView({ match, participantId, aName, bName }: Props) {
  const { dict } = useI18n();
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
          interpolate(dict.vote.voteCastFor, {
            name: choice === "A" ? aName : bName,
          }),
        );
      }
    });
  };

  return (
    <main className="flex flex-1 flex-col gap-5 p-4 duration-500 animate-in fade-in slide-in-from-bottom-2">
      <header className="flex items-center justify-between">
        <span className="bg-white/10 text-white/80 inline-flex items-center rounded-full border border-white/10 px-3 py-1 text-xs font-medium uppercase tracking-widest backdrop-blur">
          {dict.rounds[match.round]}
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-pb-violet/50 bg-pb-violet/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-pb-violet-soft backdrop-blur">
          <span className="bg-pb-violet-soft inline-block h-1.5 w-1.5 animate-pulse rounded-full" />
          {dict.vote.votingLive}
        </span>
      </header>

      <div className="space-y-1.5 text-center">
        <h1 className="font-display text-white text-2xl font-black tracking-tight uppercase text-balance">
          {dict.vote.whoPromptedBetter}
        </h1>
        <p className="text-white/60 text-sm">{dict.vote.tapImageToWin}</p>
        {match.task_text && (
          <p className="text-white/40 pt-2 text-xs">
            {interpolate(dict.vote.taskLabel, { task: match.task_text })}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <VoteCard
          name={aName}
          side="A"
          resultUrl={match.result_a_url}
          selected={voted === "A"}
          disabled={pending}
          onClick={() => cast("A")}
        />
        <VoteCard
          name={bName}
          side="B"
          resultUrl={match.result_b_url}
          selected={voted === "B"}
          disabled={pending}
          onClick={() => cast("B")}
        />
      </div>

      {voted && (
        <p className="text-white/50 text-center text-sm">
          {dict.vote.canChangeVote}
        </p>
      )}
    </main>
  );
}

const SIDE_STYLE = {
  A: {
    dot: "bg-pb-green",
    selected: "border-pb-green bg-pb-green/10 ring-2 ring-pb-green ring-offset-2 ring-offset-background shadow-[0_0_40px_rgba(53,237,126,0.25)]",
    chip: "bg-pb-green text-black",
  },
  B: {
    dot: "bg-pb-magenta",
    selected: "border-pb-magenta bg-pb-magenta/10 ring-2 ring-pb-magenta ring-offset-2 ring-offset-background shadow-[0_0_40px_rgba(236,72,189,0.25)]",
    chip: "bg-pb-magenta text-white",
  },
} as const;

function VoteCard({
  name,
  side,
  resultUrl,
  selected,
  disabled,
  onClick,
}: {
  name: string;
  side: "A" | "B";
  resultUrl: string | null;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const { dict } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group flex flex-col gap-3 overflow-hidden rounded-3xl border p-3 text-left backdrop-blur transition-all active:scale-[0.985] ${
        selected ? SIDE_STYLE[side].selected : "border-white/10 bg-white/5 hover:bg-white/10"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <div className="flex items-center justify-between px-1">
        <span className="flex items-center gap-2 text-white text-lg font-semibold">
          <span className={`inline-block size-2.5 rounded-full ${SIDE_STYLE[side].dot}`} aria-hidden />
          {name}
        </span>
        {selected && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${SIDE_STYLE[side].chip}`}>
            {dict.vote.yourChoice}
          </span>
        )}
      </div>
      {resultUrl ? (
        <div className="bg-white/5 relative aspect-square w-full overflow-hidden rounded-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resultUrl}
            alt={interpolate(dict.vote.resultOf, { name })}
            className="h-full w-full object-contain"
          />
        </div>
      ) : (
        <div className="bg-white/5 text-white/40 flex aspect-square w-full items-center justify-center rounded-2xl text-sm italic">
          {dict.vote.noImage}
        </div>
      )}
    </button>
  );
}
