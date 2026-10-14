"use server";

import { getUser } from "@/lib/supabase/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getServerDictionary } from "@/lib/i18n/server";

const MAX_PER_HOUR = 5;
const MAX_LENGTH = 4000;

export type FeedbackResult = { ok: true } | { ok: false; error: string };

/**
 * Store a host's feedback and email it to the operator (FEEDBACK_EMAIL,
 * default hello@promptbattle.io) through Resend. Storing comes first, so a
 * failed email never loses the message — it stays readable in the
 * `feedback` table.
 */
export async function sendFeedbackAction(input: {
  message: string;
  page: string;
  allowContact: boolean;
}): Promise<FeedbackResult> {
  const { locale, dict } = await getServerDictionary();
  const user = await getUser();
  if (!user) return { ok: false, error: dict.feedback.failed };

  const message = input.message.trim().slice(0, MAX_LENGTH);
  if (!message) return { ok: false, error: dict.feedback.failed };
  const page = input.page.slice(0, 200);

  const supabase = createServiceRoleClient();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_PER_HOUR) return { ok: false, error: dict.feedback.tooMany };

  const { data: row, error: insertError } = await supabase
    .from("feedback")
    .insert({
      user_id: user.id,
      email: user.email ?? null,
      message,
      page,
      locale,
      allow_contact: input.allowContact,
    })
    .select("id")
    .single();
  if (insertError) console.error("feedback insert failed:", insertError.message);

  const emailed = await emailOperator({
    from: user.email ?? "unknown",
    message,
    page,
    locale,
    replyTo: input.allowContact ? user.email ?? undefined : undefined,
  });

  if (row && emailed) {
    await supabase.from("feedback").update({ emailed: true }).eq("id", row.id);
  }
  // Saved but not emailed still counts as received; only a total loss fails.
  if (!row && !emailed) return { ok: false, error: dict.feedback.failed };
  return { ok: true };
}

async function emailOperator(f: {
  from: string;
  message: string;
  page: string;
  locale: string;
  replyTo?: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set — feedback stored but not emailed.");
    return false;
  }
  const to = process.env.FEEDBACK_EMAIL?.trim() || "hello@promptbattle.io";
  const text = [
    f.message,
    "",
    "—",
    `From: ${f.from}${f.replyTo ? "" : " (does not want a reply)"}`,
    `Page: ${f.page}`,
    `Language: ${f.locale}`,
  ].join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Prompt Battle <hello@promptbattle.io>",
        to: [to],
        subject: `Feedback from ${f.from}`,
        text,
        ...(f.replyTo ? { reply_to: f.replyTo } : {}),
      }),
    });
    if (!res.ok) console.error("feedback email failed:", res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error("feedback email failed:", err);
    return false;
  }
}
