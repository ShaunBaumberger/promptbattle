"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImageUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createTaskAction,
  deleteTaskAction,
  type TaskActionState,
} from "./actions";
import type { PlayerCount, Task } from "@/lib/types/database";
import { taskKind } from "@/lib/types/database";
import { getRoundsForPlayerCount, type RoundSpec } from "@/lib/rounds";

const initial: TaskActionState = {};

interface Props {
  tournamentId: string;
  playerCount: PlayerCount;
  tasks: Task[];
}

export function TaskManager({ tournamentId, playerCount, tasks }: Props) {
  const rounds = getRoundsForPlayerCount(playerCount);
  const boundCreate = createTaskAction.bind(null, tournamentId);
  const [state, formAction, pending] = useActionState(boundCreate, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<"image" | "text">("image");
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!pending && !state.error && formRef.current) {
      formRef.current.reset();
      setPickedFile(null);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
  }, [state, pending]);

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  // Clean up object URL on unmount.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setPickedFile(f);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return f ? URL.createObjectURL(f) : null;
    });
  };

  const clearFile = () => {
    setPickedFile(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const tasksByRound = groupBy(tasks, (t) => t.round);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Neue Task hinzufügen</CardTitle>
        </CardHeader>
        <CardContent>
          <form ref={formRef} action={formAction} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="kind" value={kind} />

            <div className="flex flex-col gap-2">
              <Label htmlFor="round">Runde</Label>
              <select
                id="round"
                name="round"
                required
                defaultValue={rounds[0].round}
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              >
                {rounds.map((r) => (
                  <option key={r.round} value={r.round}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="internal_label">Interne Bezeichnung (optional)</Label>
              <Input
                id="internal_label"
                name="internal_label"
                placeholder="z. B. „Surrealistischer Wald"
              />
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label>Aufgabentyp</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={kind === "image" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setKind("image")}
                >
                  Bildaufgabe
                </Button>
                <Button
                  type="button"
                  variant={kind === "text" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setKind("text")}
                >
                  Textaufgabe
                </Button>
              </div>
            </div>

            {kind === "image" ? (
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="file">
                  Referenzbild (JPG, PNG, WEBP – max. 5 MB)
                </Label>
                {/* Hidden native input — driven by the custom button / preview. */}
                <input
                  ref={fileInputRef}
                  id="file"
                  name="file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                  onChange={onFileChange}
                  className="sr-only"
                />
                {previewUrl && pickedFile ? (
                  <div className="flex items-start gap-3 rounded-md border p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt={pickedFile.name}
                      className="bg-muted h-20 w-20 shrink-0 rounded-md border object-cover"
                    />
                    <div className="flex flex-1 flex-col gap-1 overflow-hidden">
                      <p className="truncate text-sm font-medium">{pickedFile.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {(pickedFile.size / 1024).toFixed(0)} KB
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={clearFile}
                        className="text-destructive hover:text-destructive w-fit gap-1"
                      >
                        <Trash2 className="size-4" />
                        Entfernen
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="border-input hover:bg-accent flex h-24 w-full flex-col items-center justify-center gap-1 border-2 border-dashed text-sm"
                  >
                    <ImageUp className="size-6" />
                    <span>Bild auswählen</span>
                    <span className="text-muted-foreground text-xs">
                      JPG, PNG, WEBP · max. 5 MB
                    </span>
                  </Button>
                )}
                <p className="text-muted-foreground text-xs">
                  Spieler sehen das Bild und müssen es per Prompt rekonstruieren.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="text_prompt">Text-Aufgabe</Label>
                <Textarea
                  id="text_prompt"
                  name="text_prompt"
                  required
                  rows={3}
                  placeholder='z. B. „Generiere ein Bild von einem Pelikan auf einem Fahrrad."'
                />
                <p className="text-muted-foreground text-xs">
                  Spieler sehen die Beschreibung und müssen das Bild dazu prompten.
                </p>
              </div>
            )}

            <div className="sm:col-span-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Wird gespeichert…" : "Task hinzufügen"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {rounds.map((spec) => (
          <RoundSection
            key={spec.round}
            spec={spec}
            tasks={tasksByRound.get(spec.round) ?? []}
            tournamentId={tournamentId}
          />
        ))}
      </div>
    </div>
  );
}

function RoundSection({
  spec,
  tasks,
  tournamentId,
}: {
  spec: RoundSpec;
  tasks: Task[];
  tournamentId: string;
}) {
  const complete = tasks.length >= spec.matches;

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <h3 className="text-base font-semibold">{spec.label}</h3>
        <Badge variant={complete ? "default" : "secondary"}>
          {tasks.length} / {spec.matches} Tasks
        </Badge>
      </header>
      {tasks.length === 0 ? (
        <p className="text-muted-foreground text-sm">Noch keine Tasks für diese Runde.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} tournamentId={tournamentId} />
          ))}
        </div>
      )}
    </section>
  );
}

function TaskCard({ task, tournamentId }: { task: Task; tournamentId: string }) {
  const boundDelete = deleteTaskAction.bind(null, task.id, tournamentId);
  const kind = taskKind(task);
  return (
    <div className="space-y-2">
      {kind === "image" ? (
        <div className="bg-muted aspect-square overflow-hidden rounded-md border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={task.reference_image_url ?? ""}
            alt={task.internal_label ?? "Referenzbild"}
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="bg-muted/40 flex aspect-square flex-col items-start justify-between gap-2 overflow-hidden rounded-md border p-3">
          <Badge variant="outline" className="text-xs">
            Text
          </Badge>
          <p className="text-foreground line-clamp-6 text-sm leading-snug">
            {task.text_prompt}
          </p>
        </div>
      )}
      {task.internal_label && (
        <p className="text-muted-foreground truncate text-xs">{task.internal_label}</p>
      )}
      <form action={boundDelete}>
        <Button type="submit" variant="ghost" size="sm" className="w-full">
          Löschen
        </Button>
      </form>
    </div>
  );
}

function groupBy<T, K>(arr: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const item of arr) {
    const k = key(item);
    const list = m.get(k) ?? [];
    list.push(item);
    m.set(k, list);
  }
  return m;
}
