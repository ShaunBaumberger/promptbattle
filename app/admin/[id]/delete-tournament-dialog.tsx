"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
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
import { useI18n, interpolate } from "@/lib/i18n/context";

interface Props {
  tournamentId: string;
  tournamentName: string;
  /** Icon-only trigger for list rows (dashboard quick actions). Same
   *  confirmation dialog either way — deletion is never one click. */
  compact?: boolean;
}

export function DeleteTournamentDialog({
  tournamentId,
  tournamentName,
  compact = false,
}: Props) {
  const { dict } = useI18n();
  const [pending, setPending] = useState(false);
  const boundDelete = deleteTournamentAction.bind(null, tournamentId);

  return (
    <Dialog>
      <DialogTrigger
        render={
          compact ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={dict.admin.deleteTournament}
              title={dict.admin.deleteTournament}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          ) : (
            <Button variant="destructive" size="sm">
              {dict.admin.deleteTournament}
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dict.admin.deleteConfirmTitle}</DialogTitle>
          <DialogDescription>
            {interpolate(dict.admin.deleteConfirmBody, { name: tournamentName })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">{dict.admin.cancel}</Button>} />
          <form action={boundDelete} onSubmit={() => setPending(true)}>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? dict.admin.deleting : dict.admin.deleteFinal}
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
