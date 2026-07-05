"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

// NOTE: Auth UI copy is English-only for now — this is the Phase-2 branch.
// i18n keys for the auth screens are a follow-up before merge.

type Mode = "signin" | "signup";
type Status = { type: "error" | "info"; msg: string } | null;

export function LoginForm() {
  const router = useRouter();
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
      setStatus({ type: "error", msg: "Enter your email first." });
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
        : { type: "info", msg: "Check your email for a login link." },
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
          : {
              type: "info",
              msg: "Account created — check your email to confirm, then sign in.",
            },
      );
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" onClick={() => oauth("google")} disabled={busy}>
          Continue with Google
        </Button>
        <Button type="button" variant="outline" onClick={() => oauth("azure")} disabled={busy}>
          Continue with Microsoft
        </Button>
      </div>

      <div className="text-muted-foreground flex items-center gap-3 text-xs">
        <span className="bg-border h-px flex-1" /> or <span className="bg-border h-px flex-1" />
      </div>

      <form onSubmit={passwordAuth} className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
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
          <Label htmlFor="password">Password</Label>
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
          {mode === "signin" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground underline"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "Create an account" : "Have an account? Sign in"}
        </button>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground underline disabled:opacity-50"
          onClick={magicLink}
          disabled={busy}
        >
          Email me a link
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
    </div>
  );
}
