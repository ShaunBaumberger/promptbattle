"use client";

import { useState, useTransition } from "react";
import { QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";
import { setStageJoinOverlayAction } from "./voting-actions";

/** Puts the big join QR on the projector (or takes it down) mid-tournament. */
export function StageJoinToggle({
  tournamentId,
  initialShown,
}: {
  tournamentId: string;
  initialShown: boolean;
}) {
  const { dict } = useI18n();
  const [shown, setShown] = useState(initialShown);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !shown;
    setShown(next);
    startTransition(async () => {
      const result = await setStageJoinOverlayAction(tournamentId, next);
      if (!result.ok) {
        setShown(!next);
        toast.error(result.error ?? "");
      }
    });
  };

  return (
    <Button
      type="button"
      variant={shown ? "default" : "outline"}
      size="sm"
      onClick={toggle}
      disabled={pending}
      className="gap-1.5"
    >
      <QrCode className="size-4" aria-hidden />
      {shown ? dict.admin.hideJoinOnStage : dict.admin.showJoinOnStage}
    </Button>
  );
}
