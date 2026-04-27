"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteTournamentAction } from "./actions";

interface Props {
  tournamentId: string;
  tournamentName: string;
}

export function DeleteTournamentDialog({ tournamentId, tournamentName }: Props) {
  const [pending, setPending] = useState(false);
  const boundDelete = deleteTournamentAction.bind(null, tournamentId);

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="destructive" size="sm">
            Tournament löschen
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tournament wirklich löschen?</DialogTitle>
          <DialogDescription>
            <strong className="text-foreground">„{tournamentName}"</strong> wird unwiderruflich
            gelöscht – inklusive aller Tasks, Bilder, Teilnehmer und Matches. Diese Aktion
            kann nicht rückgängig gemacht werden.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Abbrechen</Button>} />
          <form action={boundDelete} onSubmit={() => setPending(true)}>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Wird gelöscht…" : "Endgültig löschen"}
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
