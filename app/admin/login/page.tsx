import { LoginForm } from "./login-form";
import { getServerDictionary } from "@/lib/i18n/server";

export const metadata = { title: "Host login", robots: { index: false } };

export default async function LoginPage() {
  const { dict } = await getServerDictionary();
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="bg-card w-full max-w-sm space-y-6 rounded-[28px] border p-7">
        <div className="space-y-2 text-center">
          <h1 className="font-display text-2xl font-black tracking-tight uppercase">{dict.admin.hostLogin}</h1>
          <p className="text-muted-foreground text-sm">{dict.admin.loginSubtitle}</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
