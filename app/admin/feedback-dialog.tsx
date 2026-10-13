"use client";

import { useState } from "react";
import { MessageSquareText } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n/context";
import { sendFeedbackAction } from "./feedback-actions";

export function FeedbackDialog() {
  const { dict } = useI18n();
  const t = dict.feedback;
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [allowContact, setAllowContact] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await sendFeedbackAction({
      message,
      page: window.location.pathname,
      allowContact,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.success(t.thanks);
    setMessage("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm" className="gap-2">
            <MessageSquareText className="size-4" aria-hidden />
            <span className="hidden sm:inline">{t.button}</span>
          </Button>
        }
      />
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="font-display font-black">{t.title}</DialogTitle>
            <DialogDescription>{t.desc}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="feedback-message">{t.label}</Label>
            <Textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t.placeholder}
              required
              maxLength={4000}
              rows={5}
              className="min-h-32 resize-y"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowContact}
              onChange={(e) => setAllowContact(e.target.checked)}
              className="accent-pb-violet size-4"
            />
            {t.allowContact}
          </label>
          {error && (
            <p className="border-destructive/40 bg-destructive/10 text-destructive rounded-xl border px-3 py-2 text-sm" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline">{dict.admin.cancel}</Button>} />
            <Button type="submit" disabled={busy || !message.trim()}>
              {busy ? t.sending : t.send}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
