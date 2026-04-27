import { LoginForm } from "./login-form";

export const metadata = { title: "Host-Login · Prompt Battle" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Host-Login</h1>
          <p className="text-muted-foreground text-sm">
            Melde dich an, um das Tournament zu verwalten.
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
