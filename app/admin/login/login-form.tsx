"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/context";
import { richText } from "@/lib/i18n/rich";

type Mode = "signin" | "signup";
type Status = { type: "error" | "info"; msg: string } | null;

export function LoginForm() {
  const router = useRouter();
  const { dict } = useI18n();
  const t = dict.auth;
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const oauth = async (provider: "google" | "azure") => {
    setBusy(true);
    setStatus(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${origin}/auth/callback?next=/admin` },
    });
    if (error) {
      setStatus({ type: "error", msg: error.message });
      setBusy(false);
    }
    // On success the browser redirects to the provider.
  };

  const magicLink = async () => {
    if (!email) {
      setStatus({ type: "error", msg: t.enterEmailFirst });
      return;
    }
    setBusy(true);
    setStatus(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/auth/callback` },
    });
    setBusy(false);
    setStatus(
      error
        ? { type: "error", msg: error.message }
        : { type: "info", msg: t.checkEmail },
    );
  };

  const passwordAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    const supabase = createClient();
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) setStatus({ type: "error", msg: error.message });
      else router.push("/admin");
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${origin}/auth/callback` },
      });
      setBusy(false);
      setStatus(
        error
          ? { type: "error", msg: error.message }
          : { type: "info", msg: t.accountCreated },
      );
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" onClick={() => oauth("google")} disabled={busy}>
          {t.continueGoogle}
        </Button>
        <Button type="button" variant="outline" onClick={() => oauth("azure")} disabled={busy}>
          {t.continueMicrosoft}
        </Button>
      </div>

      <div className="text-muted-foreground flex items-center gap-3 text-xs">
        <span className="bg-border h-px flex-1" /> {t.or} <span className="bg-border h-px flex-1" />
      </div>

      <form onSubmit={passwordAuth} className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">{t.email}</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">{t.password}</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />
        </div>
        <Button type="submit" disabled={busy}>
          {mode === "signin" ? t.signIn : t.createAccount}
        </Button>
      </form>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground underline"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? t.toSignup : t.toSignin}
        </button>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground underline disabled:opacity-50"
          onClick={magicLink}
          disabled={busy}
        >
          {t.magicLink}
        </button>
      </div>

      {status && (
        <p
          className={
            status.type === "error"
              ? "text-destructive text-sm"
              : "text-muted-foreground text-sm"
          }
          role="alert"
        >
          {status.msg}
        </p>
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
