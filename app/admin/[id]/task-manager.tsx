"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
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
import type { PlayerCount, Round, Task } from "@/lib/types/database";
import { taskKind } from "@/lib/types/database";
import { getRoundsForPlayerCount, type RoundSpec } from "@/lib/rounds";
import { useI18n, interpolate } from "@/lib/i18n/context";

/**
 * Pick the first round that still has missing tasks. Falls back to the last
 * round so the form remains valid even when every round is full (admin can
 * intentionally add an extra task to a round if they want).
 */
function firstIncompleteRound(rounds: RoundSpec[], tasks: Task[]): Round {
  const counts = new Map<Round, number>();
  for (const t of tasks) counts.set(t.round, (counts.get(t.round) ?? 0) + 1);
  for (const spec of rounds) {
    if ((counts.get(spec.round) ?? 0) < spec.matches) return spec.round;
  }
  return rounds[rounds.length - 1].round;
}

const initial: TaskActionState = {};

interface Props {
  tournamentId: string;
  playerCount: PlayerCount;
  tasks: Task[];
  /** Free plans can't create video tasks (Veo is premium-only). */
  videoAllowed: boolean;
}

export function TaskManager({ tournamentId, playerCount, tasks, videoAllowed }: Props) {
  const { dict } = useI18n();
  // Memoised so the array reference is stable across renders — the form-reset
  // effect depends on it and would otherwise fire on every render.
  const rounds = useMemo(
    () => getRoundsForPlayerCount(playerCount),
    [playerCount],
  );
  const boundCreate = createTaskAction.bind(null, tournamentId);
  const [state, formAction, pending] = useActionState(boundCreate, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<"image" | "text" | "video">("image");
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Selected round for the form. Controlled so we can re-target it after each
  // successful add — defaults to (and snaps back to) the first round that
  // still needs tasks.
  const [round, setRound] = useState<Round>(() =>
    firstIncompleteRound(rounds, tasks),
  );

  // Reset only when the action's state object actually changes (new submit
  // result), not on every render. Without this guard, file picks would clear
  // themselves the next render because rounds/tasks references can churn.
  const lastSeenStateRef = useRef(state);
  useEffect(() => {
    if (state === lastSeenStateRef.current) return;
    lastSeenStateRef.current = state;
    if (!pending && !state.error && formRef.current) {
      formRef.current.reset();
      setRound(firstIncompleteRound(rounds, tasks));
      setPickedFile(null);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
  }, [state, pending, rounds, tasks]);

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  // Clean up object URL on unmount.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const original = input.files?.[0] ?? null;
    if (!original) {
      setPickedFile(null);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }

    // Vercel Hobby caps serverless function request bodies at 4.5 MB.
    // Most phone photos sit at 3–5 MB so we'd hit 413 on the server
    // action. Resize anything over 1.5 MB to a max edge of 2048 px and
    // re-encode as JPEG q=0.92 — keeps detail more than enough for a
    // prompt-recreation reference image while shrinking typical
    // inputs to 400–900 KB. Swap the input's File via DataTransfer
    // so the form's native submission picks up the resized version.
    let processed: File;
    try {
      processed = await resizeImageIfLarge(original);
    } catch (err) {
      console.error("image resize failed; using original:", err);
      processed = original;
    }
    if (processed !== original) {
      const dt = new DataTransfer();
      dt.items.add(processed);
      input.files = dt.files;
    }

    setPickedFile(processed);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(processed);
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
          <CardTitle>{dict.admin.newTask}</CardTitle>
        </CardHeader>
        <CardContent>
          <form ref={formRef} action={formAction} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="kind" value={kind} />

            <div className="flex flex-col gap-2">
              <Label htmlFor="round">{dict.admin.round}</Label>
              <select
                id="round"
                name="round"
                required
                value={round}
                onChange={(e) => setRound(e.target.value as Round)}
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              >
                {rounds.map((r) => (
                  <option key={r.round} value={r.round}>
                    {dict.rounds[r.round]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="internal_label">{dict.admin.internalLabel}</Label>
              <Input
                id="internal_label"
                name="internal_label"
                placeholder={dict.admin.internalLabelPlaceholder}
              />
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label>{dict.admin.taskType}</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={kind === "image" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setKind("image")}
                >
                  {dict.admin.imageTask}
                </Button>
                <Button
                  type="button"
                  variant={kind === "text" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setKind("text")}
                >
                  {dict.admin.textTask}
                </Button>
                <Button
                  type="button"
                  variant={kind === "video" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setKind("video")}
                  disabled={!videoAllowed}
                >
                  {dict.admin.videoTask}
                  {!videoAllowed && ` ${dict.admin.premiumTag}`}
                </Button>
              </div>
            </div>

            {kind === "image" ? (
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="file">{dict.admin.referenceImageLabel}</Label>
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
                        {dict.admin.remove}
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
                    <span>{dict.admin.chooseImage}</span>
                    <span className="text-muted-foreground text-xs">
                      {dict.admin.imageFormats}
                    </span>
                  </Button>
                )}
                <p className="text-muted-foreground text-xs">{dict.admin.imageTaskHint}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="text_prompt">
                  {kind === "video" ? dict.admin.videoTaskLabel : dict.admin.textTaskLabel}
                </Label>
                <Textarea
                  id="text_prompt"
                  name="text_prompt"
                  required
                  rows={3}
                  placeholder={
                    kind === "video"
                      ? dict.admin.videoTaskPlaceholder
                      : dict.admin.textTaskPlaceholder
                  }
                />
                <p className="text-muted-foreground text-xs">
                  {kind === "video" ? dict.admin.videoTaskHint : dict.admin.textTaskHint}
                </p>
              </div>
            )}

            <div className="sm:col-span-2">
              <Button type="submit" disabled={pending}>
                {pending ? dict.admin.savingTask : dict.admin.addTask}
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
  const { dict } = useI18n();
  const complete = tasks.length >= spec.matches;

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <h3 className="text-base font-semibold">{dict.rounds[spec.round]}</h3>
        <Badge variant={complete ? "default" : "secondary"}>
          {interpolate(dict.admin.tasksProgress, {
            have: tasks.length,
            need: spec.matches,
          })}
        </Badge>
      </header>
      {tasks.length === 0 ? (
        <p className="text-muted-foreground text-sm">{dict.admin.noTasksRound}</p>
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
  const { dict } = useI18n();
  const boundDelete = deleteTaskAction.bind(null, task.id, tournamentId);
  const kind = taskKind(task);
  return (
    <div className="space-y-2">
      {kind === "image" ? (
        <div className="bg-muted aspect-square overflow-hidden rounded-md border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={task.reference_image_url ?? ""}
            alt={task.internal_label ?? dict.stage.referenceImage}
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="bg-muted/40 flex aspect-square flex-col items-start justify-between gap-2 overflow-hidden rounded-md border p-3">
          <Badge variant={kind === "video" ? "default" : "outline"} className="text-xs">
            {kind === "video" ? dict.admin.videoBadge : dict.admin.textBadge}
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
          {dict.admin.deleteBtn}
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

// ---------- Client-side image resize -----------------------------------
// See `onFileChange` for the why. These helpers run in the browser and
// keep the upload comfortably under Vercel Hobby's 4.5 MB body cap.

const RESIZE_THRESHOLD_BYTES = 1.5 * 1024 * 1024;
const MAX_EDGE_PX = 2048;
const JPEG_QUALITY = 0.92;

/**
 * Resize an image to fit within MAX_EDGE_PX × MAX_EDGE_PX (preserving
 * aspect ratio) and re-encode as JPEG. Files already under the size
 * threshold are returned unchanged so we don't needlessly recompress
 * small screenshots / icons. Always returns a File so the caller can
 * swap it into the form input.
 */
async function resizeImageIfLarge(file: File): Promise<File> {
  if (file.size < RESIZE_THRESHOLD_BYTES) return file;

  const img = await loadImageBitmap(file);
  try {
    const ratio = Math.min(MAX_EDGE_PX / img.width, MAX_EDGE_PX / img.height, 1);
    const w = Math.max(1, Math.round(img.width * ratio));
    const h = Math.max(1, Math.round(img.height * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
    });
    if (!blob) throw new Error("canvas.toBlob returned null");

    // Strip the original extension; replace with .jpg since we always
    // output JPEG. Preserves the original name for context.
    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    // createImageBitmap returns an ImageBitmap which holds GPU memory
    // until close() — important on phones with limited RAM.
    img.close?.();
  }
}

/**
 * Decode a File into an ImageBitmap. Prefer createImageBitmap over
 * <img> + URL.createObjectURL because it skips a layout pass and
 * works off the main thread on supporting browsers.
 */
async function loadImageBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }
  // Very old browser fallback — unlikely to be hit in 2026.
  throw new Error("createImageBitmap not supported in this browser");
}
