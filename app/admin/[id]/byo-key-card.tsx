"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/context";
import { interpolate } from "@/lib/i18n/interpolate";
import {
  PROVIDERS,
  PROVIDER_KEY_URLS,
  PROVIDER_LABELS,
  type Provider,
} from "@/lib/ai/models";
import {
  setByoKeyAction,
  removeByoKeyAction,
  type ByoKeyActionState,
} from "./byo-key-actions";

const initial: ByoKeyActionState = {};

const KEY_PLACEHOLDERS: Record<Provider, string> = {
  google: "AIza…",
  openai: "sk-…",
  replicate: "r8_…",
};

/**
 * Bring-your-own-keys box. Hosts store one key per AI provider (Google,
 * OpenAI, Replicate); any stored key unlocks premium features and bills
 * generation to the host's own provider account. Keys are validated live,
 * stored encrypted, and never shown again — the UI only knows which
 * providers have a key.
 */
export function ByoKeyCard({
  tournamentId,
  storedProviders,
}: {
  tournamentId: string;
  storedProviders: Provider[];
}) {
  const { dict } = useI18n();
  const firstMissing = PROVIDERS.find((p) => !storedProviders.includes(p)) ?? "google";
  const [provider, setProvider] = useState<Provider>(firstMissing);

  const boundSave = setByoKeyAction.bind(null, tournamentId);
  const [saveState, saveAction, savePending] = useActionState(boundSave, initial);

  useEffect(() => {
    if (saveState.ok) toast.success(dict.admin.byoSaved);
  }, [saveState, dict]);

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4" aria-hidden />
        <h2 className="text-base font-semibold">{dict.admin.byoTitle}</h2>
      </div>
      <p className="text-muted-foreground text-sm">{dict.admin.byoDesc}</p>

      {storedProviders.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{dict.admin.byoStoredKeys}</p>
          <ul className="space-y-2">
            {storedProviders.map((p) => (
              <StoredKeyRow key={p} tournamentId={tournamentId} provider={p} />
            ))}
          </ul>
        </div>
      )}

      <form action={saveAction} className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="byo_provider">{dict.admin.byoProviderLabel}</Label>
            <select
              id="byo_provider"
              name="provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Label htmlFor="byo_api_key">{dict.admin.byoKeyLabel}</Label>
            <Input
              id="byo_api_key"
              name="api_key"
              type="password"
              required
              autoComplete="off"
              placeholder={KEY_PLACEHOLDERS[provider]}
              className="max-w-sm font-mono"
            />
          </div>
          <Button type="submit" disabled={savePending}>
            {savePending ? dict.admin.byoSaving : dict.admin.byoSave}
          </Button>
        </div>
        {saveState.error && (
          <p className="text-destructive text-sm" role="alert">
            {saveState.error}
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          {interpolate(dict.admin.byoGetKeyAt, { url: PROVIDER_KEY_URLS[provider] })}
          {" · "}
          {dict.admin.byoGetKeyHint}
        </p>
      </form>
    </div>
  );
}

function StoredKeyRow({
  tournamentId,
  provider,
}: {
  tournamentId: string;
  provider: Provider;
}) {
  const { dict } = useI18n();
  const boundRemove = removeByoKeyAction.bind(null, tournamentId, provider);
  const [state, action, pending] = useActionState(boundRemove, initial);

  useEffect(() => {
    if (state.ok) toast.success(dict.admin.byoRemoved);
  }, [state, dict]);

  return (
    <li className="flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
        ✓ {PROVIDER_LABELS[provider]}
      </span>
      <form action={action}>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {dict.admin.byoRemove}
        </Button>
      </form>
      {state.error && (
        <span className="text-destructive text-sm" role="alert">
          {state.error}
        </span>
      )}
    </li>
  );
}
