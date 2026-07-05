import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "./server";

/**
 * Current authenticated admin (Supabase Auth user), or null. Uses the
 * SSR cookie-based client. Server components / actions only.
 */
export async function getUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

/** Like getUser but redirects to the login page when signed out. */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/admin/login");
  return user;
}
