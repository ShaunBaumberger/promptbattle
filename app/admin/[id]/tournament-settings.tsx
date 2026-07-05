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
import { setSkipGenerationAction } from "./match-actions";
import { useI18n, interpolate } from "@/lib/i18n/context";

interface Props {
  tournamentId: string;
  initialPlayerCount: PlayerCount;
  initialRoundTime: number;
  initialRoundTimeOverrides: Partial<Record<Round, number>>;
  initialSkipGeneration: boolean;
  status: TournamentStatus;
  /** Largest bracket the tournament's plan allows (free 8 / premium 32).
   *  Bigger options render disabled with a premium tag; the server
   *  enforces the same limit. */
  maxPlayers: PlayerCount;
}

const PLAYER_COUNT_VALUES: PlayerCount[] = [2, 4, 8, 16, 32];

export function TournamentSettings({
  tournamentId,
  initialPlayerCount,
  initialRoundTime,
  initialRoundTimeOverrides,
  initialSkipGeneration,
  status,
  maxPlayers,
}: Props) {
  const { dict } = useI18n();
  const [playerCount, setPlayerCount] = useState<PlayerCount>(initialPlayerCount);
  const [roundTime, setRoundTime] = useState<number>(initialRoundTime);
  const [skipGeneration, setSkipGeneration] = useState<boolean>(initialSkipGeneration);
  const [pcPending, startPcTransition] = useTransition();
  const [rtPending, startRtTransition] = useTransition();
  const [modePending, startModeTransition] = useTransition();

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
        toast.success(dict.admin.playerCountUpdated);
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
        toast.success(dict.admin.roundTimeUpdated);
      }
    });
  };

  const setMode = (mode: "test" | "live") => {
    const wantSkip = mode === "test";
    if (wantSkip === skipGeneration) return; // no-op if already in this mode
    const previous = skipGeneration;
    setSkipGeneration(wantSkip);
    startModeTransition(async () => {
      const result = await setSkipGenerationAction(tournamentId, wantSkip);
      if (result.error) {
        toast.error(result.error);
        setSkipGeneration(previous); // rollback optimistic update
      } else {
        toast.success(
          wantSkip ? dict.admin.testModeActive : dict.admin.liveModeActive,
        );
      }
    });
  };

  return (
    <div className="space-y-4 rounded-md border p-4">
      <h2 className="text-base font-semibold">{dict.admin.settings}</h2>

      <div className="flex flex-col gap-2">
        <Label>{dict.admin.mode}</Label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={skipGeneration ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("test")}
            disabled={modePending}
          >
            {dict.admin.testModeBtn}
          </Button>
          <Button
            type="button"
            variant={!skipGeneration ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("live")}
            disabled={modePending}
          >
            {dict.admin.liveModeBtn}
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          {skipGeneration ? dict.admin.testModeDesc : dict.admin.liveModeDesc}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="player_count_setting">{dict.admin.playerCount}</Label>
          <select
            id="player_count_setting"
            value={playerCount}
            onChange={(e) => savePlayerCount(Number(e.target.value) as PlayerCount)}
            disabled={playerCountLocked || pcPending}
            className="border-input bg-background h-9 rounded-md border px-3 text-sm disabled:opacity-60"
          >
            {PLAYER_COUNT_VALUES.map((value) => (
              <option key={value} value={value} disabled={value > maxPlayers}>
                {interpolate(dict.admin.playersN, { count: value })}
                {value > maxPlayers && ` ${dict.admin.premiumTag}`}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">
            {playerCountLocked
              ? dict.admin.playerCountLockedHint
              : dict.admin.playerCountEditableHint}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="round_time_setting">{dict.admin.defaultRoundTime}</Label>
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
              {rtPending ? dict.admin.saving : dict.admin.save}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            {dict.admin.roundTimeAppliesHint}
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
  const { dict } = useI18n();
  const rounds = useMemo(
    () => getRoundsForPlayerCount(playerCount),
    [playerCount],
  );
  return (
    <div className="space-y-3 rounded-md border border-dashed p-3">
      <div>
        <h3 className="text-sm font-semibold">{dict.admin.roundTimePerRound}</h3>
        <p className="text-muted-foreground text-xs">
          {interpolate(dict.admin.roundTimeOptionalHint, { seconds: defaultSeconds })}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {rounds.map((spec) => (
          <RoundOverrideInput
            key={spec.round}
            tournamentId={tournamentId}
            round={spec.round}
            label={dict.rounds[spec.round]}
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
  const { dict } = useI18n();
  const [value, setValue] = useState<string>(initial != null ? String(initial) : "");
  const [pending, startTransition] = useTransition();
  const lastSaved = initial != null ? String(initial) : "";
  const dirty = value.trim() !== lastSaved;

  const save = () => {
    const trimmed = value.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (next !== null && (!Number.isFinite(next) || next < 10 || next > 600)) {
      toast.error(dict.admin.roundTimeRangeError);
      return;
    }
    startTransition(async () => {
      const result = await updateRoundTimeOverrideAction(tournamentId, round, next);
      if (result.error) toast.error(result.error);
      else
        toast.success(
          interpolate(dict.admin.roundOverrideSaved, {
            label,
            value: next === null ? dict.admin.standardWord : `${next}s`,
          }),
        );
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
          {pending ? "…" : dict.admin.ok}
        </Button>
      </div>
    </div>
  );
}
