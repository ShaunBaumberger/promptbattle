"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/context";
import {
  setByoKeyAction,
  removeByoKeyAction,
  type ByoKeyActionState,
} from "./byo-key-actions";

const initial: ByoKeyActionState = {};

/**
 * Bring-your-own-key box. Saving a valid Gemini key unlocks premium
 * features for this tournament and bills all generation to the key
 * owner's Google account. The key is validated live, stored encrypted,
 * and never shown again — the UI only knows "a key is set".
 */
export function ByoKeyCard({
  tournamentId,
  keySet,
}: {
  tournamentId: string;
  keySet: boolean;
}) {
  const { dict } = useI18n();

  const boundSave = setByoKeyAction.bind(null, tournamentId);
  const [saveState, saveAction, savePending] = useActionState(boundSave, initial);
  const boundRemove = removeByoKeyAction.bind(null, tournamentId);
  const [removeState, removeAction, removePending] = useActionState(
    boundRemove,
    initial,
  );

  useEffect(() => {
    if (saveState.ok) toast.success(dict.admin.byoSaved);
  }, [saveState, dict]);
  useEffect(() => {
    if (removeState.ok) toast.success(dict.admin.byoRemoved);
  }, [removeState, dict]);

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4" aria-hidden />
        <h2 className="text-base font-semibold">{dict.admin.byoTitle}</h2>
      </div>
      <p className="text-muted-foreground text-sm">{dict.admin.byoDesc}</p>

      {keySet ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
            ✓ {dict.admin.byoSet}
          </p>
          {removeState.error && (
            <p className="text-destructive text-sm" role="alert">
              {removeState.error}
            </p>
          )}
          <form action={removeAction}>
            <Button type="submit" variant="outline" size="sm" disabled={removePending}>
              {dict.admin.byoRemove}
            </Button>
          </form>
        </div>
      ) : (
        <form action={saveAction} className="space-y-2">
          <Label htmlFor="byo_api_key">{dict.admin.byoKeyLabel}</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="byo_api_key"
              name="api_key"
              type="password"
              required
              autoComplete="off"
              placeholder="AIza…"
              className="max-w-sm font-mono"
            />
            <Button type="submit" disabled={savePending}>
              {savePending ? dict.admin.byoSaving : dict.admin.byoSave}
            </Button>
          </div>
          {saveState.error && (
            <p className="text-destructive text-sm" role="alert">
              {saveState.error}
            </p>
          )}
          <p className="text-muted-foreground text-xs">{dict.admin.byoGetKeyHint}</p>
        </form>
      )}
    </div>
  );
}
