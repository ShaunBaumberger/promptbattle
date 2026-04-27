"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import { restartLiveMatchAction } from "./match-actions";

interface Props {
  matchId: string;
}

export function RestartMatchDialog({ matchId }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    startTransition(async () => {
      const result = await restartLiveMatchAction(matchId, {}, new FormData());
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Match neu gestartet.");
        setOpen(false);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="destructive" size="sm">
            Match abbrechen & neu starten
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Match wirklich neu starten?</DialogTitle>
          <DialogDescription>
            Das laufende Match wird sofort gestoppt und mit den{" "}
            <strong className="text-foreground">gleichen Spielern</strong> und der{" "}
            <strong className="text-foreground">gleichen Aufgabe</strong> neu
            gestartet. Bisherige Prompts und Ergebnisse gehen verloren.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Abbrechen</Button>} />
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? "Wird neu gestartet…" : "Ja, neu starten"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
