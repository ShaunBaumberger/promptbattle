"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PlayerCount, TournamentStatus } from "@/lib/types/database";
import { updatePlayerCountAction, updateRoundTimeAction } from "./actions";

interface Props {
  tournamentId: string;
  initialPlayerCount: PlayerCount;
  initialRoundTime: number;
  status: TournamentStatus;
}

const PLAYER_COUNT_OPTIONS: Array<{ value: PlayerCount; label: string }> = [
  { value: 2, label: "2 Spieler – Test-Modus" },
  { value: 4, label: "4 Spieler" },
  { value: 8, label: "8 Spieler" },
  { value: 16, label: "16 Spieler" },
  { value: 32, label: "32 Spieler" },
];

export function TournamentSettings({
  tournamentId,
  initialPlayerCount,
  initialRoundTime,
  status,
}: Props) {
  const [playerCount, setPlayerCount] = useState<PlayerCount>(initialPlayerCount);
  const [roundTime, setRoundTime] = useState<number>(initialRoundTime);
  const [pcPending, startPcTransition] = useTransition();
  const [rtPending, startRtTransition] = useTransition();

  const playerCountLocked = status !== "setup";

  const savePlayerCount = (next: PlayerCount) => {
    const previous = playerCount;
    setPlayerCount(next);
    startPcTransition(async () => {
      const result = await updatePlayerCountAction(tournamentId, next);
      if (result.error) {
        toast.error(result.error);
        setPlayerCount(previous);
      } else {
        toast.success("Spieleranzahl aktualisiert.");
      }
    });
  };

  const saveRoundTime = () => {
    if (roundTime === initialRoundTime) return;
    startRtTransition(async () => {
      const result = await updateRoundTimeAction(tournamentId, roundTime);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Rundenzeit aktualisiert.");
      }
    });
  };

  return (
    <div className="space-y-4 rounded-md border p-4">
      <h2 className="text-base font-semibold">Einstellungen</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="player_count_setting">Spieleranzahl</Label>
          <select
            id="player_count_setting"
            value={playerCount}
            onChange={(e) => savePlayerCount(Number(e.target.value) as PlayerCount)}
            disabled={playerCountLocked || pcPending}
            className="border-input bg-background h-9 rounded-md border px-3 text-sm disabled:opacity-60"
          >
            {PLAYER_COUNT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">
            {playerCountLocked
              ? "Der Bracket läuft bereits — die Spieleranzahl ist gesperrt."
              : "Kann bis zum Tournament-Start geändert werden."}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="round_time_setting">Rundenzeit (Sekunden)</Label>
          <div className="flex gap-2">
            <Input
              id="round_time_setting"
              type="number"
              min={10}
              max={600}
              value={roundTime}
              onChange={(e) => setRoundTime(Number(e.target.value))}
              className="w-28"
            />
            <Button
              type="button"
              size="sm"
              onClick={saveRoundTime}
              disabled={rtPending || roundTime === initialRoundTime}
            >
              {rtPending ? "Speichert…" : "Speichern"}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Gilt für alle Matches, die nach der Änderung gestartet werden.
          </p>
        </div>
      </div>
    </div>
  );
}
