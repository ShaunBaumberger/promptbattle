import { ImageResponse } from "next/og";

export const alt = "Prompt Battle — the live AI prompting game";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const HEADLINE = "OUT-PROMPT YOUR TEAM.";
const WORDMARK = "PROMPT BATTLE";
const TAGLINE = "The live AI prompting game for teams, workshops and classrooms.";
const DOMAIN = "promptbattle.io";
const FOOTNOTE = "Free for up to 8 players · no app needed";

/** Font subset for just the characters drawn (Google serves TTF to non-browser clients). */
async function loadFont(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&text=${encodeURIComponent(text)}`,
    ).then((r) => r.text());
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    return url ? await fetch(url).then((r) => r.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

export default async function OpenGraphImage() {
  const [displayFont, bodyFont] = await Promise.all([
    loadFont("Unbounded", 900, `${HEADLINE}${WORDMARK}VS`),
    loadFont("Geist", 500, `${TAGLINE}${DOMAIN}${FOOTNOTE}`),
  ]);
  const display = displayFont ? "Unbounded" : "sans-serif";
  const body = bodyFont ? "Geist" : "sans-serif";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          backgroundColor: "#0e0b33",
          backgroundImage:
            "radial-gradient(circle at 12% 10%, rgba(123,92,255,0.55), transparent 45%), radial-gradient(circle at 92% 30%, rgba(236,72,189,0.45), transparent 45%)",
          color: "white",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="56" height="56" viewBox="0 0 32 32">
            <rect x="1.5" y="4" width="18" height="18" rx="5.5" fill="#35ed7e" />
            <rect x="12.5" y="10" width="18" height="18" rx="5.5" fill="#ec48bd" />
            <path d="M12.5 15.5a5.5 5.5 0 0 1 5.5-5.5h1.5v6.5a5.5 5.5 0 0 1-5.5 5.5h-1.5z" fill="#7b5cff" />
          </svg>
          <span style={{ fontFamily: display, fontSize: 34, fontWeight: 900 }}>{WORDMARK}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 700 }}>
            <span style={{ fontFamily: display, fontSize: 66, fontWeight: 900, lineHeight: 1.05 }}>
              {HEADLINE}
            </span>
            <span style={{ marginTop: 26, fontFamily: body, fontSize: 30, color: "rgba(255,255,255,0.78)" }}>
              {TAGLINE}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
            <div
              style={{
                width: 190,
                height: 190,
                borderRadius: 36,
                border: "8px solid #35ed7e",
                backgroundImage: "linear-gradient(180deg, #ff9a5a 0%, #ff5e7e 48%, #6b3cff 100%)",
              }}
            />
            <div
              style={{
                width: 190,
                height: 190,
                marginLeft: 18,
                borderRadius: 36,
                border: "8px solid #ec48bd",
                backgroundImage: "linear-gradient(180deg, #ffb347 0%, #ff7a3d 50%, #3a1c71 100%)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 158,
                top: 58,
                width: 92,
                height: 92,
                borderRadius: 46,
                backgroundColor: "#7b5cff",
                border: "8px solid #0e0b33",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: display,
                fontSize: 30,
                fontWeight: 900,
              }}
            >
              VS
            </div>
          </div>
        </div>

        <div
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: body, fontSize: 28 }}
        >
          <span style={{ color: "#35ed7e" }}>{DOMAIN}</span>
          <span style={{ color: "rgba(255,255,255,0.7)" }}>{FOOTNOTE}</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        ...(displayFont ? [{ name: "Unbounded", data: displayFont, style: "normal" as const, weight: 900 as const }] : []),
        ...(bodyFont ? [{ name: "Geist", data: bodyFont, style: "normal" as const, weight: 500 as const }] : []),
      ],
    },
  );
}
