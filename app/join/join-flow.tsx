"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinTournamentAction, type JoinState } from "./actions";
import { participantStorageKey } from "@/lib/participant-storage";

const initial: JoinState = { status: "idle" };

interface Props {
  tournamentName: string;
  tournamentCode: string;
}

export function JoinFlow({ tournamentName, tournamentCode }: Props) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [state, formAction, pending] = useActionState(joinTournamentAction, initial);

  useEffect(() => {
    const existing = window.localStorage.getItem(participantStorageKey(tournamentCode));
    if (existing) {
      router.replace(`/play/${tournamentCode}`);
      return;
    }
    setChecking(false);
  }, [tournamentCode, router]);

  useEffect(() => {
    if (state.status === "ok") {
      window.localStorage.setItem(participantStorageKey(state.tournamentCode), state.participantId);
      router.replace(`/play/${state.tournamentCode}`);
    }
  }, [state, router]);

  if (checking) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p className="text-white/40 text-sm">Lade…</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-10 duration-500 animate-in fade-in slide-in-from-bottom-4">
        <div className="space-y-2 text-center">
          <h1 className="text-white text-4xl font-semibold tracking-tight">
            {tournamentName}
          </h1>
        </div>

        <form action={formAction} className="flex flex-col gap-5">
          <input type="hidden" name="code" value={tournamentCode} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="name" className="text-white/70 text-sm font-medium">
              Dein Name (für alle Spieler sichtbar)
            </Label>
            <Input
              id="name"
              name="name"
              required
              maxLength={40}
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="words"
              spellCheck={false}
              className="bg-white/5 text-white placeholder:text-white/30 focus-visible:bg-white/10 focus-visible:border-white/30 h-14 rounded-2xl border-white/10 px-4 text-lg backdrop-blur"
            />
          </div>
          {state.status === "error" && (
            <p
              className="text-rose-400 text-sm font-medium"
              role="alert"
            >
              {state.error}
            </p>
          )}
          <Button
            type="submit"
            disabled={pending || state.status === "ok"}
            className="bg-white text-black hover:bg-white/90 active:scale-[0.98] h-14 rounded-2xl text-base font-semibold transition-transform"
          >
            {pending || state.status === "ok" ? "Trete bei…" : "Beitreten"}
          </Button>
        </form>
      </div>
    </main>
  );
}
