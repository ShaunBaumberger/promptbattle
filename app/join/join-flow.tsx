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
        <p className="text-muted-foreground text-sm">Lade…</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <p className="text-muted-foreground text-sm uppercase tracking-wide">
            Beitritt zum Tournament
          </p>
          <h1 className="text-2xl font-bold tracking-tight">{tournamentName}</h1>
          <p className="text-muted-foreground text-xs">
            Code: <span className="font-mono">{tournamentCode}</span>
          </p>
        </div>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="code" value={tournamentCode} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Dein Name</Label>
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
            />
          </div>
          {state.status === "error" && (
            <p className="text-destructive text-sm" role="alert">
              {state.error}
            </p>
          )}
          <Button type="submit" disabled={pending || state.status === "ok"}>
            {pending || state.status === "ok" ? "Beitreten…" : "Beitreten"}
          </Button>
        </form>
      </div>
    </main>
  );
}
