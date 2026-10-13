"use client";

import { useEffect, useState } from "react";
import { CircleHelp, ImagePlus, MonitorPlay, Play, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useI18n, interpolate } from "@/lib/i18n/context";

const SEEN_KEY = "pb_host_guide_seen";

function seen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {}
}

/**
 * Four-step "how to run a battle" guide. Opens by itself once for a host
 * without tournaments; the trigger button reopens it any time.
 */
export function HostGuide({ autoOpen }: { autoOpen: boolean }) {
  const { dict } = useI18n();
  const t = dict.guide;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!autoOpen || seen()) return;
    const id = setTimeout(() => setOpen(true), 400);
    return () => clearTimeout(id);
  }, [autoOpen]);

  const steps = [
    { icon: Trophy, title: t.s1Title, text: t.s1Text, tint: "bg-pb-green text-black" },
    { icon: ImagePlus, title: t.s2Title, text: t.s2Text, tint: "bg-pb-magenta text-white" },
    { icon: MonitorPlay, title: t.s3Title, text: t.s3Text, tint: "bg-pb-violet text-white" },
    { icon: Play, title: t.s4Title, text: t.s4Text, tint: "bg-pb-gold text-black" },
  ];
  const last = step === steps.length - 1;
  const current = steps[step];

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) setStep(0);
    else markSeen();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-2">
            <CircleHelp className="size-4" aria-hidden />
            {t.howItWorks}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-black">{t.title}</DialogTitle>
          <DialogDescription>{t.intro}</DialogDescription>
        </DialogHeader>

        <div className="bg-pb-surface-2/60 flex flex-col gap-4 rounded-2xl p-5" aria-live="polite">
          <div className="flex items-center gap-3">
            <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${current.tint}`}>
              <current.icon className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                {interpolate(t.stepOf, { n: step + 1, total: steps.length })}
              </p>
              <h3 className="text-base font-bold">{current.title}</h3>
            </div>
          </div>
          <p className="text-sm leading-relaxed">{current.text}</p>
          {last && (
            <p className="border-pb-gold/40 bg-pb-gold/10 rounded-xl border px-3 py-2 text-sm">{t.tip}</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-1.5" aria-hidden>
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-2 rounded-full transition-all ${i === step ? "bg-pb-violet w-6" : "bg-white/20 w-2"}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>
                {t.back}
              </Button>
            )}
            <Button
              size="sm"
              className={last ? "bg-pb-green text-black hover:bg-pb-green/90" : ""}
              onClick={() => (last ? onOpenChange(false) : setStep(step + 1))}
            >
              {last ? t.done : t.next}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
