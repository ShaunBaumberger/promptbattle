import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Participant, Task, Tournament } from "@/lib/types/database";
import { TaskManager } from "./task-manager";
import { ParticipantsList } from "./participants-list";
import { StartBracketForm } from "./start-bracket-form";
import { MatchControl } from "./match-control";
import { TournamentSettings } from "./tournament-settings";
import { DeleteTournamentDialog } from "./delete-tournament-dialog";
import { copyTournamentAction } from "./actions";
import type { PlayerCount, Round } from "@/lib/types/database";

// Image generation can take ~15-25s; allow headroom for the server action.
export const maxDuration = 60;

const STATUS_LABELS: Record<Tournament["status"], string> = {
  setup: "In Vorbereitung",
  live: "Läuft",
  finished: "Beendet",
};

export default async function TournamentAdminPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = createServiceRoleClient();

  const [{ data: tournament }, { data: tasks }, { data: participants }] = await Promise.all([
    supabase.from("tournaments").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("tasks")
      .select("*")
      .eq("tournament_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("participants")
      .select("*")
      .eq("tournament_id", id)
      .order("joined_at", { ascending: true }),
  ]);

  if (!tournament) notFound();

  const tasksByRound: Record<Round, number> = { R32: 0, R16: 0, QF: 0, SF: 0, FINAL: 0 };
  for (const t of (tasks ?? []) as Task[]) {
    tasksByRound[t.round] = (tasksByRound[t.round] ?? 0) + 1;
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 p-6">
      <div className="flex items-center justify-between">
        <Link href="/admin" className="text-muted-foreground hover:text-foreground text-sm">
          ← Zurück
        </Link>
        <Badge variant="secondary">
          {STATUS_LABELS[tournament.status as Tournament["status"]]}
        </Badge>
      </div>

      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{tournament.name}</h1>
        <p className="text-muted-foreground text-sm">
          Beitritts-Code:{" "}
          <span className="bg-muted rounded px-2 py-0.5 font-mono">{tournament.code}</span>
          {" · "}
          {tournament.player_count} Spieler
          {" · "}
          {tournament.round_time_seconds}s pro Runde
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <a
            href={`/stage/${tournament.code}`}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Bühnen-Ansicht öffnen ↗
          </a>
        </div>
      </header>

      <section>
        <TournamentSettings
          tournamentId={tournament.id}
          initialPlayerCount={tournament.player_count as PlayerCount}
          initialRoundTime={tournament.round_time_seconds}
          status={tournament.status as Tournament["status"]}
        />
      </section>

      <section>
        <ParticipantsList
          tournamentId={tournament.id}
          initialParticipants={(participants ?? []) as Participant[]}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Tasks</h2>
        <TaskManager
          tournamentId={tournament.id}
          playerCount={tournament.player_count as PlayerCount}
          tasks={(tasks ?? []) as Task[]}
        />
      </section>

      {tournament.status === "setup" && (
        <section>
          <StartBracketForm
            tournamentId={tournament.id}
            playerCount={tournament.player_count as PlayerCount}
            initialParticipantCount={(participants ?? []).length}
            initialTasksByRound={tasksByRound}
          />
        </section>
      )}

      {tournament.status === "live" && (
        <section>
          <MatchControl
            tournamentId={tournament.id}
            initialCurrentMatchId={tournament.current_match_id}
            roundTimeSeconds={tournament.round_time_seconds}
            playerCount={tournament.player_count as PlayerCount}
            initialSkipGeneration={tournament.skip_image_generation === true}
            isTestMode={tournament.is_test_mode === true}
          />
        </section>
      )}

      <section className="space-y-3 rounded-md border p-4">
        <h2 className="text-base font-semibold">Turnier duplizieren</h2>
        <p className="text-muted-foreground text-sm">
          Erstellt ein neues Turnier mit demselben Setup (Modus, Rundenzeit,
          Tasks). Bilder werden kopiert. Neuer Beitritts-Code wird automatisch
          generiert.
        </p>
        <form action={copyTournamentAction.bind(null, tournament.id)}>
          <Button type="submit" variant="outline" size="sm">
            Turnier kopieren
          </Button>
        </form>
      </section>

      <section className="border-destructive/50 space-y-3 rounded-md border p-4">
        <h2 className="text-base font-semibold">Gefahrenzone</h2>
        <p className="text-muted-foreground text-sm">
          Löscht das Turnier unwiderruflich – inklusive aller Tasks, Bilder, Teilnehmer:innen und
          Matches.
        </p>
        <DeleteTournamentDialog
          tournamentId={tournament.id}
          tournamentName={tournament.name}
        />
      </section>
    </main>
  );
}
