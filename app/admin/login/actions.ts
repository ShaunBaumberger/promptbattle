"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifyPassword,
} from "@/lib/admin-session";
import { getServerDictionary } from "@/lib/i18n/server";

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");

  if (!verifyPassword(password)) {
    const { dict } = await getServerDictionary();
    return { error: dict.admin.err.wrongPassword };
  }

  const token = await createSessionToken();
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  redirect("/admin");
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE);
  redirect("/admin/login");
}
