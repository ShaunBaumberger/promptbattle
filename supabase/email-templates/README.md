# Auth email templates

Branded Supabase Auth emails in all 10 UI languages. The language comes from
`user_metadata.locale`, which the app stores on sign-up and on every sign-in
(see `app/admin/login/login-form.tsx` and `app/auth/callback/route.ts`).
Users without a stored language get English.

Both emails include the one-time link **and** the 6-digit code (`{{ .Token }}`):
corporate mail scanners (e.g. Microsoft Defender Safe Links) can open and use up
the link before the person clicks it — the code still works on the login page.

## Install (Supabase Dashboard → Authentication → Emails → Templates)

| Template            | Subject (paste the whole line)  | Body                  |
| ------------------- | ------------------------------- | --------------------- |
| **Magic Link**      | `magic-link.subject.txt`        | `magic-link.html`     |
| **Confirm sign up** | `confirm-signup.subject.txt`    | `confirm-signup.html` |

Paste each file's full contents into the subject and message body fields and save.
Copy the HTML **source**, not the page a browser shows when you open the file —
on a Mac, `pbcopy < supabase/email-templates/magic-link.html` puts it on the
clipboard. The subject is the language-neutral `{{ .Token }} · Prompt Battle`
because Supabase caps subjects at 255 characters.

## Editing

The files are generated — every language shares one layout. Change the copy or
layout in `scripts/generate-email-templates.py` and regenerate rather than
hand-editing ten branches:

```bash
python3 scripts/generate-email-templates.py supabase/email-templates
```
The templates use Go template syntax (`{{ if eq $l "de" }}…`), which Supabase
renders server-side; test changes with a real login email before relying on them.
