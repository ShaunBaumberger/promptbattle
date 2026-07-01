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
import { useI18n } from "@/lib/i18n/context";

interface Props {
  matchId: string;
}

export function RestartMatchDialog({ matchId }: Props) {
  const { dict } = useI18n();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    startTransition(async () => {
      const result = await restartLiveMatchAction(matchId, {}, new FormData());
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(dict.admin.matchRestarted);
        setOpen(false);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="destructive" size="sm">
            {dict.admin.restartMatch}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dict.admin.restartConfirmTitle}</DialogTitle>
          <DialogDescription>{dict.admin.restartConfirmBody}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">{dict.admin.cancel}</Button>} />
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? dict.admin.restarting : dict.admin.restartYes}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
