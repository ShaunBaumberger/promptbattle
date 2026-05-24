"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PlayerCount, Round, TournamentStatus } from "@/lib/types/database";
import { getRoundsForPlayerCount } from "@/lib/rounds";
import {
  updatePlayerCountAction,
  updateRoundTimeAction,
  updateRoundTimeOverrideAction,
} from "./actions";

interface Props {
  tournamentId: string;
  initialPlayerCount: PlayerCount;
  initialRoundTime: number;
  initialRoundTimeOverrides: Partial<Record<Round, number>>;
  status: TournamentStatus;
}

const PLAYER_COUNT_OPTIONS: Array<{ value: PlayerCount; label: string }> = [
  { value: 2, label: "2 Spieler" },
  { value: 4, label: "4 Spieler" },
  { value: 8, label: "8 Spieler" },
  { value: 16, label: "16 Spieler" },
  { value: 32, label: "32 Spieler" },
];

export function TournamentSettings({
  tournamentId,
  initialPlayerCount,
  initialRoundTime,
  initialRoundTimeOverrides,
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
              : "Kann bis zum Turnier-Start geändert werden."}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="round_time_setting">
            Standard-Rundenzeit (Sekunden)
          </Label>
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
            Greift für jede Runde, die unten keinen eigenen Wert hat.
          </p>
        </div>
      </div>

      <RoundTimeOverrides
        tournamentId={tournamentId}
        playerCount={playerCount}
        defaultSeconds={roundTime}
        initial={initialRoundTimeOverrides}
      />
    </div>
  );
}

/**
 * Per-round timer overrides — one input per round in the active bracket.
 * Empty input = no override (fall back to the tournament default).
 * Saved individually so a single round can be tweaked without disturbing
 * the others (e.g. dial up only the FINAL).
 */
function RoundTimeOverrides({
  tournamentId,
  playerCount,
  defaultSeconds,
  initial,
}: {
  tournamentId: string;
  playerCount: PlayerCount;
  defaultSeconds: number;
  initial: Partial<Record<Round, number>>;
}) {
  const rounds = useMemo(
    () => getRoundsForPlayerCount(playerCount),
    [playerCount],
  );
  return (
    <div className="space-y-3 rounded-md border border-dashed p-3">
      <div>
        <h3 className="text-sm font-semibold">Rundenzeit pro Runde</h3>
        <p className="text-muted-foreground text-xs">
          Optional. Leer lassen = Standard ({defaultSeconds}s) wird verwendet.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {rounds.map((spec) => (
          <RoundOverrideInput
            key={spec.round}
            tournamentId={tournamentId}
            round={spec.round}
            label={spec.label}
            initial={initial[spec.round] ?? null}
            placeholder={defaultSeconds}
          />
        ))}
      </div>
    </div>
  );
}

function RoundOverrideInput({
  tournamentId,
  round,
  label,
  initial,
  placeholder,
}: {
  tournamentId: string;
  round: Round;
  label: string;
  initial: number | null;
  placeholder: number;
}) {
  const [value, setValue] = useState<string>(initial != null ? String(initial) : "");
  const [pending, startTransition] = useTransition();
  const lastSaved = initial != null ? String(initial) : "";
  const dirty = value.trim() !== lastSaved;

  const save = () => {
    const trimmed = value.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (next !== null && (!Number.isFinite(next) || next < 10 || next > 600)) {
      toast.error("Rundenzeit muss zwischen 10 und 600 Sekunden liegen.");
      return;
    }
    startTransition(async () => {
      const result = await updateRoundTimeOverrideAction(tournamentId, round, next);
      if (result.error) toast.error(result.error);
      else toast.success(`${label}: ${next === null ? "Standard" : `${next}s`}`);
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={`round_time_${round}`} className="text-xs">
        {label}
      </Label>
      <div className="flex gap-2">
        <Input
          id={`round_time_${round}`}
          type="number"
          min={10}
          max={600}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`${placeholder}`}
          className="w-24"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={save}
          disabled={pending || !dirty}
        >
          {pending ? "…" : "OK"}
        </Button>
      </div>
    </div>
  );
}
