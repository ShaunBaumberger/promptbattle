import { LoginForm } from "./login-form";
import { getServerDictionary } from "@/lib/i18n/server";

export const metadata = { title: "Host-Login · Prompt Battle" };

export default async function LoginPage() {
  const { dict } = await getServerDictionary();
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">{dict.admin.hostLogin}</h1>
          <p className="text-muted-foreground text-sm">{dict.admin.loginSubtitle}</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
