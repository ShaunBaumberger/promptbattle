"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/context";
import { interpolate } from "@/lib/i18n/interpolate";
import {
  CATALOG,
  PROVIDER_LABELS,
  SUGGESTIONS,
  modelLabel,
  parseModelRef,
  providerSupports,
  toModelRef,
  type ModelKind,
  type Provider,
} from "@/lib/ai/models";
import { updateModelsAction } from "./model-actions";

/**
 * Which AI models generate this tournament's images and videos.
 *   free     → fixed cheap model, read-only
 *   platform → paid plan: curated catalog models (known prices)
 *   byo      → own keys: any model id of a provider with a stored key
 */
export function ModelSettingsCard({
  tournamentId,
  mode,
  imageRef,
  videoRef,
  providers,
}: {
  tournamentId: string;
  mode: "free" | "platform" | "byo";
  imageRef: string;
  videoRef: string;
  /** platform mode: providers the server has keys for; byo: stored keys */
  providers: Provider[];
}) {
  const { dict } = useI18n();
  const [image, setImage] = useState(imageRef);
  const [video, setVideo] = useState(videoRef);
  const [pending, startTransition] = useTransition();

  if (mode === "free") {
    return (
      <Shell>
        <p className="text-muted-foreground text-sm">
          {interpolate(dict.admin.modelsFreeInfo, { model: modelLabel(imageRef) })}
        </p>
      </Shell>
    );
  }

  const dirty = image !== imageRef || video !== videoRef;
  const save = () =>
    startTransition(async () => {
      const res = await updateModelsAction(tournamentId, image, video);
      if (res.ok) toast.success(dict.admin.modelsSaved);
      else toast.error(res.error ?? "Error");
    });

  const Picker = mode === "platform" ? CatalogPicker : ByoPicker;

  return (
    <Shell>
      <div className="grid gap-4 sm:grid-cols-2">
        <Picker
          kind="image"
          label={dict.admin.imageModelLabel}
          value={image}
          onChange={setImage}
          providers={providers}
        />
        <Picker
          kind="video"
          label={dict.admin.videoModelLabel}
          value={video}
          onChange={setVideo}
          providers={providers}
        />
      </div>
      {mode === "byo" && (
        <p className="text-muted-foreground text-xs">{dict.admin.modelIdHint}</p>
      )}
      <Button size="sm" onClick={save} disabled={!dirty || pending}>
        {dict.admin.save}
      </Button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { dict } = useI18n();
  return (
    <div className="bg-card space-y-4 rounded-2xl border p-5">
      <div className="flex items-center gap-2">
        <Cpu className="size-4" aria-hidden />
        <h2 className="font-display text-base font-bold">{dict.admin.modelsTitle}</h2>
      </div>
      <p className="text-muted-foreground text-sm">{dict.admin.modelsDesc}</p>
      {children}
    </div>
  );
}

interface PickerProps {
  kind: ModelKind;
  label: string;
  value: string;
  onChange: (ref: string) => void;
  providers: Provider[];
}

function CatalogPicker({ kind, label, value, onChange, providers }: PickerProps) {
  const options = CATALOG.filter(
    (m) => m.kind === kind && providers.includes(parseModelRef(m.ref).provider),
  );
  const id = `model_${kind}`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-input bg-background h-9 rounded-md border px-3 text-sm"
      >
        {!options.some((m) => m.ref === value) && (
          <option value={value}>{modelLabel(value)}</option>
        )}
        {options.map((m) => (
          <option key={m.ref} value={m.ref}>
            {m.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ByoPicker({ kind, label, value, onChange, providers: keyed }: PickerProps) {
  const { dict } = useI18n();
  const { provider, model } = parseModelRef(value);
  const listId = `model_suggestions_${kind}`;
  const providers = keyed.filter((p) => providerSupports(p, kind));

  const switchProvider = (next: Provider) => {
    if (next === provider) return;
    onChange(toModelRef(next, SUGGESTIONS[next][kind][0] ?? ""));
  };

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <select
        aria-label={dict.admin.byoProviderLabel}
        value={provider}
        onChange={(e) => switchProvider(e.target.value as Provider)}
        className="border-input bg-background h-9 rounded-md border px-3 text-sm"
      >
        {!providers.includes(provider) && (
          <option value={provider}>{PROVIDER_LABELS[provider]}</option>
        )}
        {providers.map((p) => (
          <option key={p} value={p}>
            {PROVIDER_LABELS[p]}
          </option>
        ))}
      </select>
      <Input
        aria-label={dict.admin.modelIdLabel}
        list={listId}
        value={model}
        onChange={(e) => onChange(toModelRef(provider, e.target.value))}
        placeholder={SUGGESTIONS[provider][kind][0]}
        className="font-mono"
        spellCheck={false}
        autoComplete="off"
      />
      <datalist id={listId}>
        {SUGGESTIONS[provider][kind].map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {providers.length === 0 && (
        <p className="text-muted-foreground text-xs">{dict.admin.noVideoProvider}</p>
      )}
    </fieldset>
  );
}
