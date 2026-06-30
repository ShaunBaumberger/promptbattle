# Prompt Battle

A live, on-stage **prompt-battle tournament**. Two players go head-to-head: each
gets the same task and races to write the best prompt. An AI model turns their
prompts into images (or videos), the results are revealed side-by-side on a
projector, and the audience votes for the winner. Single-elimination bracket,
2 to 32 players.

Built for workshops, team events, classrooms, and meetups — anywhere you want
to make "learning to prompt" into a spectator sport.

> The UI is currently **German**. English/i18n is on the roadmap (see below) —
> contributions welcome.

## How it works

Three views, three screens:

| View | URL | Who | What |
|------|-----|-----|------|
| **Host** | `/admin` | Organizer (laptop) | Create tournaments, add tasks, run matches, control reveals & voting |
| **Players** | `/` → join with code | Players (phones) | Join via QR/code, type prompts against the clock |
| **Stage** | `/stage/<code>` | Projector | Bracket, live match, reveal animation, voting, champion |

A **task** is either an image to recreate (players see a reference image), a
text brief ("generate an image of…"), or a video brief. Players never see each
other's prompts until the reveal.

## Tech stack

- **Next.js 16** (App Router, Server Actions) + **React 19** + **Tailwind v4**
- **Supabase** — Postgres, Realtime (live sync across all three views), Storage
- **Google Gemini** — images (Nano Banana Pro) and video (Veo 3 Fast)
- Deploys cleanly to **Vercel** (Hobby tier is enough for a single event)

## Bring your own keys

This is **self-hosted and bring-your-own-key**: you run it on your own Supabase
project and your own Google Gemini key, so **you** control (and pay for) the
generations your tournaments produce. Nothing phones home.

You can also **choose your models** — image quality/cost and video model are
configurable via environment variables. See [`.env.local.example`](.env.local.example)
for the menu and pricing notes.

## Setup

### Prerequisites

- Node.js 20+
- A free [Supabase](https://supabase.com) project
- A [Google Gemini API key](https://aistudio.google.com) (only needed for real
  generation — there's a Test Mode that skips all API calls)

### 1. Install

```bash
git clone https://github.com/<you>/promptbattle.git
cd promptbattle
npm install
```

### 2. Set up the database

In your Supabase project, open **SQL Editor** and run every file in
[`supabase/migrations/`](supabase/migrations/) **in filename order**
(`0001…` first, then `0002…`, … `0008…`, `0008b…`, `0009…` and so on).

The first migration creates the tables, Row-Level-Security policies, the
Realtime publication, **and** a public Storage bucket named `images` — so once
all files have run, the database is fully configured. No dashboard clicking
required.

> Re-running migrations on an existing database will error on already-applied
> statements — that's expected. Apply each one once, in order.

### 3. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in your Supabase URL + keys, your Gemini key, and a host password. Every
variable is documented inline in the example file, including the optional
model-selection vars.

### 4. Run

```bash
npm run dev
```

Open <http://localhost:3000>. The host area is at `/admin` (log in with
`HOST_PASSWORD`).

## Running an event

1. **Host:** go to `/admin`, create a tournament, pick the player count and
   round time.
2. **Host:** add tasks for each round (image references, or text/video briefs).
3. **Stage:** open `/stage/<code>` on the projector — it shows a join QR code.
4. **Players:** scan the QR (or go to the site and enter the code) on their
   phones.
5. **Host:** start the tournament, then run each match: *prepare → start →*
   (players prompt) *→ generate → reveal → vote → next.*

**Test Mode** (in tournament settings) skips all Gemini/Veo calls so you can
rehearse the whole flow for free.

## Deploying to Vercel

Import the repo on [Vercel](https://vercel.com/new), add the same environment
variables, and deploy. Notes:

- Server actions that generate images/videos set `maxDuration = 60` to fit
  Vercel's function budget. Veo renders longer than that, so video generation
  uses a **polling architecture** (kick off the job, then short poll calls pick
  up the result) — no single function blocks on the render.
- Vercel caps request bodies at **4.5 MB**. Reference-image uploads are resized
  client-side to stay well under that, so phone photos upload fine.

## Cost

You pay Google directly for generations on your key. Ballpark per match (two
players, default models):

- **Image task:** ~$0.27
- **Video task:** ~$1.60 (two 8-second Veo clips) + ~$0.27 for backup images

Image-only tournaments are cheap. Video is the expensive option — use it
sparingly (e.g. only the final). Cheaper models are available via env vars.

## Roadmap

Things that would help this go wider — PRs welcome:

- **i18n** — the UI is German-only today; an English locale + i18n layer
- **Automated migrations** — a setup script instead of manual SQL paste
- **Multi-provider** — abstract the model layer to support non-Gemini providers
- **Multi-tenant / hosted mode** — real accounts + per-org isolation (today's
  auth is a single shared host password, perfect for one organizer, not for a
  shared instance)

## License

[AGPL-3.0-or-later](LICENSE). You're free to use, modify, and self-host. If you
run a **modified** version as a network service, the AGPL requires you to make
your source available to its users. Add the canonical license text as a
`LICENSE` file (GitHub's *Add file → license template → GNU AGPLv3* inserts the
official wording).
