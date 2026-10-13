#!/usr/bin/env node
// Uploads the auth email templates in supabase/email-templates/ to the
// Supabase project in .env.local via the Management API — no dashboard
// copy-paste. Needs a personal access token from
// https://supabase.com/dashboard/account/tokens (asked for, never stored).
//
//   node scripts/push-email-templates.mjs

import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

const dir = "supabase/email-templates";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^"|"$/g, "");
if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing in .env.local");
const ref = new URL(url).hostname.split(".")[0];

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl._writeToOutput = (s) => rl.output.write(s.startsWith(question) ? question : "");
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

const token =
  process.env.SUPABASE_ACCESS_TOKEN?.trim() || (await askHidden("Supabase access token (sbp_…): "));

const read = (f) => readFileSync(`${dir}/${f}`, "utf8");
const body = {
  mailer_subjects_magic_link: read("magic-link.subject.txt").trim(),
  mailer_templates_magic_link_content: read("magic-link.html"),
  mailer_subjects_confirmation: read("confirm-signup.subject.txt").trim(),
  mailer_templates_confirmation_content: read("confirm-signup.html"),
};

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
console.log(
  res.ok
    ? `✓ Magic Link and Confirm sign up templates updated for project ${ref}.`
    : `✗ Supabase answered ${res.status}: ${await res.text()}`,
);
process.exit(res.ok ? 0 : 1);
