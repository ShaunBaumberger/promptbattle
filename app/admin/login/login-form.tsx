"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/context";
import { richText } from "@/lib/i18n/rich";
import { GitHubIcon, GoogleIcon } from "@/components/provider-icons";

/**
 * Email sign-in defaults to a passwordless login link; password sign-in and
 * sign-up sit behind a secondary toggle so the two methods don't compete.
 */
type Mode = "link" | "password" | "signup";
type Sent = { email: string; kind: "link" | "confirm" } | null;

export function LoginForm({ initialError = null }: { initialError?: string | null }) {
  const router = useRouter();
  const { dict, locale } = useI18n();
  const t = dict.auth;
  const [mode, setMode] = useState<Mode>("link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Sent>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const callback = `${origin}/auth/callback?next=/admin`;

  const oauth = async (provider: "google" | "github") => {
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: callback },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
    // On success the browser redirects to the provider.
  };

  /** Sends (or re-sends) the login link; `data` only applies to brand-new users. */
  const sendLink = async (address: string) => {
    return createClient().auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: callback, data: { locale } },
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();

    if (mode === "link") {
      const { error } = await sendLink(email);
      setBusy(false);
      if (error) setError(error.message);
      else setSent({ email, kind: "link" });
      return;
    }

    if (mode === "password") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setBusy(false);
        setError(error.message);
      } else await finishSignIn();
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callback, data: { locale } },
    });
    setBusy(false);
    if (error) setError(error.message);
    else if (data.session) await finishSignIn();
    else setSent({ email, kind: "confirm" });
  };

  /** Signed in on this page: remember the UI language for future auth emails. */
  const finishSignIn = async () => {
    await createClient().auth.updateUser({ data: { locale } });
    router.push("/admin");
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 gap-3 text-sm font-semibold"
          onClick={() => oauth("google")}
          disabled={busy}
        >
          <GoogleIcon className="size-5" />
          {t.continueGoogle}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 gap-3 text-sm font-semibold"
          onClick={() => oauth("github")}
          disabled={busy}
        >
          <GitHubIcon className="size-5" />
          {t.continueGithub}
        </Button>
      </div>

      <div className="text-muted-foreground flex items-center gap-3 text-xs">
        <span className="bg-border h-px flex-1" /> {t.orEmail} <span className="bg-border h-px flex-1" />
      </div>

      {error && <ErrorNote message={error} />}

      {sent ? (
        <SentPanel
          sent={sent}
          onResend={() =>
            sent.kind === "link"
              ? sendLink(sent.email)
              : createClient().auth.resend({
                  type: "signup",
                  email: sent.email,
                  options: { emailRedirectTo: callback },
                })
          }
          onVerified={finishSignIn}
          onReset={() => {
            setSent(null);
            setError(null);
          }}
        />
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t.email}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="h-11"
            />
          </div>

          {mode !== "link" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">{t.password}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={mode === "password" ? "current-password" : "new-password"}
                className="h-11"
              />
            </div>
          )}

          <Button type="submit" disabled={busy} className="h-11 text-sm font-semibold">
            {busy
              ? t.sending
              : mode === "link"
                ? t.sendLink
                : mode === "password"
                  ? t.signIn
                  : t.createAccount}
          </Button>

          {mode === "link" ? (
            <>
              <p className="text-muted-foreground text-center text-xs">{t.linkHint}</p>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground mx-auto text-sm underline"
                onClick={() => switchMode("password")}
              >
                {t.usePassword}
              </button>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground underline"
                onClick={() => switchMode(mode === "password" ? "signup" : "password")}
              >
                {mode === "password" ? t.toSignup : t.toSignin}
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground underline"
                onClick={() => switchMode("link")}
              >
                {t.useLink}
              </button>
            </div>
          )}
        </form>
      )}

      <p className="text-muted-foreground text-center text-xs">
        {richText(t.agree, {
          terms: (
            <Link href="/legal/terms" className="hover:text-foreground underline">
              {dict.legal.terms}
            </Link>
          ),
          privacy: (
            <Link href="/legal/privacy" className="hover:text-foreground underline">
              {dict.legal.privacy}
            </Link>
          ),
        })}
      </p>
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p
      className="border-destructive/40 bg-destructive/10 text-destructive rounded-xl border px-3 py-2 text-sm"
      role="alert"
    >
      {message}
    </p>
  );
}

/**
 * Shown after an email went out. The one-time code is the fallback for mail
 * scanners that consume one-time links, and for opening the email on
 * another device.
 */
function SentPanel({
  sent,
  onResend,
  onVerified,
  onReset,
}: {
  sent: NonNullable<Sent>;
  onResend: () => Promise<{ error: { message: string } | null }>;
  onVerified: () => Promise<void>;
  onReset: () => void;
}) {
  const { dict } = useI18n();
  const t = dict.auth;
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.verifyOtp({
      email: sent.email,
      token: code.trim(),
      type: sent.kind === "confirm" ? "signup" : "email",
    });
    if (error) {
      setBusy(false);
      setError(t.invalidCode);
    } else await onVerified();
  };

  const resend = async () => {
    setBusy(true);
    setError(null);
    setResent(false);
    const { error } = await onResend();
    setBusy(false);
    if (error) setError(error.message);
    else setResent(true);
  };

  const emailNode = <strong className="text-foreground [overflow-wrap:anywhere]">{sent.email}</strong>;

  return (
    <div className="border-pb-violet/50 bg-pb-violet/15 flex flex-col items-center gap-4 rounded-2xl border p-5 text-center" role="status">
      <span className="bg-pb-violet flex size-12 items-center justify-center rounded-full">
        <MailCheck className="size-6 text-white" aria-hidden />
      </span>
      <div className="space-y-1.5">
        <h2 className="font-display text-lg font-black">
          {sent.kind === "link" ? t.inboxTitle : t.confirmTitle}
        </h2>
        <p className="text-muted-foreground text-sm">
          {richText(sent.kind === "link" ? t.inboxText : t.confirmText, { email: emailNode })}
        </p>
      </div>

      <form onSubmit={verify} className="flex w-full flex-col gap-2">
        <Label htmlFor="otp-code" className="justify-center text-xs font-medium">
          {t.codeLabel}
        </Label>
        <div className="flex flex-col gap-2">
          <Input
            id="otp-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            minLength={6}
            required
            placeholder="12345678"
            className="h-12 text-center font-mono text-xl tracking-[0.4em]"
          />
          <Button type="submit" disabled={busy} className="h-11 font-semibold">
            {t.verify}
          </Button>
        </div>
      </form>

      {error && <ErrorNote message={error} />}

      <p className="text-muted-foreground text-xs">{t.spamHint}</p>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
        <button
          type="button"
          onClick={resend}
          disabled={busy}
          className="text-muted-foreground hover:text-foreground underline disabled:opacity-50"
        >
          {t.sendAgain}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="text-muted-foreground hover:text-foreground underline"
        >
          {t.otherEmail}
        </button>
      </div>
      {resent && <p className="text-pb-green text-xs font-medium">{t.sentAgain}</p>}
    </div>
  );
}
